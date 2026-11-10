import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BIN_DIR = path.join(__dirname, "..", "bin");
const BIN_PATH = path.join(BIN_DIR, "luau-compile");
const ZIP_PATH = path.join(BIN_DIR, "luau-ubuntu.zip");

const RELEASE = "0.741";
const URL = `https://github.com/luau-lang/luau/releases/download/${RELEASE}/luau-ubuntu.zip`;

async function main() {
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

  if (fs.existsSync(BIN_PATH)) {
    try {
      execSync(`"${BIN_PATH}" --help`, { stdio: "ignore", timeout: 5000 });
      console.log("luau-compile уже установлен.");
      return;
    } catch {
      console.log("luau-compile найден, но не работает — переустанавливаю.");
    }
  }

  console.log(`Скачивание ${URL}`);
  const response = await axios.get(URL, {
    responseType: "arraybuffer",
    timeout: 60000
  });
  fs.writeFileSync(ZIP_PATH, response.data);

  console.log("Распаковка luau-compile…");
  try {
    execSync(`unzip -o "${ZIP_PATH}" luau-compile -d "${BIN_DIR}"`, { stdio: "inherit" });
  } catch (e) {
    throw new Error("Не удалось распаковать архив. Проверьте наличие утилиты unzip.");
  }
  fs.chmodSync(BIN_PATH, 0o755);
  fs.unlinkSync(ZIP_PATH);
  console.log("luau-compile готов.");
}

main().catch(err => {
  console.error("Ошибка установки luau-compile:", err.message);
  process.exit(1);
});
