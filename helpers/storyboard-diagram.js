/////////////////////////////////////////////////////////////
// Get trial information
/////////////////////////////////////////////////////////////

/* --- timeline helpers --- */
// for top level only, without repetitions, loop, conditional functions, etc.
function getTopLevelTrialInfo(timeline) {
  return timeline.map((node, index) => ({
    index,
    name: node.name ?? 'none',
    isTimeline: Boolean(node.timeline),
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
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
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
/* Build each step (box) of the diagram */
function buildTopLevelDiagramSteps(trials) {
  return trials
    .map((trial, i) => {
      const boxClass = trial.isTimeline ? 'box timeline-block' : 'box trial';
      const subtitle = trial.isTimeline
        ? `${trial.childCount} nested trial(s)`
        : (trial.pluginType ?? '');

      const box = `
        <div class="${boxClass}">
          <div class="step-number">${i + 1}</div>
          <div class="name">${escapeHtml(trial.name)}</div>
          ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>`;

      return i < trials.length - 1
        ? `${box}<div class="arrow" aria-hidden="true">&rarr;</div>`
        : box;
    })
    .join('\n');
}

function generateTopLevelDiagramHTML(timeline, options = {}) {
  const title = options.title ?? 'Experiment Timeline';
  const trials = getTopLevelTrialInfo(timeline);
  const steps = buildTopLevelDiagramSteps(trials);

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
  <p class="meta">Top-level trials only &middot; ${trials.length} step(s)</p>
  <div class="flow">
    ${steps}
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
