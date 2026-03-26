import { esc, trunc, openFile } from './utils.js';
import { basename } from './graph.js';
import { getToolIcon, isDataUri } from './theme.js';

const ZONE_COLORS = {
  autonomous: '#4ade80',
  'post-hoc': '#60a5fa',
  escalated: '#fbbf24',
};

export default class MessageLog {
  constructor(container) {
    this.container = container;
    this.entries = [];
    this.activitySource = null;
    this.currentSessionId = null;
  }

  /** Start streaming cross-repo activity events inline */
  startActivityStream(sessionId) {
    this.stopActivityStream();
    this.currentSessionId = sessionId;
    this.activitySource = new EventSource('/api/activity');

    this.activitySource.addEventListener('activity', (e) => {
      try {
        const event = JSON.parse(e.data);
        // Skip events from this session (already shown as tool calls)
        if (event.session === sessionId) return;
        // Skip post-edit/post-command (duplicates pre- events)
        if (event.action.startsWith('post-')) return;
        this.addActivityEvent(event);
      } catch { /* skip malformed */ }
    });
  }

  stopActivityStream() {
    if (this.activitySource) {
      this.activitySource.close();
      this.activitySource = null;
    }
  }

  addActivityEvent(event) {
    const div = document.createElement('div');
    div.className = 'msg-entry activity-entry';

    const zone = event.zone || 'autonomous';
    const color = ZONE_COLORS[zone] || '#94a3b8';
    const time = event.ts ? event.ts.split('T')[1]?.replace('Z', '').substring(0, 8) || '' : '';
    const target = (event.target || '').split('/').slice(-2).join('/');
    const tool = event.tool || event.action;

    div.innerHTML = `
      <div class="msg-header">
        <span class="activity-badge" style="color:${color}" title="${zone}">\u25c6</span>
        <span class="msg-role" style="color:${color}">${esc(event.repo)}</span>
        ${time ? `<span class="msg-time">${time}</span>` : ''}
      </div>
      <div class="msg-body"><code style="color:var(--text-dim)">${esc(tool)}</code> ${esc(trunc(target, 60))}</div>`;

    // Flash effect
    div.style.borderLeft = `2px solid ${color}`;
    this.container.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Fade flash
    div.style.background = `${color}15`;
    setTimeout(() => { div.style.background = ''; }, 1500);
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
            <span class="tool-badge tool-${step.toolName.toLowerCase()}" title="${step.toolName}">${isDataUri(getToolIcon(step.toolName)) ? `<img src="${getToolIcon(step.toolName)}" width="14" height="14" alt="${step.toolName}">` : getToolIcon(step.toolName)}</span>
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
          <div class="msg-header">
            <span class="claude-badge">◆</span>
            <span class="msg-role assistant">Claude</span>
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
