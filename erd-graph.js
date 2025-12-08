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
// Constants
// ----------------------------------
const FIELD_HEIGHT = 22;
const HEADER_HEIGHT = 42;
const PORT_TOP_MARGIN = 10;

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
    router: { name: 'er' },
    validateConnection({ sourcePort, targetPort }) {
      // Only allow source from right ports and target from left ports
      return (
        String(sourcePort).includes('.R.') && String(targetPort).includes('.L.')
      );
    },
  },
  selecting: { enabled: true, multiple: false },
});

// ----------------------------------
// Build HTML
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
// ----------------------------------
// Track Node Positions
// ----------------------------------
function saveNodePositions() {
  const positions = {};
  graph.getNodes().forEach((node) => {
    const pos = node.position();
    positions[node.id] = { x: pos.x, y: pos.y };
  });
  return positions;
}

// ----------------------------------
// Port connection formation
// ----------------------------------
function makePortsForTable(table) {
  return (table.fields || []).flatMap((f, i) => {
    const fid = f.id || f.name;

    if (table.baseTable) {
      // Base table  only right ports opens
      return [
        {
          id: `${table.id}.R.${fid}`,
          group: 'right',
          args: { y: HEADER_HEIGHT + i * FIELD_HEIGHT + PORT_TOP_MARGIN },
        },
      ];
    } else {
      // Other left and right ports opens
      return [
        {
          id: `${table.id}.L.${fid}`,
          group: 'left',
          args: { y: HEADER_HEIGHT + i * FIELD_HEIGHT + PORT_TOP_MARGIN },
        },
        {
          id: `${table.id}.R.${fid}`,
          group: 'right',
          args: { y: HEADER_HEIGHT + i * FIELD_HEIGHT + PORT_TOP_MARGIN },
        },
      ];
    }
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
  const width = 10;
  const height = 2;

  edge.setLabels([
    {
      position: 0.5,
      attrs: {
        text: {
          text: relation,
          fill: '#05070eff',
          fontSize: 12,
          fontWeight: 600,
          textAnchor: 'middle',
        },
        rect: {
          fill: '#f8fafc',
          stroke: '#0f4991ff',
          rx: 6,
          ry: 20,

          refWidth: width,
          refHeight: height,

          refX: -width / 2,
          refY: -height / 2,
        },
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
// Add/Update link in currentGraphData
// ----------------------------------
function addOrUpdateLinkFromEdge(edge) {
  // console.log(edge);
  const srcNode = edge.getSourceNode();
  const tgtNode = edge.getTargetNode();
  if (!srcNode || !tgtNode) return;

  const srcFieldId = String(edge.getSource().port || '')
    .split('.')
    .pop();
  const tgtFieldId = String(edge.getTarget().port || '')
    .split('.')
    .pop();

  const newLink = {
    id: edge.id,
    source: `${srcNode.id}.R.${srcFieldId}`,
    target: `${tgtNode.id}.L.${tgtFieldId}`,
    relation: edge.getData()?.relation || '=',
    sourceTableName: srcNode.data?.name,
    sourceFieldName:
      srcNode.data?.fields.find((f) => f.id === srcFieldId)?.name || srcFieldId,
    targetTableName: tgtNode.data?.name,
    targetFieldName:
      tgtNode.data?.fields.find((f) => f.id === tgtFieldId)?.name || tgtFieldId,
  };

  currentGraphData.links = currentGraphData.links || [];
  const index = currentGraphData.links.findIndex((l) => l.id === newLink.id);
  if (index === -1) currentGraphData.links.push(newLink);
  else
    currentGraphData.links[index] = {
      ...currentGraphData.links[index],
      ...newLink,
    };
}

// ----------------------------------
// GLOBAL: Sort tables & fields
// ----------------------------------
function applyGlobalRelationCountSort() {
  const updated = JSON.parse(
    JSON.stringify(currentGraphData || { tables: [], links: [] })
  );

  // Keep current positions
  const nodePositions = saveNodePositions();

  const relationCount = {};
  const tableToLinkedFieldIds = {};

  (updated.links || []).forEach((l) => {
    const [sTable, , sField] = String(l.source).split('.');
    const [tTable, , tField] = String(l.target).split('.');
    relationCount[sTable] = (relationCount[sTable] || 0) + 1;
    relationCount[tTable] = (relationCount[tTable] || 0) + 1;

    if (!tableToLinkedFieldIds[sTable])
      tableToLinkedFieldIds[sTable] = new Set();
    if (!tableToLinkedFieldIds[tTable])
      tableToLinkedFieldIds[tTable] = new Set();
    if (sField) tableToLinkedFieldIds[sTable].add(sField);
    if (tField) tableToLinkedFieldIds[tTable].add(tField);
  });

  updated.tables = (updated.tables || []).map((table) => {
    // Preserve current position
    if (nodePositions[table.id]) table.position = nodePositions[table.id];

    const linkedFields = Array.from(tableToLinkedFieldIds[table.id] || []);
    if (!table.fields) return table;

    const linked = [],
      other = [];
    table.fields.forEach((f) => {
      const fid = f.id || f.name;
      linkedFields.includes(fid) ? linked.push(f) : other.push(f);
    });

    return { ...table, fields: [...linked, ...other] };
  });

  // Sort tables by relation count descending
  updated.tables.sort(
    (a, b) => (relationCount[b.id] || 0) - (relationCount[a.id] || 0)
  );

  currentGraphData = updated;
  loadGraphData(updated);
}

// ----------------------------------
// Edge Events
// ----------------------------------
graph.on('edge:connected', ({ edge }) => {
  updateEdgeLabelAndStyle(edge, edge.getData()?.relation || '=');
  addRemoveButton(edge);
  addOrUpdateLinkFromEdge(edge);
  applyGlobalRelationCountSort();
});
// ----------------------------------
// Relation-ship Events
// ----------------------------------
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
// Save / Cancel Relation
// ----------------------------------
btnSaveRelation.addEventListener('click', () => {
  if (!selectedEdge) return;

  const relation = relationTypeSelect.value;
  const newLeftField = leftFieldSelect.value;
  const newRightField = rightFieldSelect.value;

  const srcNode = selectedEdge.getSourceNode();
  const tgtNode = selectedEdge.getTargetNode();

  selectedEdge.setSource({
    cell: srcNode.id,
    port: `${srcNode.id}.R.${newRightField}`,
  });
  selectedEdge.setTarget({
    cell: tgtNode.id,
    port: `${tgtNode.id}.L.${newLeftField}`,
  });
  updateEdgeLabelAndStyle(selectedEdge, relation);

  const link = currentGraphData.links.find((l) => l.id === selectedEdge.id);
  if (link) {
    link.source = `${srcNode.id}.R.${newRightField}`;
    link.target = `${tgtNode.id}.L.${newLeftField}`;
    link.relation = relation;
  }

  applyGlobalRelationCountSort();
  edgeControls.style.display = 'none';
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
    try {
      edgeToDelete.remove();
    } catch (e) {}
    currentGraphData.links = currentGraphData.links.filter(
      (l) => l.id !== edgeToDelete.id
    );
    applyGlobalRelationCountSort();
  }
  deleteModal.classList.add('hidden');
  edgeToDelete = null;
});

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

  (currentGraphData.links || []).forEach((l) => {
    const [srcTableId, , srcFieldId] = String(l.source).split('.');
    const [tgtTableId, , tgtFieldId] = String(l.target).split('.');
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
}
// ----------------------------------
// Center Graph
// ----------------------------------
document
  .getElementById('btnCenter')
  .addEventListener('click', () => graph.centerContent());

// ----------------------------------
// Export JSON
// ----------------------------------
document.getElementById('btnExport').addEventListener('click', () => {
  // Clone current graph data to avoid mutation
  const exportData = JSON.parse(JSON.stringify(currentGraphData));

  // Save current live positions
  graph.getNodes().forEach((node) => {
    const pos = node.position();
    const table = exportData.tables.find((t) => t.id === node.id);
    if (table) table.position = { x: pos.x, y: pos.y };
  });
  const json = JSON.stringify(exportData, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'erd-export.json';
  a.click();

  //  console.log('Exported JSON:', exportData);
});

// ----------------------------------
// Demo / FileMaker
// ----------------------------------
document.getElementById('btnLoadDemo').addEventListener('click', () => {
  fetch('http://localhost:8000/demoJSON/demo.json')
    .then((res) => res.json())
    .then((jsonData) => {
      currentGraphData = JSON.parse(JSON.stringify(jsonData));
      applyGlobalRelationCountSort();
    })
    .catch((err) => console.error('Failed to load demo JSON:', err));
});

window.receiveJSONFromFM = (jsonString) => {
  try {
    const parsed = JSON.parse(jsonString);
    currentGraphData = JSON.parse(JSON.stringify(parsed));
    applyGlobalRelationCountSort();
  } catch (e) {
    alert('Invalid JSON from FileMaker');
    console.error(e);
  }
};

window.updateBaseTable = (newBaseTableName) => {
  currentGraphData.tables.forEach(
    (t) => (t.baseTable = t.name === newBaseTableName)
  );
  applyGlobalRelationCountSort();
};
