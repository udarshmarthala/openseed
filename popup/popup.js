'use strict';

const STATE_ICON = { seed: '🌱', sprout: '🌿', tree: '🌳' };

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

// Read tasks from active tab's localStorage via scripting API
async function loadTasks() {
  const tab = await getActiveTab();
  if (!tab) return [];

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
    return u.hostname + u.pathname;
  } catch {
    return url;
  }
}

function renderTasks(tasks) {
  const list = document.getElementById('task-list');

  if (!tasks.length) {
    list.innerHTML = '<div class="empty">No tasks recorded yet.<br>Browse and interact normally.</div>';
    return;
  }

  list.innerHTML = tasks.map(t => `
    <div class="task-item" data-id="${encodeURIComponent(t.id)}">
      <span class="task-icon">${STATE_ICON[t.state]}</span>
      <div class="task-info">
        <div class="task-url">${shortUrl(t.url || t.id)}</div>
        <div class="task-meta">${t.steps} steps · ${t.runs} run${t.runs !== 1 ? 's' : ''}</div>
      </div>
      <span class="task-state ${t.state}">${t.state}</span>
      <button class="delete-btn" title="Delete task" data-id="${encodeURIComponent(t.id)}">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = decodeURIComponent(btn.dataset.id);
      await deleteTask(taskId);
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
  renderTasks(tasks);
}

// --- Controls ---

document.getElementById('btn-pause').addEventListener('click', () => {
  paused = !paused;
  sendMsg(paused ? 'OPENSEED_PAUSE' : 'OPENSEED_RESUME');
  document.getElementById('btn-pause').textContent = paused ? '▶ Resume' : '⏸ Pause';
});

document.getElementById('btn-clear').addEventListener('click', async () => {
  await sendMsg('OPENSEED_CLEAR');
});

// --- Boot ---
render();
