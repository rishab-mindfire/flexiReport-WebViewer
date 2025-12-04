const { Graph } = window.X6;

// --------------------------
// DOM refs
// --------------------------
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
  mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'] },
  connecting: {
    snap: true,
    allowBlank: false,
    allowLoop: false,
    allowMulti: true,
    connector: { name: 'rounded', args: { radius: 8 } },
    router: { name: 'manhattan' },
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
  return `<div class="er-table ${table.baseTable ? 'base-table' : ''}">
    <div class="er-header">${table.name}</div>
    <div class="er-fields-container">${fieldsHtml}</div>
  </div>`;
}

// --------------------------
// Ports
// --------------------------
function makePortsForTable(n) {
  const items = [];
  (n.fields || []).forEach((f, i) => {
    const fid = f.id || f.name;
    if (!n.baseTable) {
      items.push({
        id: `${n.id}.L.${fid}`,
        group: 'left',
        args: { y: 58 + i * 36 },
      });
    } else {
      items.push({
        id: `${n.id}.R.${fid}`,
        group: 'right',
        args: { y: 58 + i * 36 },
      });
    }
  });
  return items;
}

// --------------------------
// Add node
// --------------------------
function addTableNode(n) {
  const headerHeight = 42,
    rowHeight = 36,
    totalH = headerHeight + (n.fields?.length || 1) * rowHeight + 10;
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
// Edge label + arrow style updater
// --------------------------
function updateEdgeLabelAndStyle(edge, relation) {
  // Set label
  edge.setLabels([
    {
      position: 0.5,
      attrs: {
        text: {
          text: relation || '',
          fill: '#0f172a',
          fontWeight: '700',
        },
        rect: { fill: '#f8fafc', stroke: '#cbd5e1', rx: 6, ry: 6 },
      },
    },
  ]);
  // Save relation in data
  edge.setData({ ...edge.getData(), relation });

  // Set arrow style
  switch (relation) {
    case '=':
      edge.attr('line/targetMarker', { name: 'classic', size: 8 });
      edge.attr('line/stroke', '#A2B1C3');
      break;
    case '1:N':
      edge.attr('line/targetMarker', { name: 'block', size: 12 });
      edge.attr('line/stroke', '#0e7490');
      break;
    case 'N:1':
      edge.attr('line/targetMarker', {
        name: 'classic',
        size: 12,
        fill: '#0e7490',
      });
      edge.attr('line/stroke', '#0e7490');
      break;
    case 'N:N':
      edge.attr('line/targetMarker', {
        name: 'classic',
        size: 8,
        fill: '#ef4444',
      });
      edge.attr('line/stroke', '#ef4444');
      break;
  }
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
        distance: 0.6,
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
  updateEdgeLabelAndStyle(edge, edge.getData()?.relation || '=');
  addRemoveButton(edge);
});

graph.on('edge:click', ({ edge, e }) => {
  selectedEdge = edge;
  relationTypeSelect.value = edge.getData()?.relation || '=';

  const sourceNode = edge.getSourceNode();
  const targetNode = edge.getTargetNode();

  // Populate left (target) fields
  const leftSelect = document.getElementById('edge-left-field');
  leftSelect.innerHTML = '';
  targetNode?.data?.fields?.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.id || f.name;
    opt.textContent = f.name;
    leftSelect.appendChild(opt);
  });
  const targetPort = edge.getTarget()?.port;
  if (targetPort) leftSelect.value = targetPort.split('.').slice(2).join('.');

  // Populate right (source) fields
  const rightSelect = document.getElementById('edge-right-field');
  rightSelect.innerHTML = '';
  sourceNode?.data?.fields?.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.id || f.name;
    opt.textContent = f.name;
    rightSelect.appendChild(opt);
  });
  const sourcePort = edge.getSource()?.port;
  if (sourcePort) rightSelect.value = sourcePort.split('.').slice(2).join('.');

  // Position panel
  const rect = container.getBoundingClientRect();
  edgeControls.style.left = `${
    Math.min(e.clientX, rect.right - edgeControls.offsetWidth - 12) - rect.left
  }px`;
  edgeControls.style.top = `${
    Math.min(e.clientY, rect.bottom - edgeControls.offsetHeight - 12) - rect.top
  }px`;
  edgeControls.style.display = 'block';
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

  const relation = relationTypeSelect.value;

  // 1️⃣ Update edge label and arrow
  updateEdgeLabelAndStyle(selectedEdge, relation);

  // 2️⃣ Update source & target ports if needed
  const leftField = document.getElementById('edge-left-field').value;
  const rightField = document.getElementById('edge-right-field').value;

  const sourcePortId = selectedEdge.getSource()?.port?.split('.') || [];
  const targetPortId = selectedEdge.getTarget()?.port?.split('.') || [];

  // Rebuild port ids
  if (sourcePortId.length >= 3) {
    selectedEdge.setSource({
      cell: sourcePortId[0],
      port: `${sourcePortId[0]}.R.${rightField}`,
    });
  }
  if (targetPortId.length >= 3) {
    selectedEdge.setTarget({
      cell: targetPortId[0],
      port: `${targetPortId[0]}.L.${leftField}`,
    });
  }

  // 3️⃣ Re-add remove button (tools)
  addRemoveButton(selectedEdge);

  // 4️⃣ Refresh edge to reflect changes immediately
  selectedEdge.invalidate(); // ensures the edge redraws
  graph.paint(); // optional: forces the graph to redraw

  // Hide panel and reset selection
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
  edgeToDelete = null;
  deleteModal.classList.add('hidden');
});
btnConfirmDelete.addEventListener('click', () => {
  if (edgeToDelete) edgeToDelete.remove();
  edgeToDelete = null;
  deleteModal.classList.add('hidden');
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
    const s = e.getSource(),
      t = e.getTarget(),
      d = e.getData() || {};
    return { id: e.id, source: s.port, target: t.port, relation: d.relation };
  });
  const json = JSON.stringify({ nodes, edges }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'erd-export.json';
  a.click();
});

// --------------------------
// Center graph
// --------------------------
document
  .getElementById('btnCenter')
  .addEventListener('click', () => graph.centerContent());

// --------------------------
// Load JSON
// --------------------------
document.getElementById('btnLoadDemo').addEventListener('click', () => {
  fetch('http://localhost:8000/demoJSON/demo.json')
    .then((res) => res.json())
    .then((data) => {
      graph.clearCells();
      (data.nodes || []).forEach(addTableNode);
      (data.edges || []).forEach((l) => {
        const parse = (p) => ({ cell: p.split('.')[0], port: p });
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
        updateEdgeLabelAndStyle(e, l.relation);
        addRemoveButton(e);
      });
      graph.centerContent();
    })
    .catch((err) => console.error('Failed to load demo JSON:', err));
});
