const axios = require("axios");

const GITHUB_API = "https://api.github.com";

const REPOS = {
  core: { owner: "Roblox", repo: "Core-Scripts", branch: "master", extensions: [".lua", ".luau"] },
  luau_tests: { owner: "luau-lang", repo: "luau", branch: "master", path: "tests", extensions: [".lua", ".luau"] }
};

const cache = new Map();

async function fetchTree(repoKey) {
  const cfg = REPOS[repoKey];
  if (!cfg) throw new Error(`Unknown repo: ${repoKey}`);

  const cacheKey = `tree:${repoKey}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const url = `${GITHUB_API}/repos/${cfg.owner}/${cfg.repo}/git/trees/${cfg.branch}?recursive=1`;
  const headers = { "User-Agent": "Luau-Decompiler-Tester" };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
  }

  const res = await axios.get(url, { headers, timeout: 15000 });
  const files = res.data.tree.filter(item => {
    if (item.type !== "blob") return false;
    if (cfg.path && !item.path.startsWith(cfg.path)) return false;
    return cfg.extensions.some(ext => item.path.endsWith(ext));
  });

  cache.set(cacheKey, files);
  return files;
}

async function downloadFile(downloadUrl) {
  if (cache.has(downloadUrl)) return cache.get(downloadUrl);

  const res = await axios.get(downloadUrl, {
    headers: { "User-Agent": "Luau-Decompiler-Tester" },
    timeout: 15000,
    responseType: "text"
  });
  cache.set(downloadUrl, res.data);
  return res.data;
}

async function loadScripts(repoKey, difficulty) {
  const files = await fetchTree(repoKey);
  const minCounts = { easy: 50, normal: 125, hard: 355 };
  const sizeRanges = {
    easy: [0, 2048],
    normal: [2048, 10240],
    hard: [10240, Infinity]
  };

  const [minSize, maxSize] = sizeRanges[difficulty] || sizeRanges.easy;
  const minCount = minCounts[difficulty] || 50;

  const candidates = files.filter(f => f.size >= minSize && f.size < maxSize);
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.max(minCount, shuffled.length));

  const scripts = [];
  for (const file of selected) {
    try {
      const code = await downloadFile(file.url.replace("?raw=true", ""));
      if (code.trim().length === 0) continue;
      scripts.push({ name: file.path, code });
    } catch (e) {
      continue;
    }
  }

  return scripts;
}

module.exports = { loadScripts, REPOS };
