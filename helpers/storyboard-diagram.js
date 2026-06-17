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
// HTML elements
/////////////////////////////////////////////////////////////

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}