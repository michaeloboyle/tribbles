// Sidebar resize handle — VSCode-style drag-to-resize

const STORAGE_KEY = 'tribbles-sidebar-width';
const MIN = 200;
const MAX = 600;

export function initResize() {
  const handle = document.getElementById('sidebar-resize');
  const landing = document.getElementById('landing');
  if (!handle || !landing) return;

  // Restore saved width
  const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (saved >= MIN && saved <= MAX) {
    document.documentElement.style.setProperty('--sidebar-width', saved + 'px');
  }

  let startX, startW;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startW = landing.getBoundingClientRect().width;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const w = Math.min(MAX, Math.max(MIN, startW + e.clientX - startX));
      document.documentElement.style.setProperty('--sidebar-width', w + 'px');
    }

    function onUp() {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalW = landing.getBoundingClientRect().width;
      localStorage.setItem(STORAGE_KEY, Math.round(finalW));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
