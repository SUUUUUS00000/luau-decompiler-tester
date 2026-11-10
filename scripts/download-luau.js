import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BIN_DIR = path.join(__dirname, "..", "bin");
const ZIP_PATH = path.join(BIN_DIR, "luau-ubuntu.zip");

const LUAU_RELEASE_URL = "https://github.com/luau-lang/luau/releases/download/0.741/luau-ubuntu.zip";

async function download() {
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
  if (fs.existsSync(path.join(BIN_DIR, "luau-compile"))) {
    console.log("luau-compile already exists, skipping download.");
    return;
  }
  console.log("Downloading luau-ubuntu.zip...");
  const response = await axios.get(LUAU_RELEASE_URL, { responseType: "arraybuffer" });
  fs.writeFileSync(ZIP_PATH, response.data);
  console.log("Extracting luau-compile...");
  execSync(`unzip -o ${ZIP_PATH} luau-compile -d ${BIN_DIR}`, { stdio: "inherit" });
  fs.chmodSync(path.join(BIN_DIR, "luau-compile"), 0o755);
  console.log("luau-compile is ready.");
}

download().catch(err => {
  console.error("Failed to download luau-compile:", err.message);
  process.exit(1);
});
