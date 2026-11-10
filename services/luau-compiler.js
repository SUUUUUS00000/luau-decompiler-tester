import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LUAU_COMPILE_PATH = path.join(__dirname, "..", "bin", "luau-compile");

export async function compileLuau(source) {
  try {
    const { stdout } = await execFileAsync(LUAU_COMPILE_PATH, ["--binary", "-"], {
      input: source,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "buffer"
    });
    return stdout.toString("base64");
  } catch (error) {
    throw new Error(error.stderr?.toString() || "Luau compilation failed");
  }
}

export async function isCompilable(source) {
  try {
    await compileLuau(source);
    return true;
  } catch (e) {
    return false;
  }
}
