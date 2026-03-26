/**
 * Activity Dashboard - Cross-repo agent activity timeline
 * Streams events from ~/.claude/activity.jsonl via SSE
 */

const ZONE_COLORS = {
  autonomous: '#4ade80',  // green
  'post-hoc': '#60a5fa',  // blue
  escalated: '#fbbf24',   // amber
  unknown: '#94a3b8',     // gray
};

const ZONE_ICONS = {
  autonomous: '\u25cf',  // filled circle
  'post-hoc': '\u25cf',
  escalated: '\u25d0',   // half circle
  unknown: '\u25cb',     // empty circle
};

let activitySource = null;
let events = [];
let repoStats = {};

export function initActivity(container) {
  container.innerHTML = `
    <div id="activity-dashboard">
      <div id="activity-header">
        <h2>Agent Activity</h2>
        <div id="activity-status">connecting...</div>
      </div>
      <div id="activity-body">
        <div id="repo-graph"></div>
        <div id="activity-timeline"></div>
      </div>
      <div id="activity-footer">
        <div id="zone-summary"></div>
      </div>
    </div>
  `;
  startStream();
}

export function stopActivity() {
  if (activitySource) {
    activitySource.close();
    activitySource = null;
  }
}

function startStream() {
  // First load recent events via REST, then switch to SSE
  fetch('/api/activity/recent?limit=200')
    .then(r => r.json())
    .then(data => {
      events = data;
      updateStats();
      renderTimeline();
      renderRepoGraph();
      renderZoneSummary();
      connectSSE();
    })
    .catch(() => {
      // No activity log yet, just connect SSE
      connectSSE();
    });
}

function connectSSE() {
  const status = document.getElementById('activity-status');
  activitySource = new EventSource('/api/activity');

  activitySource.addEventListener('activity', (e) => {
    try {
      const event = JSON.parse(e.data);
      events.push(event);
      // Keep last 500 events in memory
      if (events.length > 500) events = events.slice(-500);
      updateStats();
      addTimelineEvent(event);
      renderRepoGraph();
      renderZoneSummary();
    } catch (err) { /* skip malformed */ }
  });

  activitySource.onopen = () => {
    if (status) status.textContent = 'live';
    if (status) status.style.color = ZONE_COLORS.autonomous;
  };

  activitySource.onerror = () => {
    if (status) status.textContent = 'reconnecting...';
    if (status) status.style.color = ZONE_COLORS.escalated;
  };
}

function updateStats() {
  repoStats = {};
  const zoneCounts = { autonomous: 0, 'post-hoc': 0, escalated: 0 };

  for (const e of events) {
    const repo = e.repo || 'unknown';
    if (!repoStats[repo]) repoStats[repo] = { count: 0, lastAction: '', lastTs: '' };
    repoStats[repo].count++;
    repoStats[repo].lastAction = e.action;
    repoStats[repo].lastTs = e.ts;

    const zone = e.zone || 'unknown';
    if (zone in zoneCounts) zoneCounts[zone]++;
  }

  return zoneCounts;
}

function renderTimeline() {
  const container = document.getElementById('activity-timeline');
  if (!container) return;
  container.innerHTML = '';

  // Show last 50 events, newest first
  const recent = events.slice(-50).reverse();
  for (const e of recent) {
    container.appendChild(createEventRow(e));
  }
}

function addTimelineEvent(event) {
  const container = document.getElementById('activity-timeline');
  if (!container) return;

  const row = createEventRow(event);
  container.insertBefore(row, container.firstChild);

  // Flash effect
  row.style.background = 'rgba(255,255,255,0.1)';
  setTimeout(() => { row.style.background = ''; }, 1000);

  // Keep DOM size manageable
  while (container.children.length > 100) {
    container.removeChild(container.lastChild);
  }
}

function createEventRow(e) {
  const row = document.createElement('div');
  row.className = 'activity-row';

  const zone = e.zone || 'unknown';
  const color = ZONE_COLORS[zone] || ZONE_COLORS.unknown;
  const icon = ZONE_ICONS[zone] || ZONE_ICONS.unknown;

  const time = e.ts ? e.ts.split('T')[1]?.replace('Z', '') || '' : '';
  const target = (e.target || '').split('/').slice(-2).join('/');  // last 2 path segments

  row.innerHTML = `
    <span class="activity-time">${time.substring(0, 8)}</span>
    <span class="activity-icon" style="color:${color}">${icon}</span>
    <span class="activity-zone" style="color:${color}">[${zone}]</span>
    <span class="activity-repo">${e.repo || '?'}</span>
    <span class="activity-action">${e.action || '?'}</span>
    <span class="activity-target" title="${e.target || ''}">${target}</span>
  `;

  return row;
}

function renderRepoGraph() {
  const container = document.getElementById('repo-graph');
  if (!container) return;

  const repos = Object.entries(repoStats).sort((a, b) => b[1].count - a[1].count);
  if (repos.length === 0) {
    container.innerHTML = '<div class="no-data">No activity yet</div>';
    return;
  }

  const maxCount = Math.max(...repos.map(([, s]) => s.count));

  container.innerHTML = repos.map(([name, stats]) => {
    const barWidth = Math.max(10, (stats.count / maxCount) * 100);
    const isRecent = stats.lastTs && (Date.now() - new Date(stats.lastTs).getTime()) < 60000;
    const pulse = isRecent ? 'repo-active' : '';

    return `
      <div class="repo-bar ${pulse}">
        <span class="repo-name">${name}</span>
        <div class="repo-meter">
          <div class="repo-fill" style="width:${barWidth}%"></div>
        </div>
        <span class="repo-count">${stats.count}</span>
      </div>
    `;
  }).join('');
}

function renderZoneSummary() {
  const container = document.getElementById('zone-summary');
  if (!container) return;

  const counts = updateStats();
  container.innerHTML = Object.entries(counts).map(([zone, count]) => {
    const color = ZONE_COLORS[zone];
    return `<span class="zone-chip" style="color:${color}">\u25a0 ${zone}: ${count}</span>`;
  }).join('  ');
}
