import { showApp } from './view.js';
import SessionParser from './parser.js';
import { GraphModel } from './graph.js';
import GraphRenderer from './renderer.js';
import MessageLog from './log.js';
import AnimationController from './animation.js';
import { wireControls } from './controls.js';
import { buildLegend } from './replay.js';

const API_BASE = window.location.origin;
let liveEventSource = null;

export function startLive(sessionId) {
  // Close any existing live connection
  if (liveEventSource) {
    liveEventSource.close();
    liveEventSource = null;
  }

  showApp();
  document.getElementById('live-indicator').classList.add('visible');

  const parser = new SessionParser();
  let session = null;
  let graphModel = null;
  let renderer = null;
  let messageLog = null;
  let controller = null;
  let initialized = false;

  liveEventSource = new EventSource(`${API_BASE}/api/live?id=${sessionId}`);

  liveEventSource.addEventListener('init', (e) => {
    // Initial batch of all existing content
    const text = JSON.parse(e.data);
    session = parser.parse(text);

    graphModel = new GraphModel();
    renderer = new GraphRenderer(document.getElementById('graph'));
    messageLog = new MessageLog(document.getElementById('messages-container'));
    controller = new AnimationController(session, graphModel, renderer, messageLog);

    buildLegend();
    wireControls(controller, renderer);

    // Jump to end and show everything
    controller.jumpToEnd();
    initialized = true;

    // Fit view after settling
    setTimeout(() => renderer.fitView(), 1000);
  });

  liveEventSource.addEventListener('line', (e) => {
    if (!initialized || !session) return;

    // Parse the new line and add any new steps
    const lineText = JSON.parse(e.data);
    let entry;
    try { entry = JSON.parse(lineText); } catch { return; }

    // Re-parse to get new steps (quick approach: parse just this line)
    const miniText = lineText;
    const miniSession = parser.parse(miniText);

    for (const step of miniSession.steps) {
      // Re-index with correct step index
      step.index = session.steps.length;
      session.steps.push(step);

      // Apply the new step
      controller.model.addStepNodes(step);
      controller.messageLog.addStep(step);
      controller.updateAccumulators(step);
    }

    if (miniSession.steps.length > 0) {
      controller.currentStep = session.steps.length - 1;
      const visNodes = controller.model.getVisibleNodes(controller.currentStep);
      const visEdges = controller.model.getVisibleEdges(controller.currentStep);
      controller.renderer.render(visNodes, visEdges, controller.currentStep);
      controller.updateControls();
    }
  });

  liveEventSource.onerror = () => {
    // SSE reconnects automatically, but show a visual cue
    document.getElementById('live-indicator').style.opacity = '0.5';
    setTimeout(() => {
      document.getElementById('live-indicator').style.opacity = '1';
    }, 2000);
  };
}

export function stopLive() {
  if (liveEventSource) {
    liveEventSource.close();
    liveEventSource = null;
  }
  document.getElementById('live-indicator').classList.remove('visible');
}
