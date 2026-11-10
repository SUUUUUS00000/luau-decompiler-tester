import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BIN_PATH = path.join(__dirname, "..", "bin", "luau-compile");

if (!fs.existsSync(BIN_PATH)) {
  console.warn(`[luau-compiler] Внимание: ${BIN_PATH} не найден. Запустите "npm install" для его установки.`);
}

function runProcess(source, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BIN_PATH)) {
      return reject(new Error("luau-compile не установлен (bin/luau-compile отсутствует)"));
    }
    const proc = spawn(BIN_PATH, ["--binary", "-"], { timeout: timeoutMs });
    const stdoutChunks = [];
    const stderrChunks = [];
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try { proc.kill("SIGKILL"); } catch {}
    }, timeoutMs);

    proc.stdout.on("data", chunk => stdoutChunks.push(chunk));
    proc.stderr.on("data", chunk => stderrChunks.push(chunk));

    proc.on("error", err => {
      clearTimeout(timer);
      reject(new Error(`Не удалось запустить luau-compile: ${err.message}`));
    });

    proc.on("close", code => {
      clearTimeout(timer);
      if (killed) {
        return reject(new Error(`luau-compile не уложился в ${timeoutMs} мс`));
      }
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `luau-compile завершился с кодом ${code}`));
      }
    });

    proc.stdin.on("error", () => {});
    try {
      proc.stdin.write(source);
      proc.stdin.end();
    } catch (e) {
      try { proc.kill("SIGKILL"); } catch {}
      reject(new Error(`Не удалось передать код в luau-compile: ${e.message}`));
    }
  });
}

export async function compileLuau(source) {
  if (typeof source !== "string" || source.length === 0) {
    throw new Error("Пустой исходный код");
  }
  const buf = await runProcess(source);
  return buf.toString("base64");
}

export async function isCompilable(source) {
  if (typeof source !== "string" || source.trim().length === 0) return false;
  try {
    await runProcess(source);
    return true;
  } catch {
    return false;
  }
}
