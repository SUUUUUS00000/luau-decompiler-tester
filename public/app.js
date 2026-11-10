const PALETTE = ["#0071e3", "#ff3b30", "#34c759", "#ff9500", "#af52de", "#ff2d55", "#5ac8fa", "#ffcc00"];
const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

let cachedResults = [];
let cachedDecompilers = [];

async function fetchRepos() {
  const list = await api("/api/repos");
  const select = document.getElementById("test-repo");
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "Все репозитории";
  select.appendChild(allOpt);
  for (const r of list) {
    const o = document.createElement("option");
    o.value = r.key;
    o.textContent = r.label;
    select.appendChild(o);
  }
}

async function fetchDecompilers() {
  cachedDecompilers = await api("/api/decompilers");
  renderDecompilers();
  renderDecompilerSelect();
}

function renderDecompilers() {
  const ul = document.getElementById("decompiler-list");
  ul.innerHTML = "";
  for (const d of cachedDecompilers) {
    const li = document.createElement("li");
    li.innerHTML = `<span><strong>${escapeHtml(d.name)}</strong> — ${escapeHtml(d.url)}</span>`;
    const btn = document.createElement("button");
    btn.textContent = "Удалить";
    btn.onclick = async () => {
      await api(`/api/decompilers/${d.id}`, { method: "DELETE" });
      fetchDecompilers();
    };
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function renderDecompilerSelect() {
  const sel = document.getElementById("test-decompiler");
  sel.innerHTML = "";
  for (const d of cachedDecompilers) {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.name;
    sel.appendChild(o);
  }
}

document.getElementById("add-decompiler-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("dec-name").value.trim();
  const url = document.getElementById("dec-url").value.trim();
  const method = document.getElementById("dec-method").value;
  let headers = {};
  const headersRaw = document.getElementById("dec-headers").value.trim();
  if (headersRaw) {
    try { headers = JSON.parse(headersRaw); }
    catch { alert("Некорректный JSON в заголовках"); return; }
  }
  const bodyTemplate = document.getElementById("dec-body").value.trim();
  try {
    await api("/api/decompilers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, method, headers, bodyTemplate })
    });
    e.target.reset();
    fetchDecompilers();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("run-test").addEventListener("click", async () => {
  const decompilerId = document.getElementById("test-decompiler").value;
  const difficulty = document.getElementById("test-difficulty").value;
  const repoKey = document.getElementById("test-repo").value;
  if (!decompilerId) return alert("Выберите декомпилятор");

  const btn = document.getElementById("run-test");
  btn.disabled = true;
  showStatus("info", "Загрузка скриптов и запуск теста… (может занять 1–3 минуты)");

  try {
    const result = await api("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decompilerId, difficulty, repoKey })
    });
    showTestResult(result);
    await fetchResults();
  } catch (err) {
    showStatus("error", "Ошибка: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

function showStatus(kind, text) {
  const s = document.getElementById("status");
  s.className = "status status-" + kind;
  s.textContent = text;
}

function showTestResult(result) {
  const s = document.getElementById("status");
  s.className = "";
  s.innerHTML = "";

  let kind = "success";
  let head = `Готово: ${result.totalScripts} из ${result.attemptedScripts} скриптов, среднее ${result.avgSimilarity}%`;
  if (result.totalScripts === 0) { kind = "error"; head = `Тест провален: 0 из ${result.attemptedScripts} скриптов обработано`; }
  else if (result.warnings.length > 0) { kind = "warning"; head = `Завершено с предупреждениями: ${result.totalScripts} скриптов, среднее ${result.avgSimilarity}%`; }

  const summary = document.createElement("div");
  summary.className = "status status-" + kind;
  summary.textContent = head;
  s.appendChild(summary);

  if (result.warnings.length > 0) {
    const ul = document.createElement("ul");
    ul.className = "warnings-list";
    result.warnings.forEach(w => {
      const li = document.createElement("li");
      li.textContent = w;
      ul.appendChild(li);
    });
    s.appendChild(ul);
  }

  if (result.errors.length > 0) {
    const det = document.createElement("details");
    det.className = "errors-details";
    const sm = document.createElement("summary");
    sm.textContent = `Примеры ошибок (${result.errors.length})`;
    det.appendChild(sm);
    const ul = document.createElement("ul");
    result.errors.forEach(e => {
      const li = document.createElement("li");
      li.textContent = e;
      ul.appendChild(li);
    });
    det.appendChild(ul);
    s.appendChild(det);
  }
}

async function fetchResults() {
  cachedResults = await api("/api/results");
  renderChart(cachedResults);
  renderResultCards(cachedResults);
}

function renderResultCards(list) {
  const latest = {};
  for (const r of list) {
    const cur = latest[r.decompilerName];
    if (!cur || new Date(r.timestamp) > new Date(cur.timestamp)) latest[r.decompilerName] = r;
  }
  const entries = Object.values(latest).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const container = document.getElementById("results-container");
  container.innerHTML = "";

  if (entries.length === 0) {
    container.innerHTML = `<div class="empty-state">Тестов ещё не было</div>`;
    return;
  }

  entries.forEach(r => {
    const card = document.createElement("div");
    card.className = "result-card";

    let badge = "";
    if (r.totalScripts === 0) {
      card.classList.add("card-error");
      badge = `<div class="card-badge badge-error">Провал: 0/${r.attemptedScripts}</div>`;
    } else if (r.warnings && r.warnings.length > 0) {
      card.classList.add("card-warning");
      badge = `<div class="card-badge badge-warning">⚠ ${escapeHtml(r.warnings[0])}</div>`;
    }

    card.innerHTML = `
      <h3>${escapeHtml(r.decompilerName)}</h3>
      <div class="score">${r.avgSimilarity.toFixed(1)}%</div>
      <div class="meta">${escapeHtml(r.difficulty)} · ${r.totalScripts}/${r.attemptedScripts || r.totalScripts} скриптов</div>
      <div class="meta">${new Date(r.timestamp).toLocaleString()}</div>
      ${badge}
      <div class="bar"><div class="bar-fill" style="width:${Math.min(100, Math.max(0, r.avgSimilarity))}%"></div></div>
    `;
    container.appendChild(card);
  });
}

function renderChart(results) {
  const svg = document.getElementById("chart");
  svg.innerHTML = "";
  const W = 800, H = 400;
  const P = { top: 20, right: 160, bottom: 40, left: 55 };
  const plotW = W - P.left - P.right;
  const plotH = H - P.top - P.bottom;

  for (let v = 0; v <= 100; v += 5) {
    const y = P.top + plotH - (v / 100) * plotH;
    svg.appendChild(el("line", {
      x1: P.left, y1: y, x2: P.left + plotW, y2: y,
      stroke: v % 10 === 0 ? "#d2d2d7" : "#f0f0f5", "stroke-width": 1
    }));
    if (v % 10 === 0) {
      const t = el("text", { x: P.left - 8, y: y + 4, "text-anchor": "end", "font-size": 10, fill: "#6e6e73" });
      t.textContent = `${v}%`;
      svg.appendChild(t);
    }
  }

  const groups = {};
  for (const r of results) {
    if (!groups[r.decompilerName]) groups[r.decompilerName] = [];
    groups[r.decompilerName].push(r);
  }
  const names = Object.keys(groups);
  if (names.length === 0) {
    const t = el("text", { x: W / 2, y: H / 2, "text-anchor": "middle", fill: "#a1a1a6", "font-size": 14 });
    t.textContent = "Пока нет результатов";
    svg.appendChild(t);
    return;
  }
  const maxLen = Math.max(...names.map(n => groups[n].length), 1);

  names.forEach((name, idx) => {
    const color = PALETTE[idx % PALETTE.length];
    const sorted = groups[name].slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const points = sorted.map((r, i) => ({
      x: P.left + (maxLen === 1 ? plotW / 2 : (i / (maxLen - 1)) * plotW),
      y: P.top + plotH - (r.avgSimilarity / 100) * plotH,
      r
    }));
    if (points.length > 1) {
      const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      svg.appendChild(el("path", { d, stroke: color, "stroke-width": 2, fill: "none" }));
    }
    points.forEach(p => {
      const c = el("circle", { cx: p.x, cy: p.y, r: 5, fill: color, stroke: "#fff", "stroke-width": 2, style: "cursor:pointer" });
      c.addEventListener("mouseenter", ev => showTooltip(p.r, ev));
      c.addEventListener("mousemove", ev => showTooltip(p.r, ev));
      c.addEventListener("mouseleave", hideTooltip);
      svg.appendChild(c);
    });
    const legendY = P.top + idx * 22;
    svg.appendChild(el("rect", { x: W - P.right + 20, y: legendY - 8, width: 12, height: 12, fill: color, rx: 2 }));
    const lt = el("text", { x: W - P.right + 38, y: legendY + 2, "font-size": 11, fill: "#1d1d1f" });
    lt.textContent = name;
    svg.appendChild(lt);
  });
}

function showTooltip(result, ev) {
  const tt = document.getElementById("tooltip");
  const wrap = document.getElementById("chart-wrap").getBoundingClientRect();
  tt.style.display = "block";
  tt.style.left = (ev.clientX - wrap.left + 12) + "px";
  tt.style.top = (ev.clientY - wrap.top - 40) + "px";
  tt.innerHTML = `<strong>${escapeHtml(result.decompilerName)}</strong><br>${escapeHtml(result.difficulty)} · ${result.totalScripts}/${result.attemptedScripts || result.totalScripts}<br><b>${result.avgSimilarity.toFixed(2)}%</b>`;
}

function hideTooltip() {
  document.getElementById("tooltip").style.display = "none";
}

(async function init() {
  try {
    await Promise.all([fetchRepos(), fetchDecompilers()]);
    await fetchResults();
  } catch (e) {
    showStatus("error", "Ошибка инициализации: " + e.message);
  }
})();

document.getElementById("run-selftest").addEventListener("click", async () => {
  const btn = document.getElementById("run-selftest");
  btn.disabled = true;
  showStatus("info", "Проверка luau-compile и GitHub…");
  try {
    const r = await api("/api/selftest", { method: "POST" });
    const lines = [];
    if (r.compile.ok) lines.push(`✅ Компилятор: OK (длина байт-кода: ${r.compile.bytecodeLength})`);
    else lines.push(`❌ Компилятор: ${r.compile.error}`);
    if (r.github.ok) lines.push(`✅ GitHub: OK (найдено скриптов: ${r.github.count})`);
    else lines.push(`❌ GitHub: ${r.github.error}`);
    showStatus(r.compile.ok && r.github.ok ? "success" : "error", lines.join(" · "));
  } catch (err) {
    showStatus("error", "Самодиагностика упала: " + err.message);
  } finally {
    btn.disabled = false;
  }
});
