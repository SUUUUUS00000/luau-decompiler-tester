const API = '';

async function fetchDecompilers() {
  const res = await fetch('/api/decompilers');
  const list = await res.json();
  renderDecompilers(list);
  renderTestSelect(list);
}

function renderDecompilers(list) {
  const ul = document.getElementById('decompiler-list');
  ul.innerHTML = '';
  list.forEach(d => {
    const li = document.createElement('li');
    li.innerHTML = `<span><strong>${d.name}</strong> — ${d.url}</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Удалить';
    btn.onclick = async () => {
      await fetch(`/api/decompilers/${d.id}`, { method: 'DELETE' });
      fetchDecompilers();
    };
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function renderTestSelect(list) {
  const select = document.getElementById('test-decompiler');
  select.innerHTML = '';
  list.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name;
    select.appendChild(opt);
  });
}

document.getElementById('add-decompiler-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('dec-name').value;
  const url = document.getElementById('dec-url').value;
  const method = document.getElementById('dec-method').value;
  let headers = {};
  try {
    headers = JSON.parse(document.getElementById('dec-headers').value || '{}');
  } catch (e) {}
  const bodyTemplate = document.getElementById('dec-body').value;
  await fetch('/api/decompilers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, url, method, headers, bodyTemplate })
  });
  e.target.reset();
  fetchDecompilers();
});

document.getElementById('run-test').addEventListener('click', async () => {
  const decompilerId = document.getElementById('test-decompiler').value;
  const difficulty = document.getElementById('test-difficulty').value;
  if (!decompilerId) return alert('Выберите декомпилятор');
  const res = await fetch('/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decompilerId, difficulty })
  });
  const result = await res.json();
  fetchResults();
});

async function fetchResults() {
  const res = await fetch('/api/results');
  const list = await res.json();
  const container = document.getElementById('results-container');
  container.innerHTML = '';
  list.reverse().forEach(r => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <h3>${r.decompilerName} — ${r.difficulty}</h3>
      <div class="score">${r.avgSimilarity.toFixed(1)}%</div>
      <div class="meta">Скриптов: ${r.totalScripts}</div>
      <div class="meta">${new Date(r.timestamp).toLocaleString()}</div>
      <div class="bar"><div class="bar-fill" style="width:${r.avgSimilarity}%"></div></div>
    `;
    container.appendChild(card);
  });
}

fetchDecompilers();
fetchResults();
