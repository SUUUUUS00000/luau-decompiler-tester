const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { compileLuau, isCompilable } = require('./services/luau-compiler');
const { loadScripts, REPOS } = require('./services/github-loader');
const { computeSimilarity } = require('./services/similarity');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DECOMPILERS_FILE = path.join(DATA_DIR, 'decompilers.json');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');

function loadJSON(file, defaultVal = []) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return defaultVal;
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let decompilers = loadJSON(DECOMPILERS_FILE);
let results = loadJSON(RESULTS_FILE);

async function callDecompiler(decompiler, bytecode) {
  const { url, method = 'POST', headers = {}, bodyTemplate = '' } = decompiler;
  let body = {};
  if (bodyTemplate) {
    body = JSON.parse(bodyTemplate);
    const key = Object.keys(body).find(k => body[k] === '__BYTECODE__');
    if (key) body[key] = bytecode;
    else body.bytecode = bytecode;
  } else {
    body = { bytecode };
  }

  const response = await axios({
    method,
    url,
    headers: { 'Content-Type': 'application/json', ...headers },
    data: body,
    timeout: 30000,
    validateStatus: () => true
  });

  const data = response.data;
  return typeof data === 'string' ? data : data.code || data.result || JSON.stringify(data);
}

app.get('/api/repos', (req, res) => {
  res.json(Object.entries(REPOS).map(([key, cfg]) => ({
    key,
    owner: cfg.owner,
    repo: cfg.repo,
    label: `${cfg.owner}/${cfg.repo}`
  })));
});

app.get('/api/decompilers', (req, res) => res.json(decompilers));

app.post('/api/decompilers', (req, res) => {
  const { name, url, method, headers, bodyTemplate } = req.body;
  const id = Date.now().toString();
  const dec = { id, name, url, method: method || 'POST', headers: headers || {}, bodyTemplate: bodyTemplate || '' };
  decompilers.push(dec);
  saveJSON(DECOMPILERS_FILE, decompilers);
  res.json(dec);
});

app.delete('/api/decompilers/:id', (req, res) => {
  decompilers = decompilers.filter(d => d.id !== req.params.id);
  saveJSON(DECOMPILERS_FILE, decompilers);
  res.json({ ok: true });
});

app.post('/api/test', async (req, res) => {
  const { decompilerId, difficulty, repoKey = 'core' } = req.body;
  const decompiler = decompilers.find(d => d.id === decompilerId);
  if (!decompiler) return res.status(404).json({ error: 'Decompiler not found' });

  let scripts;
  try {
    scripts = await loadScripts(repoKey, difficulty);
  } catch (e) {
    return res.status(500).json({ error: `GitHub loading failed: ${e.message}` });
  }

  if (scripts.length === 0) {
    return res.status(400).json({ error: 'No suitable scripts found in repository' });
  }

  const testResults = [];
  for (const script of scripts) {
    let bytecode;
    try {
      bytecode = compileLuau(script.code);
    } catch (e) {
      continue;
    }

    let decompiled = '';
    let decompiledCompiles = false;
    let similarity = 0;

    try {
      decompiled = await callDecompiler(decompiler, bytecode);
      decompiledCompiles = isCompilable(decompiled);
      similarity = computeSimilarity(script.code, decompiled, decompiledCompiles);
    } catch (e) {
      decompiled = '';
      decompiledCompiles = false;
      similarity = 0;
    }

    testResults.push({
      scriptName: script.name,
      scriptSize: script.code.length,
      decompiled,
      decompiledCompiles,
      similarity
    });
  }

  const avgSimilarity = testResults.length
    ? Math.round((testResults.reduce((s, r) => s + r.similarity, 0) / testResults.length) * 100) / 100
    : 0;

  const resultEntry = {
    id: Date.now().toString(),
    decompilerId,
    decompilerName: decompiler.name,
    difficulty,
    repoKey,
    totalScripts: testResults.length,
    avgSimilarity,
    timestamp: new Date().toISOString(),
    details: testResults
  };

  results.push(resultEntry);
  saveJSON(RESULTS_FILE, results);
  res.json(resultEntry);
});

app.get('/api/results', (req, res) => res.json(results));
app.get('/api/results/:id', (req, res) => {
  const r = results.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
