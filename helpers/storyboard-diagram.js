/////////////////////////////////////////////////////////////
// Get trial information
/////////////////////////////////////////////////////////////

function getTimelineBlockInfo(node) {
  return {
    name: node.name ?? 'none',
    isTimeline: Boolean(node.timeline),
    hasConditional: typeof node.conditional_function === 'function',
    hasLoop: typeof node.loop_function === 'function',
    repetitions: node.repetitions ?? 1,
    hasTimelineVariables: Boolean(node.timeline_variables),
    randomizeOrder: Boolean(node.randomize_order),
    hasSample: Boolean(node.sample),
  };
}




/* --- timeline helpers --- */
function getTopLevelTrialInfo(timeline) {
  return timeline.map((node, index) => ({
    index,
    ...getTimelineBlockInfo(node),
    pluginType: node.type?.info?.name ?? null,
    childCount: node.timeline?.length ?? 0,
  }));
}


// for trials (nested O, looped x, conditional x)
function getTrialNames(timeline) {
  const names = [];

  function traverse(node) {
    if (Array.isArray(node)) {
      node.forEach(traverse);
      return;
    }
    names.push(node.name ?? 'none');
    if (node.timeline) {
      node.timeline.forEach(traverse);
    }
  }

  traverse(timeline);
  return names;
}


/////////////////////////////////////////////////////////////
// Mermaid export
/////////////////////////////////////////////////////////////

function escapeMermaidLabel(text) {
  return String(text)
    .replace(/"/g, '#quot;')
    .replace(/\]/g, '#93;');
}

function formatMermaidNodeLabel(node) {
  const info = getTimelineBlockInfo(node);
  const parts = [node.name ?? 'none'];
  const plugin = node.type?.info?.name;
  if (plugin) parts.push(plugin);
  if (info.hasConditional) parts.push('conditional');
  if (info.hasTimelineVariables) parts.push(`${node.timeline_variables.length} timeline vars`);
  if (info.repetitions > 1) parts.push(`reps: ${info.repetitions}`);
  if (info.randomizeOrder) parts.push('random order');
  if (info.hasLoop) parts.push('loop');
  if (info.hasSample) parts.push('sample');
  return parts.map(escapeMermaidLabel).join('<br/>');
}

function createMermaidIdFactory() {
  const usedIds = new Set();
  const nodeToId = new WeakMap();

  return function mermaidId(node) {
    if (nodeToId.has(node)) {
      return nodeToId.get(node);
    }
    let base = String(node.name ?? 'none').replace(/[^a-zA-Z0-9_]/g, '_');
    if (!base) base = 'node';
    if (/^\d/.test(base)) base = `n_${base}`;

    let id = base;
    let counter = 1;
    while (usedIds.has(id)) {
      id = `${base}_${counter++}`;
    }
    usedIds.add(id);
    nodeToId.set(node, id);
    return id;
  };
}

function timelineToMermaid(timeline, options = {}) {
  const direction = options.direction ?? 'TD';
  const lines = [`flowchart ${direction}`];
  const getId = createMermaidIdFactory();
  const definedNodes = new Set();
  let forkCounter = 0;

  function push(line) {
    lines.push(line);
  }

  function defineNode(node, indent = '') {
    const id = getId(node);
    if (!definedNodes.has(id)) {
      push(`${indent}${id}["${formatMermaidNodeLabel(node)}"]`);
      definedNodes.add(id);
    }
    return id;
  }

  function link(fromId, toId, label, indent = '') {
    if (!fromId || !toId) return;
    if (label) {
      push(`${indent}${fromId} -->|"${escapeMermaidLabel(label)}"| ${toId}`);
    } else {
      push(`${indent}${fromId} --> ${toId}`);
    }
  }

  function processNodes(nodes, indent = '') {
    let exits = [];
    let firstId = null;
    let i = 0;

    while (i < nodes.length) {
      if (getTimelineBlockInfo(nodes[i]).hasConditional) {
        const branchNodes = [];
        while (i < nodes.length && getTimelineBlockInfo(nodes[i]).hasConditional) {
          branchNodes.push(nodes[i]);
          i++;
        }

        const forkId = `fork_${forkCounter++}`;
        push(`${indent}${forkId}{{"conditional"}}`);
        exits.forEach((fromId) => link(fromId, forkId, null, indent));

        const branchExits = [];
        branchNodes.forEach((branch, branchIndex) => {
          const branchLabel = branch.name ?? `path ${branchIndex + 1}`;

          if (branch.timeline?.length) {
            const inner = processNodes(branch.timeline, indent);
            if (inner.firstId) {
              link(forkId, inner.firstId, branchLabel, indent);
              branchExits.push(...(inner.exits.length ? inner.exits : [inner.firstId]));
            }
          } else {
            const id = defineNode(branch, indent);
            link(forkId, id, branchLabel, indent);
            branchExits.push(id);
          }
        });

        exits = branchExits;
        if (!firstId) firstId = forkId;
        continue;
      }

      const node = nodes[i++];
      const info = getTimelineBlockInfo(node);

      if (node.timeline) {
        const subgraphId = getId(node);
        push(`${indent}subgraph ${subgraphId}["${formatMermaidNodeLabel(node)}"]`);
        push(`${indent}  direction ${direction}`);

        const inner = processNodes(node.timeline, `${indent}  `);
        push(`${indent}end`);

        if (inner.firstId) {
          exits.forEach((fromId) => link(fromId, inner.firstId, null, indent));
          exits = inner.exits.length ? inner.exits : [inner.firstId];
          if (!firstId) firstId = inner.firstId;
        }
      } else {
        const id = defineNode(node, indent);
        if (exits.length) {
          exits.forEach((fromId) => link(fromId, id, null, indent));
        }
        if (!firstId) firstId = id;
        exits = [id];
      }
    }

    return { firstId, exits };
  }

  processNodes(timeline);
  return lines.join('\n');
}

function generateMermaidDiagramHTML(timeline, options = {}) {
  const title = options.title ?? 'Experiment Timeline';
  const mermaidCode = timelineToMermaid(timeline, options);
  const theme = options.theme ?? 'default';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      padding: 2rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #fafafa;
      color: #222;
    }
    h1 { margin: 0 0 1.5rem; font-size: 1.5rem; }
    .mermaid { background: #fff; border-radius: 8px; padding: 1rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <pre class="mermaid">${mermaidCode}</pre>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({ startOnLoad: true, theme: ${JSON.stringify(theme)} });
  </script>
</body>
</html>`;
}

function openMermaidDiagram(timeline, options = {}) {
  const html = generateMermaidDiagramHTML(timeline, options);
  const win = window.open();
  win.document.open('text/html;charset=UTF-8');
  win.document.write(html);
  win.document.close();
}


/////////////////////////////////////////////////////////////
// HTML elements & styles
/////////////////////////////////////////////////////////////

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STORYBOARD_DIAGRAM_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #fafafa;
    color: #222;
  }
  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
    font-weight: 600;
  }
  .meta {
    margin: 0 0 2rem;
    color: #666;
    font-size: 0.9rem;
  }
  .flow {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .flow-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .flow-segment {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .conditional-fork {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 2px dashed #f59e0b;
    border-radius: 8px;
    background: #fffdf5;
    min-width: 200px;
  }
  .fork-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #b45309;
    padding: 0.35rem 0.75rem;
    border: 2px solid #f59e0b;
    border-radius: 4px;
    background: #fffbeb;
    align-self: center;
  }
  .fork-branches {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
    width: 100%;
  }
  .fork-branch {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 6px;
    background: rgba(255, 251, 235, 0.6);
  }
  .fork-branch-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
  }
  .fork-branch-label {
    color: #b45309;
    font-weight: 600;
  }
  .fork-branch-name {
    color: #666;
  }
  .fork-branch-flow {
    padding-left: 0.25rem;
  }
  .timeline-group {
    border: 2px dashed #4a6fa5;
    border-radius: 8px;
    padding: 0.75rem;
    background: #f8faff;
  }
  .timeline-group-header {
    margin-bottom: 0.35rem;
  }
  .timeline-group-header .box {
    min-width: 100px;
    padding: 0.5rem 0.75rem;
  }
  .timeline-group-inner {
    padding-top: 0.5rem;
    border-top: 1px dashed #c5d4ef;
  }
  .timeline-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 0.35rem;
  }
  .badge {
    font-size: 0.7rem;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    background: #e8eef8;
    color: #4a6fa5;
  }
  .box {
    border: 2px solid #333;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    background: #fff;
    min-width: 120px;
    text-align: center;
  }
  .box.timeline-block {
    border-style: dashed;
    background: #f0f4ff;
    border-color: #4a6fa5;
  }
  .box.conditional-block {
    border-style: dashed;
    background: #fffbeb;
    border-color: #f59e0b;
  }
  .step-number {
    font-size: 0.75rem;
    color: #888;
    margin-bottom: 0.25rem;
  }
  .name {
    font-weight: 600;
    font-size: 1rem;
  }
  .subtitle {
    margin-top: 0.35rem;
    font-size: 0.8rem;
    color: #666;
  }
  .arrow {
    font-size: 1.5rem;
    color: #888;
    padding: 0 0.25rem;
    user-select: none;
  }
`;


/////////////////////////////////////////////////////////////
// Build diagram steps
/////////////////////////////////////////////////////////////

function toTrialDisplay(node) {
  return {
    name: node.name ?? 'none',
    ...getTimelineBlockInfo(node),
    pluginType: node.type?.info?.name ?? null,
    childCount: node.timeline?.length ?? 0,
  };
}

function buildArrow() {
  return '<div class="arrow" aria-hidden="true">&rarr;</div>';
}

function getTrialBoxSubtitle(trial) {
  if (trial.hasConditional && !trial.isTimeline) {
    return 'conditional';
  }
  if (trial.isTimeline && !trial.hasConditional) {
    return `${trial.childCount} nested trial(s)`;
  }
  if (trial.isTimeline && trial.hasConditional) {
    return `conditional · ${trial.childCount} nested trial(s)`;
  }
  return trial.pluginType ?? '';
}

function buildTrialBox(trial, stepNumber) {
  let boxClass = 'box trial';
  if (trial.hasConditional) {
    boxClass = 'box conditional-block';
  } else if (trial.isTimeline) {
    boxClass = 'box timeline-block';
  }

  const subtitle = getTrialBoxSubtitle(trial);

  return `
    <div class="${boxClass}">
      ${stepNumber != null ? `<div class="step-number">${stepNumber}</div>` : ''}
      <div class="name">${escapeHtml(trial.name)}</div>
      ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
    </div>`;
}

function getTimelineBadges(node) {
  const info = getTimelineBlockInfo(node);
  const badges = [];
  if (info.repetitions > 1) badges.push(`repetitions: ${info.repetitions}`);
  if (info.hasTimelineVariables) badges.push(`${node.timeline_variables.length} timeline variables`);
  if (info.randomizeOrder) badges.push('random order');
  if (info.hasLoop) badges.push('loop');
  if (info.hasSample) badges.push('sample');
  return badges
    .map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`)
    .join('');
}

function buildTimelineGroup(node, stepCounter) {
  const info = toTrialDisplay(node);
  const badges = getTimelineBadges(node);
  const innerFlow = node.timeline
    ? buildHorizontalFlowHtml(node.timeline, stepCounter)
    : '';

  return `
    <div class="timeline-group">
      <div class="timeline-group-header">
        ${buildTrialBox(info, null)}
      </div>
      ${badges ? `<div class="timeline-badges">${badges}</div>` : ''}
      ${innerFlow ? `<div class="timeline-group-inner flow-row">${innerFlow}</div>` : ''}
    </div>`;
}

function buildConditionalForkHtml(branchNodes, stepCounter) {
  const branches = branchNodes.map((node, branchIndex) => {
    const innerFlow = node.timeline
      ? buildHorizontalFlowHtml(node.timeline, stepCounter)
      : buildTrialBox(toTrialDisplay(node), stepCounter.n++);

    return `
      <div class="fork-branch">
        <div class="fork-branch-meta">
          <span class="fork-branch-label">path ${branchIndex + 1}</span>
          <span class="fork-branch-name">${escapeHtml(node.name ?? 'none')}</span>
        </div>
        <div class="fork-branch-flow flow-row">
          ${innerFlow}
        </div>
      </div>`;
  }).join('\n');

  return `
    <div class="conditional-fork">
      <div class="fork-label">&#9670; conditional</div>
      <div class="fork-branches">
        ${branches}
      </div>
    </div>`;
}

function buildHorizontalFlowHtml(nodes, stepCounter) {
  const parts = [];
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i];
    const info = getTimelineBlockInfo(node);

    if (info.hasConditional) {
      const branchNodes = [];
      while (i < nodes.length && getTimelineBlockInfo(nodes[i]).hasConditional) {
        branchNodes.push(nodes[i]);
        i++;
      }
      if (parts.length) parts.push(buildArrow());
      parts.push(buildConditionalForkHtml(branchNodes, stepCounter));
      continue;
    }

    if (parts.length) parts.push(buildArrow());

    if (node.timeline) {
      parts.push(buildTimelineGroup(node, stepCounter));
    } else {
      parts.push(buildTrialBox(toTrialDisplay(node), stepCounter.n++));
    }
    i++;
  }

  return parts.join('\n');
}

function parseTopLevelSegments(trials) {
  const segments = [];
  let i = 0;

  while (i < trials.length) {
    if (trials[i].hasConditional) {
      const branches = [];
      while (i < trials.length && trials[i].hasConditional) {
        branches.push(trials[i]);
        i++;
      }
      segments.push({ type: 'conditional', branches });
    } else {
      segments.push({ type: 'step', trial: trials[i] });
      i++;
    }
  }

  return segments;
}

function buildTopLevelDiagramFlow(timeline) {
  return buildHorizontalFlowHtml(timeline, { n: 1 });
}

function countConditionalBranches(timeline) {
  let count = 0;
  function traverse(nodes) {
    let i = 0;
    while (i < nodes.length) {
      if (getTimelineBlockInfo(nodes[i]).hasConditional) {
        count++;
        while (i < nodes.length && getTimelineBlockInfo(nodes[i]).hasConditional) {
          i++;
        }
      } else {
        const node = nodes[i];
        if (node.timeline) traverse(node.timeline);
        i++;
      }
    }
  }
  traverse(timeline);
  return count;
}

function countAllTrials(nodes) {
  let count = 0;
  function traverse(nodeList) {
    nodeList.forEach((node) => {
      count++;
      if (node.timeline) traverse(node.timeline);
    });
  }
  traverse(nodes);
  return count;
}

function generateTopLevelDiagramHTML(timeline, options = {}) {
  const title = options.title ?? 'Experiment Timeline';
  const flow = buildTopLevelDiagramFlow(timeline);
  const branchCount = countConditionalBranches(timeline);
  const trialCount = countAllTrials(timeline);
  const branchNote = branchCount > 0
    ? ` &middot; ${branchCount} conditional branch(es)`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${STORYBOARD_DIAGRAM_CSS}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Flowchart &middot; ${trialCount} trial(s) defined${branchNote}</p>
  <div class="flow">
    ${flow}
  </div>
</body>
</html>`;
}

/////////////////////////////////////////////////////////////
// Output
/////////////////////////////////////////////////////////////
function openTopLevelDiagram(timeline, options = {}) {
  const html = generateTopLevelDiagramHTML(timeline, options);
  const win = window.open();
  win.document.open('text/html;charset=UTF-8');
  win.document.write(html);
  win.document.close();
}

function downloadTopLevelDiagram(timeline, filename = 'storyboard.html', options = {}) {
  const html = generateTopLevelDiagramHTML(timeline, options);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
