export default class SessionParser {
  parse(text) {
    const lines = text.split('\n').filter(l => l.trim());
    const entries = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch (e) { /* skip malformed */ }
    }

    const session = {
      sessionId: '',
      version: '',
      cwd: '',
      model: '',
      steps: [],
      totalTokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
    };

    let stepIndex = 0;

    for (const entry of entries) {
      // Skip non-visualizable
      if (['progress', 'file-history-snapshot', 'queue-operation', 'system'].includes(entry.type)) continue;

      // Capture session metadata
      if (!session.sessionId && entry.sessionId) session.sessionId = entry.sessionId;
      if (!session.version && entry.version) session.version = entry.version;
      if (!session.cwd && entry.cwd) session.cwd = entry.cwd;

      const msg = entry.message;
      if (!msg) continue;

      // Capture model
      if (msg.model && !session.model) session.model = msg.model;

      // Accumulate tokens
      if (msg.usage) {
        session.totalTokens.input += msg.usage.input_tokens || 0;
        session.totalTokens.output += msg.usage.output_tokens || 0;
        session.totalTokens.cacheCreation += msg.usage.cache_creation_input_tokens || 0;
        session.totalTokens.cacheRead += msg.usage.cache_read_input_tokens || 0;
      }

      const ts = entry.timestamp ? new Date(entry.timestamp) : null;

      if (entry.type === 'user') {
        // User message: could be text or tool_result(s)
        if (typeof msg.content === 'string') {
          session.steps.push({
            index: stepIndex++, type: 'user_message', timestamp: ts,
            uuid: entry.uuid, text: msg.content, tokens: null,
          });
        } else if (Array.isArray(msg.content)) {
          // Check for text
          const textBlocks = msg.content.filter(b => b.type === 'text');
          const resultBlocks = msg.content.filter(b => b.type === 'tool_result');

          if (textBlocks.length > 0) {
            const combinedText = textBlocks.map(b => b.text).join('\n');
            if (combinedText.trim()) {
              session.steps.push({
                index: stepIndex++, type: 'user_message', timestamp: ts,
                uuid: entry.uuid, text: combinedText, tokens: null,
              });
            }
          }

          for (const rb of resultBlocks) {
            const preview = typeof rb.content === 'string' ? rb.content : JSON.stringify(rb.content);
            session.steps.push({
              index: stepIndex++, type: 'tool_result', timestamp: ts,
              uuid: entry.uuid, toolUseId: rb.tool_use_id,
              resultPreview: preview.slice(0, 500),
              isError: rb.is_error || false, tokens: null,
            });
          }
        }
      } else if (entry.type === 'assistant') {
        if (!msg.content || !Array.isArray(msg.content)) continue;

        const tokenInfo = msg.usage ? {
          input: msg.usage.input_tokens || 0,
          output: msg.usage.output_tokens || 0,
        } : null;

        for (const block of msg.content) {
          if (block.type === 'thinking' && block.thinking) {
            session.steps.push({
              index: stepIndex++, type: 'thinking', timestamp: ts,
              uuid: entry.uuid, thinkingPreview: block.thinking.slice(0, 300),
              tokens: null,
            });
          } else if (block.type === 'text' && block.text && block.text.trim()) {
            session.steps.push({
              index: stepIndex++, type: 'assistant_text', timestamp: ts,
              uuid: entry.uuid, text: block.text, tokens: tokenInfo,
            });
          } else if (block.type === 'tool_use') {
            const inp = block.input || {};
            const filePaths = this.extractFilePaths(block.name, inp);
            const step = {
              index: stepIndex++, type: 'tool_use', timestamp: ts,
              uuid: entry.uuid, toolName: block.name,
              toolUseId: block.id, input: inp,
              filePaths, tokens: tokenInfo,
            };
            // Parse bash commands into structured sub-commands
            if (block.name === 'Bash' && inp.command) {
              step.bashCommands = this.parseBashCommand(inp.command);
            }
            session.steps.push(step);
          }
        }
      }
    }

    return session;
  }

  extractFilePaths(toolName, input) {
    const paths = [];
    switch (toolName) {
      case 'Read':
      case 'Write':
      case 'NotebookEdit':
        if (input.file_path) paths.push(input.file_path);
        if (input.notebook_path) paths.push(input.notebook_path);
        break;
      case 'Edit':
        if (input.file_path) paths.push(input.file_path);
        break;
      case 'Glob':
        if (input.path) paths.push(input.path);
        break;
      case 'Grep':
        if (input.path) paths.push(input.path);
        break;
      case 'Bash':
        paths.push(...this.extractPathsFromCommand(input.command || ''));
        break;
      case 'WebFetch':
        if (input.url) paths.push(input.url);
        break;
    }
    return [...new Set(paths.map(p => p.replace(/\/+$/, '')))];
  }

  extractPathsFromCommand(cmd) {
    const paths = [];
    for (const m of cmd.matchAll(/"(\/[^"]{2,})"/g)) paths.push(m[1]);
    for (const m of cmd.matchAll(/'(\/[^']{2,})'/g)) paths.push(m[1]);
    for (const m of cmd.matchAll(/(?:cat|ls|cd|mkdir|rm|cp|mv|head|tail|wc|chmod|touch|python|node|git\s+\S+)\s+(\/\S+)/g)) {
      paths.push(m[1]);
    }
    return paths.filter(p => p.length > 2 && !p.startsWith('/dev/'));
  }

  /**
   * Parse a bash command string into structured sub-commands.
   * Splits on &&, ||, ;, and | to produce individual command objects.
   * Each has: { program, args, display, targets[], category }
   */
  parseBashCommand(cmdStr) {
    if (!cmdStr) return [];

    // Split on chain operators, respecting quotes AND $() subshells
    const tokens = [];
    let current = '';
    let inSingle = false, inDouble = false;
    let parenDepth = 0;
    for (let i = 0; i < cmdStr.length; i++) {
      const c = cmdStr[i];
      if (c === "'" && !inDouble && parenDepth === 0) { inSingle = !inSingle; current += c; continue; }
      if (c === '"' && !inSingle && parenDepth === 0) { inDouble = !inDouble; current += c; continue; }
      if (inSingle) { current += c; continue; }

      // Track $() and () subshell depth
      if (c === '(' ) { parenDepth++; current += c; continue; }
      if (c === ')' && parenDepth > 0) { parenDepth--; current += c; continue; }
      if (parenDepth > 0 || inDouble) { current += c; continue; }

      if (c === '|' && cmdStr[i+1] === '|') {
        if (current.trim()) tokens.push({ text: current.trim(), op: null });
        tokens.push({ text: null, op: '||' });
        current = ''; i++; continue;
      }
      if (c === '&' && cmdStr[i+1] === '&') {
        if (current.trim()) tokens.push({ text: current.trim(), op: null });
        tokens.push({ text: null, op: '&&' });
        current = ''; i++; continue;
      }
      if (c === ';') {
        if (current.trim()) tokens.push({ text: current.trim(), op: null });
        tokens.push({ text: null, op: ';' });
        current = ''; continue;
      }
      if (c === '|') {
        if (current.trim()) tokens.push({ text: current.trim(), op: null });
        tokens.push({ text: null, op: '|' });
        current = ''; continue;
      }
      current += c;
    }
    if (current.trim()) tokens.push({ text: current.trim(), op: null });

    const commands = [];
    let prevOp = null;

    for (const tok of tokens) {
      if (tok.op) { prevOp = tok.op; continue; }

      const raw = tok.text;
      // Skip variable assignments (VAR=value, VAR=$(cmd), etc)
      if (/^\w+=/.test(raw)) continue;
      // Strip leading inline env vars (VAR=val cmd ...) but keep the command
      const cleaned = raw.replace(/^(\s*\w+=\S*\s+)+/, '').replace(/\s*[<>].*$/, '').trim();
      if (!cleaned) continue;

      const parts = this.splitArgs(cleaned);
      let program = parts[0];
      const args = parts.slice(1);

      // Skip shell syntax keywords
      const SKIP = ['if','then','else','elif','fi','do','done','for','while','case','esac',
                     'in','true','false','[','[[',']]',']','!','set','{','}','export','local',
                     'return','break','continue','shift','declare','typeset','readonly','unset'];
      if (SKIP.includes(program)) continue;

      // Skip fragments: $, =, parens, leading dash, path fragments, short garbage, bare numbers
      if (/[${}()=\[\]"']/.test(program) || program.length <= 1
          || program.startsWith('-') || program.includes('/')
          || /^\d+$/.test(program)) continue;

      if (['sudo', 'env', 'nohup', 'time', 'timeout'].includes(program) && parts.length > 1) {
        program = parts[1];
        args.shift();
        if (SKIP.includes(program) || /[${}()=\[\]]/.test(program)) continue;
      }

      // Extract targets — but skip for inline code commands
      const targets = [];
      const isInlineCode = (program === 'node' && args.includes('-e'))
        || (program === 'python3' && args.includes('-c'))
        || (program === 'python' && args.includes('-c'))
        || (program === 'ruby' && args.includes('-e'))
        || (program === 'perl' && args.includes('-e'));

      if (!isInlineCode) {
        const REAL_EXTS = /\.(js|ts|jsx|tsx|py|rb|go|rs|java|c|h|cpp|hpp|css|html|htm|json|yaml|yml|toml|xml|md|txt|sh|bash|zsh|sql|csv|log|conf|cfg|ini|env|lock|gitignore|jsonl|svg|png|jpg|jpeg|gif|pdf|wasm|mjs|cjs)$/i;
        for (const arg of args) {
          const unquoted = arg.replace(/^["']|["']$/g, '');
          // Skip flags
          if (unquoted.startsWith('-')) continue;
          // Absolute paths
          if (unquoted.startsWith('/') && unquoted.length > 2 && !unquoted.startsWith('/dev/')) {
            targets.push(unquoted);
          // Relative paths
          } else if (unquoted.startsWith('./') || unquoted.startsWith('../')) {
            targets.push(unquoted);
          // Files with real extensions (not JS property access like args.length)
          } else if (REAL_EXTS.test(unquoted)) {
            targets.push(unquoted);
          }
        }
        // Quoted absolute paths from raw string
        for (const m of raw.matchAll(/"(\/[^"]{2,})"/g)) {
          if (!targets.includes(m[1])) targets.push(m[1]);
        }
        for (const m of raw.matchAll(/'(\/[^']{2,})'/g)) {
          if (!targets.includes(m[1])) targets.push(m[1]);
        }
      }

      const category = this.categorizeCommand(program);

      // Include subcommand for multi-word tools
      let display = program;
      const subCmdTools = ['git', 'npm', 'npx', 'yarn', 'docker', 'kubectl', 'cargo', 'brew', 'pip', 'pip3'];
      if (subCmdTools.includes(program) && args.length > 0 && !args[0].startsWith('-')) {
        display = `${program} ${args[0]}`;
      }

      commands.push({
        program,
        display,
        args: raw,
        targets,
        category,
        pipeOp: prevOp,
      });
      prevOp = null;
    }

    return commands;
  }

  /** Split a command string into arguments, respecting quotes */
  splitArgs(str) {
    const args = [];
    let current = '';
    let inSingle = false, inDouble = false;
    for (const c of str) {
      if (c === "'" && !inDouble) { inSingle = !inSingle; current += c; continue; }
      if (c === '"' && !inSingle) { inDouble = !inDouble; current += c; continue; }
      if ((c === ' ' || c === '\t') && !inSingle && !inDouble) {
        if (current) { args.push(current); current = ''; }
        continue;
      }
      current += c;
    }
    if (current) args.push(current);
    return args;
  }

  categorizeCommand(program) {
    const categories = {
      git: 'vcs',
      gh: 'vcs',
      svn: 'vcs',
      npm: 'pkg',
      npx: 'pkg',
      yarn: 'pkg',
      pip: 'pkg',
      pip3: 'pkg',
      brew: 'pkg',
      cargo: 'pkg',
      python: 'exec',
      python3: 'exec',
      node: 'exec',
      ruby: 'exec',
      java: 'exec',
      go: 'exec',
      make: 'build',
      cmake: 'build',
      gcc: 'build',
      rustc: 'build',
      tsc: 'build',
      webpack: 'build',
      ls: 'fs', cd: 'fs', pwd: 'fs', mkdir: 'fs', rm: 'fs',
      cp: 'fs', mv: 'fs', touch: 'fs', chmod: 'fs', chown: 'fs',
      cat: 'fs', head: 'fs', tail: 'fs', wc: 'fs', find: 'fs', du: 'fs',
      grep: 'search', rg: 'search', ag: 'search', awk: 'search', sed: 'search',
      curl: 'net', wget: 'net', ssh: 'net', scp: 'net',
      docker: 'infra', kubectl: 'infra',
      echo: 'io', printf: 'io', tee: 'io',
      ps: 'sys', kill: 'sys', top: 'sys', lsof: 'sys', pgrep: 'sys',
      xargs: 'sys', sort: 'sys', uniq: 'sys', tr: 'sys', cut: 'sys',
    };
    return categories[program] || 'other';
  }
}
