import { stopLive } from './live.js';
import { getPromptManager } from './prompt.js';
import { showLanding } from './view.js';

let keydownHandler = null;

export function wireControls(controller, renderer) {
  document.getElementById('btn-play').addEventListener('click', () => controller.toggle());
  document.getElementById('btn-next').addEventListener('click', () => { controller.pause(); controller.stepForward(); });
  document.getElementById('btn-prev').addEventListener('click', () => { controller.pause(); controller.stepBack(); });
  document.getElementById('btn-start').addEventListener('click', () => controller.jumpToStart());
  document.getElementById('btn-end').addEventListener('click', () => controller.jumpToEnd());

  document.getElementById('speed-slider').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    controller.setSpeed(val);
    document.getElementById('speed-label').textContent = val + 'ms';
  });

  document.getElementById('progress-slider').addEventListener('input', (e) => {
    controller.seekTo(parseInt(e.target.value));
  });

  document.getElementById('layout-select').addEventListener('change', (e) => {
    renderer.setLayout(e.target.value);
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    controller.pause();
    renderer.clear();
    stopLive();
    const pm = getPromptManager();
    if (pm) pm.hide();
    showLanding();
    window.appController = null;
    document.getElementById('layout-select').value = 'force';
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
  });

  // Keyboard
  if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
  keydownHandler = (e) => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.code) {
      case 'Space': e.preventDefault(); controller.toggle(); break;
      case 'ArrowRight': e.preventDefault(); controller.pause(); controller.stepForward(); break;
      case 'ArrowLeft': e.preventDefault(); controller.pause(); controller.stepBack(); break;
      case 'Home': e.preventDefault(); controller.jumpToStart(); break;
      case 'End': e.preventDefault(); controller.jumpToEnd(); break;
      case 'KeyF': e.preventDefault(); renderer.fitView(); break;
    }
  };
  document.addEventListener('keydown', keydownHandler);
}
