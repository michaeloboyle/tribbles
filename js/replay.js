import SessionParser from './parser.js';
import { GraphModel } from './graph.js';
import GraphRenderer from './renderer.js';
import MessageLog from './log.js';
import AnimationController from './animation.js';
import { wireControls } from './controls.js';
import { showApp } from './view.js';
import { getPromptManager } from './prompt.js';
import { isServerAvailable } from './browser.js';

const API_BASE = window.location.origin;

export function buildLegend() {
  const items = [
    { label: 'Read', color: '#27ae60', shape: 'dot' },
    { label: 'Write', color: '#e67e22', shape: 'dot' },
    { label: 'Edit', color: '#f1c40f', shape: 'dot' },
    { label: 'Search', color: '#9b59b6', shape: 'dot' },
    { label: 'Task', color: '#e84393', shape: 'dot' },
    { label: 'Web', color: '#00b894', shape: 'dot' },
    { label: 'File', color: '#74b9ff', shape: 'rect' },
    { label: 'git', color: '#f39c12', shape: 'hex' },
    { label: 'fs', color: '#e74c3c', shape: 'hex' },
    { label: 'pkg', color: '#1abc9c', shape: 'hex' },
    { label: 'exec', color: '#e67e22', shape: 'hex' },
    { label: 'net', color: '#3498db', shape: 'hex' },
  ];

  const legend = document.getElementById('legend');
  legend.innerHTML = items.map(i => {
    let shape;
    if (i.shape === 'rect') {
      shape = `<span class="legend-rect" style="background:${i.color};opacity:0.4;border:1px solid ${i.color}"></span>`;
    } else if (i.shape === 'hex') {
      shape = `<svg width="10" height="10" viewBox="-6 -6 12 12"><polygon points="${
        d3.range(6).map(j => { const a = (Math.PI/3)*j - Math.PI/6; return [5*Math.cos(a), 5*Math.sin(a)].join(','); }).join(' ')
      }" fill="${i.color}" fill-opacity="0.5" stroke="${i.color}" stroke-width="1"/></svg>`;
    } else {
      shape = `<span class="legend-dot" style="background:${i.color}"></span>`;
    }
    return `<span class="legend-item">${shape} ${i.label}</span>`;
  }).join('');
}

export function initializeApp(session) {
  document.getElementById('session-info').textContent =
    `${session.model || 'unknown'} \u00B7 ${session.version || ''} \u00B7 ${session.steps.length} steps`;

  // Clear previous graph completely before creating new renderer
  const svgElement = document.getElementById('graph');
  svgElement.innerHTML = ''; // Clear all children

  // Reset zoom display
  const zoomDisplay = document.getElementById('zoom-level');
  if (zoomDisplay) zoomDisplay.textContent = '100%';

  const graphModel = new GraphModel();
  const renderer = new GraphRenderer(svgElement);
  const messageLog = new MessageLog(document.getElementById('messages-container'));
  const controller = new AnimationController(session, graphModel, renderer, messageLog);

  buildLegend();
  wireControls(controller, renderer);
  controller.updateControls();

  // Show prompt bar if server is available
  if (isServerAvailable()) {
    getPromptManager().show();
  }

  // Auto-play after short delay
  setTimeout(() => controller.play(), 400);
}

export async function startReplay(sessionId) {
  try {
    const resp = await fetch(`${API_BASE}/api/session?id=${sessionId}`);
    if (!resp.ok) throw new Error('Failed to load session');
    const text = await resp.text();
    const parser = new SessionParser();
    const session = parser.parse(text);
    if (session.steps.length === 0) {
      alert('No visualizable steps in this session.');
      return;
    }
    showApp();
    initializeApp(session);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
