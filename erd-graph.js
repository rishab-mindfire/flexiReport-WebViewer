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
// NEW: Add or update link in currentGraphData from an X6 edge
// ----------------------------------
function addOrUpdateLinkFromEdge(edge) {
  const src = edge.getSource();
  const tgt = edge.getTarget();
  const srcNode = edge.getSourceNode();
  const tgtNode = edge.getTargetNode();
  if (!srcNode || !tgtNode) return;

  const srcFieldId = String(src.port || '')
    .split('.')
    .pop();
  const tgtFieldId = String(tgt.port || '')
    .split('.')
    .pop();

  const newLink = {
    id: edge.id,
    // keep tableId.R.fieldId format (R/L used by your code)
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

  // ensure currentGraphData has links array
  currentGraphData.links = currentGraphData.links || [];

  const existsIndex = currentGraphData.links.findIndex(
    (l) =>
      l.id === newLink.id ||
      (l.source === newLink.source && l.target === newLink.target)
  );

  if (existsIndex === -1) {
    currentGraphData.links.push(newLink);
  } else {
    // update existing
    currentGraphData.links[existsIndex] = {
      ...currentGraphData.links[existsIndex],
      ...newLink,
    };
  }
}

// ----------------------------------
// GLOBAL: Sort tables by relation count (most-connected first) and move connected fields top
// ----------------------------------
function applyGlobalRelationCountSort() {
  // deep clone to avoid accidental mutation during calculations
  const updated = JSON.parse(
    JSON.stringify(currentGraphData || { tables: [], links: [] })
  );

  const relationCount = {}; // tableId -> number

  // Normalize links array
  updated.links = updated.links || [];

  updated.links.forEach((l) => {
    // Expect source/target format tableId.<R/L>.fieldId or tableId.R.fieldId
    const sParts = String(l.source).split('.');
    const tParts = String(l.target).split('.');
    const srcTableId = sParts[0];
    const tgtTableId = tParts[0];

    relationCount[srcTableId] = (relationCount[srcTableId] || 0) + 1;
    relationCount[tgtTableId] = (relationCount[tgtTableId] || 0) + 1;
  });

  // Ensure every table has a count
  (updated.tables || []).forEach((t) => {
    relationCount[t.id] = relationCount[t.id] || 0;
  });

  // Within each table: move fields that participate in any link (by id) to top (preserve relative order)
  const tableToLinkedFieldIds = {};
  updated.links.forEach((l) => {
    const [sTable, , sField] = String(l.source).split('.');
    const [tTable, , tField] = String(l.target).split('.');
    if (!tableToLinkedFieldIds[sTable])
      tableToLinkedFieldIds[sTable] = new Set();
    if (!tableToLinkedFieldIds[tTable])
      tableToLinkedFieldIds[tTable] = new Set();
    if (sField) tableToLinkedFieldIds[sTable].add(sField);
    if (tField) tableToLinkedFieldIds[tTable].add(tField);
  });

  updated.tables = (updated.tables || []).map((table) => {
    const linked = Array.from(tableToLinkedFieldIds[table.id] || new Set());
    if (!table.fields || table.fields.length === 0) return table;

    // preserve original order among linked and unlinked groups
    const linkedFields = [];
    const otherFields = [];

    (table.fields || []).forEach((f) => {
      const fid = f.id || f.name;
      if (linked.includes(fid)) linkedFields.push(f);
      else otherFields.push(f);
    });

    return { ...table, fields: [...linkedFields, ...otherFields] };
  });

  // Sort tables by relationCount desc (most-connected first), stable for equal counts
  updated.tables.sort((a, b) => {
    const ca = relationCount[a.id] || 0;
    const cb = relationCount[b.id] || 0;
    return cb - ca;
  });

  // Save back to global and reload graph
  currentGraphData = updated;
  loadGraphData(updated);
}

// ----------------------------------
// Edge Events
// ----------------------------------
graph.on('edge:connected', ({ edge }) => {
  // Set default relation label and tools
  updateEdgeLabelAndStyle(edge, edge.getData()?.relation || '=');
  addRemoveButton(edge);

  // Add/update link in currentGraphData and call global sort + reload
  addOrUpdateLinkFromEdge(edge);
  applyGlobalRelationCountSort();
});

graph.on('edge:click', ({ edge }) => {
  selectedEdge = edge;
  relationTypeSelect.value = edge.getData()?.relation || '=';
  const srcNode = edge.getSourceNode();
  const tgtNode = edge.getTargetNode();

  // populate selects with field ids
  leftFieldSelect.innerHTML = (tgtNode.data.fields || [])
    .map((f) => `<option value="${f.id}">${f.name}</option>`)
    .join('');
  rightFieldSelect.innerHTML = (srcNode.data.fields || [])
    .map((f) => `<option value="${f.id}">${f.name}</option>`)
    .join('');
  leftFieldSelect.value = edge.getTarget().port.split('.').pop();
  rightFieldSelect.value = edge.getSource().port.split('.').pop();

  // position edgeControls roughly centered
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
// Remove old sorting-only helpers (kept for compatibility but no longer used elsewhere)
// ----------------------------------
function sortingOrderOfFields(edge) {
  // kept for backward compatibility — but we no longer recommend using this directly
  // better to use addOrUpdateLinkFromEdge(edge) + applyGlobalRelationCountSort()
  addOrUpdateLinkFromEdge(edge);
  applyGlobalRelationCountSort();
}

function reorderFieldsBasedOnEdge(edge) {
  // kept for compatibility; calls global sorter
  applyGlobalRelationCountSort();
}

function resortAllFields() {
  // Count relations per field
  const fieldUsage = {};

  currentGraphData.links.forEach((link) => {
    const [, , srcField] = link.source.split('.');
    const [, , tgtField] = link.target.split('.');

    fieldUsage[srcField] = (fieldUsage[srcField] || 0) + 1;
    fieldUsage[tgtField] = (fieldUsage[tgtField] || 0) + 1;
  });

  // Sort each table fields: most relations first
  currentGraphData.tables.forEach((table) => {
    table.fields.sort((a, b) => {
      const fa = fieldUsage[a.id] || 0;
      const fb = fieldUsage[b.id] || 0;
      return fb - fa;
    });
  });
}

// ----------------------------------
// Save / Cancel Relation
// ----------------------------------
btnSaveRelation.addEventListener('click', () => {
  if (!selectedEdge) return;

  const relation = relationTypeSelect.value;
  const newLeftField = leftFieldSelect.value; // target field
  const newRightField = rightFieldSelect.value; // source field

  const srcNode = selectedEdge.getSourceNode();
  const tgtNode = selectedEdge.getTargetNode();

  // -----------------------------
  // 1. UPDATE EDGE PORTS
  // -----------------------------
  selectedEdge.setSource({
    cell: srcNode.id,
    port: `${srcNode.id}.R.${newRightField}`,
  });

  selectedEdge.setTarget({
    cell: tgtNode.id,
    port: `${tgtNode.id}.L.${newLeftField}`,
  });

  // -----------------------------
  // 2. UPDATE RELATION LABEL
  // -----------------------------
  updateEdgeLabelAndStyle(selectedEdge, relation);

  // -----------------------------
  // 3. UPDATE JSON ENTRY
  // -----------------------------
  const link = currentGraphData.links.find((l) => l.id === selectedEdge.id);
  if (link) {
    link.source = `${srcNode.id}.R.${newRightField}`;
    link.target = `${tgtNode.id}.L.${newLeftField}`;
    link.relation = relation;
  }

  // -----------------------------
  // 4. RESORT ALL FIELDS
  // -----------------------------
  resortAllFields();

  loadGraphData(currentGraphData);

  // Close popup
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
    // remove visual edge if present
    try {
      edgeToDelete.remove();
    } catch (e) {
      /* ignore */
    }

    // remove from data
    currentGraphData.links = currentGraphData.links.filter(
      (l) => l.id !== edgeToDelete.id
    );

    // After delete, reapply global sort & reload to update table order + fields
    applyGlobalRelationCountSort();
  }
  deleteModal.classList.add('hidden');
  edgeToDelete = null;
});

// ----------------------------------
// Export JSON
// ----------------------------------
document.getElementById('btnExport').addEventListener('click', () => {
  // Export from currentGraphData so readable names are preserved
  const json = JSON.stringify(currentGraphData, null, 2);
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
  // data is expected to be { tables: [...], links: [...] }
  currentGraphData = JSON.parse(JSON.stringify(data));
  graph.clearCells();

  const nodeMap = {};
  currentGraphData.tables.forEach((table) => {
    addTableNode(table);
    nodeMap[table.id] = table;
  });

  // Recreate edges using IDs (port ids must match ports created in nodes)
  (currentGraphData.links || []).forEach((l) => {
    // source and target are expected like: TableId.R.FieldId
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
      data: { ...l }, // includes readable names if present
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
    .then((jsonData) => {
      // Set data, then apply global sorting and load
      currentGraphData = JSON.parse(JSON.stringify(jsonData));
      applyGlobalRelationCountSort();
    })
    .catch((err) => console.error('Failed to load demo JSON:', err));
});

// ----------------------------------
// FileMaker Receiver
// ----------------------------------
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

// ----------------------------------
// Update Base Table
// ----------------------------------
window.updateBaseTable = (newBaseTableName) => {
  currentGraphData.tables.forEach(
    (t) => (t.baseTable = t.name === newBaseTableName)
  );
  // Reapply sorting so base flag can affect ordering if needed
  applyGlobalRelationCountSort();
};
