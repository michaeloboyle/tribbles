import { esc } from './utils.js';

const tooltip = document.getElementById('tooltip');

export function showTooltip(event, d) {
  let html = '';
  if (d.type === 'file') {
    html = `<div class="tt-title">${esc(d.label)}</div>
      <div class="tt-detail">${esc(d.fullPath)}</div>
      <div class="tt-detail">Read: ${d.readCount} | Write: ${d.writeCount} | Edit: ${d.editCount}</div>`;
  } else if (d.type.startsWith('cmd:')) {
    html = `<div class="tt-title">${esc(d.label)}</div>
      <div class="tt-detail" style="font-family:monospace">${esc(d.fullCommand || '')}</div>`;
  } else if (d.type.startsWith('tool:')) {
    html = `<div class="tt-title">${esc(d.toolName || d.label)}</div>
      <div class="tt-detail">${esc(d.sublabel || '')}</div>`;
  }
  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
  moveTooltip(event);
}

export function moveTooltip(event) {
  tooltip.style.left = (event.clientX + 12) + 'px';
  tooltip.style.top = (event.clientY - 10) + 'px';
}

export function hideTooltip() {
  tooltip.style.display = 'none';
}
