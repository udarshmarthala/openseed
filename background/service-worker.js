'use strict';

// Forward messages from popup → active content script tab
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function sendToContentScript(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

// --- Popup → content script relay ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Messages from content scripts have sender.tab; from popup they don't
  if (sender.tab) return; // content script → ignore (content scripts talk via custom events)

  (async () => {
    const tab = await getActiveTab();
    if (!tab) return sendResponse({ ok: false, error: 'No active tab' });

    const result = await sendToContentScript(tab.id, msg);
    sendResponse({ ok: true, result });
  })();

  return true; // keep channel open for async sendResponse
});

// --- Install / update lifecycle ---

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[OpenSeed] Installed.');
  }
  if (reason === 'update') {
    console.log('[OpenSeed] Updated to', chrome.runtime.getManifest().version);
  }
});
