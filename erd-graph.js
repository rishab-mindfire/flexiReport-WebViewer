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

let selectedEdge = null;
let edgeToDelete = null;

//initialize json Data
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
// Helpers
// ----------------------------------
const parsePort = (p) => ({ cell: p.split('.')[0], port: p });

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
const FIELD_HEIGHT = 22;
const HEADER_HEIGHT = 42;
const TABLE_PADDING = 10;
const PORT_TOP_MARGIN = 10;

function makePortsForTable(n) {
  return (n.fields || []).map((f, i) => {
    const fid = f.id || f.name;
    const grp = n.baseTable ? 'right' : 'left';
    return {
      id: `${n.id}.${grp === 'right' ? 'R' : 'L'}.${fid}`,
      group: grp,
      args: {
        y: HEADER_HEIGHT + i * FIELD_HEIGHT + PORT_TOP_MARGIN,
      },
    };
  });
}

// ----------------------------------
// Add Node
// ----------------------------------
function addTableNode(n) {
  const height = 42 + (n.fields?.length || 1) * 36 + 10;

  graph.addNode({
    id: n.id,
    shape: 'html',
    x: n.position?.x ?? 60,
    y: n.position?.y ?? 60,
    width: 260,
    height,
    html: buildTableHtml(n),
    data: n,
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
      items: makePortsForTable(n),
    },
  });
}

// ----------------------------------
// Edge Label + Style
// ----------------------------------
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

// ----------------------------------
// Remove Button on Edges
// ----------------------------------
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
});

graph.on('edge:click', ({ edge }) => {
  selectedEdge = edge;

  relationTypeSelect.value = edge.getData()?.relation || '=';

  const sourceNode = edge.getSourceNode();
  const targetNode = edge.getTargetNode();

  // Populate dropdowns
  leftFieldSelect.innerHTML = (targetNode.data.fields || [])
    .map((f) => `<option value="${f.id || f.name}">${f.name}</option>`)
    .join('');

  rightFieldSelect.innerHTML = (sourceNode.data.fields || [])
    .map((f) => `<option value="${f.id || f.name}">${f.name}</option>`)
    .join('');

  // Selected items
  leftFieldSelect.value = edge.getTarget().port.split('.').slice(2).join('.');
  rightFieldSelect.value = edge.getSource().port.split('.').slice(2).join('.');

  // Center panel horizontally
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
// Save Relation
// ----------------------------------
btnSaveRelation.addEventListener('click', () => {
  if (!selectedEdge) return;

  const relation = relationTypeSelect.value;
  updateEdgeLabelAndStyle(selectedEdge, relation);

  const left = leftFieldSelect.value;
  const right = rightFieldSelect.value;

  const src = selectedEdge.getSource().port.split('.');
  const tgt = selectedEdge.getTarget().port.split('.');

  selectedEdge.setSource({ cell: src[0], port: `${src[0]}.R.${right}` });
  selectedEdge.setTarget({ cell: tgt[0], port: `${tgt[0]}.L.${left}` });

  addRemoveButton(selectedEdge);

  edgeControls.style.display = 'none';
  selectedEdge = null;

  selectedEdge.invalidate();
  graph.paint();
});

btnCancelRelation.addEventListener('click', () => {
  edgeControls.style.display = 'none';
  selectedEdge = null;
});

// ----------------------------------
// Delete Modal
// ----------------------------------
btnCancelDelete.addEventListener('click', () => {
  edgeToDelete = null;
  deleteModal.classList.add('hidden');
});

btnConfirmDelete.addEventListener('click', () => {
  if (edgeToDelete) edgeToDelete.remove();
  deleteModal.classList.add('hidden');
  edgeToDelete = null;
});

// ----------------------------------
// EXPORT JSON
// ----------------------------------
document.getElementById('btnExport').addEventListener('click', () => {
  const nodesMap = {};
  graph.getNodes().forEach((n) => {
    nodesMap[n.id] = n.data;
  });

  const tables = graph.getNodes().map((n) => ({
    id: n.id,
    name: n.data.name,
    baseTable: n.data.baseTable || false,
    position: n.position(),
    fields: n.data.fields || [],
  }));

  const links = graph.getEdges().map((e) => {
    const srcNode = nodesMap[e.getSourceNode().id];
    const tgtNode = nodesMap[e.getTargetNode().id];

    const srcFieldId = e.getSource().port.split('.').pop();
    const tgtFieldId = e.getTarget().port.split('.').pop();

    const srcField =
      srcNode.fields.find((f) => f.id === srcFieldId)?.name || srcFieldId;
    const tgtField =
      tgtNode.fields.find((f) => f.id === tgtFieldId)?.name || tgtFieldId;

    return {
      id: e.id,
      source: `${srcNode.name}.R.${srcField}`,
      target: `${tgtNode.name}.L.${tgtField}`,
      relation: e.getData().relation,
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
// Load Demo JSON
// ----------------------------------
document.getElementById('btnLoadDemo').addEventListener('click', () => {
  fetch('http://localhost:8000/demoJSON/demo.json')
    .then((res) => res.json())
    .then(loadGraphData)
    .catch((err) => console.error('Failed to load demo JSON:', err));
});

// ----------------------------------
// Shared Loader (Demo + FileMaker)
// ----------------------------------
function loadGraphData(data) {
  currentGraphData = JSON.parse(JSON.stringify(data));
  graph.clearCells();

  const nodeMap = {};
  (data.tables || []).forEach((n) => {
    addTableNode(n);
    nodeMap[n.name] = n;
  });

  (data.links || []).forEach((l) => {
    let sourceNode = nodeMap[l.source.split('.').shift()];
    let targetNode = nodeMap[l.target.split('.').shift()];

    if (!sourceNode || !targetNode) return;

    // Find field IDs for ports
    const srcFieldName = l.source.split('.').pop();
    const tgtFieldName = l.target.split('.').pop();

    const srcField = sourceNode.fields.find((f) => f.name === srcFieldName);
    const tgtField = targetNode.fields.find((f) => f.name === tgtFieldName);

    const e = graph.addEdge({
      id: l.id,
      source: {
        cell: sourceNode.id,
        port: `${sourceNode.id}.R.${srcField?.id || srcFieldName}`,
      },
      target: {
        cell: targetNode.id,
        port: `${targetNode.id}.L.${tgtField?.id || tgtFieldName}`,
      },
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
}

// ----------------------------------
// FileMaker Receiver
// ----------------------------------
window.receiveJSONFromFM = function (jsonString) {
  try {
    const data = JSON.parse(jsonString);
    loadGraphData(data);
  } catch (e) {
    alert('Invalid JSON from FileMaker');
  }
};

// ----------------------------------
// FileMaker Base Table name
// ----------------------------------
window.updateBaseTable = function (newBaseTableName) {
  try {
    currentGraphData.tables.forEach((table) => {
      table.baseTable = table.name === newBaseTableName;
    });

    // Re-render from updated JSON
    loadGraphData(currentGraphData);
  } catch (error) {
    console.error('Error updating base table:', error);
    return false;
  }
};
