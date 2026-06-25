(() => {
  'use strict';

  const STEP_TIMEOUT_MS = 5000;
  const STEP_DELAY_MS = 120;

  // --- Wait for element ---

  function waitForElement(selector, timeoutMs) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element not found: "${selector}" (${timeoutMs}ms timeout)`));
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    });
  }

  // --- Fire events matching original action ---

  function fireEvent(el, action) {
    switch (action.type) {
      case 'click': {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        break;
      }
      case 'input': {
        el.focus();
        const nativeInputSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        );
        if (nativeInputSetter && nativeInputSetter.set) {
          nativeInputSetter.set.call(el, action.value ?? '');
        } else {
          el.value = action.value ?? '';
        }
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
        break;
      }
      case 'change': {
        el.value = action.value ?? el.value;
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        break;
      }
      case 'submit': {
        const form = el.closest('form') || el;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        break;
      }
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --- Core replay ---

  async function replay(sequence) {
    if (!sequence || !sequence.length) {
      throw new Error('No sequence to replay');
    }

    for (let i = 0; i < sequence.length; i++) {
      const action = sequence[i];

      let el;
      try {
        el = await waitForElement(action.selector, STEP_TIMEOUT_MS);
      } catch (err) {
        notifyError(err.message, i, action);
        throw err;
      }

      fireEvent(el, action);
      notifyStep(i, sequence.length);

      if (i < sequence.length - 1) await delay(STEP_DELAY_MS);
    }

    notifyComplete(sequence.length);
  }

  // --- Notify ui.js ---

  function notifyStep(stepIndex, total) {
    document.dispatchEvent(new CustomEvent('openseed:replay-step', {
      detail: { step: stepIndex + 1, total }
    }));
  }

  function notifyComplete(total) {
    document.dispatchEvent(new CustomEvent('openseed:replay-done', {
      detail: { total }
    }));
  }

  function notifyError(message, stepIndex, action) {
    document.dispatchEvent(new CustomEvent('openseed:replay-error', {
      detail: { message, step: stepIndex + 1, selector: action.selector }
    }));
  }

  // --- Public API ---

  window.OpenSeedTree = {
    replay,
    waitForElement,
  };
})();
