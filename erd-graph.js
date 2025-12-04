const { Graph } = window.X6;

// DOM refs
const container = document.getElementById('container');
const edgeControls = document.getElementById('edge-controls');
const relationTypeSelect = document.getElementById('relation-type');
const btnSaveRelation = document.getElementById('btnSaveRelation');
const btnCancelRelation = document.getElementById('btnCancelRelation');
const deleteModal = document.getElementById('delete-modal');
const btnConfirmDelete = document.getElementById('btnConfirmDelete');
const btnCancelDelete = document.getElementById('btnCancelDelete');

let selectedEdge = null;
let edgeToDelete = null;

// --------------------------
// Graph init
// --------------------------
const graph = new Graph({
  container,
  grid: {
    visible: true,
    type: 'doubleMesh',
    args: [
      { color: '#eee', thickness: 1 },
      { color: '#ddd', thickness: 1, factor: 4 },
    ],
  },
  panning: { enabled: true, modifiers: 'shift' },
  mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'] },
  connecting: {
    snap: true,
    allowBlank: false,
    allowLoop: false,
    allowMulti: true,
    connector: { name: 'rounded', args: { radius: 8 } },
    router: { name: 'manhattan' },
    createEdge() {
      const e = graph.createEdge({
        attrs: {
          line: {
            stroke: '#A2B1C3',
            strokeWidth: 2,
            targetMarker: { name: 'classic', size: 8 },
          },
        },
        data: { relation: '=' },
      });
      applyEdgeLabels(e, '=');
      return e;
    },
    validateConnection({ sourcePort, targetPort }) {
      return (
        String(sourcePort).includes('.R.') && String(targetPort).includes('.L.')
      );
    },
  },
  selecting: { enabled: true, multiple: false },
});

// --------------------------
// Node HTML builder
// --------------------------
function buildTableHtml(table) {
  const fieldsHtml = (table.fields || [])
    .map(
      (f) =>
        `<div class="er-field" data-name="${f.id || f.name}">${f.name}</div>`
    )
    .join('');
  return `
    <div class="er-table ${table.baseTable ? 'base-table' : ''}">
      <div class="er-header">${table.name}</div>
      <div class="er-fields-container">${fieldsHtml}</div>
    </div>
  `;
}

// --------------------------
// Ports
// --------------------------
function makePortsForTable(n) {
  const items = [];
  (n.fields || []).forEach((f, i) => {
    const fid = f.id || f.name;
    if (!n.baseTable)
      items.push({
        id: `${n.id}.L.${fid}`,
        group: 'left',
        args: { y: 58 + i * 36 },
      });
    items.push({
      id: `${n.id}.R.${fid}`,
      group: 'right',
      args: { y: 58 + i * 36 },
    });
  });
  return items;
}

// --------------------------
// Add node
// --------------------------
function addTableNode(n) {
  const headerHeight = 42;
  const rowHeight = 36;
  const totalH = headerHeight + (n.fields?.length || 1) * rowHeight + 10;

  graph.addNode({
    id: n.id,
    shape: 'html',
    x: n.position?.x ?? 60,
    y: n.position?.y ?? 60,
    width: 260,
    height: totalH,
    html: buildTableHtml(n),
    data: n,
    ports: {
      groups: {
        left: {
          position: { name: 'absolute', args: { x: 0, y: headerHeight } },
          attrs: {
            circle: {
              magnet: 'passive',
              r: 6,
              stroke: '#0e7490',
              fill: '#fff',
            },
          },
        },
        right: {
          position: { name: 'absolute', args: { x: 260, y: headerHeight } },
          attrs: {
            circle: { magnet: true, r: 6, stroke: '#0e7490', fill: '#fff' },
          },
        },
      },
      items: makePortsForTable(n),
    },
  });
}

// --------------------------
// Edge labels (relationship type)
// --------------------------
function applyEdgeLabels(edge, relationText) {
  edge.setLabels([
    {
      position: 0.5,
      attrs: {
        text: {
          text: relationText || '',
          fill: '#0f172a',

          fontWeight: '700',
        },
        rect: {
          fill: '#f8fafc',
          stroke: '#cbd5e1',
          rx: 6,
          ry: 6,
        },
      },
    },
  ]);
  edge.setData({ relation: relationText });
}

// --------------------------
// Add remove button
// --------------------------
function addRemoveButton(edge) {
  edge.removeTools();
  edge.addTools([
    {
      name: 'button-remove',
      args: {
        markup: [
          {
            tagName: 'circle',
            selector: 'button',
            attrs: { r: 10, fill: '#ef4444', cursor: 'pointer' },
          },
          {
            tagName: 'text',
            selector: 'icon',
            textContent: 'X',
            attrs: {
              fill: '#fff',
              fontSize: 12,
              textAnchor: 'middle',
              dominantBaseline: 'middle',
              dy: '0.1em',
            },
          },
        ],
        distance: 0.6, // slightly further from label
        offset: { x: 40, y: 0 },
        onClick: () => {
          edgeToDelete = edge;
          deleteModal.classList.remove('hidden');
        },
      },
    },
  ]);
}

// --------------------------
// Edge events
// --------------------------
graph.on('edge:connected', ({ edge }) => {
  applyEdgeLabels(edge, edge.getData()?.relation || '=');
  addRemoveButton(edge);
});
graph.on('edge:click', ({ edge, e }) => {
  selectedEdge = edge;
  relationTypeSelect.value = edge.getData()?.relation || '=';
  const panel = edgeControls;
  const rect = container.getBoundingClientRect();
  const x = Math.min(e.clientX, rect.right - panel.offsetWidth - 12);
  const y = Math.min(e.clientY, rect.bottom - panel.offsetHeight - 12);
  panel.style.left = `${x - rect.left}px`;
  panel.style.top = `${y - rect.top}px`;
  panel.style.display = 'block';
});
graph.on('blank:click node:click', () => {
  edgeControls.style.display = 'none';
  selectedEdge = null;
});

// --------------------------
// Save / Cancel relation
// --------------------------
btnSaveRelation.addEventListener('click', () => {
  if (!selectedEdge) return;
  applyEdgeLabels(selectedEdge, relationTypeSelect.value);
  addRemoveButton(selectedEdge);
  edgeControls.style.display = 'none';
  selectedEdge = null;
});
btnCancelRelation.addEventListener('click', () => {
  edgeControls.style.display = 'none';
  selectedEdge = null;
});

// --------------------------
// Delete modal
// --------------------------
btnCancelDelete.addEventListener('click', () => {
  deleteModal.classList.add('hidden');
  edgeToDelete = null;
});
btnConfirmDelete.addEventListener('click', () => {
  if (edgeToDelete) edgeToDelete.remove();
  deleteModal.classList.add('hidden');
  edgeToDelete = null;
});

// --------------------------
// Export JSON
// --------------------------
document.getElementById('btnExport').addEventListener('click', () => {
  const nodes = graph.getNodes().map((n) => ({
    id: n.id,
    name: n.data?.name,
    baseTable: n.data?.baseTable || false,
    position: n.position(),
    fields: n.data?.fields || [],
  }));
  const edges = graph.getEdges().map((e) => {
    const s = e.getSource();
    const t = e.getTarget();
    const d = e.getData() || {};
    return { id: e.id, source: s.port, target: t.port, relation: d.relation };
  });
  const json = JSON.stringify({ nodes, edges }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'erd-export.json';
  a.click();
});

// --------------------------
// Center
// --------------------------
document
  .getElementById('btnCenter')
  .addEventListener('click', () => graph.centerContent());

// --------------------------
// Load demo JSON only on button click
// --------------------------
document.getElementById('btnLoadDemo').addEventListener('click', () => {
  fetch('http://localhost:8000/demoJSON/demo.json')
    .then((res) => res.json())
    .then((data) => {
      graph.clearCells();
      data.nodes.forEach(addTableNode);
      data.links.forEach((l) => {
        const parse = (p) => {
          const parts = p.split('.');
          return { cell: parts[0], port: p };
        };
        const e = graph.addEdge({
          id: l.id,
          source: parse(l.source),
          target: parse(l.target),
          attrs: {
            line: {
              stroke: '#A2B1C3',
              strokeWidth: 2,
              targetMarker: { name: 'classic', size: 8 },
            },
          },
          data: { relation: l.relation },
        });
        applyEdgeLabels(e, l.relation);
        addRemoveButton(e);
      });
      graph.centerContent();
    })
    .catch(() => console.warn('demo.json not found.'));
});
