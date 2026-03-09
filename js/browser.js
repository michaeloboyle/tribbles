import { esc } from './utils.js';
import { TOOL_COLORS } from './graph.js';
import { startReplay } from './replay.js';
import { startLive } from './live.js';
import { showApp } from './view.js';
import { getPromptManager } from './prompt.js';
import { applyTheme, resetToDefault, initTheme } from './theme.js';

const API_BASE = window.location.origin;
let serverAvailable = false;
let paginationState = null;
let listClickController = null;

initTheme();

export function isServerAvailable() {
  return serverAvailable;
}

export async function checkServer() {
  try {
    const resp = await fetch(API_BASE + '/api/sessions', { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      serverAvailable = true;
      const sessions = await resp.json();
      renderSessionBrowser(sessions);
      // Show new session bar
      document.getElementById('new-session-bar').classList.remove('hidden');
      loadThemes();
      return sessions;
    }
  } catch {}
  return null;
}

async function loadThemes() {
  const res = await fetch('/api/themes').catch(() => null);
  if (!res?.ok) return;
  const themes = await res.json();
  const sel = document.getElementById('theme-select');
  const dark = themes.filter(t => t.type !== 'light');
  const light = themes.filter(t => t.type === 'light');
  if (dark.length) {
    const g = document.createElement('optgroup'); g.label = 'Dark';
    dark.forEach(t => { const o = new Option(t.name, t.idx); g.append(o); });
    sel.append(g);
  }
  if (light.length) {
    const g = document.createElement('optgroup'); g.label = 'Light';
    light.forEach(t => { const o = new Option(t.name, t.idx); g.append(o); });
    sel.append(g);
  }
  // Restore saved selection
  const saved = localStorage.getItem('tribbles-theme');
  if (saved) {
    try {
      const name = JSON.parse(saved).name;
      const opt = [...sel.options].find(o => o.text === name);
      if (opt) opt.selected = true;
    } catch {}
  }
}

document.getElementById('theme-select').addEventListener('change', async (e) => {
  if (e.target.value === '__default__') { resetToDefault(); return; }
  const res = await fetch(`/api/theme?idx=${e.target.value}`);
  if (res.ok) {
    const json = await res.json();
    applyTheme(json);
  }
});

export function renderAnalysisCardHtml(a) {
  const rows = (a.areas || []).map(area =>
    `<tr><td>${esc(area.name)}</td><td>${area.pct}%</td><td>${esc(area.status)}</td></tr>`
  ).join('');
  const table = rows ? `<table class="analysis-table">${rows}</table>` : '';
  const prose = [];
  if (a.shipped) prose.push(`<p><strong>What shipped:</strong> ${esc(a.shipped)}</p>`);
  if (a.waste) prose.push(`<p class="waste"><strong>Waste:</strong> ${esc(a.waste)}</p>`);
  if (a.pattern) prose.push(`<p><strong>Pattern:</strong> ${esc(a.pattern)}</p>`);
  const proseHtml = prose.length ? `<div class="analysis-prose">${prose.join('')}</div>` : '';
  return `<div class="analysis-card" data-end="${a.endDate || ''}">
    <h3>${esc(a.title || 'Analysis')}</h3>
    <div class="analysis-headline">${esc(a.headline || '')}</div>
    ${table}${proseHtml}
  </div>`;
}

function renderDayHtml(dayKey, daySessions) {
  const totalSteps = daySessions.reduce((a, s) => a + (s.stepEstimate || 0), 0);
  const totalBytes = daySessions.reduce((a, s) => a + (s.sizeBytes || 0), 0);
  const compactions = daySessions.filter(s => (s.sizeBytes || 0) > 5_000_000).length;
  const toolTotals = {};
  for (const s of daySessions) {
    for (const [tool, count] of Object.entries(s.toolCounts || {})) {
      toolTotals[tool] = (toolTotals[tool] || 0) + count;
    }
  }
  const topTools = Object.entries(toolTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const dayDate = new Date(dayKey + 'T12:00:00');
  const dayLabel = dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const sizeMB = (totalBytes / 1048576).toFixed(1);
  const compTag = compactions > 0 ? `<span style="color:var(--accent-write)">${compactions} compacted</span>` : '';
  const toolChipsDay = topTools.map(([name, count]) => {
    const color = TOOL_COLORS[name] || '#6a6a8a';
    return `<span class="session-tool-chip" style="background:${color}">${name} ${count}</span>`;
  }).join('');

  let out = `<div class="day-summary-card" data-day="${dayKey}">
    <span class="day-summary-date">${dayLabel}</span>
    <div class="day-summary-stats">
      <span>${daySessions.length} sessions</span>
      <span>${totalSteps} steps</span>
      <span>${sizeMB} MB</span>
      ${compTag}
    </div>
    <div class="day-summary-tools">${toolChipsDay}</div>
  </div>`;

  for (const s of daySessions) {
    const isActive = s.active;
    const toolChips = Object.entries(s.toolCounts || {}).slice(0, 6).map(([name, count]) => {
      const color = TOOL_COLORS[name] || '#6a6a8a';
      return `<span class="session-tool-chip" style="background:${color}">${name} ${count}</span>`;
    }).join('');

    const startDate = s.startTime ? new Date(s.startTime) : null;
    const dateStr = startDate ? startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const timeStr = startDate ? startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';

    out += `
      <div class="session-card ${isActive ? 'active-session' : ''}" data-id="${s.id}">
        <div class="session-status">
          ${isActive ? '<span class="live-dot"></span>' : '<span style="color:var(--text-dim);font-size:10px">' + dateStr + '</span>'}
          <span class="session-age">${isActive ? 'LIVE' : s.modifiedAgo}</span>
        </div>
        <div class="session-info">
          <div class="session-msg">${esc(s.firstMessage)}</div>
          <div class="session-meta">
            <span>${s.model}</span>
            <span>${s.stepEstimate} steps</span>
            <span>${s.sizeHuman}</span>
            ${timeStr ? `<span>${timeStr}</span>` : ''}
          </div>
          ${toolChips ? `<div class="session-tools">${toolChips}</div>` : ''}
        </div>
        <div class="session-actions">
          ${isActive ? `<button class="session-btn live-btn" data-action="live" data-id="${s.id}">Watch Live</button>` : ''}
          <button class="session-btn continue-btn" data-action="continue" data-id="${s.id}">Continue</button>
          <button class="session-btn" data-action="replay" data-id="${s.id}">Replay</button>
        </div>
      </div>`;
  }
  return out;
}

export function renderSessionBrowser(sessions) {
  const browser = document.getElementById('session-browser');
  const list = document.getElementById('session-list');
  browser.classList.remove('hidden');

  if (!sessions || sessions.length === 0) {
    list.innerHTML = '<div style="color:var(--text-dim);padding:20px;text-align:center">No sessions found in ~/.claude/projects/</div>';
    return;
  }

  // Group sessions by day (using startTime or endTime)
  const byDay = {};
  for (const s of sessions) {
    const ts = s.startTime || s.endTime;
    const dayKey = ts ? new Date(ts).toLocaleDateString('en-CA') : 'unknown'; // YYYY-MM-DD
    (byDay[dayKey] ??= []).push(s);
  }
  const dayKeys = Object.keys(byDay).sort().reverse();

  // Weekly analysis card (last 7 days only)
  const html = [];
  const weekDayKeys = dayKeys.slice(0, 7);
  const weekSessions = weekDayKeys.flatMap(dk => byDay[dk]);
  if (weekDayKeys.length >= 2) {
    const allSteps = weekSessions.reduce((a, s) => a + (s.stepEstimate || 0), 0);
    const allBytes = weekSessions.reduce((a, s) => a + (s.sizeBytes || 0), 0);
    const allCompactions = weekSessions.filter(s => (s.sizeBytes || 0) > 5_000_000).length;
    const allToolTotals = {};
    const projectTotals = {};
    for (const s of weekSessions) {
      for (const [tool, count] of Object.entries(s.toolCounts || {})) {
        allToolTotals[tool] = (allToolTotals[tool] || 0) + count;
      }
      const proj = s.project || 'unknown';
      projectTotals[proj] = (projectTotals[proj] || 0) + 1;
    }
    const topToolsAll = Object.entries(allToolTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sizeMBAll = (allBytes / 1048576).toFixed(0);
    const avgPerDay = (weekSessions.length / weekDayKeys.length).toFixed(1);
    const firstDay = new Date(weekDayKeys[weekDayKeys.length - 1] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const lastDay = new Date(weekDayKeys[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Project area breakdown by steps
    const projSteps = {};
    for (const s of weekSessions) {
      const proj = (s.project || 'unknown').split('/').pop();
      projSteps[proj] = (projSteps[proj] || 0) + (s.stepEstimate || 0);
    }
    const projBySteps = Object.entries(projSteps).sort((a, b) => b[1] - a[1]);
    const projRows = projBySteps.slice(0, 6).map(([p, steps]) => {
      const pct = allSteps > 0 ? Math.round((steps / allSteps) * 100) : 0;
      const count = projectTotals[Object.keys(projectTotals).find(k => k.split('/').pop() === p)] || 0;
      return `<div class="analysis-area-row">
        <span class="analysis-area-bar" style="width:${Math.max(pct, 2)}%"></span>
        <span class="analysis-area-name">${esc(p)}</span>
        <span class="analysis-area-pct">${pct}%</span>
        <span class="analysis-area-detail">${count} sessions \u00b7 ${steps.toLocaleString()} steps</span>
      </div>`;
    }).join('');

    // Waste signals
    const warnings = [];
    if (allCompactions > 0) warnings.push(`${allCompactions} compactions \u2014 sessions run to exhaustion`);
    const uniqueProjects = Object.keys(projSteps).length;
    if (uniqueProjects > 5) warnings.push(`${uniqueProjects} project areas \u2014 high context switching`);
    const busiestDay = weekDayKeys.reduce((best, dk) => byDay[dk].length > (byDay[best]?.length || 0) ? dk : best, weekDayKeys[0]);
    const quietestDay = weekDayKeys.reduce((best, dk) => byDay[dk].length < (byDay[best]?.length || Infinity) ? dk : best, weekDayKeys[0]);
    if (byDay[busiestDay].length > byDay[quietestDay].length * 3) {
      warnings.push(`Uneven load: ${byDay[busiestDay].length} sessions on busiest day vs ${byDay[quietestDay].length} on quietest`);
    }
    const warningHtml = warnings.length > 0
      ? `<div class="analysis-warnings">${warnings.map(w => `<div class="analysis-warning">${esc(w)}</div>`).join('')}</div>`
      : '';

    const toolLine = topToolsAll.map(([n, c]) => `${n} ${c}`).join(' \u00b7 ');

    html.push(`<div class="week-analysis-card">
      <h3>${firstDay} \u2013 ${lastDay} \u00b7 ${weekDayKeys.length} days</h3>
      <div class="week-analysis-grid">
        <div class="week-analysis-stat"><div class="val">${weekSessions.length}</div><div class="label">sessions</div></div>
        <div class="week-analysis-stat"><div class="val">${avgPerDay}</div><div class="label">avg / day</div></div>
        <div class="week-analysis-stat"><div class="val">${allSteps.toLocaleString()}</div><div class="label">steps</div></div>
        <div class="week-analysis-stat"><div class="val">${sizeMBAll}</div><div class="label">MB context</div></div>
        <div class="week-analysis-stat"><div class="val">${allCompactions}</div><div class="label">compactions</div></div>
      </div>
      <div class="analysis-areas">${projRows}</div>
      <div style="color:var(--text-dim);margin-top:6px;font-size:9px">Top tools: ${esc(toolLine)}</div>
      ${warningHtml}
    </div>`);
  }

  // Fetch analyses and insert inline (non-blocking, progressive)
  function loadAnalyses() {
    fetch(API_BASE + '/api/analyses', { signal: AbortSignal.timeout(5000) })
      .then(r => r.ok ? r.json() : { analyses: [], generating: [] })
      .then(data => {
        const analyses = data.analyses || [];
        const generating = data.generating || [];
        // Remove old analysis cards + generating indicators
        list.querySelectorAll('.analysis-card, .analysis-generating').forEach(el => el.remove());
        for (const a of analyses) {
          const target = list.querySelector(`.day-summary-card[data-day="${a.endDate}"]`);
          if (target) {
            target.insertAdjacentHTML('afterend', renderAnalysisCardHtml(a));
          }
        }
        // Show generating indicators
        for (const key of generating) {
          const endDate = key.split('_')[1];
          const target = list.querySelector(`.day-summary-card[data-day="${endDate}"]`);
          if (target && !list.querySelector(`.analysis-card[data-end="${endDate}"]`)) {
            target.insertAdjacentHTML('afterend',
              `<div class="analysis-generating" style="font-size:9px;color:var(--accent-user);padding:6px 14px;opacity:0.7">Generating analysis\u2026</div>`);
          }
        }
        // Poll if still generating
        if (generating.length > 0) {
          setTimeout(loadAnalyses, 5000);
        }
      })
      .catch(() => {});
  }
  // Cache week HTML and store state
  paginationState = { byDay, dayKeys, currentIdx: 0, weekHtml: html.join(''), list, loadAnalyses };

  // Render day 0
  renderCurrentDay();

  // Abort previous listeners on re-render (Refresh)
  if (listClickController) listClickController.abort();
  listClickController = new AbortController();
  const sig = listClickController.signal;

  // Delegated click: session cards + buttons
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.session-btn');
    if (btn) {
      e.stopPropagation();
      const { id, action } = btn.dataset;
      if (action === 'live') startLive(id);
      else if (action === 'replay') startReplay(id);
      else if (action === 'continue') showContinueInput(btn, id);
      return;
    }
    const card = e.target.closest('.session-card');
    if (card && !e.target.closest('.session-continue-input')) {
      card.classList.contains('active-session') ? startLive(card.dataset.id) : startReplay(card.dataset.id);
    }
  }, { signal: sig });

  // Prev / Next buttons
  document.getElementById('btn-day-prev').addEventListener('click', () => navigateDay(1), { signal: sig });
  document.getElementById('btn-day-next').addEventListener('click', () => navigateDay(-1), { signal: sig });

  // Keyboard arrows (skip when typing)
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.key === 'ArrowLeft') navigateDay(1);
    else if (e.key === 'ArrowRight') navigateDay(-1);
  }, { signal: sig });
}

function renderCurrentDay() {
  const { byDay, dayKeys, currentIdx, weekHtml, list, loadAnalyses } = paginationState;
  list.innerHTML = weekHtml + renderDayHtml(dayKeys[currentIdx], byDay[dayKeys[currentIdx]]);
  loadAnalyses();
  updateDayNav();
}

function updateDayNav() {
  const { currentIdx, dayKeys } = paginationState;
  const dayKey = dayKeys[currentIdx];
  const dayLabel = new Date(dayKey + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  document.getElementById('day-nav-label').textContent = `${dayLabel} \u00b7 ${currentIdx + 1} / ${dayKeys.length}`;
  document.getElementById('btn-day-prev').disabled = currentIdx >= dayKeys.length - 1;
  document.getElementById('btn-day-next').disabled = currentIdx <= 0;
}

function navigateDay(delta) {
  if (!paginationState) return;
  const newIdx = paginationState.currentIdx + delta;
  if (newIdx < 0 || newIdx >= paginationState.dayKeys.length) return;
  paginationState.currentIdx = newIdx;
  renderCurrentDay();
}

function showContinueInput(btn, sessionId) {
  // Don't duplicate
  const card = btn.closest('.session-card');
  if (card.querySelector('.session-continue-input')) return;

  const row = document.createElement('div');
  row.className = 'session-continue-input';
  row.innerHTML = `
    <input type="text" placeholder="Enter a prompt..." autofocus>
    <button>Send</button>
  `;
  card.appendChild(row);

  const input = row.querySelector('input');
  const sendBtn = row.querySelector('button');

  // Prevent card click from navigating
  row.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') doSend();
    if (e.key === 'Escape') row.remove();
  });

  function doSend() {
    const prompt = input.value.trim();
    if (!prompt) return;

    const pm = getPromptManager();

    // Show the app, enter prompt flow
    showApp();
    pm.show();
    pm.input.value = prompt;
    pm.send(sessionId);
  }

  sendBtn.addEventListener('click', doSend);
  input.focus();
}
