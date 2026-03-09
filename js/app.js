import { checkServer } from './browser.js';
import { showApp } from './view.js';
import { startLive } from './live.js';
import { startReplay } from './replay.js';
import { getPromptManager } from './prompt.js';
import './fix-review.js';

// Refresh button
document.getElementById('btn-refresh')?.addEventListener('click', async () => {
  await checkServer();
});

// New session from landing page
document.getElementById('btn-new-session')?.addEventListener('click', () => {
  const input = document.getElementById('new-session-input');
  const prompt = input.value.trim();
  if (!prompt) return;
  const pm = getPromptManager();
  showApp();
  pm.show();
  pm.input.value = prompt;
  pm.send(null); // null = new session
});

document.getElementById('new-session-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('btn-new-session')?.click();
  }
});

// Re-render graph when theme changes
document.addEventListener('tribbles-theme-change', () => {
  const ctrl = window.appController;
  if (ctrl && ctrl.currentStep >= 0) ctrl.rebuildToStep(ctrl.currentStep);
});

// Startup
(async function startup() {
  // Check if served from the local server
  const sessions = await checkServer();

  // Check URL hash for direct live link
  const hash = window.location.hash;
  if (hash.startsWith('#live=')) {
    const id = hash.slice(6);
    startLive(id);
  } else if (hash.startsWith('#replay=')) {
    const id = hash.slice(8);
    startReplay(id);
  }
})();
