export default class AnimationController {
  constructor(session, graphModel, renderer, messageLog) {
    this.session = session;
    this.model = graphModel;
    this.renderer = renderer;
    this.messageLog = messageLog;
    this.currentStep = -1;
    this.playing = false;
    this.timerId = null;
    this.speed = 600;
    this.accTokens = { input: 0, output: 0 };
    this.accFiles = new Set();
    this.accTools = {};

    window.appController = this;
  }

  play() {
    if (this.currentStep >= this.session.steps.length - 1) {
      // If at end, restart
      this.seekTo(-1);
    }
    this.playing = true;
    this.updatePlayButton();
    this.scheduleNext();
  }

  scheduleNext() {
    this.timerId = setTimeout(() => {
      if (!this.playing) return;
      if (this.currentStep >= this.session.steps.length - 1) {
        this.pause();
        return;
      }
      this.stepForward();
      if (this.playing) this.scheduleNext();
    }, this.speed);
  }

  pause() {
    this.playing = false;
    clearTimeout(this.timerId);
    this.updatePlayButton();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  stepForward() {
    if (this.currentStep >= this.session.steps.length - 1) return;
    this.currentStep++;
    this.applyStep(this.currentStep);
  }

  stepBack() {
    if (this.currentStep < 0) return;
    this.currentStep--;
    this.rebuildToStep(this.currentStep);
  }

  jumpToStart() {
    this.pause();
    this.seekTo(-1);
  }

  jumpToEnd() {
    this.pause();
    this.seekTo(this.session.steps.length - 1);
  }

  seekTo(stepIndex) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.currentStep = stepIndex;
    this.rebuildToStep(stepIndex);
    // Don't auto-resume on seek
  }

  setSpeed(ms) {
    this.speed = ms;
  }

  applyStep(idx) {
    const step = this.session.steps[idx];
    if (!step) return;

    this.model.addStepNodes(step);
    this.updateAccumulators(step);

    const visNodes = this.model.getVisibleNodes(idx);
    const visEdges = this.model.getVisibleEdges(idx);
    this.renderer.render(visNodes, visEdges, idx);
    this.messageLog.addStep(step);
    this.updateControls();
  }

  rebuildToStep(idx) {
    this.model.reset();
    this.renderer.clear();
    this.messageLog.clear();
    this.accTokens = { input: 0, output: 0 };
    this.accFiles = new Set();
    this.accTools = {};

    for (let i = 0; i <= idx; i++) {
      const step = this.session.steps[i];
      this.model.addStepNodes(step);
      this.messageLog.addStep(step);
      this.updateAccumulators(step);
    }

    if (idx >= 0) {
      const visNodes = this.model.getVisibleNodes(idx);
      const visEdges = this.model.getVisibleEdges(idx);
      this.renderer.render(visNodes, visEdges, idx);
    }

    this.messageLog.scrollToStep(idx);
    this.updateControls();
  }

  updateAccumulators(step) {
    if (step.tokens) {
      this.accTokens.input += step.tokens.input || 0;
      this.accTokens.output += step.tokens.output || 0;
    }
    if (step.type === 'tool_use') {
      this.accTools[step.toolName] = (this.accTools[step.toolName] || 0) + 1;
      for (const fp of step.filePaths) this.accFiles.add(fp);
    }
  }

  updateControls() {
    const total = this.session.steps.length;
    const cur = this.currentStep + 1;
    document.getElementById('step-counter').textContent = `${cur} / ${total}`;

    const slider = document.getElementById('progress-slider');
    slider.max = total - 1;
    slider.value = this.currentStep;

    document.getElementById('btn-prev').disabled = this.currentStep < 0;
    document.getElementById('btn-start').disabled = this.currentStep < 0;
    document.getElementById('btn-next').disabled = this.currentStep >= total - 1;
    document.getElementById('btn-end').disabled = this.currentStep >= total - 1;

    // Stats
    const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n;
    document.getElementById('stat-tokens').textContent =
      `${fmtK(this.accTokens.input)} in / ${fmtK(this.accTokens.output)} out`;
    document.getElementById('stat-files').textContent = this.accFiles.size;

    const toolParts = Object.entries(this.accTools).map(([k, v]) => `${k}(${v})`);
    document.getElementById('stat-tools').textContent = toolParts.join(' ') || '0';

    // Duration
    if (this.currentStep >= 0) {
      const first = this.session.steps[0]?.timestamp;
      const current = this.session.steps[this.currentStep]?.timestamp;
      if (first && current) {
        const diffMs = current - first;
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        document.getElementById('stat-duration').textContent = `${mins}m ${secs}s`;
      }
    }
  }

  updatePlayButton() {
    const btn = document.getElementById('btn-play');
    btn.textContent = this.playing ? '\u23F8' : '\u25B6';
    btn.classList.toggle('playing', this.playing);
  }
}
