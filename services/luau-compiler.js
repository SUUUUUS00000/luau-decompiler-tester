import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LUAU_COMPILE_PATH = path.join(__dirname, "..", "bin", "luau-compile");

export function compileLuau(source) {
  return new Promise((resolve, reject) => {
    const proc = spawn(LUAU_COMPILE_PATH, ["--binary", "-"], { timeout: 15000 });
    const stdout = [];
    const stderr = [];

    proc.stdout.on("data", chunk => stdout.push(chunk));
    proc.stderr.on("data", chunk => stderr.push(chunk));

    proc.on("error", err => reject(err));
    proc.on("close", code => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("base64"));
      } else {
        const msg = Buffer.concat(stderr).toString().trim();
        reject(new Error(msg || `luau-compile exited with code ${code}`));
      }
    });

    proc.stdin.on("error", () => {});
    proc.stdin.write(source);
    proc.stdin.end();
  });
}

export async function isCompilable(source) {
  try {
    await compileLuau(source);
    return true;
  } catch (e) {
    return false;
  }
}
