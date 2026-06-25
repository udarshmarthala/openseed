'use strict';

let paused = false;
let allTasks = [];
let searchQuery = '';
let activeFilter = 'all';

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function sendMsg(type) {
  const tab = await getActiveTab();
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { type }).catch(() => {});
}

async function loadTasks() {
  const tab = await getActiveTab();
  if (!tab) return [];

  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
    renderUnavailable();
    return [];
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const raw = localStorage.getItem('openseed_tasks');
        return raw ? JSON.parse(raw) : {};
      },
    });

    const store = results[0]?.result || {};
    return Object.entries(store).map(([id, data]) => {
      const runs = data.runs || 0;
      const state = runs >= 10 ? 'tree' : runs >= 3 ? 'sprout' : 'seed';
      return { id, url: data.url, runs, state, steps: (data.sequence || []).length };
    });
  } catch {
    return [];
  }
}

async function readTaskStore() {
  const tab = await getActiveTab();
  if (!tab) return null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const raw = localStorage.getItem('openseed_tasks');
        return raw ? JSON.parse(raw) : {};
      },
    });
    return results[0]?.result || {};
  } catch {
    return null;
  }
}

async function writeTaskStore(store) {
  const tab = await getActiveTab();
  if (!tab) return false;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (nextStore) => {
        localStorage.setItem('openseed_tasks', JSON.stringify(nextStore));
      },
      args: [store],
    });
    return true;
  } catch {
    return false;
  }
}

function taskMatches(task) {
  const query = searchQuery.trim().toLowerCase();
  const haystack = [task.id, task.url || '', task.state, String(task.runs), String(task.steps)]
    .join(' ')
    .toLowerCase();

  if (activeFilter !== 'all' && task.state !== activeFilter) return false;
  if (query && !haystack.includes(query)) return false;
  return true;
}

function getVisibleTasks() {
  return allTasks
    .filter(taskMatches)
    .sort((a, b) => b.runs - a.runs || a.url.localeCompare(b.url) || a.id.localeCompare(b.id));
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    return u.hostname + path;
  } catch {
    return url;
  }
}

function renderUnavailable() {
  document.getElementById('task-list').innerHTML =
    `<div class="empty"><span class="empty-icon">⊘</span>Can't run on this page.<br>Navigate to any website.</div>`;
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function setActiveFilterButton() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === activeFilter);
  });
}

function renderTasks(tasks) {
  const list = document.getElementById('task-list');
  const footer = document.getElementById('footer');

  if (!tasks.length) {
    const emptyIcon = allTasks.length ? '⌕' : '∅';
    const emptyText = allTasks.length
      ? 'No matching tasks.<br>Try a different search or filter.'
      : 'No tasks recorded yet.<br>Browse normally to begin.';
    list.innerHTML =
      `<div class="empty"><span class="empty-icon">${emptyIcon}</span>${emptyText}</div>`;
    footer.style.display = allTasks.length ? 'flex' : 'none';
    if (allTasks.length) {
      document.getElementById('stat-tasks').textContent = tasks.length;
      document.getElementById('stat-trees').textContent = tasks.filter(t => t.state === 'tree').length;
      document.getElementById('stat-runs').textContent = tasks.reduce((s, t) => s + t.runs, 0);
    }
    return;
  }

  footer.style.display = 'flex';
  document.getElementById('stat-tasks').textContent = tasks.length;
  document.getElementById('stat-trees').textContent = tasks.filter(t => t.state === 'tree').length;
  document.getElementById('stat-runs').textContent = tasks.reduce((s, t) => s + t.runs, 0);

  list.innerHTML = tasks.map(t => {
    const pct = Math.min(100, Math.round((t.runs / 10) * 100));
    const id = encodeURIComponent(t.id);
    return `
      <div class="task-item" data-state="${t.state}" data-id="${id}">
        <div class="task-url" title="${t.url || ''}">${shortUrl(t.url || t.id)}</div>
        <button class="task-delete" title="Delete" data-id="${id}">×</button>
        <div class="task-progress-wrap">
          <div class="task-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="task-meta">
          <span class="task-state-pill">${t.state}</span>
          <span class="task-runs"><strong>${t.runs}</strong>/10 runs</span>
          <span class="task-steps">${t.steps} steps</span>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.task-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteTask(decodeURIComponent(btn.dataset.id));
      await render();
    });
  });
}

async function deleteTask(taskId) {
  const tab = await getActiveTab();
  if (!tab) return;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (id) => {
      const raw = localStorage.getItem('openseed_tasks');
      if (!raw) return;
      const store = JSON.parse(raw);
      delete store[id];
      localStorage.setItem('openseed_tasks', JSON.stringify(store));
    },
    args: [taskId],
  });
}

async function render() {
  allTasks = await loadTasks();
  setActiveFilterButton();
  renderTasks(getVisibleTasks());
}

// ── Controls ──

document.getElementById('btn-pause').addEventListener('click', () => {
  paused = !paused;
  const btn = document.getElementById('btn-pause');
  sendMsg(paused ? 'OPENSEED_PAUSE' : 'OPENSEED_RESUME');
  btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
  btn.classList.toggle('active', paused);
});

document.getElementById('btn-clear').addEventListener('click', async () => {
  await sendMsg('OPENSEED_CLEAR');
});

document.getElementById('btn-export').addEventListener('click', async () => {
  const store = await readTaskStore();
  if (!store) return;

  downloadJson(`openseed-tasks-${new Date().toISOString().slice(0, 10)}.json`, {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: store,
  });
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const nextStore = parsed && typeof parsed === 'object' && parsed.tasks && typeof parsed.tasks === 'object'
      ? parsed.tasks
      : parsed;

    if (!nextStore || typeof nextStore !== 'object' || Array.isArray(nextStore)) {
      throw new Error('Invalid task store');
    }

    const ok = await writeTaskStore(nextStore);
    if (!ok) throw new Error('Unable to write task store');
    await render();
  } catch (err) {
    console.error('[OpenSeed] import failed', err);
    alert('Could not import task data.');
  }
});

document.getElementById('task-search').addEventListener('input', (e) => {
  searchQuery = e.target.value || '';
  renderTasks(getVisibleTasks());
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter || 'all';
    setActiveFilterButton();
    renderTasks(getVisibleTasks());
  });
});

render();
