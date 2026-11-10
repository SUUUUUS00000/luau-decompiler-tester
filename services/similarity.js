const TOKEN_REGEX = /(\b\w+\b|[^\s\w])/g;

function tokenize(code) {
  const normalized = code
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.match(TOKEN_REGEX) || [];
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 1 : inter / union;
}

export function computeSimilarity(originalCode, decompiledCode, decompiledCompiles) {
  if (!decompiledCode) return 0;
  const tokenSim = jaccard(tokenize(originalCode), tokenize(decompiledCode));
  const compileScore = decompiledCompiles ? 1 : 0;
  return Math.round((tokenSim * 0.7 + compileScore * 0.3) * 10000) / 100;
}
