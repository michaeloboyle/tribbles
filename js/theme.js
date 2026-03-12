// Theme engine: VS Code theme support with Tribbles defaults
// Icon system: Lucide SVG data URIs (matching guidance-graph pattern)

// -- Lucide SVG icon library (stroke-based, 24x24) --

const STROKE = '#d0d0e0';

function lucide(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${STROKE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function svgToDataUri(svg) {
  return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
}

// Shared path fragments
const ICON_PATHS = {
  // Tools
  eye:          '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  save:         '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  pencil:       '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  terminal:     '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  search:       '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  folderSearch: '<path d="M11 20H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.5-1.5"/>',
  bot:          '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  lightbulb:    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  globe:        '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  searchCode:   '<path d="m13 13.5 2-2.5-2-2.5"/><path d="m9 8.5-2 2.5 2 2.5"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  notebook:     '<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/>',
  circleHelp:   '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  map:          '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0Z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  circleCheck:  '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  wrench:       '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  clipboardList:'<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  upload:       '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  // Files
  fileCode:     '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/>',
  fileText:     '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  file:         '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  folder:       '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  database:     '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  image:        '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  lock:         '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  key:          '<path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  braces:       '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/>',
  table:        '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  bookOpen:     '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  cpu:          '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  archive:      '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  settings:     '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
};

// Build data URIs from path keys
function iconUri(pathKey) {
  const paths = ICON_PATHS[pathKey];
  return paths ? svgToDataUri(lucide(paths)) : null;
}

// -- Tool icon defaults (data URIs) --

const DEFAULT_ICONS = {
  Read:             iconUri('eye'),
  Write:            iconUri('save'),
  Edit:             iconUri('pencil'),
  Bash:             iconUri('terminal'),
  Grep:             iconUri('search'),
  Glob:             iconUri('folderSearch'),
  Task:             iconUri('bot'),
  Skill:            iconUri('lightbulb'),
  WebFetch:         iconUri('globe'),
  WebSearch:        iconUri('searchCode'),
  NotebookEdit:     iconUri('notebook'),
  AskUserQuestion:  iconUri('circleHelp'),
  EnterPlanMode:    iconUri('map'),
  ExitPlanMode:     iconUri('circleCheck'),
  LSP:              iconUri('wrench'),
  TodoWrite:        iconUri('clipboardList'),
  TodoRead:         iconUri('clipboardList'),
  TaskOutput:       iconUri('upload'),
};

// -- File icon defaults (map extension → path key, then resolve) --

const FILE_ICON_KEYS = {
  js: 'fileCode', mjs: 'fileCode', cjs: 'fileCode', jsx: 'fileCode',
  ts: 'fileCode', tsx: 'fileCode',
  html: 'globe', htm: 'globe',
  css: 'fileCode', scss: 'fileCode', less: 'fileCode',
  json: 'braces', jsonl: 'braces',
  yaml: 'fileText', yml: 'fileText', toml: 'fileText',
  csv: 'table', xml: 'fileText',
  sql: 'database',
  md: 'fileText', txt: 'file', pdf: 'bookOpen',
  sh: 'terminal', bash: 'terminal', zsh: 'terminal', fish: 'terminal',
  py: 'fileCode', rb: 'fileCode', go: 'fileCode', rs: 'fileCode',
  java: 'fileCode', kt: 'fileCode',
  c: 'fileCode', h: 'fileCode', cpp: 'fileCode', hpp: 'fileCode',
  env: 'key', lock: 'lock',
  conf: 'settings', cfg: 'settings', ini: 'settings',
  svg: 'image', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  wasm: 'cpu', ipynb: 'notebook',
  db: 'database', pkl: 'archive', pickle: 'archive',
};

const DEFAULT_FILE_ICONS = {};
for (const [ext, key] of Object.entries(FILE_ICON_KEYS)) {
  DEFAULT_FILE_ICONS[ext] = iconUri(key);
}

// Special file icons (no extension mapping)
const FILE_ICON_FOLDER  = iconUri('folder');
const FILE_ICON_KEY     = iconUri('key');
const FILE_ICON_DEFAULT = iconUri('file');

let activeIconTheme = { ...DEFAULT_ICONS };
let activeFileIcons = { ...DEFAULT_FILE_ICONS };

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

  // Apply iconTheme overrides (data URIs or emoji strings both work)
  activeIconTheme = { ...DEFAULT_ICONS, ...(themeJson.iconTheme || {}) };
  activeFileIcons = { ...DEFAULT_FILE_ICONS, ...(themeJson.fileIconTheme || {}) };

  updateDerivedVars();
  document.dispatchEvent(new CustomEvent('tribbles-theme-change'));
  localStorage.setItem('tribbles-theme', JSON.stringify(themeJson));
}

/**
 * Returns icon for a tool. May be a data: URI (for SVG) or a short string (emoji/text).
 * Consumers should check `.startsWith('data:')` to decide <image> vs <text>.
 */
export function getToolIcon(toolName) {
  return activeIconTheme[toolName] || toolName;
}

/**
 * Returns icon data URI for a file path.
 */
export function getFileIcon(path) {
  if (!path) return FILE_ICON_DEFAULT;
  const segs = path.replace(/\/$/, '').split('/');
  const name = segs[segs.length - 1] || '';
  if (!name) return FILE_ICON_FOLDER;
  if (!name.includes('.')) return FILE_ICON_FOLDER;
  if (name.startsWith('.') && name.indexOf('.', 1) === -1) return FILE_ICON_KEY;
  const ext = name.split('.').pop().toLowerCase();
  return activeFileIcons[ext] || FILE_ICON_DEFAULT;
}

/**
 * Check if an icon value is a data URI (SVG) vs plain text/emoji.
 */
export function isDataUri(icon) {
  return typeof icon === 'string' && icon.startsWith('data:');
}

export function resetToDefault() {
  const root = document.documentElement;
  for (const [v, hex] of Object.entries(DEFAULT)) {
    root.style.setProperty(v, hex);
  }
  activeIconTheme = { ...DEFAULT_ICONS };
  activeFileIcons = { ...DEFAULT_FILE_ICONS };
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
