export const TOOL_COLORS = {
  Read: '#27ae60', Write: '#e67e22', Edit: '#f1c40f',
  Bash: '#e74c3c', Grep: '#9b59b6', Glob: '#9b59b6',
  Task: '#e84393', WebFetch: '#00b894', WebSearch: '#00b894',
  NotebookEdit: '#f1c40f', Skill: '#e84393',
};

// Colors for bash sub-command categories
export const CMD_COLORS = {
  vcs: '#f39c12',    // git, gh — amber
  pkg: '#1abc9c',    // npm, pip, brew — teal
  exec: '#e67e22',   // python, node — orange
  build: '#d35400',  // make, tsc — burnt orange
  fs: '#e74c3c',     // ls, cd, mkdir — red
  search: '#9b59b6', // grep, rg — purple
  net: '#3498db',    // curl, wget — blue
  infra: '#2c3e50',  // docker, kubectl — dark
  io: '#95a5a6',     // echo, printf — gray
  sys: '#7f8c8d',    // ps, kill — dark gray
  other: '#c0392b',  // fallback — dark red
};

export const TOOL_EDGE_CLASS = {
  Read: 'edge-file-read', Write: 'edge-file-write', Edit: 'edge-file-edit',
  Grep: 'edge-file-search', Glob: 'edge-file-search',
  Bash: 'edge-file-bash',
};

const TOOL_CSS_VARS = {
  Read: '--accent-read', Write: '--accent-write', Edit: '--accent-edit',
  NotebookEdit: '--accent-edit', Bash: '--accent-bash',
  Grep: '--accent-search', Glob: '--accent-search',
  Task: '--accent-task', Skill: '--accent-task',
  WebFetch: '--accent-web', WebSearch: '--accent-web',
};

export function toolColor(name) {
  const v = TOOL_CSS_VARS[name];
  const style = getComputedStyle(document.documentElement);
  return (v ? style.getPropertyValue(v) : style.getPropertyValue('--text-dim')).trim() || TOOL_COLORS[name] || '#6a6a8a';
}

export function fileId(path) {
  return 'file-' + path.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80);
}

export function basename(p) {
  if (!p) return '?';
  if (p.startsWith('http')) {
    try { return new URL(p).hostname; } catch { return p.slice(0, 30); }
  }
  const parts = p.split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || p.slice(-20);
}

export function shortenPath(p) {
  if (!p) return '';
  if (p.startsWith('http')) return p;
  const parts = p.split('/');
  if (parts.length <= 3) return p;
  return '.../' + parts.slice(-3).join('/');
}

export class GraphModel {
  constructor() { this.reset(); }

  reset() {
    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map();
    this.fileNodes = new Map();
    this.lastToolNodeId = null;
    this.stepFilesSeen = new Set();
  }

  addStepNodes(step) {
    if (step.type === 'tool_use') {
      if (step.toolName === 'Bash' && step.bashCommands && step.bashCommands.length > 0) {
        // Decompose Bash into individual command nodes
        this.addBashSubCommands(step);
      } else {
        // Standard single-node tool
        this.addSingleToolNode(step);
      }
    } else if (step.type === 'user_message') {
      this.lastToolNodeId = null;
    }
  }

  addSingleToolNode(step) {
    const nodeId = `step-${step.index}`;
    const node = {
      id: nodeId, type: `tool:${step.toolName}`, label: step.toolName,
      sublabel: this.toolSublabel(step), color: toolColor(step.toolName),
      stepIndex: step.index, shape: 'circle', r: 18,
    };
    this.nodes.push(node);
    this.nodeMap.set(nodeId, node);

    if (this.lastToolNodeId) {
      this.edges.push({
        source: this.lastToolNodeId, target: nodeId,
        type: 'flow', stepIndex: step.index, edgeClass: 'edge-flow',
      });
    }
    this.lastToolNodeId = nodeId;

    this.addFileEdges(nodeId, step.filePaths, step);
  }

  addBashSubCommands(step) {
    const cmds = step.bashCommands;
    let prevCmdId = this.lastToolNodeId;

    for (let i = 0; i < cmds.length; i++) {
      const cmd = cmds[i];
      const cmdId = `step-${step.index}-cmd-${i}`;
      const color = CMD_COLORS[cmd.category] || CMD_COLORS.other;

      const node = {
        id: cmdId, type: `cmd:${cmd.category}`, label: cmd.display,
        sublabel: cmd.targets.length > 0 ? cmd.targets.map(t => basename(t)).join(', ') : '',
        fullCommand: cmd.args,
        color, stepIndex: step.index, shape: 'hexagon', r: 16,
      };
      this.nodes.push(node);
      this.nodeMap.set(cmdId, node);

      // Chain from previous (either prior tool or prior sub-command)
      if (prevCmdId) {
        const isPipe = cmd.pipeOp === '|';
        this.edges.push({
          source: prevCmdId, target: cmdId,
          type: isPipe ? 'pipe' : 'flow',
          stepIndex: step.index,
          edgeClass: isPipe ? 'edge-pipe' : 'edge-flow',
        });
      }
      prevCmdId = cmdId;

      // Connect sub-command to its file targets
      this.addFileEdges(cmdId, cmd.targets, step);
    }

    this.lastToolNodeId = prevCmdId;
  }

  addFileEdges(sourceId, paths, step) {
    for (const fp of paths) {
      const fid = fileId(fp);
      if (!this.fileNodes.has(fid)) {
        const fnode = {
          id: fid, type: 'file', label: basename(fp), fullPath: fp,
          sublabel: shortenPath(fp), color: getComputedStyle(document.documentElement).getPropertyValue('--accent-file').trim() || '#74b9ff',
          stepIndex: step.index, shape: 'rect',
          readCount: 0, writeCount: 0, editCount: 0,
        };
        this.nodes.push(fnode);
        this.nodeMap.set(fid, fnode);
        this.fileNodes.set(fid, fnode);
      }
      const fnode = this.fileNodes.get(fid);
      if (step.toolName === 'Read' || step.toolName === 'Grep' || step.toolName === 'Glob') fnode.readCount++;
      else if (step.toolName === 'Write') fnode.writeCount++;
      else if (step.toolName === 'Edit') fnode.editCount++;

      const edgeClass = TOOL_EDGE_CLASS[step.toolName] || 'edge-file-default';
      this.edges.push({
        source: sourceId, target: fid,
        type: 'file_ref', stepIndex: step.index, edgeClass,
      });
    }
  }

  toolSublabel(step) {
    const inp = step.input;
    switch (step.toolName) {
      case 'Read': return basename(inp.file_path);
      case 'Write': return basename(inp.file_path);
      case 'Edit': return basename(inp.file_path);
      case 'Bash': return (inp.command || '').slice(0, 30);
      case 'Grep': return `/${(inp.pattern || '').slice(0, 20)}/`;
      case 'Glob': return (inp.pattern || '').slice(0, 25);
      case 'WebFetch': return basename(inp.url);
      case 'WebSearch': return (inp.query || '').slice(0, 25);
      case 'Task': return (inp.description || inp.prompt || '').slice(0, 25);
      default: return '';
    }
  }

  getVisibleNodes(upToStep) {
    return this.nodes.filter(n => n.stepIndex <= upToStep);
  }

  getVisibleEdges(upToStep) {
    const visibleIds = new Set(this.getVisibleNodes(upToStep).map(n => n.id));
    return this.edges.filter(e =>
      e.stepIndex <= upToStep &&
      visibleIds.has(typeof e.source === 'object' ? e.source.id : e.source) &&
      visibleIds.has(typeof e.target === 'object' ? e.target.id : e.target)
    );
  }
}
