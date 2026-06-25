(() => {
  'use strict';

  const RECORDED_EVENTS = ['click', 'input', 'change', 'submit'];
  let currentSequence = [];
  let recording = true;

  // --- Stable selector builder ---

  function getSelector(el) {
    if (el.id) return `#${el.id}`;

    const dataAttrs = [...el.attributes].filter(a => a.name.startsWith('data-'));
    if (dataAttrs.length) {
      const attr = dataAttrs[0];
      return `[${attr.name}="${attr.value}"]`;
    }

    const aria = el.getAttribute('aria-label');
    if (aria) return `[aria-label="${aria}"]`;

    const name = el.getAttribute('name');
    if (name) return `[name="${name}"]`;

    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/)[0];
      if (cls) return `${el.tagName.toLowerCase()}.${cls}`;
    }

    return el.tagName.toLowerCase();
  }

  // --- Event capture ---

  function captureAction(e) {
    if (!recording) return;

    const el = e.target;
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

    // Ignore clicks inside the Open Seed badge
    if (el.closest && el.closest('#openseed-badge')) return;

    const action = {
      type: e.type,
      selector: getSelector(el),
      value: (e.type === 'input' || e.type === 'change') ? el.value : undefined,
      tagName: el.tagName.toLowerCase(),
      url: location.href,
      timestamp: Date.now(),
    };

    if (action.value === undefined) delete action.value;

    currentSequence.push(action);
    notifyUI();
  }

  // --- Session save ---

  function finalizeSession() {
    if (!currentSequence.length) return;
    if (!window.OpenSeedBrain) return;

    const { generateTaskId, saveTask, getTask, incrementRun } = window.OpenSeedBrain;
    const taskId = generateTaskId(location.href, currentSequence);
    const existing = getTask(taskId);

    if (existing) {
      incrementRun(taskId);
    } else {
      saveTask(taskId, currentSequence, location.href);
    }

    notifyUI();
  }

  // --- Notify ui.js to refresh badge ---

  function notifyUI() {
    document.dispatchEvent(new CustomEvent('openseed:update', {
      detail: { sequenceLength: currentSequence.length }
    }));
  }

  // --- Public API for ui.js / tree.js ---

  window.OpenSeedRecorder = {
    getSequence: () => [...currentSequence],
    clearSequence: () => { currentSequence = []; notifyUI(); },
    pause: () => { recording = false; },
    resume: () => { recording = true; },
    finalizeSession,
  };

  // --- Wire up listeners ---

  function init() {
    RECORDED_EVENTS.forEach(type => {
      document.addEventListener(type, captureAction, { capture: true, passive: true });
    });

    window.addEventListener('beforeunload', finalizeSession);

    // Listen for messages from popup / service-worker
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'OPENSEED_PAUSE') recording = false;
      if (msg.type === 'OPENSEED_RESUME') recording = true;
      if (msg.type === 'OPENSEED_CLEAR') {
        currentSequence = [];
        notifyUI();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
