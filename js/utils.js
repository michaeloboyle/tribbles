export function esc(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

export function trunc(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

export function openFile(path) {
  fetch(`/api/open?path=${encodeURIComponent(path)}`)
    .then(r => r.json())
    .then(r => { if (r.error) console.warn('Open failed:', r.error); })
    .catch(e => console.warn('Open failed:', e));
}
