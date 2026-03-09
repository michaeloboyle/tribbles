import { startLive } from './live.js';

const API_BASE = window.location.origin;
let promptManager = null;

export default class PromptManager {
  constructor() {
    this.pollTimer = null;
    this.bar = document.getElementById('prompt-bar');
    this.input = document.getElementById('prompt-input');
    this.sendBtn = document.getElementById('btn-send');
    this.stopBtn = document.getElementById('btn-stop-prompt');
    this.statusEl = document.getElementById('prompt-status');
    this.skipPermsCheckbox = document.getElementById('skip-permissions');
    this.outputBar = document.getElementById('claude-output-bar');
    this.outputText = document.getElementById('claude-output-text');
    this.respondInput = document.getElementById('respond-input');
    this.respondBtn = document.getElementById('btn-respond');

    this.sendBtn.addEventListener('click', () => this.send());
    this.stopBtn.addEventListener('click', () => this.stop());
    this.respondBtn.addEventListener('click', () => this.respond());

    // Prevent keyboard shortcuts when typing in prompt/respond inputs
    for (const input of [this.input, this.respondInput]) {
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          if (input === this.input) this.send();
          else this.respond();
        }
      });
    }
  }

  show() {
    this.bar.classList.remove('hidden');
    this.bar.classList.add('visible');
  }

  hide() {
    this.bar.classList.add('hidden');
    this.bar.classList.remove('visible');
    this.hideOutputBar();
    this.stopPolling();
  }

  showOutputBar(text) {
    this.outputText.textContent = text;
    this.outputBar.classList.remove('hidden');
    this.respondInput.focus();
  }

  hideOutputBar() {
    this.outputBar.classList.add('hidden');
    this.respondInput.value = '';
  }

  async send(sessionId) {
    const prompt = this.input.value.trim();
    if (!prompt) return;

    const skipPermissions = this.skipPermsCheckbox.checked;

    this.sendBtn.disabled = true;
    this.statusEl.textContent = 'Starting...';
    this.sessionId = sessionId || (window.appController?.session?.sessionId);

    try {
      const resp = await fetch(API_BASE + '/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          sessionId: this.sessionId,
          skipPermissions,
        }),
      });

      const result = await resp.json();
      if (!resp.ok) {
        this.statusEl.textContent = result.error || 'Failed';
        this.sendBtn.disabled = false;
        return;
      }

      this.sessionId = result.sessionId;
      this.input.value = '';
      this.statusEl.textContent = 'Running...';
      this.stopBtn.classList.remove('hidden');

      // Enter live mode for this session
      startLive(result.sessionId);

      // Start polling for completion and input requests
      this.startPolling();
    } catch (err) {
      this.statusEl.textContent = 'Error: ' + err.message;
      this.sendBtn.disabled = false;
    }
  }

  async respond() {
    const text = this.respondInput.value.trim();
    if (!text) return;

    try {
      const resp = await fetch(API_BASE + '/api/prompt/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const result = await resp.json();
      if (result.ok) {
        this.respondInput.value = '';
        this.hideOutputBar();
        this.statusEl.textContent = 'Running...';
      } else {
        this.statusEl.textContent = 'Respond failed: ' + (result.error || '');
      }
    } catch (err) {
      this.statusEl.textContent = 'Respond error: ' + err.message;
    }
  }

  async stop() {
    try {
      await fetch(API_BASE + '/api/prompt/stop', { method: 'POST' });
      this.statusEl.textContent = 'Stopped';
      this.onComplete();
    } catch (err) {
      this.statusEl.textContent = 'Stop failed';
    }
  }

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      try {
        const resp = await fetch(API_BASE + '/api/prompt/status');
        const status = await resp.json();

        if (status.running) {
          if (status.waitingForInput) {
            // Show the last few output lines as the prompt
            const outputLines = status.output || [];
            const lastLines = outputLines.slice(-3).join('\n');
            this.statusEl.textContent = 'Waiting for input...';
            this.showOutputBar(lastLines || 'Claude is waiting for your response');
          } else {
            this.hideOutputBar();
            this.statusEl.textContent = `Running (${Math.round(status.elapsed || 0)}s)`;
          }
        } else {
          if (status.error) {
            this.statusEl.textContent = 'Error: ' + status.error.slice(0, 60);
          } else {
            this.statusEl.textContent = 'Completed';
          }
          this.onComplete();
        }
      } catch {
        // Server unavailable, stop polling
        this.onComplete();
      }
    }, 2000);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  onComplete() {
    this.stopPolling();
    this.sendBtn.disabled = false;
    this.stopBtn.classList.add('hidden');
    this.hideOutputBar();
  }
}

export function getPromptManager() {
  if (!promptManager) promptManager = new PromptManager();
  return promptManager;
}
