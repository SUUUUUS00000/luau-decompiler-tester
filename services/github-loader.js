import axios from "axios";

const GITHUB_API = "https://api.github.com";

const REPOS = {
  core: {
    owner: "Roblox",
    repo: "Core-Scripts",
    branch: "master",
    extensions: [".lua", ".luau"]
  },
  luau_tests: {
    owner: "luau-lang",
    repo: "luau",
    branch: "master",
    path: "tests/conformance",
    extensions: [".lua", ".luau"]
  }
};

const treeCache = new Map();
const fileCache = new Map();
const FILE_CACHE_MAX = 500;

function ghHeaders() {
  const h = { "User-Agent": "Luau-Decompiler-Tester" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function fetchTree(repoKey) {
  const cfg = REPOS[repoKey];
  if (!cfg) throw new Error(`Неизвестный репозиторий: ${repoKey}`);
  if (treeCache.has(repoKey)) return treeCache.get(repoKey);

  const url = `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/git/trees/${cfg.branch}?recursive=1`;
  let res;
  try {
    res = await axios.get(url, { headers: ghHeaders(), timeout: 20000 });
  } catch (e) {
    if (e.response && e.response.status === 403) {
      throw new Error(
        "GitHub API вернул 403 (лимит запросов). Добавьте GITHUB_TOKEN в переменные окружения Render."
      );
    }
    if (e.response && e.response.status === 404) {
      throw new Error(
        `Репозиторий ${cfg.owner}/${cfg.repo} ветка ${cfg.branch} не найден (404). Проверьте REPOS в github-loader.js.`
      );
    }
    throw new Error(`GitHub API: ${e.message}`);
  }

  if (!res.data || !Array.isArray(res.data.tree)) {
    throw new Error("GitHub API вернул пустое дерево — возможно, неверный branch или path.");
  }

  const files = res.data.tree.filter(item => {
    if (item.type !== "blob") return false;
    if (cfg.path && !item.path.startsWith(cfg.path)) return false;
    return cfg.extensions.some(ext => item.path.endsWith(ext));
  });

  console.log(`[github-loader] ${cfg.owner}/${cfg.repo}: найдено ${files.length} файлов после фильтра`);
  treeCache.set(repoKey, files);
  return files;
}

async function downloadFile(cfg, filePath) {
  const rawUrl = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${filePath}`;
  if (fileCache.has(rawUrl)) return fileCache.get(rawUrl);
  const res = await axios.get(rawUrl, {
    headers: { "User-Agent": "Luau-Decompiler-Tester" },
    timeout: 15000,
    responseType: "text",
    maxContentLength: 20 * 1024 * 1024
  });
  if (fileCache.size >= FILE_CACHE_MAX) {
    fileCache.delete(fileCache.keys().next().value);
  }
  fileCache.set(rawUrl, res.data);
  return res.data;
}

function pickByRange(files, minSize, maxSize, target) {
  const inRange = files.filter(f => f.size >= minSize && f.size < maxSize);
  if (inRange.length >= target) return inRange;
  const below = files.filter(f => f.size < minSize).sort((a, b) => b.size - a.size);
  const above = files.filter(f => f.size >= maxSize).sort((a, b) => a.size - b.size);
  const result = [...inRange];
  let need = target - inRange.length;
  let bi = 0, ai = 0;
  while (need > 0 && (bi < below.length || ai < above.length)) {
    if (bi < below.length) { result.push(below[bi++]); need--; }
    if (need > 0 && ai < above.length) { result.push(above[ai++]); need--; }
  }
  return result;
}

export async function loadScripts(repoKey, difficulty) {
  const keys = repoKey === "all" ? Object.keys(REPOS) : [repoKey];
  const collected = [];
  const treeErrors = [];

  for (const key of keys) {
    try {
      const files = await fetchTree(key);
      for (const f of files) collected.push({ ...f, _repo: key });
    } catch (e) {
      treeErrors.push(`${key}: ${e.message}`);
    }
  }

  if (collected.length === 0) {
    const detail = treeErrors.length ? treeErrors.join("; ") : "файлы не найдены";
    throw new Error(`Не удалось получить список файлов — ${detail}`);
  }

  const minCounts = { easy: 50, normal: 125, hard: 355 };
  const sizeRanges = { easy: [0, 2048], normal: [2048, 10240], hard: [10240, Infinity] };
  const target = minCounts[difficulty] || 50;
  const [minSize, maxSize] = sizeRanges[difficulty] || sizeRanges.easy;

  const candidates = pickByRange(collected, minSize, maxSize, target);
  if (candidates.length === 0) {
    throw new Error(
      `В репозитории нет файлов размером ${minSize}–${maxSize === Infinity ? "∞" : maxSize} байт для уровня "${difficulty}".`
    );
  }

  const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, target);

  const scripts = [];
  let downloadFailures = 0;
  for (const file of shuffled) {
    try {
      const cfg = REPOS[file._repo];
      const code = await downloadFile(cfg, file.path);
      if (code && code.trim().length > 0) {
        scripts.push({ name: `${file._repo}/${file.path}`, code });
      }
    } catch (e) {
      downloadFailures++;
      if (downloadFailures <= 2) {
        console.warn(`[github-loader] Скачивание не удалось: ${file.path}: ${e.message}`);
      }
    }
  }

  console.log(
    `[github-loader] Итого: попытка ${shuffled.length}, успешно ${scripts.length}, ошибок ${downloadFailures}`
  );
  return scripts;
}

export { REPOS };
