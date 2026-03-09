import { esc, trunc, openFile } from './utils.js';
import { basename } from './graph.js';

export default class MessageLog {
  constructor(container) {
    this.container = container;
    this.entries = [];
  }

  addStep(step) {
    const el = this.createEntry(step);
    if (!el) return;
    this.entries.push({ step, el });
    this.container.appendChild(el);
    this.updateHighlights(step.index);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  createEntry(step) {
    const div = document.createElement('div');
    div.className = `msg-entry`;
    div.dataset.stepIndex = step.index;

    switch (step.type) {
      case 'user_message':
        div.innerHTML = `
          <div class="msg-header"><span class="msg-role user">User</span>
            ${step.timestamp ? `<span class="msg-time">${this.fmtTime(step.timestamp)}</span>` : ''}</div>
          <div class="msg-body">${esc(trunc(step.text, 200))}</div>`;
        break;
      case 'tool_use':
        div.innerHTML = `
          <div class="msg-header">
            <span class="tool-badge tool-${step.toolName.toLowerCase()}">${step.toolName}</span>
            ${step.timestamp ? `<span class="msg-time">${this.fmtTime(step.timestamp)}</span>` : ''}</div>
          <div class="msg-body"><code>${this.fmtToolInput(step)}</code></div>`;
        break;
      case 'tool_result':
        div.innerHTML = `
          <div class="msg-header"><span class="msg-role result">Result</span></div>
          <div class="msg-body result-body">${esc(trunc(step.resultPreview, 150))}</div>`;
        break;
      case 'assistant_text':
        div.innerHTML = `
          <div class="msg-header"><span class="msg-role assistant">Claude</span>
            ${step.timestamp ? `<span class="msg-time">${this.fmtTime(step.timestamp)}</span>` : ''}</div>
          <div class="msg-body">${esc(trunc(step.text, 200))}</div>`;
        break;
      case 'thinking':
        div.innerHTML = `
          <div class="msg-header"><span class="msg-role thinking">Thinking</span></div>
          <div class="msg-body thinking-body">${esc(trunc(step.thinkingPreview, 100))}</div>`;
        break;
      default:
        return null;
    }

    // Cmd+click file links to open, regular click to seek
    div.addEventListener('click', (e) => {
      const link = e.target.closest('.file-link');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        openFile(link.dataset.path);
        return;
      }
      if (window.appController) window.appController.seekTo(step.index);
    });

    return div;
  }

  updateHighlights(currentStep) {
    for (const { step, el } of this.entries) {
      el.classList.toggle('active', step.index === currentStep);
      el.classList.toggle('dimmed', step.index < currentStep);
    }
  }

  scrollToStep(stepIndex) {
    const entry = this.entries.find(e => e.step.index === stepIndex);
    if (entry) {
      entry.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    this.updateHighlights(stepIndex);
  }

  clear() {
    this.container.innerHTML = '';
    this.entries = [];
  }

  fmtTime(ts) {
    if (!ts) return '';
    const h = ts.getHours().toString().padStart(2, '0');
    const m = ts.getMinutes().toString().padStart(2, '0');
    const s = ts.getSeconds().toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  fileLink(path) {
    if (!path) return '';
    const name = basename(path);
    return `<a class="file-link" href="#" data-path="${esc(path)}" title="${esc(path)}">${esc(name)}</a>`;
  }

  fmtToolInput(step) {
    const inp = step.input;
    switch (step.toolName) {
      case 'Read': return this.fileLink(inp.file_path);
      case 'Write': return `${this.fileLink(inp.file_path)} (${(inp.content || '').length} chars)`;
      case 'Edit': return this.fileLink(inp.file_path);
      case 'Bash': return esc(trunc(inp.command || '', 80));
      case 'Grep': return `/${esc((inp.pattern || '').slice(0, 30))}/ in ${this.fileLink(inp.path || '.')}`;
      case 'Glob': return `${esc((inp.pattern || '').slice(0, 30))} in ${this.fileLink(inp.path || '.')}`;
      case 'WebFetch': return esc(trunc(inp.url || '', 60));
      case 'WebSearch': return esc(trunc(inp.query || '', 60));
      case 'Task': return esc(trunc(inp.description || inp.prompt || 'sub-agent', 60));
      default: return esc(step.toolName);
    }
  }
}
