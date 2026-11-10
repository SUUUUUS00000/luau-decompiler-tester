const PALETTE = ["#0071e3", "#ff3b30", "#34c759", "#ff9500", "#af52de", "#ff2d55", "#5ac8fa", "#ffcc00"];
const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
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
    li.innerHTML = `<span><strong>${d.name}</strong> — ${d.url}</span>`;
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
    try { headers = JSON.parse(headersRaw); } catch (err) { alert("Некорректный JSON в заголовках"); return; }
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
  const status = document.getElementById("status");
  btn.disabled = true;
  status.textContent = "Загрузка скриптов и запуск теста... (может занять 1–3 минуты)";

  try {
    const result = await api("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decompilerId, difficulty, repoKey })
    });
    status.textContent = `Готово: ${result.totalScripts} скриптов, среднее ${result.avgSimilarity}%`;
    await fetchResults();
  } catch (err) {
    status.textContent = "Ошибка: " + err.message;
  } finally {
    btn.disabled = false;
  }
});

async function fetchResults() {
  cachedResults = await api("/api/results");
  renderChart(cachedResults);
  renderResultCards(cachedResults);
}

function renderResultCards(list) {
  const container = document.getElementById("results-container");
  container.innerHTML = "";
  [...list].reverse().slice(0, 12).forEach(r => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <h3>${r.decompilerName}</h3>
      <div class="score">${r.avgSimilarity.toFixed(1)}%</div>
      <div class="meta">${r.difficulty} · ${r.totalScripts} скриптов</div>
      <div class="meta">${new Date(r.timestamp).toLocaleString()}</div>
      <div class="bar"><div class="bar-fill" style="width:${Math.min(100, r.avgSimilarity)}%"></div></div>
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
      stroke: v % 10 === 0 ? "#d2d2d7" : "#f0f0f5",
      "stroke-width": 1
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
    const empty = el("text", { x: W / 2, y: H / 2, "text-anchor": "middle", fill: "#a1a1a6", "font-size": 14 });
    empty.textContent = "Пока нет результатов";
    svg.appendChild(empty);
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
      const c = el("circle", {
        cx: p.x, cy: p.y, r: 5,
        fill: color, stroke: "#fff", "stroke-width": 2,
        style: "cursor: pointer;"
      });
      c.addEventListener("mouseenter", (ev) => showTooltip(p.r, ev));
      c.addEventListener("mousemove", (ev) => showTooltip(p.r, ev));
      c.addEventListener("mouseleave", hideTooltip);
      c.addEventListener("click", (ev) => showTooltip(p.r, ev));
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
  tt.innerHTML = `<strong>${result.decompilerName}</strong><br>${result.difficulty} · ${result.totalScripts} скриптов<br><b>${result.avgSimilarity.toFixed(2)}%</b>`;
}

function hideTooltip() {
  document.getElementById("tooltip").style.display = "none";
}

(async function init() {
  try {
    await Promise.all([fetchRepos(), fetchDecompilers()]);
    await fetchResults();
  } catch (e) {
    console.error(e);
  }
})();
