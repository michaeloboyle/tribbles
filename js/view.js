export function showApp() {
  document.getElementById('landing').classList.add('sidebar');
  const app = document.getElementById('app');
  app.classList.remove('hidden');

  // Apply saved view mode
  const savedMode = localStorage.getItem('tribbles-view-mode') || 'split';
  app.setAttribute('data-view-mode', savedMode);
}

export function showLanding() {
  document.getElementById('landing').classList.remove('sidebar');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('live-indicator').classList.remove('visible');
}
