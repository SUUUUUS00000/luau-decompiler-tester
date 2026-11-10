import axios from "axios";

const GITHUB_API = "https://api.github.com";

const REPOS = {
  core: { owner: "Roblox", repo: "Core-Scripts", branch: "master", extensions: [".lua", ".luau"] },
  luau_tests: { owner: "luau-lang", repo: "luau", branch: "master", path: "tests", extensions: [".lua", ".luau"] }
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
  if (!cfg) throw new Error(`Unknown repo: ${repoKey}`);
  if (treeCache.has(repoKey)) return treeCache.get(repoKey);

  const url = `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/git/trees/${cfg.branch}?recursive=1`;
  const res = await axios.get(url, { headers: ghHeaders(), timeout: 15000 });

  const files = res.data.tree.filter(item => {
    if (item.type !== "blob") return false;
    if (cfg.path && !item.path.startsWith(cfg.path)) return false;
    return cfg.extensions.some(ext => item.path.endsWith(ext));
  });

  treeCache.set(repoKey, files);
  return files;
}

async function downloadFile(cfg, filePath) {
  const rawUrl = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${filePath}`;
  if (fileCache.has(rawUrl)) return fileCache.get(rawUrl);
  const res = await axios.get(rawUrl, {
    headers: ghHeaders(),
    timeout: 15000,
    responseType: "text"
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
  for (const key of keys) {
    try {
      const files = await fetchTree(key);
      for (const f of files) collected.push({ ...f, _repo: key });
    } catch (e) {}
  }
  if (collected.length === 0) return [];

  const minCounts = { easy: 50, normal: 125, hard: 355 };
  const sizeRanges = { easy: [0, 2048], normal: [2048, 10240], hard: [10240, Infinity] };

  const target = minCounts[difficulty] || 50;
  const [minSize, maxSize] = sizeRanges[difficulty] || sizeRanges.easy;

  const candidates = pickByRange(collected, minSize, maxSize, target);
  const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, target);

  const scripts = [];
  for (const file of shuffled) {
    try {
      const cfg = REPOS[file._repo];
      const code = await downloadFile(cfg, file.path);
      if (code && code.trim().length > 0) {
        scripts.push({ name: `${file._repo}/${file.path}`, code });
      }
    } catch (e) {}
  }
  return scripts;
}

export { REPOS };
