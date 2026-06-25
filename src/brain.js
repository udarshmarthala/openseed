const STORE_KEY = 'openseed_tasks';
const THRESHOLDS = { SPROUT: 3, TREE: 10 };

function _load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}

function _save(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

// Stable URL pattern: origin + pathname, no query/hash
function urlPattern(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

// Selector type fingerprint: id | data | aria | class | tag
function selectorType(selector) {
  if (selector.startsWith('#')) return 'id';
  if (selector.includes('[data-')) return 'data';
  if (selector.includes('[aria-')) return 'aria';
  if (selector.startsWith('.')) return 'class';
  return 'tag';
}

// Fuzzy task ID: URL pattern + sequence of "eventType:selectorType"
function generateTaskId(url, sequence) {
  const pattern = urlPattern(url);
  const fingerprint = sequence
    .map(a => `${a.type}:${selectorType(a.selector)}`)
    .join(',');
  return `${pattern}||${fingerprint}`;
}

function getState(runs) {
  if (runs >= THRESHOLDS.TREE) return 'tree';
  if (runs >= THRESHOLDS.SPROUT) return 'sprout';
  return 'seed';
}

// --- Public API ---

function saveTask(taskId, sequence, url) {
  const store = _load();
  const existing = store[taskId];
  store[taskId] = {
    sequence,
    url,
    runs: existing ? existing.runs : 0,
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
  _save(store);
}

function getTask(taskId) {
  return _load()[taskId] || null;
}

function getAllTasks() {
  const store = _load();
  return Object.entries(store).map(([id, data]) => ({
    id,
    ...data,
    state: getState(data.runs),
  }));
}

function getConfidence(taskId) {
  const task = getTask(taskId);
  if (!task) return { runs: 0, state: 'seed' };
  return { runs: task.runs, state: getState(task.runs) };
}

function incrementRun(taskId) {
  const store = _load();
  if (!store[taskId]) return;
  store[taskId].runs += 1;
  store[taskId].updatedAt = Date.now();
  _save(store);
  return getState(store[taskId].runs);
}

function deleteTask(taskId) {
  const store = _load();
  delete store[taskId];
  _save(store);
}

window.OpenSeedBrain = {
  generateTaskId,
  saveTask,
  getTask,
  getAllTasks,
  getConfidence,
  incrementRun,
  deleteTask,
  urlPattern,
};
