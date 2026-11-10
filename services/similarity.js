const TOKEN_REGEX = /(\b\w+\b|[^\s\w])/g;

function tokenize(code) {
  const normalized = code
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized.match(TOKEN_REGEX) || [];
  return tokens;
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function computeSimilarity(originalCode, decompiledCode, decompiledCompiles) {
  const tokensA = tokenize(originalCode);
  const tokensB = tokenize(decompiledCode);
  const tokenSim = jaccardSimilarity(tokensA, tokensB);
  const compileScore = decompiledCompiles ? 1 : 0;
  return Math.round((tokenSim * 0.7 + compileScore * 0.3) * 10000) / 100;
}

module.exports = { computeSimilarity };
