import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { compileLuau, isCompilable } from "./services/luau-compiler.js";
import { loadScripts, REPOS } from "./services/github-loader.js";
import { computeSimilarity } from "./services/similarity.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DECOMPILERS_FILE = path.join(DATA_DIR, "decompilers.json");
const RESULTS_FILE = path.join(DATA_DIR, "results.json");

function loadJSON(file, def = []) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.error("loadJSON:", file, e.message);
  }
  return def;
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("saveJSON:", file, e.message);
  }
}

let decompilers = loadJSON(DECOMPILERS_FILE);
let results = loadJSON(RESULTS_FILE);

async function callDecompiler(decompiler, bytecode) {
  const { url, method = "POST", headers = {}, bodyTemplate = "" } = decompiler;

  let body = {};
  if (bodyTemplate) {
    try {
      body = JSON.parse(bodyTemplate);
    } catch (e) {
      throw new Error("Некорректный JSON в шаблоне тела декомпилятора");
    }
    const placeholderKey = Object.keys(body).find(k => body[k] === "__BYTECODE__");
    if (placeholderKey) body[placeholderKey] = bytecode;
    else body.bytecode = bytecode;
  } else {
    body = { bytecode };
  }

  const response = await axios({
    method,
    url,
    headers: { "Content-Type": "application/json", ...headers },
    data: method === "GET" ? undefined : body,
    params: method === "GET" ? body : undefined,
    timeout: 180000,
    validateStatus: () => true,
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024
  });

  if (response.status >= 400) {
    const msg =
      typeof response.data === "object" && response.data && response.data.error
        ? response.data.error
        : `HTTP ${response.status}`;
    throw new Error(`Декомпилятор ответил ошибкой: ${msg}`);
  }

  const data = response.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    if (data.error) throw new Error(`Декомпилятор вернул error: ${data.error}`);
    return data.code || data.result || data.output || data.source || JSON.stringify(data);
  }
  return "";
}

app.get("/health", (req, res) => res.status(200).send("OK"));

app.get("/api/repos", (req, res) => {
  res.json(
    Object.entries(REPOS).map(([key, cfg]) => ({
      key,
      owner: cfg.owner,
      repo: cfg.repo,
      label: `${cfg.owner}/${cfg.repo}`
    }))
  );
});

app.get("/api/decompilers", (req, res) => res.json(decompilers));

app.post("/api/decompilers", (req, res) => {
  const { name, url, method, headers, bodyTemplate } = req.body;
  if (!name || !url) return res.status(400).json({ error: "name and url are required" });
  const dec = {
    id: Date.now().toString(),
    name,
    url,
    method: method || "POST",
    headers: headers || {},
    bodyTemplate: bodyTemplate || ""
  };
  decompilers.push(dec);
  saveJSON(DECOMPILERS_FILE, decompilers);
  res.json(dec);
});

app.delete("/api/decompilers/:id", (req, res) => {
  decompilers = decompilers.filter(d => d.id !== req.params.id);
  saveJSON(DECOMPILERS_FILE, decompilers);
  res.json({ ok: true });
});

app.post("/api/selftest", async (req, res) => {
  const sample = "local x = 1 + 2\nprint(x)";
  const report = {};

  try {
    const bytecode = await compileLuau(sample);
    report.compile = { ok: true, bytecodeLength: bytecode.length };
  } catch (e) {
    report.compile = { ok: false, error: e.message };
  }

  try {
    const scripts = await loadScripts("luau_tests", "easy");
    report.github = { ok: true, count: scripts.length };
  } catch (e) {
    report.github = { ok: false, error: e.message };
  }

  res.json(report);
});

app.post("/api/test", async (req, res) => {
  const { decompilerId, difficulty = "easy", repoKey = "core" } = req.body;
  const decompiler = decompilers.find(d => d.id === decompilerId);
  if (!decompiler) return res.status(404).json({ error: "Decompiler not found" });

  let scripts;
  try {
    scripts = await loadScripts(repoKey, difficulty);
  } catch (e) {
    return res.status(500).json({ error: `Не удалось загрузить скрипты из GitHub: ${e.message}` });
  }
  if (scripts.length === 0) {
    return res.status(400).json({ error: "Не найдено подходящих скриптов в выбранном репозитории" });
  }

  const testResults = [];
  const compileErrors = [];
  const decompileErrors = [];
  let compileFailures = 0;
  let decompileFailures = 0;

  for (const script of scripts) {
    let bytecode;
    try {
      bytecode = await compileLuau(script.code);
    } catch (e) {
      compileFailures++;
      if (compileErrors.length < 3) {
        compileErrors.push(`${script.name}: ${e.message}`);
        console.error(`[compile] ${script.name}: ${e.message}`);
      }
      continue;
    }

    let decompiled = "";
    let decompiledCompiles = false;
    let similarity = 0;
    let decompileError = null;

    try {
      decompiled = await callDecompiler(decompiler, bytecode);
      decompiledCompiles = await isCompilable(decompiled);
      similarity = computeSimilarity(script.code, decompiled, decompiledCompiles);
    } catch (e) {
      decompileError = e.message;
      decompileFailures++;
      if (decompileErrors.length < 3) {
        decompileErrors.push(`${script.name}: ${e.message}`);
        console.error(`[decompile] ${script.name}: ${e.message}`);
      }
      similarity = 0;
    }

    testResults.push({
      scriptName: script.name,
      scriptSize: script.code.length,
      decompiledPreview: decompiled.slice(0, 500),
      decompiledCompiles,
      decompileError,
      similarity
    });
  }

  const warnings = [];
  if (compileFailures > 0) {
    warnings.push(`Не удалось скомпилировать ${compileFailures} из ${scripts.length} скриптов`);
  }
  if (decompileFailures > 0) {
    warnings.push(`Декомпилятор вернул ошибку для ${decompileFailures} скриптов`);
  }
  if (testResults.length === 0) {
    warnings.push("Ни один скрипт не был обработан — тест не имеет смысла");
  }

  const avgSimilarity = testResults.length
    ? Math.round(
        (testResults.reduce((s, r) => s + r.similarity, 0) / testResults.length) * 100
      ) / 100
    : 0;

  const entry = {
    id: Date.now().toString(),
    decompilerId,
    decompilerName: decompiler.name,
    difficulty,
    repoKey,
    attemptedScripts: scripts.length,
    totalScripts: testResults.length,
    compileFailures,
    decompileFailures,
    avgSimilarity,
    errors: [...compileErrors, ...decompileErrors],
    warnings,
    timestamp: new Date().toISOString(),
    details: testResults
  };

  results.push(entry);
  saveJSON(RESULTS_FILE, results);
  res.json(entry);
});

app.get("/api/results", (req, res) => res.json(results));

app.get("/api/results/:id", (req, res) => {
  const r = results.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "Not found" });
  res.json(r);
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on ${PORT}`);
});
