'use strict';

let paused = false;

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

function renderTasks(tasks) {
  const list = document.getElementById('task-list');
  const footer = document.getElementById('footer');

  if (!tasks.length) {
    list.innerHTML =
      `<div class="empty"><span class="empty-icon">∅</span>No tasks recorded yet.<br>Browse normally to begin.</div>`;
    footer.style.display = 'none';
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
  const tasks = await loadTasks();
  if (tasks.length) renderTasks(tasks);
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

render();
