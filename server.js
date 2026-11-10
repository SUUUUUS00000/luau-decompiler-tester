app.post("/api/test", async (req, res) => {
  const { decompilerId, difficulty = "easy", repoKey = "core" } = req.body;
  const decompiler = decompilers.find(d => d.id === decompilerId);
  if (!decompiler) return res.status(404).json({ error: "Decompiler not found" });

  let scripts;
  try {
    scripts = await loadScripts(repoKey, difficulty);
  } catch (e) {
    return res.status(500).json({ error: `Не удалось загрузить скрипты из GitHub: ${e.message}` });
  }
  if (scripts.length === 0) {
    return res.status(400).json({ error: "Не найдено подходящих скриптов в выбранном репозитории" });
  }

  const testResults = [];
  const compileErrors = [];
  const decompileErrors = [];
  let compileFailures = 0;
  let decompileFailures = 0;

  for (const script of scripts) {
    let bytecode;
    try {
      bytecode = await compileLuau(script.code);
    } catch (e) {
      compileFailures++;
      if (compileErrors.length < 3) {
        compileErrors.push(`${script.name}: ${e.message}`);
        console.error(`[compile] ${script.name}: ${e.message}`);
      }
      continue;
    }

    let decompiled = "";
    let decompiledCompiles = false;
    let similarity = 0;
    let decompileError = null;

    try {
      decompiled = await callDecompiler(decompiler, bytecode);
      decompiledCompiles = await isCompilable(decompiled);
      similarity = computeSimilarity(script.code, decompiled, decompiledCompiles);
    } catch (e) {
      decompileError = e.message;
      decompileFailures++;
      if (decompileErrors.length < 3) {
        decompileErrors.push(`${script.name}: ${e.message}`);
        console.error(`[decompile] ${script.name}: ${e.message}`);
      }
      similarity = 0;
    }

    testResults.push({
      scriptName: script.name,
      scriptSize: script.code.length,
      decompiledPreview: decompiled.slice(0, 500),
      decompiledCompiles,
      decompileError,
      similarity
    });
  }

  const warnings = [];
  if (compileFailures > 0) {
    warnings.push(`Не удалось скомпилировать ${compileFailures} из ${scripts.length} скриптов`);
  }
  if (decompileFailures > 0) {
    warnings.push(`Декомпилятор вернул ошибку для ${decompileFailures} скриптов`);
  }
  if (testResults.length === 0) {
    warnings.push("Ни один скрипт не был обработан — тест не имеет смысла");
  }

  const avgSimilarity = testResults.length
    ? Math.round((testResults.reduce((s, r) => s + r.similarity, 0) / testResults.length) * 100) / 100
    : 0;

  const entry = {
    id: Date.now().toString(),
    decompilerId,
    decompilerName: decompiler.name,
    difficulty,
    repoKey,
    attemptedScripts: scripts.length,
    totalScripts: testResults.length,
    compileFailures,
    decompileFailures,
    avgSimilarity,
    errors: [...compileErrors, ...decompileErrors],
    warnings,
    timestamp: new Date().toISOString(),
    details: testResults
  };

  results.push(entry);
  saveJSON(RESULTS_FILE, results);
  res.json(entry);
});
