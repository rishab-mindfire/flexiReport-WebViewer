const { Graph } = window.X6;

// ----------------------------------
// DOM References
// ----------------------------------
const container = document.getElementById('container');
const edgeControls = document.getElementById('edge-controls');
const relationTypeSelect = document.getElementById('relation-type');
const leftFieldSelect = document.getElementById('edge-left-field');
const rightFieldSelect = document.getElementById('edge-right-field');
const btnSaveRelation = document.getElementById('btnSaveRelation');
const btnCancelRelation = document.getElementById('btnCancelRelation');
const deleteModal = document.getElementById('delete-modal');
const btnConfirmDelete = document.getElementById('btnConfirmDelete');
const btnCancelDelete = document.getElementById('btnCancelDelete');

// ----------------------------------
// State
// ----------------------------------
let selectedEdge = null;
let edgeToDelete = null;
let currentGraphData = { tables: [], links: [] };

// ----------------------------------
// Graph Initialization
// ----------------------------------
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

// ----------------------------------
// Constants
// ----------------------------------
const FIELD_HEIGHT = 22;
const HEADER_HEIGHT = 42;
const PORT_TOP_MARGIN = 10;

// ----------------------------------
// Helpers
// ----------------------------------
function buildTableHtml(table) {
  return `
    <div class="er-table ${table.baseTable ? 'base-table' : ''}">
      <div class="er-header">${table.name}</div>
      <div class="er-fields-container">
        ${(table.fields || [])
          .map(
            (f) =>
              `<div class="er-field" data-name="${f.id || f.name}">${
                f.name
              }</div>`
          )
          .join('')}
      </div>
    </div>`;
}

function makePortsForTable(table) {
  return (table.fields || []).map((f, i) => {
    const fid = f.id || f.name;
    const group = table.baseTable ? 'right' : 'left';
    return {
      id: `${table.id}.${group === 'right' ? 'R' : 'L'}.${fid}`,
      group,
      args: { y: HEADER_HEIGHT + i * FIELD_HEIGHT + PORT_TOP_MARGIN },
    };
  });
}

function addTableNode(table) {
  const height = HEADER_HEIGHT + (table.fields?.length || 1) * 36 + 10;
  graph.addNode({
    id: table.id,
    shape: 'html',
    x: table.position?.x ?? 60,
    y: table.position?.y ?? 60,
    width: 260,
    height,
    html: buildTableHtml(table),
    data: table,
    ports: {
      groups: {
        left: {
          position: { name: 'absolute', args: { x: 0 } },
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
          position: { name: 'absolute', args: { x: 260 } },
          attrs: {
            circle: { magnet: true, r: 6, stroke: '#0e7490', fill: '#fff' },
          },
        },
      },
      items: makePortsForTable(table),
    },
  });
}

function updateEdgeLabelAndStyle(edge, relation) {
  edge.setLabels([
    {
      position: 0.5,
      attrs: {
        text: { text: relation, fill: '#0f172a', fontWeight: 700 },
        rect: { fill: '#f8fafc', stroke: '#cbd5e1', rx: 6, ry: 6 },
      },
    },
  ]);
  edge.setData({ ...edge.getData(), relation });
}

function addRemoveButton(edge) {
  edge.removeTools();
  edge.addTools([
    {
      name: 'button-remove',
      args: {
        markup: [
          { tagName: 'circle', attrs: { r: 10, fill: '#ef4444' } },
          {
            tagName: 'text',
            textContent: 'X',
            attrs: {
              fill: '#fff',
              fontSize: 13,
              textAnchor: 'middle',
              dy: '0.4em',
            },
          },
        ],
        distance: 0.6,
        offset: { x: 20, y: 0 },
        onClick: () => {
          edgeToDelete = edge;
          deleteModal.classList.remove('hidden');
        },
      },
    },
  ]);
}

// ----------------------------------
// Edge Events
// ----------------------------------
graph.on('edge:connected', ({ edge }) => {
  updateEdgeLabelAndStyle(edge, edge.getData()?.relation || '=');
  addRemoveButton(edge);
  sortingOrderOfFields(edge);
});

graph.on('edge:click', ({ edge }) => {
  selectedEdge = edge;
  relationTypeSelect.value = edge.getData()?.relation || '=';
  const srcNode = edge.getSourceNode();
  const tgtNode = edge.getTargetNode();

  leftFieldSelect.innerHTML = (tgtNode.data.fields || [])
    .map((f) => `<option value="${f.id}">${f.name}</option>`)
    .join('');
  rightFieldSelect.innerHTML = (srcNode.data.fields || [])
    .map((f) => `<option value="${f.id}">${f.name}</option>`)
    .join('');
  leftFieldSelect.value = edge.getTarget().port.split('.').pop();
  rightFieldSelect.value = edge.getSource().port.split('.').pop();

  const rect = container.getBoundingClientRect();
  edgeControls.style.left =
    rect.left + (rect.width - edgeControls.offsetWidth) / 2 + 'px';
  edgeControls.style.top = '50px';
  edgeControls.style.display = 'block';
});

graph.on('blank:click node:click', () => {
  edgeControls.style.display = 'none';
  selectedEdge = null;
});

// ----------------------------------
// Sorting Fields + Links
// ----------------------------------
function sortingOrderOfFields(edge) {
  const updatedData = JSON.parse(JSON.stringify(currentGraphData));

  const srcNode = edge.getSourceNode();
  const tgtNode = edge.getTargetNode();
  const srcFieldId = edge.getSource().port.split('.').pop();
  const tgtFieldId = edge.getTarget().port.split('.').pop();

  const newLink = {
    id: edge.id,
    source: `${srcNode.id}.R.${srcFieldId}`,
    target: `${tgtNode.id}.L.${tgtFieldId}`,
    relation: edge.getData()?.relation || '=',
    sourceTableName: srcNode.data.name,
    sourceFieldName:
      srcNode.data.fields.find((f) => f.id === srcFieldId)?.name || srcFieldId,
    targetTableName: tgtNode.data.name,
    targetFieldName:
      tgtNode.data.fields.find((f) => f.id === tgtFieldId)?.name || tgtFieldId,
  };

  updatedData.links.push(newLink);

  // Move connected fields to top
  updatedData.tables.forEach((table) => {
    if (table.id === srcNode.id) {
      const idx = table.fields.findIndex((f) => f.id === srcFieldId);
      if (idx > -1) table.fields.unshift(table.fields.splice(idx, 1)[0]);
    }
    if (table.id === tgtNode.id) {
      const idx = table.fields.findIndex((f) => f.id === tgtFieldId);
      if (idx > -1) table.fields.unshift(table.fields.splice(idx, 1)[0]);
    }
  });

  currentGraphData = updatedData;
  loadGraphData(updatedData);
}

// ----------------------------------
// Save / Cancel Relation
// ----------------------------------
btnSaveRelation.addEventListener('click', () => {
  if (!selectedEdge) return;
  const relation = relationTypeSelect.value;
  updateEdgeLabelAndStyle(selectedEdge, relation);

  const link = currentGraphData.links.find((l) => l.id === selectedEdge.id);
  if (link) link.relation = relation;

  edgeControls.style.display = 'none';
  sortingOrderOfFields(selectedEdge);
  selectedEdge = null;
});

btnCancelRelation.addEventListener('click', () => {
  edgeControls.style.display = 'none';
  selectedEdge = null;
});

// ----------------------------------
// Delete Edge Modal
// ----------------------------------
btnCancelDelete.addEventListener('click', () => {
  edgeToDelete = null;
  deleteModal.classList.add('hidden');
});
btnConfirmDelete.addEventListener('click', () => {
  if (edgeToDelete) {
    edgeToDelete.remove();
    currentGraphData.links = currentGraphData.links.filter(
      (l) => l.id !== edgeToDelete.id
    );
  }
  deleteModal.classList.add('hidden');
  edgeToDelete = null;
});

// ----------------------------------
// Export JSON
// ----------------------------------
document.getElementById('btnExport').addEventListener('click', () => {
  const tables = graph.getNodes().map((n) => ({
    id: n.id,
    name: n.data.name,
    baseTable: n.data.baseTable || false,
    position: n.position(),
    fields: n.data.fields || [],
  }));
  const links = graph.getEdges().map((e) => {
    const srcNode = e.getSourceNode();
    const tgtNode = e.getTargetNode();
    const srcFieldId = e.getSource().port.split('.').pop();
    const tgtFieldId = e.getTarget().port.split('.').pop();

    return {
      id: e.id,
      source: e.getSource().port,
      target: e.getTarget().port,
      relation: e.getData().relation,
      sourceTableName: srcNode.data.name,
      sourceFieldName:
        srcNode.data.fields.find((f) => f.id === srcFieldId)?.name ||
        srcFieldId,
      targetTableName: tgtNode.data.name,
      targetFieldName:
        tgtNode.data.fields.find((f) => f.id === tgtFieldId)?.name ||
        tgtFieldId,
    };
  });

  const json = JSON.stringify({ tables, links }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'erd-export.json';
  a.click();
});

// ----------------------------------
// Center Graph
// ----------------------------------
document
  .getElementById('btnCenter')
  .addEventListener('click', () => graph.centerContent());

// ----------------------------------
// Load Graph
// ----------------------------------
function loadGraphData(data) {
  currentGraphData = JSON.parse(JSON.stringify(data));
  graph.clearCells();

  const nodeMap = {};
  currentGraphData.tables.forEach((table) => {
    addTableNode(table);
    nodeMap[table.id] = table;
  });

  currentGraphData.links.forEach((l) => {
    const [srcTableId, , srcFieldId] = l.source.split('.');
    const [tgtTableId, , tgtFieldId] = l.target.split('.');
    const srcNode = nodeMap[srcTableId];
    const tgtNode = nodeMap[tgtTableId];
    if (!srcNode || !tgtNode) return;

    const edge = graph.addEdge({
      id: l.id,
      source: { cell: srcNode.id, port: `${srcNode.id}.R.${srcFieldId}` },
      target: { cell: tgtNode.id, port: `${tgtNode.id}.L.${tgtFieldId}` },
      attrs: {
        line: {
          stroke: '#A2B1C3',
          strokeWidth: 2,
          targetMarker: { name: 'classic', size: 8 },
        },
      },
      data: { ...l },
    });

    updateEdgeLabelAndStyle(edge, l.relation);
    addRemoveButton(edge);
  });

  graph.centerContent();
}

// ----------------------------------
// Load Demo JSON
// ----------------------------------
document.getElementById('btnLoadDemo').addEventListener('click', () => {
  fetch('http://localhost:8000/demoJSON/demo.json')
    .then((res) => res.json())
    .then(loadGraphData)
    .catch((err) => console.error('Failed to load demo JSON:', err));
});

// ----------------------------------
// FileMaker Receiver
// ----------------------------------
window.receiveJSONFromFM = (jsonString) => {
  try {
    loadGraphData(JSON.parse(jsonString));
  } catch {
    alert('Invalid JSON from FileMaker');
  }
};

// ----------------------------------
// Update Base Table
// ----------------------------------
window.updateBaseTable = (newBaseTableName) => {
  currentGraphData.tables.forEach(
    (t) => (t.baseTable = t.name === newBaseTableName)
  );
  loadGraphData(currentGraphData);
};
