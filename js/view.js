export function showApp() {
  document.getElementById('landing').classList.add('sidebar');
  document.getElementById('app').classList.remove('hidden');
}

export function showLanding() {
  document.getElementById('landing').classList.remove('sidebar');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('live-indicator').classList.remove('visible');
}
