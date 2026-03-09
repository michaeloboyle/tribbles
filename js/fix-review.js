const fixReview = {
  pollInterval: null,
  currentFixId: null,

  toggle() {
    const panel = document.getElementById('fix-review-panel');
    panel.classList.toggle('visible');
    if (panel.classList.contains('visible')) {
      this.refresh();
    }
  },

  async refresh() {
    try {
      const resp = await fetch('/api/fix/snapshots');
      const fixes = await resp.json();
      const body = document.getElementById('fix-review-body');

      if (!fixes.length) {
        body.innerHTML = '<div class="fix-review-status">No fixes to review</div>';
        document.getElementById('fix-review-badge').classList.remove('has-fixes');
        return;
      }

      document.getElementById('fix-review-badge').classList.add('has-fixes');
      document.getElementById('fix-review-badge').textContent = `Fix Review (${fixes.length})`;

      let html = '';
      for (const fix of fixes) {
        html += `<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">`;
        html += `<div class="fix-review-desc">${fix.description}</div>`;

        if (fix.status === 'running') {
          html += `<div class="fix-review-status">Session running... after screenshot pending</div>`;
        } else if (fix.hasBeforeAfter) {
          html += await this.renderDiff(fix.fixId);
        } else if (fix.status === 'ready') {
          html += `<div class="fix-review-status">Screenshots captured (partial)</div>`;
        }

        html += `<div class="fix-review-actions">`;
        html += `<button class="btn-approve" onclick="fixReview.resolve('${fix.fixId}','success')">Approve</button>`;
        html += `<button class="btn-partial" onclick="fixReview.resolve('${fix.fixId}','partial')">Partial</button>`;
        html += `<button class="btn-reject" onclick="fixReview.resolve('${fix.fixId}','failure')">Reject</button>`;
        html += `</div></div>`;
      }
      body.innerHTML = html;
    } catch (e) {
      console.warn('[fix-review] refresh error:', e);
    }
  },

  async renderDiff(fixId) {
    try {
      const resp = await fetch(`/api/fix/snapshot?id=${fixId}`);
      const data = await resp.json();
      if (!data.beforePath || !data.afterPath) return '';

      const beforeFile = data.beforePath.split('/').pop();
      const afterFile = data.afterPath.split('/').pop();

      return `<div class="fix-review-images">
        <div class="img-col">
          <label>Before</label>
          <img src="/fix-snapshots/${beforeFile}" alt="Before" onclick="window.open(this.src)">
        </div>
        <div class="img-col">
          <label>After</label>
          <img src="/fix-snapshots/${afterFile}" alt="After" onclick="window.open(this.src)">
        </div>
      </div>`;
    } catch { return ''; }
  },

  resolve(fixId, outcome) {
    if (window.__claude && window.__claude.resolve) {
      window.__claude.resolve(fixId, outcome);
    }
    // Remove from UI
    this.refresh();
  },

  startPolling() {
    // Poll every 5s for new fix snapshots
    this.pollInterval = setInterval(() => {
      fetch('/api/fix/snapshots')
        .then(r => r.json())
        .then(fixes => {
          const badge = document.getElementById('fix-review-badge');
          if (fixes.length > 0) {
            badge.classList.add('has-fixes');
            badge.textContent = `Fix Review (${fixes.length})`;
          } else {
            badge.classList.remove('has-fixes');
          }
          // Auto-refresh if panel is open
          const panel = document.getElementById('fix-review-panel');
          if (panel.classList.contains('visible')) {
            this.refresh();
          }
        })
        .catch(() => {});
    }, 5000);
  }
};

// Expose for onclick= attributes in HTML
window.fixReview = fixReview;

// Start polling after module loads
fixReview.startPolling();
