const fixReview = {
  pollInterval: null,
  currentFixId: null,
  _notifiedIds: new Set(),

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
        document.getElementById('fix-review-badge').textContent = 'Fix Review';
        return;
      }

      document.getElementById('fix-review-badge').classList.add('has-fixes');
      document.getElementById('fix-review-badge').textContent = `Fix Review (${fixes.length})`;

      // Send desktop notifications for newly ready fixes
      fixes.forEach(fix => {
        if (fix.status === 'ready' && !this._notifiedIds.has(fix.fixId)) {
          this._notifiedIds.add(fix.fixId);
          this._notify(fix);
        }
      });

      // Group fixes by issue class for batch actions
      const byClass = {};
      fixes.forEach(fix => {
        const cls = fix.issueClass || '__unknown__';
        (byClass[cls] = byClass[cls] || []).push(fix);
      });

      let html = '';
      // Batch action bar when multiple fixes share a class
      for (const [cls, group] of Object.entries(byClass)) {
        if (group.length > 1 && cls !== '__unknown__') {
          html += `<div class="fix-batch-bar">
            <span class="fix-batch-class">${this._escHtml(cls)}</span>
            <span class="fix-batch-count">${group.length} fixes</span>
            <button class="btn-approve btn-batch" onclick="fixReview.batchResolve(${JSON.stringify(group.map(f => f.fixId))}, 'success')">Approve All</button>
            <button class="btn-reject btn-batch" onclick="fixReview.batchResolve(${JSON.stringify(group.map(f => f.fixId))}, 'failure')">Reject All</button>
          </div>`;
        }
      }

      for (const fix of fixes) {
        html += `<div class="fix-review-item" data-fix-id="${fix.fixId}">`;
        html += `<div class="fix-review-desc">${this._escHtml(fix.description)}</div>`;

        // Issue class + confidence badge
        if (fix.issueClass || fix.confidence !== undefined) {
          html += `<div class="fix-review-meta">`;
          if (fix.issueClass) {
            html += `<span class="fix-class-badge">${this._escHtml(fix.issueClass)}</span>`;
          }
          const conf = typeof fix.confidence === 'number' ? fix.confidence : 0;
          const confClass = conf >= 0.7 ? 'confidence-high' : 'confidence-low';
          const confLabel = conf >= 0.7 ? 'High' : 'Low';
          html += `<span class="fix-confidence-badge ${confClass}" title="Confidence: ${(conf * 100).toFixed(0)}%">${confLabel} ${(conf * 100).toFixed(0)}%</span>`;
          html += `</div>`;
        }

        if (fix.status === 'running') {
          html += `<div class="fix-review-status">Session running... after screenshot pending</div>`;
        } else if (fix.hasBeforeAfter) {
          html += await this.renderDiff(fix.fixId);
        } else if (fix.status === 'ready') {
          html += `<div class="fix-review-status">Screenshots captured</div>`;
        }

        // Code diff section (lazy-loaded)
        html += `<div class="fix-code-diff-wrapper" id="diff-${fix.fixId}">
          <button class="btn-show-diff" onclick="fixReview.loadDiff('${fix.fixId}')">Show Code Diff</button>
          <div class="fix-code-diff hidden" id="diff-content-${fix.fixId}"></div>
        </div>`;

        html += `<div class="fix-review-actions">`;
        html += `<button class="btn-approve" onclick="fixReview.resolve('${fix.fixId}','success')">Approve</button>`;
        html += `<button class="btn-partial" onclick="fixReview.resolve('${fix.fixId}','partial')">Partial</button>`;
        html += `<button class="btn-reject" onclick="fixReview.resolve('${fix.fixId}','failure')">Reject</button>`;
        html += `<button class="btn-revert hidden" id="revert-${fix.fixId}" onclick="fixReview.revert('${fix.fixId}')">Revert Files</button>`;
        html += `</div></div>`;
      }

      // Graduation stats section
      html += await this.renderGraduationStats();

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

      let html = `<div class="fix-review-images">
        <div class="img-col">
          <label>Before</label>
          <img src="/fix-snapshots/${beforeFile}" alt="Before" onclick="window.open(this.src)">
        </div>
        <div class="img-col">
          <label>After</label>
          <img src="/fix-snapshots/${afterFile}" alt="After" onclick="window.open(this.src)">
        </div>
      </div>`;

      // Show graduation button if class qualifies
      if (data.issueClass && data.canGraduate) {
        html += `<div class="fix-graduation-bar">
          <span>🎓 Class <strong>${this._escHtml(data.issueClass)}</strong> is ready to graduate
            (${(data.graduationRate * 100).toFixed(0)}% approval over ${data.graduationTotal} fixes)</span>
          <button class="btn-graduate" onclick="fixReview.graduate('${this._escHtml(data.issueClass)}')">Graduate → Autonomous</button>
        </div>`;
      }
      return html;
    } catch { return ''; }
  },

  async loadDiff(fixId) {
    const wrapper = document.getElementById(`diff-${fixId}`);
    const content = document.getElementById(`diff-content-${fixId}`);
    if (!wrapper || !content) return;

    try {
      const resp = await fetch(`/api/fix/diff?id=${fixId}`);
      const data = await resp.json();
      const diffs = data.diffs || [];
      if (!diffs.length) {
        content.innerHTML = '<div class="fix-review-status">No code edits found in session</div>';
      } else {
        content.innerHTML = diffs.map(d => `
          <div class="fix-diff-file">
            <div class="fix-diff-filename">${this._escHtml(d.file_path)} <span class="fix-diff-tool">${d.tool}</span></div>
            <pre class="fix-diff-pre">${this._renderUnifiedDiff(d.unified_diff)}</pre>
          </div>`).join('');
      }
      content.classList.remove('hidden');
      wrapper.querySelector('.btn-show-diff').textContent = 'Hide Code Diff';
      wrapper.querySelector('.btn-show-diff').onclick = () => {
        content.classList.toggle('hidden');
        wrapper.querySelector('.btn-show-diff').textContent =
          content.classList.contains('hidden') ? 'Show Code Diff' : 'Hide Code Diff';
      };
    } catch (e) {
      content.innerHTML = `<div class="fix-review-status">Error loading diff: ${e.message}</div>`;
      content.classList.remove('hidden');
    }
  },

  _renderUnifiedDiff(diff) {
    if (!diff) return '';
    return diff.split('\n').map(line => {
      const esc = this._escHtml(line);
      if (line.startsWith('+++') || line.startsWith('---')) return `<span class="diff-header">${esc}</span>`;
      if (line.startsWith('@@')) return `<span class="diff-hunk">${esc}</span>`;
      if (line.startsWith('+')) return `<span class="diff-add">${esc}</span>`;
      if (line.startsWith('-')) return `<span class="diff-del">${esc}</span>`;
      return `<span class="diff-ctx">${esc}</span>`;
    }).join('\n');
  },

  async renderGraduationStats() {
    try {
      const resp = await fetch('/api/fix/graduation-stats');
      const stats = await resp.json();
      const classes = Object.entries(stats);
      if (!classes.length) return '';

      let rows = classes.map(([cls, s]) => {
        const badge = s.graduated
          ? '<span class="fix-grad-badge grad-auto">AUTO</span>'
          : s.canGraduate
          ? `<button class="btn-graduate btn-graduate-small" onclick="fixReview.graduate('${this._escHtml(cls)}')">Graduate</button>`
          : '';
        return `<tr>
          <td>${this._escHtml(cls)}</td>
          <td>${s.approved}✓ ${s.partial}~ ${s.rejected}✗</td>
          <td>${(s.rate * 100).toFixed(0)}%</td>
          <td>${badge}</td>
        </tr>`;
      }).join('');

      return `<details class="fix-graduation-stats">
        <summary>Graduation Stats (${classes.length} classes)</summary>
        <table class="fix-stats-table">
          <thead><tr><th>Class</th><th>Outcomes</th><th>Rate</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>`;
    } catch { return ''; }
  },

  async resolve(fixId, outcome) {
    try {
      await fetch('/api/fix/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixId, outcome }),
      });
    } catch (e) {
      console.warn('[fix-review] resolve error:', e);
    }
    // Show revert button on reject
    if (outcome === 'failure') {
      const btn = document.getElementById(`revert-${fixId}`);
      if (btn) btn.classList.remove('hidden');
    }
    if (window.__claude && window.__claude.resolve) {
      window.__claude.resolve(fixId, outcome);
    }
    // Delay refresh so the server has time to persist the resolved status
    // before the poll reads it back (avoids the fix flickering back into view)
    setTimeout(() => this.refresh(), 800);
  },

  async batchResolve(fixIds, outcome) {
    await Promise.all(fixIds.map(id => this.resolve(id, outcome)));
  },

  async revert(fixId) {
    try {
      const resp = await fetch('/api/fix/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixId }),
      });
      const data = await resp.json();
      const btn = document.getElementById(`revert-${fixId}`);
      if (btn) {
        btn.textContent = data.reverted?.length
          ? `Reverted ${data.reverted.length} file(s)`
          : 'Nothing to revert';
        btn.disabled = true;
      }
    } catch (e) {
      console.warn('[fix-review] revert error:', e);
    }
  },

  async graduate(issueClass) {
    try {
      const resp = await fetch('/api/fix/graduate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueClass }),
      });
      const data = await resp.json();
      if (data.ok) {
        this.refresh();
      } else {
        alert(`Cannot graduate: ${data.error}`);
      }
    } catch (e) {
      console.warn('[fix-review] graduate error:', e);
    }
  },

  _notify(fix) {
    if (!('Notification' in window)) return;
    const show = () => {
      new Notification('Fix ready for review', {
        body: fix.description || 'A fix is ready for your approval.',
        icon: '/favicon.ico',
        tag: fix.fixId,
      });
    };
    if (Notification.permission === 'granted') {
      show();
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => { if (p === 'granted') show(); });
    }
  },

  _escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  startPolling() {
    // Poll every 5s for new fix snapshots
    this.pollInterval = setInterval(() => {
      fetch('/api/fix/snapshots')
        .then(r => r.json())
        .then(fixes => {
          const badge = document.getElementById('fix-review-badge');
          const pending = fixes.filter(f => !['approved', 'rejected', 'reverted'].includes(f.status));
          if (pending.length > 0) {
            badge.classList.add('has-fixes');
            badge.textContent = `Fix Review (${pending.length})`;
          } else {
            badge.classList.remove('has-fixes');
            badge.textContent = 'Fix Review';
          }
          // Auto-refresh if panel is open
          const panel = document.getElementById('fix-review-panel');
          if (panel.classList.contains('visible')) {
            this.refresh();
          }
          // Notify for newly ready fixes
          pending.forEach(fix => {
            if (fix.status === 'ready' && !this._notifiedIds.has(fix.fixId)) {
              this._notifiedIds.add(fix.fixId);
              this._notify(fix);
            }
          });
        })
        .catch(() => {});
    }, 5000);
  }
};

// Expose for onclick= attributes in HTML
window.fixReview = fixReview;

// Start polling after module loads
fixReview.startPolling();
