// Theme engine: VS Code theme support with Tribbles defaults

const DEFAULT = {
  '--bg': '#0f0f1a', '--bg-panel': '#141425', '--bg-card': '#1a1a35',
  '--bg-card-active': '#222245', '--text': '#d0d0e0', '--text-dim': '#6a6a8a',
  '--text-bright': '#f0f0ff', '--border': '#2a2a45',
  '--accent-user': '#4a90d9', '--accent-read': '#27ae60', '--accent-write': '#e67e22',
  '--accent-edit': '#f1c40f', '--accent-bash': '#e74c3c', '--accent-search': '#9b59b6',
  '--accent-task': '#e84393', '--accent-web': '#00b894',
  '--accent-file': '#74b9ff', '--accent-text': '#b0b0cc', '--accent-thinking': '#555577',
};

const VSC_MAP = {
  '--bg':             ['editor.background'],
  '--bg-panel':       ['sideBar.background', 'panel.background'],
  '--bg-card':        ['editorWidget.background', 'input.background', 'dropdown.background'],
  '--bg-card-active': ['list.hoverBackground', 'list.activeSelectionBackground'],
  '--text':           ['editor.foreground'],
  '--text-dim':       ['editorLineNumber.foreground', 'descriptionForeground'],
  '--text-bright':    ['editorLineNumber.activeForeground'],
  '--border':         ['editorGroup.border', 'panel.border', 'sideBar.border', 'input.border'],
  '--accent-user':    ['textLink.foreground', 'focusBorder', 'activityBarBadge.background'],
  '--accent-read':    ['editorGutter.addedBackground', 'terminal.ansiGreen'],
  '--accent-write':   ['editorWarning.foreground', 'editorGutter.modifiedBackground'],
  '--accent-bash':    ['editorError.foreground', 'terminal.ansiRed'],
  '--accent-text':    ['descriptionForeground'],
};

const TOKEN_MAP = {
  '--accent-read':     ['string', 'string.quoted'],
  '--accent-write':    ['constant.numeric', 'constant.language'],
  '--accent-edit':     ['entity.name.type', 'entity.name.class'],
  '--accent-bash':     ['keyword', 'keyword.control', 'storage.type'],
  '--accent-search':   ['keyword.control.flow', 'storage', 'variable.language'],
  '--accent-task':     ['entity.name.tag', 'support.function', 'entity.name.function'],
  '--accent-web':      ['entity.other.attribute-name', 'support.type'],
  '--accent-file':     ['variable', 'variable.other.readwrite'],
  '--accent-thinking': ['comment'],
};

function hexToRgba(hex, alpha) {
  if (!hex) return null;
  hex = hex.replace('#', '');
  if (hex.length === 8) hex = hex.slice(0, 6); // strip alpha channel
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const DERIVED_SPECS = [
  ['--accent-user-06', '--accent-user', 0.06],
  ['--accent-user-08', '--accent-user', 0.08],
  ['--accent-user-10', '--accent-user', 0.10],
  ['--accent-user-15', '--accent-user', 0.15],
  ['--accent-user-25', '--accent-user', 0.25],
  ['--accent-user-40', '--accent-user', 0.40],
  ['--accent-read-15', '--accent-read', 0.15],
  ['--accent-read-40', '--accent-read', 0.40],
  ['--accent-write-10', '--accent-write', 0.10],
  ['--accent-write-20', '--accent-write', 0.20],
  ['--accent-bash-10', '--accent-bash', 0.10],
  ['--bg-panel-90', '--bg-panel', 0.90],
];

function updateDerivedVars() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  for (const [derived, source, alpha] of DERIVED_SPECS) {
    const hex = style.getPropertyValue(source).trim();
    const rgba = hexToRgba(hex, alpha);
    if (rgba) root.style.setProperty(derived, rgba);
  }
}

function buildTokenMap(tokenColors) {
  const map = {}; // scope -> foreground
  if (!Array.isArray(tokenColors)) return map;
  for (const entry of tokenColors) {
    const fg = entry?.settings?.foreground;
    if (!fg) continue;
    const scope = entry.scope;
    if (typeof scope === 'string') {
      for (const s of scope.split(',')) map[s.trim()] = fg;
    } else if (Array.isArray(scope)) {
      for (const s of scope) map[s] = fg;
    }
  }
  return map;
}

export function applyTheme(themeJson) {
  const root = document.documentElement;
  const colors = themeJson.colors || {};
  const overridden = new Set();

  // Start with defaults
  for (const [v, hex] of Object.entries(DEFAULT)) {
    root.style.setProperty(v, hex);
  }

  // Apply VSC_MAP
  for (const [cssVar, keys] of Object.entries(VSC_MAP)) {
    for (const key of keys) {
      if (colors[key]) {
        let hex = colors[key];
        if (hex.length === 9) hex = hex.slice(0, 7); // strip alpha
        root.style.setProperty(cssVar, hex);
        overridden.add(cssVar);
        break;
      }
    }
  }

  // Apply TOKEN_MAP fallbacks
  const tokenMap = buildTokenMap(themeJson.tokenColors);
  for (const [cssVar, scopes] of Object.entries(TOKEN_MAP)) {
    if (overridden.has(cssVar)) continue;
    for (const scope of scopes) {
      if (tokenMap[scope]) {
        let hex = tokenMap[scope];
        if (hex.length === 9) hex = hex.slice(0, 7);
        root.style.setProperty(cssVar, hex);
        break;
      }
    }
  }

  updateDerivedVars();
  document.dispatchEvent(new CustomEvent('tribbles-theme-change'));
  localStorage.setItem('tribbles-theme', JSON.stringify(themeJson));
}

export function resetToDefault() {
  const root = document.documentElement;
  for (const [v, hex] of Object.entries(DEFAULT)) {
    root.style.setProperty(v, hex);
  }
  updateDerivedVars();
  document.dispatchEvent(new CustomEvent('tribbles-theme-change'));
  localStorage.removeItem('tribbles-theme');
}

export function initTheme() {
  const saved = localStorage.getItem('tribbles-theme');
  if (saved) {
    try {
      applyTheme(JSON.parse(saved));
      return;
    } catch {}
  }
  resetToDefault();
}
