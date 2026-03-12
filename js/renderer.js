import { showTooltip, moveTooltip, hideTooltip } from './tooltip.js';
import { openFile } from './utils.js';
import { isDataUri } from './theme.js';

export default class GraphRenderer {
  constructor(svgElement) {
    this.svg = d3.select(svgElement);
    this.width = 0;
    this.height = 0;
    this.g = this.svg.append('g');
    this.simulation = null;
    this.currentStep = -1;
    this.currentLayout = 'force';

    // SVG defs
    const defs = this.svg.append('defs');

    // Glow filter
    const glow = defs.append('filter').attr('id', 'glow')
      .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur');
    const merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Arrow marker
    defs.append('marker').attr('id', 'arrow').attr('viewBox', '0 0 10 6')
      .attr('refX', 10).attr('refY', 3).attr('markerWidth', 8).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,0L10,3L0,6').attr('fill', '#555577');

    // Edge and node groups
    this.edgeGroup = this.g.append('g').attr('class', 'edges');
    this.nodeGroup = this.g.append('g').attr('class', 'nodes');

    // Zoom
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 5])
      .on('zoom', (e) => this.g.attr('transform', e.transform));
    this.svg.call(this.zoom);

    // Track size
    this.resizeObserver = new ResizeObserver(() => this.updateSize());
    this.resizeObserver.observe(svgElement);
    this.updateSize();
  }

  updateSize() {
    const rect = this.svg.node().getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
  }

  render(nodes, edges, currentStep) {
    this.currentStep = currentStep;

    if (this.currentLayout === 'force') {
      // Update simulation
      if (!this.simulation) {
        this.simulation = d3.forceSimulation()
          .force('link', d3.forceLink().id(d => d.id).distance(d => d.type === 'flow' ? 60 : 100).strength(0.4))
          .force('charge', d3.forceManyBody().strength(-250).distanceMax(400))
          .force('center', d3.forceCenter(this.width / 2, this.height / 2).strength(0.05))
          .force('collision', d3.forceCollide().radius(d => d.shape === 'rect' ? 60 : 25))
          .force('x', d3.forceX(this.width / 2).strength(0.03))
          .force('y', d3.forceY(this.height / 2).strength(0.03))
          .alphaDecay(0.015)
          .velocityDecay(0.35)
          .on('tick', () => this.tick());
      }

      // Give new nodes initial positions near center or near their linked nodes
      for (const n of nodes) {
        if (n.x === undefined) {
          const linkedEdge = edges.find(e => {
            const sid = typeof e.source === 'object' ? e.source.id : e.source;
            const tid = typeof e.target === 'object' ? e.target.id : e.target;
            return tid === n.id && nodes.find(nn => nn.id === sid && nn.x !== undefined);
          });
          if (linkedEdge) {
            const src = nodes.find(nn => nn.id === (typeof linkedEdge.source === 'object' ? linkedEdge.source.id : linkedEdge.source));
            if (src && src.x !== undefined) {
              n.x = src.x + (Math.random() - 0.5) * 80;
              n.y = src.y + 40 + Math.random() * 40;
            }
          }
          if (n.x === undefined) {
            n.x = this.width / 2 + (Math.random() - 0.5) * 200;
            n.y = this.height / 2 + (Math.random() - 0.5) * 200;
          }
        }
      }

      this.simulation.nodes(nodes);
      this.simulation.force('link').links(edges);
      this.simulation.alpha(0.3).restart();
    } else {
      // Non-force layouts: stop simulation, compute deterministic positions
      if (this.simulation) {
        this.simulation.stop();
      }
      this.computeLayoutPositions(nodes, edges, this.currentLayout);
    }

    // -- Edges --
    const edgeSel = this.edgeGroup.selectAll('.edge-line')
      .data(edges, d => `${typeof d.source === 'object' ? d.source.id : d.source}-${typeof d.target === 'object' ? d.target.id : d.target}-${d.stepIndex}`);

    edgeSel.exit().classed('exiting', true)
      .transition().duration(200).attr('opacity', 0).remove();

    const edgeEnter = edgeSel.enter().append('line')
      .attr('class', d => `edge-line ${d.edgeClass}`)
      .attr('opacity', 0)
      .attr('marker-end', d => d.type === 'file_ref' ? 'url(#arrow)' : null);

    edgeEnter.transition().duration(300).attr('opacity', d => {
      if (d.edgeClass === 'edge-flow') return 0.3;
      return 0.6;
    });

    this.edgeElements = edgeEnter.merge(edgeSel);

    // -- Nodes --
    const nodeSel = this.nodeGroup.selectAll('.node-group')
      .data(nodes, d => d.id);

    nodeSel.exit().classed('exiting', true)
      .transition().duration(200).attr('opacity', 0).remove();

    let dragMoved = false;
    const nodeEnter = nodeSel.enter().append('g')
      .attr('class', 'node-group')
      .attr('opacity', 0)
      .call(d3.drag()
        .on('start', (e, d) => {
          dragMoved = false;
          if (!e.active) this.simulation.alphaTarget(0.2).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (e, d) => { dragMoved = true; d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => {
          if (!e.active) this.simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      );

    // Append shapes
    nodeEnter.each(function(d) {
      const g = d3.select(this);
      if (d.shape === 'rect') {
        // File node
        g.append('rect')
          .attr('class', 'node-shape')
          .attr('width', 120).attr('height', 26)
          .attr('x', -60).attr('y', -13)
          .attr('rx', 5).attr('ry', 5)
          .attr('fill', d.color)
          .attr('fill-opacity', 0.15)
          .attr('stroke', d.color)
          .attr('stroke-width', 1.5);
        if (d.icon && isDataUri(d.icon)) {
          g.append('image')
            .attr('href', d.icon)
            .attr('width', 14).attr('height', 14)
            .attr('x', -55).attr('y', -7);
        } else if (d.icon) {
          g.append('text').attr('class', 'node-label')
            .attr('x', -53).attr('dy', 1)
            .style('text-anchor', 'start')
            .attr('font-size', '11px')
            .text(d.icon);
        }
        const hasIcon = !!d.icon;
        const labelX = hasIcon ? -38 : -53;
        const maxChars = hasIcon ? 16 : 18;
        g.append('text').attr('class', 'node-label')
          .attr('x', labelX).attr('dy', 1)
          .style('text-anchor', 'start')
          .text(d.label.length > maxChars ? d.label.slice(0, maxChars - 1) + '\u2026' : d.label);
      } else if (d.shape === 'hexagon') {
        // Bash sub-command node (hexagon)
        const r = d.r || 16;
        const hex = d3.range(6).map(i => {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          return [r * Math.cos(a), r * Math.sin(a)];
        });
        g.append('polygon')
          .attr('class', 'node-shape')
          .attr('points', hex.map(p => p.join(',')).join(' '))
          .attr('fill', d.color)
          .attr('fill-opacity', 0.25)
          .attr('stroke', d.color)
          .attr('stroke-width', 1.5);
        const maxLen = Math.max(6, Math.min(10, d.label.length));
        g.append('text').attr('class', 'node-label')
          .attr('dy', 0.5)
          .attr('font-size', d.label.length > 8 ? '7px' : '8px')
          .text(d.label.length > maxLen ? d.label.slice(0, maxLen - 1) + '\u2026' : d.label);
        if (d.sublabel) {
          g.append('text').attr('class', 'node-sublabel')
            .attr('dy', r + 11)
            .text(d.sublabel.length > 20 ? d.sublabel.slice(0, 19) + '\u2026' : d.sublabel);
        }
      } else {
        // Tool node (circle)
        g.append('circle')
          .attr('class', 'node-shape')
          .attr('r', d.r || 18)
          .attr('fill', d.color)
          .attr('fill-opacity', 0.2)
          .attr('stroke', d.color)
          .attr('stroke-width', 2);
        if (d.icon && isDataUri(d.icon)) {
          const sz = (d.r || 18) * 0.9;
          g.append('image')
            .attr('href', d.icon)
            .attr('width', sz).attr('height', sz)
            .attr('x', -sz / 2).attr('y', -sz / 2);
        } else {
          const lbl = d.icon || d.label;
          const isEmoji = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(lbl) || lbl.length <= 2;
          g.append('text').attr('class', 'node-label')
            .attr('dy', isEmoji ? 1 : 0.5)
            .attr('font-size', isEmoji ? '14px' : null)
            .text(isEmoji ? lbl : (lbl.length > 6 ? lbl.slice(0, 5) : lbl));
        }
        if (d.sublabel) {
          g.append('text').attr('class', 'node-sublabel')
            .attr('dy', (d.r || 18) + 12)
            .text(d.sublabel.length > 22 ? d.sublabel.slice(0, 21) + '\u2026' : d.sublabel);
        }
      }
    });

    // Tooltip events
    nodeEnter
      .on('mouseenter', (e, d) => showTooltip(e, d))
      .on('mousemove', (e) => moveTooltip(e))
      .on('mouseleave', () => hideTooltip());

    // Click: Cmd+click to open file, regular click to seek
    nodeEnter.on('pointerup', (e, d) => {
      if (dragMoved) return;
      if (e.metaKey || e.ctrlKey) {
        const path = d.type === 'file' ? d.fullPath : null;
        if (path) {
          e.preventDefault();
          openFile(path);
          return;
        }
      }
      if (window.appController) {
        window.appController.seekTo(d.stepIndex);
      }
    });

    // Animate entry
    nodeEnter.transition().duration(400).ease(d3.easeCubicOut).attr('opacity', 1);

    this.nodeElements = nodeEnter.merge(nodeSel);

    // Update opacity for active step
    this.updateHighlights(currentStep);

    // For non-force layouts, apply positions immediately
    if (this.currentLayout !== 'force') {
      this.applyPositions();
    }
  }

  updateHighlights(step) {
    if (!this.nodeElements) return;
    this.nodeElements.each(function(d) {
      const g = d3.select(this);
      const isActive = d.stepIndex === step;
      const isPast = d.stepIndex < step;
      const isFuture = d.stepIndex > step;

      // File nodes always stay visible once created
      if (d.type === 'file') {
        g.attr('opacity', d.stepIndex <= step ? 0.9 : 0);
        return;
      }

      if (isFuture) {
        g.attr('opacity', 0);
      } else if (isActive) {
        g.attr('opacity', 1);
        g.select('.node-shape').attr('filter', 'url(#glow)');
      } else if (isPast) {
        g.attr('opacity', 0.35);
        g.select('.node-shape').attr('filter', null);
      }
    });

    if (this.edgeElements) {
      this.edgeElements.each(function(d) {
        const el = d3.select(this);
        const visible = d.stepIndex <= step;
        el.attr('display', visible ? null : 'none');
        el.attr('opacity', d.stepIndex === step ? 0.8 : 0.25);
      });
    }
  }

  tick() {
    if (this.currentLayout !== 'force') return;
    if (this.edgeElements) {
      this.edgeElements
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
    }
    if (this.nodeElements) {
      this.nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);
    }
  }

  applyPositions() {
    if (this.nodeElements) {
      this.nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);
    }
    if (this.edgeElements) {
      this.edgeElements
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
    }
  }

  setLayout(name) {
    this.currentLayout = name;

    if (this.simulation) {
      this.simulation.stop();
    }

    // Interrupt all running transitions so exit .remove() callbacks don't fire late
    this.nodeGroup.selectAll('.node-group').interrupt();
    this.edgeGroup.selectAll('.edge-line').interrupt();

    // Remove elements that were mid-exit-transition (marked with .exiting class)
    this.nodeGroup.selectAll('.node-group.exiting').remove();
    this.edgeGroup.selectAll('.edge-line.exiting').remove();

    // Re-select from DOM to get a fresh, accurate selection
    this.nodeElements = this.nodeGroup.selectAll('.node-group');
    this.edgeElements = this.edgeGroup.selectAll('.edge-line');

    // Gather current data from the live DOM elements
    const nodes = [];
    this.nodeElements.each(function(d) { if (d) nodes.push(d); });
    const edges = [];
    this.edgeElements.each(function(d) { if (d) edges.push(d); });

    if (nodes.length === 0) return;

    if (name === 'force') {
      // Re-create simulation and let it run
      this.simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(edges).id(d => d.id).distance(d => d.type === 'flow' ? 60 : 100).strength(0.4))
        .force('charge', d3.forceManyBody().strength(-250).distanceMax(400))
        .force('center', d3.forceCenter(this.width / 2, this.height / 2).strength(0.05))
        .force('collision', d3.forceCollide().radius(d => d.shape === 'rect' ? 60 : 25))
        .force('x', d3.forceX(this.width / 2).strength(0.03))
        .force('y', d3.forceY(this.height / 2).strength(0.03))
        .alphaDecay(0.015)
        .velocityDecay(0.35)
        .on('tick', () => this.tick());
      this.simulation.alpha(0.5).restart();
    } else {
      this.computeLayoutPositions(nodes, edges, name);
      // Animate to new positions
      this.nodeElements.transition().duration(500).ease(d3.easeCubicInOut)
        .attr('transform', d => `translate(${d.x},${d.y})`);
      this.edgeElements.transition().duration(500).ease(d3.easeCubicInOut)
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
    }
  }

  computeLayoutPositions(nodes, edges, layout) {
    switch (layout) {
      case 'circular': this.layoutCircular(nodes); break;
      case 'hierarchy': this.layoutHierarchy(nodes, edges); break;
      case 'timeline': this.layoutTimeline(nodes); break;
    }
  }

  layoutCircular(nodes) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const fileNodes = nodes.filter(n => n.type === 'file');
    const toolNodes = nodes.filter(n => n.type !== 'file');

    // Inner ring: tool/command nodes
    const innerR = Math.min(this.width, this.height) * 0.25;
    toolNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / (toolNodes.length || 1) - Math.PI / 2;
      n.x = cx + innerR * Math.cos(angle);
      n.y = cy + innerR * Math.sin(angle);
    });

    // Outer ring: file nodes
    const outerR = Math.min(this.width, this.height) * 0.4;
    fileNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / (fileNodes.length || 1) - Math.PI / 2;
      n.x = cx + outerR * Math.cos(angle);
      n.y = cy + outerR * Math.sin(angle);
    });
  }

  layoutHierarchy(nodes, edges) {
    // Build adjacency from flow edges to form a tree
    const flowEdges = edges.filter(e => e.type === 'flow' || e.type === 'pipe');
    const childMap = new Map(); // parent -> [children]
    const hasParent = new Set();

    for (const e of flowEdges) {
      const sid = typeof e.source === 'object' ? e.source.id : e.source;
      const tid = typeof e.target === 'object' ? e.target.id : e.target;
      if (!childMap.has(sid)) childMap.set(sid, []);
      childMap.get(sid).push(tid);
      hasParent.add(tid);
    }

    // Also attach file nodes to their first referencing tool
    const fileEdges = edges.filter(e => e.type === 'file_ref');
    const fileAttached = new Set();
    for (const e of fileEdges) {
      const sid = typeof e.source === 'object' ? e.source.id : e.source;
      const tid = typeof e.target === 'object' ? e.target.id : e.target;
      if (!fileAttached.has(tid)) {
        if (!childMap.has(sid)) childMap.set(sid, []);
        childMap.get(sid).push(tid);
        hasParent.add(tid);
        fileAttached.add(tid);
      }
    }

    // Find roots (tool nodes without parents)
    const toolNodes = nodes.filter(n => n.type !== 'file' && !hasParent.has(n.id));
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // Build d3.hierarchy data structure
    const rootData = { id: '__root__', children: [] };

    function buildTree(nodeId, visited) {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);
      const children = (childMap.get(nodeId) || [])
        .map(cid => buildTree(cid, visited))
        .filter(Boolean);
      return { id: nodeId, children: children.length > 0 ? children : undefined };
    }

    const visited = new Set();
    for (const root of toolNodes) {
      const subtree = buildTree(root.id, visited);
      if (subtree) rootData.children.push(subtree);
    }

    // Add any orphan nodes not in the tree
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        rootData.children.push({ id: n.id });
      }
    }

    if (rootData.children.length === 0) return;

    const hierarchy = d3.hierarchy(rootData);
    const treeLayout = d3.tree().size([this.height * 0.85, this.width * 0.85]);
    treeLayout(hierarchy);

    // Apply positions (swap x/y for left-to-right orientation)
    hierarchy.descendants().forEach(d => {
      if (d.data.id === '__root__') return;
      const node = nodeById.get(d.data.id);
      if (node) {
        node.x = d.y + this.width * 0.075; // tree y -> screen x (left-to-right)
        node.y = d.x + this.height * 0.075; // tree x -> screen y
      }
    });
  }

  layoutTimeline(nodes) {
    const pad = 60;
    const toolNodes = nodes.filter(n => n.type !== 'file');
    const fileNodes = nodes.filter(n => n.type === 'file');

    // X axis: step index
    const stepIndices = [...new Set(toolNodes.map(n => n.stepIndex))].sort((a, b) => a - b);
    const xScale = d3.scaleLinear()
      .domain([stepIndices[0] || 0, stepIndices[stepIndices.length - 1] || 1])
      .range([pad, this.width - pad]);

    // Y axis: swim lanes by type
    const typeOrder = {};
    let laneIdx = 0;
    for (const n of toolNodes) {
      if (!(n.type in typeOrder)) {
        typeOrder[n.type] = laneIdx++;
      }
    }
    const numLanes = Math.max(laneIdx, 1);
    const laneHeight = (this.height - pad * 2 - 80) / (numLanes + 1);

    // Position tool nodes
    const stepLaneCount = {};
    for (const n of toolNodes) {
      const lane = typeOrder[n.type];
      const key = `${n.stepIndex}-${lane}`;
      stepLaneCount[key] = (stepLaneCount[key] || 0);
      n.x = xScale(n.stepIndex) + stepLaneCount[key] * 8;
      n.y = pad + (lane + 0.5) * laneHeight;
      stepLaneCount[key]++;
    }

    // File nodes: bottom lane, spread by first-seen step
    fileNodes.forEach((n, i) => {
      n.x = xScale(n.stepIndex);
      n.y = pad + (numLanes + 0.5) * laneHeight;
    });
  }

  fitView() {
    if (!this.nodeElements || this.nodeElements.size() === 0) return;
    const bounds = this.g.node().getBBox();
    if (bounds.width === 0 || bounds.height === 0) return;
    const pad = 60;
    const scale = Math.min(
      this.width / (bounds.width + pad * 2),
      this.height / (bounds.height + pad * 2),
      1.5
    );
    const tx = this.width / 2 - (bounds.x + bounds.width / 2) * scale;
    const ty = this.height / 2 - (bounds.y + bounds.height / 2) * scale;
    this.svg.transition().duration(500)
      .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  clear() {
    this.edgeGroup.selectAll('*').interrupt().remove();
    this.nodeGroup.selectAll('*').interrupt().remove();
    this.edgeElements = null;
    this.nodeElements = null;
    if (this.simulation) {
      this.simulation.stop();
      this.simulation = null;
    }
  }
}
