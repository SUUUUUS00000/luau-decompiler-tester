const TOKEN_REGEX = /(\b\w+\b|[^\s\w])/g;

function stripComments(code) {
  return code
    .replace(/--\[=*\[[\s\S]*?\]=*\]/g, "")
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function tokenize(code) {
  if (!code) return [];
  const normalized = stripComments(code).replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  return normalized.match(TOKEN_REGEX) || [];
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function computeSimilarity(originalCode, decompiledCode, decompiledCompiles) {
  if (!decompiledCode || decompiledCode.trim().length === 0) return 0;
  const tokensA = tokenize(originalCode);
  const tokensB = tokenize(decompiledCode);
  const tokenSim = jaccard(tokensA, tokensB);
  const compileScore = decompiledCompiles ? 1 : 0;
  const raw = tokenSim * 0.7 + compileScore * 0.3;
  return Math.round(raw * 10000) / 100;
}
