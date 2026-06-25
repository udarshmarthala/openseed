// Guard against double-init on SPA re-injection
if (window.__openseedInitialized) return;  // eslint-disable-line no-labels
window.__openseedInitialized = true;

(() => {
  'use strict';

  const RECORDED_EVENTS = ['click', 'input', 'change', 'submit'];
  const MAX_SEQUENCE = 50;
  const INPUT_DEBOUNCE_MS = 500;

  let currentSequence = [];
  let recording = true;
  const inputTimers = new Map();

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

  function pushAction(action) {
    if (currentSequence.length >= MAX_SEQUENCE) return;
    currentSequence.push(action);
    notifyUI();
  }

  function clearInputTimers() {
    inputTimers.forEach(timerId => clearTimeout(timerId));
    inputTimers.clear();
  }

  function flushPendingInput(el) {
    if (!inputTimers.has(el)) return;
    clearTimeout(inputTimers.get(el));
    inputTimers.delete(el);
    pushAction({
      type: 'input',
      selector: getSelector(el),
      value: el.value,
      tagName: el.tagName.toLowerCase(),
      url: location.href,
      timestamp: Date.now(),
    });
  }

  function flushAllPendingInputs() {
    Array.from(inputTimers.keys()).forEach(flushPendingInput);
  }

  function captureAction(e) {
    if (!recording) return;

    const el = e.target;
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    if (el.closest && el.closest('#openseed-badge')) return;

    // Debounce input: only record final value after typing stops
    if (e.type === 'input') {
      if (inputTimers.has(el)) clearTimeout(inputTimers.get(el));
      inputTimers.set(el, setTimeout(() => {
        inputTimers.delete(el);
        pushAction({
          type: 'input',
          selector: getSelector(el),
          value: el.value,
          tagName: el.tagName.toLowerCase(),
          url: location.href,
          timestamp: Date.now(),
        });
      }, INPUT_DEBOUNCE_MS));
      return;
    }

    if (e.type === 'submit') {
      flushAllPendingInputs();
    }

    const action = {
      type: e.type,
      selector: getSelector(el),
      tagName: el.tagName.toLowerCase(),
      url: location.href,
      timestamp: Date.now(),
    };

    if (e.type === 'change') action.value = el.value;

    pushAction(action);
  }

  // --- Session save ---

  function finalizeSession() {
    flushAllPendingInputs();
    if (!currentSequence.length) return;
    if (!window.OpenSeedBrain) return;

    const { generateTaskId, saveTask, getTask, incrementRun } = window.OpenSeedBrain;
    const taskId = generateTaskId(location.href, currentSequence);
    const existing = getTask(taskId);

    if (existing) {
      incrementRun(taskId);
    } else {
      saveTask(taskId, currentSequence, location.href);
      incrementRun(taskId); // first observation = run 1
    }

    notifyUI();
  }

  // --- Notify ui.js ---

  function notifyUI() {
    document.dispatchEvent(new CustomEvent('openseed:update', {
      detail: { sequenceLength: currentSequence.length }
    }));
  }

  // --- Public API ---

  window.OpenSeedRecorder = {
    getSequence: () => [...currentSequence],
    clearSequence: () => { currentSequence = []; clearInputTimers(); notifyUI(); },
    pause: () => { recording = false; clearInputTimers(); },
    resume: () => { recording = true; },
    finalizeSession,
  };

  // --- Wire up ---

  function init() {
    RECORDED_EVENTS.forEach(type => {
      document.addEventListener(type, captureAction, { capture: true, passive: true });
    });

    window.addEventListener('beforeunload', finalizeSession);
    window.addEventListener('pagehide', finalizeSession);

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'OPENSEED_PAUSE') {
        recording = false;
        clearInputTimers();
      }
      if (msg.type === 'OPENSEED_RESUME') recording = true;
      if (msg.type === 'OPENSEED_CLEAR') {
        currentSequence = [];
        clearInputTimers();
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
