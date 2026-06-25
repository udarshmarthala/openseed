(() => {
  'use strict';

  const STATE_LABELS = { seed: '🌱', sprout: '🌿', tree: '🌳' };
  const STATE_HINTS  = {
    seed:   'Recording… keep going',
    sprout: 'Seen a few times — suggestions coming',
    tree:   'Press Enter to run automatically',
  };

  let badge = null;
  let statusEl = null;
  let hintEl = null;
  let replayInProgress = false;

  // --- Badge DOM ---

  function createBadge() {
    if (document.getElementById('openseed-badge')) return;

    badge = document.createElement('div');
    badge.id = 'openseed-badge';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');

    statusEl = document.createElement('span');
    statusEl.className = 'openseed-status';

    hintEl = document.createElement('span');
    hintEl.className = 'openseed-hint';

    badge.appendChild(statusEl);
    badge.appendChild(hintEl);
    document.body.appendChild(badge);
  }

  function updateBadge(state, extra) {
    if (!badge) return;
    badge.dataset.state = state;
    statusEl.textContent = STATE_LABELS[state] || '🌱';
    hintEl.textContent = extra || STATE_HINTS[state] || '';
  }

  // --- Confidence read ---

  function currentTaskState() {
    const brain = window.OpenSeedBrain;
    const recorder = window.OpenSeedRecorder;
    if (!brain || !recorder) return 'seed';

    const seq = recorder.getSequence();
    if (!seq.length) return 'seed';

    const taskId = brain.generateTaskId(location.href, seq);
    return brain.getConfidence(taskId).state;
  }

  function refresh() {
    const state = currentTaskState();
    updateBadge(state);
  }

  // --- Enter trigger ---

  function handleKeydown(e) {
    if (e.key !== 'Enter') return;
    if (replayInProgress) return;

    const brain = window.OpenSeedBrain;
    const recorder = window.OpenSeedRecorder;
    const tree = window.OpenSeedTree;
    if (!brain || !recorder || !tree) return;

    const seq = recorder.getSequence();
    if (!seq.length) return;

    const taskId = brain.generateTaskId(location.href, seq);
    const { state } = brain.getConfidence(taskId);

    // Don't intercept Enter inside text inputs / textareas / contenteditable
    const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (document.activeElement && document.activeElement.isContentEditable) return;

    if (state === 'sprout') {
      updateBadge('sprout', '🌿 Keep repeating to unlock auto-run');
      setTimeout(refresh, 2000);
      return;
    }

    if (state !== 'tree') return;

    e.preventDefault();
    startReplay(taskId, seq);
  }

  async function startReplay(taskId, seq) {
    replayInProgress = true;
    updateBadge('tree', '▶ Running…');
    window.OpenSeedRecorder.pause();

    try {
      await window.OpenSeedTree.replay(seq);
      window.OpenSeedBrain.incrementRun(taskId);
    } catch {
      // error displayed via openseed:replay-error listener below
    } finally {
      replayInProgress = false;
      window.OpenSeedRecorder.resume();
      refresh();
    }
  }

  // --- Ghost suggestion (sprout state) ---

  function showGhostHint() {
    updateBadge('sprout', '🌿 Almost there — keep repeating');
  }

  // --- Event listeners from other modules ---

  document.addEventListener('openseed:update', refresh);

  document.addEventListener('openseed:replay-step', (e) => {
    const { step, total } = e.detail;
    updateBadge('tree', `▶ Step ${step}/${total}`);
  });

  document.addEventListener('openseed:replay-done', () => {
    updateBadge('tree', '✓ Done');
    setTimeout(refresh, 1500);
  });

  document.addEventListener('openseed:replay-error', (e) => {
    const { message, step } = e.detail;
    updateBadge('tree', `✗ Step ${step}: element not found`);
    console.error('[OpenSeed]', message);
    setTimeout(refresh, 3000);
  });

  // --- Init ---

  function init() {
    createBadge();
    refresh();
    document.addEventListener('keydown', handleKeydown, { capture: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
