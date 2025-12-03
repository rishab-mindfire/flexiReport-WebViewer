// =====================
// ERD Graph
// =====================
let currentGraphData = null;

function buildTableHtml(table) {
  const fieldsHtml = (table.fields || [])
    .map(
      (f) => `
      <div class="er-field" data-name="${f.id || f.name}">
        <span>${f.name}</span>
      </div>
    `
    )
    .join('');

  return `
    <div class="er-table ${table.baseTable ? 'base-table' : ''}">
      <div class="er-header">${table.name}</div>
      <div class="er-fields-container">${fieldsHtml}</div>
    </div>
  `;
}

const { Graph } = window.X6;

const graph = new Graph({
  container: document.getElementById('container'),
  grid: true,
  panning: true,
  mousewheel: { enabled: true, modifiers: 'ctrl' },
  connecting: {
    allowBlank: false,
    allowLoop: false,
    allowMulti: true,
    highlight: true,
    connector: { name: 'normal' },
    createEdge() {
      return graph.createEdge({
        attrs: {
          line: {
            stroke: '#A2B1C3',
            strokeWidth: 2,
            targetMarker: { name: 'classic', size: 8 },
          },
        },
      });
    },

    validateConnection({ sourcePort, targetPort, targetCell }) {
      if (!sourcePort || !targetPort) return false;
      if (targetCell?.data?.baseTable) return false;
      return (
        String(sourcePort).includes('.R.') && String(targetPort).includes('.L.')
      );
    },
  },
});

// ---------------------
// LOAD JSON DATA
// ---------------------
function loadFromJSON(data) {
  graph.clearCells();
  const headerHeight = 36;
  const rowHeight = 32;
  const nodeWidth = 250;
  const nodesArr =
    data.nodes ??
    (data.tables || []).map((t) => ({
      id: t.id,
      name: t.name,
      baseTable: t.baseTable || false,
      position: t.position,
      fields: (t.fields || []).map((f) => ({
        id: f.id || f.name,
        name: f.name,
      })),
    }));

  const edgesArr =
    data.edges ??
    (data.links || []).map((l) => {
      const parse = (v) => {
        if (typeof v === 'string') {
          const [table, field] = v.split('.');
          return { table, field };
        }
        return v;
      };

      return {
        id: l.id || `e_${Math.random().toString(36).slice(2, 9)}`,
        source: parse(l.source),
        target: parse(l.target),
      };
    });

  // ---------------------
  // CREATE NODES
  // ---------------------

  nodesArr.forEach((n, i) => {
    const totalHeight = headerHeight + (n.fields?.length || 0) * rowHeight;
    let portItems = [];
    (n.fields || []).forEach((f, i) => {
      const y = headerHeight + i * rowHeight + rowHeight / 2;
      const fid = f.id || f.name;
      if (!n.baseTable)
        portItems.push({ id: `${n.id}.L.${fid}`, group: 'left', args: { y } });
      portItems.push({ id: `${n.id}.R.${fid}`, group: 'right', args: { y } });
    });

    graph.addNode({
      id: n.id,
      shape: 'html',
      x: n.baseTable ? 120 : n.position?.x ?? 40 + i * 360,
      y: n.position?.y ?? 40,
      width: nodeWidth,
      height: totalHeight,
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
                stroke: '#1890ff',
                fill: 'white',
              },
            },
          },

          right: {
            position: {
              name: 'absolute',
              args: { x: nodeWidth, y: headerHeight },
            },
            attrs: {
              circle: { magnet: true, r: 6, stroke: '#1890ff', fill: 'white' },
            },
          },
        },
        items: portItems,
      },
    });
  });

  // ---------------------
  // CREATE EDGES
  // ---------------------
  edgesArr.forEach((e) => {
    const edge = graph.addEdge({
      id: e.id,
      source: {
        cell: e.source.table,
        port: `${e.source.table}.R.${e.source.field}`,
      },

      target: {
        cell: e.target.table,
        port: `${e.target.table}.L.${e.target.field}`,
      },

      attrs: {
        line: {
          stroke: '#A2B1C3',
          strokeWidth: 2,
          targetMarker: { name: 'classic', size: 8 },
        },
      },
    });

    addRemoveButton(edge);
  });

  graph.centerContent();
}

// ---------------------
//REMOVE BUTTON
// ---------------------
function addRemoveButton(edge) {
  edge.removeTools();
  edge.addTools([
    {
      name: 'button-remove',
      args: {
        distance: 0.5,
        markup: [
          {
            tagName: 'circle',
            selector: 'button',
            attrs: {
              r: 10,
              fill: '#ff4d4f',
              stroke: '#fff',
              cursor: 'pointer',
            },
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
      },
    },
  ]);
}

// ---------------------
//  EDGE CLICK TO DELETE
// ---------------------
graph.on('edge:tool:button-remove:pointerdown', ({ edge }) => {
  if (!edge) return;
  if (confirm('Delete this relationship?')) edge.remove();
});

graph.on('edge:connected', ({ edge }) => addRemoveButton(edge));

// ---------------------
// EXPORT JSON
// ---------------------
function exportJSON() {
  return {
    tables: graph.getNodes().map((n) => ({
      id: n.id,
      name: n.data.name,
      baseTable: n.data.baseTable || false,
      position: n.position(),
      fields: n.data.fields,
    })),

    links: graph.getEdges().map((e) => {
      const s = e.getSource();
      const t = e.getTarget();
      const parse = (obj) => {
        const [table, , field] = obj.port.split('.');
        return { table, field };
      };

      return { id: e.id, source: parse(s), target: parse(t) };
    }),
  };
}

document.getElementById('btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify(exportJSON(), null, 2)], {
    type: 'application/json',
  });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'erd-export.json';
  a.click();

  // ======= use the below code when sending data to FileMaker =======
  // const exportData = exportJSON();
  // if (window.FileMaker && window.FileMaker.PerformScript) {
  //   // Send to FileMaker
  //   window.FileMaker.PerformScript("ReceiveERDData", JSON.stringify(exportData));
  // } else {

  //   // Fallback: download as file
  //   const blob = new Blob([JSON.stringify(exportData, null, 2)], {
  //     type: "application/json",
  //   });

  //   const a = document.createElement("a");
  //   a.href = URL.createObjectURL(blob);
  //   a.download = "erd-export.json";
  //   a.click();
  // }
};

document.getElementById('btnCenter').onclick = () => graph.centerContent();

document.getElementById('btnLoadDemo').onclick = () =>
  fetch('http://localhost:8000/demoJSON/demo.json')
    .then((r) => r.json())
    .then((d) => {
      currentGraphData = d;
      loadFromJSON(d);
    })
    .catch(() => console.warn('demo.json not found.'));

// ---------------------
// RECEIVE JSON FROM FILEMAKER
// ---------------------
window.receiveJSONFromFM = function (jsonString) {
  try {
    currentGraphData = JSON.parse(jsonString);
    loadFromJSON(currentGraphData);
  } catch (error) {
    console.error('Invalid JSON from FileMaker:', error);
    alert('Failed to load data from FileMaker. Invalid JSON format.');
  }
};

// ---------------------
// SEND JSON TO FILEMAKER
// ---------------------
window.sendToFileMaker = function (data) {
  if (window.FileMaker && window.FileMaker.PerformScript) {
    window.FileMaker.PerformScript('ReceiveERDData', JSON.stringify(data));
  } else {
    console.warn('Not running inside FileMaker WebViewer');
  }
};

// ---------------------
// UPDATE BASE TABLE
// ---------------------
window.updateBaseTable = function (newBaseTableId) {
  try {
    for (let table of currentGraphData.tables) {
      if (table.id == newBaseTableId) {
        table.baseTable = true;
      } else {
        table.baseTable = false;
      }
    }
    loadFromJSON(currentGraphData);
  } catch (error) {
    console.error('Error updating base table:', error);
    return false;
  }
};

// ---------------------
// SEND JSON TO FILEMAKER
// ---------------------
window.sendToFileMaker = function (data) {
  if (window.FileMaker && window.FileMaker.PerformScript) {
    window.FileMaker.PerformScript('ReceiveERDData', JSON.stringify(data));
  } else {
    console.warn('Not running inside FileMaker WebViewer');
  }
};

// ---------------------
// UPDATE BASE TABLE AND SEND TO FILEMAKER
// ---------------------
window.updateBaseTableAndSend = function (newBaseTableId) {
  var success = window.updateBaseTable(newBaseTableId);
  if (success && currentGraphData) {
    // Send updated data back to FileMaker
    window.sendToFileMaker(currentGraphData);
    return true;
  }
  return false;
};
