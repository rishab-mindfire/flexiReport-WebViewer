/**
 * 1. STATE & DATA STORE
 */
const Store = {
  data: [], // Full row data (loaded only on preview)
  headers: [], // Column names (loaded on startup)
  selectedElement: null,
};

/**
 * 2. REPORT ENGINE
 */
const ReportEngine = {
  calculate(funcName, fieldName) {
    // If we are in design mode and haven't fetched full data yet
    if (Store.data.length === 0) return '...';

    const vals = Store.data.map((r) => Number(r[fieldName] || 0));
    let res = 0;

    if (funcName === 'SUM') res = vals.reduce((a, b) => a + b, 0);
    else if (funcName === 'AVG')
      res = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

    return res.toLocaleString();
  },

  getSchema() {
    const s = { parts: {} };
    ['header', 'body', 'footer'].forEach((p) => {
      const partEl = document.getElementById('part-' + p);
      if (!partEl || partEl.style.display === 'none') return;

      s.parts[p] = {
        height: partEl.offsetHeight,
        elements: [...partEl.querySelectorAll('.canvas-element')].map((e) => {
          const type = e.dataset.type;
          let cleanContent = '';

          // FIX: Don't grab the result text for calculations
          if (type === 'calculation') {
            cleanContent = ''; // Keep content empty, use 'function' and 'field' keys instead
          } else if (type === 'label') {
            cleanContent =
              e.querySelector('.element-content')?.textContent.trim() || '';
          } else {
            cleanContent = `[${e.dataset.key}]`;
          }

          const contentEl = e.querySelector('.element-content');
          // Prefer inline style, fallback to dataset values
          const fontSize = contentEl?.style.fontSize
            ? parseInt(contentEl.style.fontSize)
            : e.dataset.fontSize
            ? parseInt(e.dataset.fontSize)
            : null;
          const bold = (contentEl?.style.fontWeight || '') === 'bold' || e.dataset.bold === '1';
          const italic = (contentEl?.style.fontStyle || '') === 'italic' || e.dataset.italic === '1';
          const underline = (contentEl?.style.textDecoration || '') === 'underline' || e.dataset.underline === '1';

          return {
            type: type,
            key: e.dataset.key || null,
            content: cleanContent,
            x: Math.round(parseFloat(e.dataset.x)) || 0,
            y: Math.round(parseFloat(e.dataset.y)) || 0,
            w: Math.round(parseFloat(e.style.width)) || 150,
            h: Math.round(parseFloat(e.style.height)) || 22,
            function: e.dataset.function || null,
            field: e.dataset.field || null,
            fontSize: fontSize,
            bold: !!bold,
            italic: !!italic,
            underline: !!underline,
          };
        }),
      };
    });
    return s;
  },
};

/**
 * 3. UI RENDERER
 */
const Renderer = {
  createCanvasElement(parent, config) {
    const { x, y, type, key, content, w = 150, h = 22, field, fontSize, bold, italic, underline } = config;
    const funcName = config.function || config.func;

    const el = document.createElement('div');
    el.className = 'canvas-element' + (type === 'label' ? ' is-label' : '');
    Object.assign(el.style, {
      width: w + 'px',
      height: h + 'px',
      transform: `translate(${x}px,${y}px)`,
    });

    Object.assign(el.dataset, { x, y, type });
    if (key) el.dataset.key = key;
    if (funcName) el.dataset.function = funcName;
    if (field) el.dataset.field = field;
    if (fontSize) el.dataset.fontSize = String(fontSize);
    if (bold) el.dataset.bold = '1';
    if (italic) el.dataset.italic = '1';
    if (underline) el.dataset.underline = '1';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'element-content';
    contentDiv.style.flex = '1';

    if (type === 'calculation') {
      this.setupCalculationUI(el, contentDiv, funcName, field);
    } else if (type === 'label') {
      contentDiv.contentEditable = true;
      contentDiv.textContent = content || 'Text';
    } else {
      // For field elements, show a sample value when placed in header/footer
      if (key) {
        const parentPart = parent?.dataset?.part;
        if ((parentPart === 'header' || parentPart === 'footer') && Store.data && Store.data.length > 0) {
          contentDiv.textContent = Store.data[0][key] ?? `[${key}]`;
        } else {
          contentDiv.textContent = `[${key}]`;
        }
      } else {
        contentDiv.textContent = '';
      }
    }

    // Apply formatting if provided
    const applyFormattingToContent = (el, cd) => {
      const fs = fontSize || el.dataset.fontSize || null;
      if (fs) cd.style.fontSize = (fs ? String(fs) : 14) + 'px';
      if (bold || el.dataset.bold === '1') cd.style.fontWeight = 'bold';
      if (italic || el.dataset.italic === '1') cd.style.fontStyle = 'italic';
      if (underline || el.dataset.underline === '1') cd.style.textDecoration = 'underline';
    };
    applyFormattingToContent(el, contentDiv);

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';

    el.append(handle, contentDiv);
    el.addEventListener('click', (e) => Actions.selectElement(el, e));
    parent.appendChild(el);
  },

  setupCalculationUI(el, container, funcName, savedField) {
    const select = document.createElement('select');
    select.style.width = '100%';

    // Use headers if available, otherwise data keys
    const options = Store.headers.length > 0 ? Store.headers : [];
    select.innerHTML =
      `<option value="">--select field--</option>` +
      options.map((k) => `<option value="${k}">${k}</option>`).join('');

    const resultDisplay = document.createElement('div');
    resultDisplay.className = 'calc-result';
    resultDisplay.style.fontSize = '12px';

    const update = (selectedField) => {
      el.dataset.field = selectedField;
      const res = ReportEngine.calculate(funcName, selectedField);
      resultDisplay.textContent = selectedField
        ? `${funcName || 'CALC'}(${selectedField}) = ${res}`
        : '';
    };

    select.addEventListener('change', (e) => update(e.target.value));
    if (savedField) {
      select.value = savedField;
      update(savedField);
    }
    container.append(select, resultDisplay);
  },
};

/**
 * 4. ACTIONS & CONTROLLER
 */
const Actions = {
  init() {
    this.setupPartResizing();
    this.setupKeyboardListeners();
    this.setupSidebarToggles();
    this.setupDropZones();
    this.setupFormattingBar();
    this.loadHeaders(); // Step 1: Initial Load
  },

  // Step 1: Load Column names for design
  async loadHeaders() {
    const list = document.getElementById('fields-list');
    list.innerHTML = '<div class="loading-text">Loading fields...</div>';

    setTimeout(async () => {
      try {
        const res = await fetch(
          'http://localhost:8000/demoJSON/layoutHeaderJSON.json'
        );
        Store.headers = await res.json();
        this.refreshToolbox();
      } catch (err) {
        list.innerHTML = '<div style="color:red">Header Load Failed</div>';
      }
    }, 1800); // Simulated delay
  },

  refreshToolbox() {
    const list = document.getElementById('fields-list');
    list.innerHTML = '';
    Store.headers.forEach((k) => {
      const d = document.createElement('div');
      d.className = 'tool-item';
      d.draggable = true;
      d.dataset.type = 'field';
      d.dataset.key = k;
      d.textContent = k;
      list.appendChild(d);
    });
    this.bindNativeDrag();
  },

  // Step 2: Load Whole Data for Preview
  async generatePreview() {
    const out = document.getElementById('preview-content');
    const modal = document.getElementById('preview-modal');
    const schema = ReportEngine.getSchema();

    modal.style.display = 'flex';
    out.innerHTML =
      '<div class="loading-text" style="text-align:center; width:100%; margin-top:50px;">Calculating report data...</div>';

    setTimeout(async () => {
      try {
        const res = await fetch(
          'http://localhost:8000/demoJSON/layoutJSON.json'
        );
        Store.data = await res.json();
        this.renderPreviewHTML(schema, out);
      } catch (err) {
        out.innerHTML =
          '<div style="color:red">Error loading full dataset.</div>';
      }
    }, 1200); // Simulated delay
  },

  renderPreviewHTML(s, container) {
    container.innerHTML = '';
    const previewPage = document.createElement('div');

    ['header', 'body', 'footer'].forEach((pName) => {
      const pDef = s.parts[pName];
      if (!pDef) return;

      const renderPart = (row = null) => {
        const div = document.createElement('div');
        div.className = `r-part-${pName}`;
        div.style.height = pDef.height + 'px';
        div.style.position = 'relative';

        pDef.elements.forEach((e) => {
          const el = document.createElement('div');
          el.className = 'r-element';
          Object.assign(el.style, {
            left: e.x + 'px',
            top: e.y + 'px',
            width: e.w + 'px',
            height: e.h + 'px',
          });
          // Apply formatting from schema
          if (e.fontSize) el.style.fontSize = e.fontSize + 'px';
          el.style.fontWeight = e.bold ? 'bold' : 'normal';
          el.style.fontStyle = e.italic ? 'italic' : 'normal';
          el.style.textDecoration = e.underline ? 'underline' : 'none';
          if (e.type === 'field') {
            if (row) el.textContent = row[e.key];
            else el.textContent = Store.data && Store.data.length > 0 ? (Store.data[0][e.key] ?? '') : (e.content || '');
          } else if (e.type === 'calculation') {
            el.textContent = ReportEngine.calculate(e.function, e.field);
          } else {
            el.textContent = e.content;
          }

          div.appendChild(el);
        });
        return div;
      };

      if (pName === 'body')
        Store.data.forEach((row) => previewPage.appendChild(renderPart(row)));
      else previewPage.appendChild(renderPart());
    });
    container.appendChild(previewPage);
  },

  bindNativeDrag() {
    document.querySelectorAll('.tool-item').forEach((t) => {
      t.ondragstart = (e) => {
        e.dataTransfer.setData('type', t.dataset.type);
        e.dataTransfer.setData('key', t.dataset.key || '');
        e.dataTransfer.setData('function', t.dataset.function || '');
      };
    });
  },

  setupDropZones() {
    document.querySelectorAll('.part').forEach((p) => {
      p.ondragover = (e) => e.preventDefault();
      p.ondrop = (e) => {
        e.preventDefault();
        const rect = p.getBoundingClientRect();
        Renderer.createCanvasElement(p, {
          x: Math.round(e.clientX - rect.left - 75),
          y: Math.round(e.clientY - rect.top - 11),
          type: e.dataTransfer.getData('type'),
          key: e.dataTransfer.getData('key'),
          function: e.dataTransfer.getData('function'),
        });
      };
    });
  },

  selectElement(el, e) {
    e.stopPropagation();
    if (Store.selectedElement) Store.selectedElement.style.outline = '';
    Store.selectedElement = el;
    el.style.outline = '2px dashed red';

    // Sync formatting toolbar to the selected element
    const contentEl = el.querySelector('.element-content');
    const fs = contentEl?.style.fontSize ? parseInt(contentEl.style.fontSize) : el.dataset.fontSize ? parseInt(el.dataset.fontSize) : 14;
    const bold = (contentEl?.style.fontWeight || '') === 'bold' || el.dataset.bold === '1';
    const italic = (contentEl?.style.fontStyle || '') === 'italic' || el.dataset.italic === '1';
    const underline = (contentEl?.style.textDecoration || '') === 'underline' || el.dataset.underline === '1';

    const fsSelect = document.getElementById('format-fontsize');
    const bBtn = document.getElementById('format-bold');
    const iBtn = document.getElementById('format-italic');
    const uBtn = document.getElementById('format-underline');
    if (fsSelect) fsSelect.value = String(fs);
    if (bBtn) bBtn.classList.toggle('active', !!bold);
    if (iBtn) iBtn.classList.toggle('active', !!italic);
    if (uBtn) uBtn.classList.toggle('active', !!underline);
  },

  applyFormatting(el, { fontSize, bold, italic, underline }) {
    if (!el) return;
    const contentEl = el.querySelector('.element-content');
    if (!contentEl) return;

    if (typeof fontSize !== 'undefined') {
      contentEl.style.fontSize = fontSize ? fontSize + 'px' : '';
      el.dataset.fontSize = fontSize ? String(fontSize) : '';
    }
    if (typeof bold !== 'undefined') {
      if (bold) {
        contentEl.style.fontWeight = 'bold';
        el.dataset.bold = '1';
      } else {
        contentEl.style.fontWeight = '';
        el.dataset.bold = '';
      }
    }
    if (typeof italic !== 'undefined') {
      if (italic) {
        contentEl.style.fontStyle = 'italic';
        el.dataset.italic = '1';
      } else {
        contentEl.style.fontStyle = '';
        el.dataset.italic = '';
      }
    }
    if (typeof underline !== 'undefined') {
      if (underline) {
        contentEl.style.textDecoration = 'underline';
        el.dataset.underline = '1';
      } else {
        contentEl.style.textDecoration = '';
        el.dataset.underline = '';
      }
    }
  },

  setupFormattingBar() {
    const fsSelect = document.getElementById('format-fontsize');
    const bBtn = document.getElementById('format-bold');
    const iBtn = document.getElementById('format-italic');
    const uBtn = document.getElementById('format-underline');

    if (fsSelect) {
      fsSelect.onchange = (e) => {
        if (!Store.selectedElement) return alert('Select an element first');
        const size = parseInt(e.target.value);
        this.applyFormatting(Store.selectedElement, { fontSize: size });
      };
    }
    if (bBtn) {
      bBtn.onclick = (e) => {
        if (!Store.selectedElement) return alert('Select an element first');
        const active = bBtn.classList.toggle('active');
        this.applyFormatting(Store.selectedElement, { bold: active });
      };
    }
    if (iBtn) {
      iBtn.onclick = (e) => {
        if (!Store.selectedElement) return alert('Select an element first');
        const active = iBtn.classList.toggle('active');
        this.applyFormatting(Store.selectedElement, { italic: active });
      };
    }
    if (uBtn) {
      uBtn.onclick = (e) => {
        if (!Store.selectedElement) return alert('Select an element first');
        const active = uBtn.classList.toggle('active');
        this.applyFormatting(Store.selectedElement, { underline: active });
      };
    }

    // Deselect formatting when clicking outside both canvas and the formatting bar
    document.addEventListener('click', (ev) => {
      // Ignore clicks inside a canvas element or inside the formatting bar
      if (!ev.target.closest('.canvas-element') && !ev.target.closest('#format-bar')) {
        ['format-bold', 'format-italic', 'format-underline'].forEach((id) => {
          const btn = document.getElementById(id);
          if (btn) btn.classList.remove('active');
        });
      }
    });
  },

  setupPartResizing() {
    interact('.part').resizable({
      edges: { bottom: true },
      listeners: {
        move(e) {
          e.target.style.height = e.rect.height + 'px';
        },
      },
    });

    interact('.canvas-element').resizable({
      edges: { left: true, right: true, bottom: true, top: true },
      listeners: {
        move(e) {
          const t = e.target;
          let x = (parseFloat(t.dataset.x) || 0) + e.deltaRect.left;
          let y = (parseFloat(t.dataset.y) || 0) + e.deltaRect.top;
          Object.assign(t.style, {
            width: e.rect.width + 'px',
            height: e.rect.height + 'px',
            transform: `translate(${x}px,${y}px)`,
          });
          Object.assign(t.dataset, { x, y });
        },
      },
    });

    interact('.drag-handle').draggable({
      listeners: {
        start(e) {
          const el = e.target.parentElement;
          const r = el.getBoundingClientRect();
          el._dragData = {
            startParent: el.parentElement,
            px: r.left,
            py: r.top,
            w: r.width,
            h: r.height,
          };
          document.body.appendChild(el);
          Object.assign(el.style, {
            position: 'fixed',
            left: r.left + 'px',
            top: r.top + 'px',
            transform: 'none',
            zIndex: 1000,
          });
        },
        move(e) {
          const el = e.target.parentElement;
          el._dragData.px += e.dx;
          el._dragData.py += e.dy;
          el.style.left = el._dragData.px + 'px';
          el.style.top = el._dragData.py + 'px';
        },
        end(e) {
          const el = e.target.parentElement;
          const cx = el._dragData.px + el._dragData.w / 2;
          const cy = el._dragData.py + el._dragData.h / 2;
          const targetPart =
            ['header', 'body', 'footer']
              .map((id) => document.getElementById('part-' + id))
              .find((p) => {
                const r = p.getBoundingClientRect();
                return (
                  cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
                );
              }) || el._dragData.startParent;

          const tr = targetPart.getBoundingClientRect();
          const nx = Math.round(cx - tr.left - el._dragData.w / 2);
          const ny = Math.round(cy - tr.top - el._dragData.h / 2);
          targetPart.appendChild(el);
          Object.assign(el.style, {
            position: 'absolute',
            left: '0',
            top: '0',
            transform: `translate(${nx}px,${ny}px)`,
            zIndex: '',
          });
          Object.assign(el.dataset, { x: nx, y: ny });
        },
      },
    });
  },

  setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' && Store.selectedElement) {
        Store.selectedElement.remove();
        Store.selectedElement = null;
      }
    });
  },

  setupSidebarToggles() {
    ['header', 'body', 'footer'].forEach((p) => {
      const cb = document.getElementById('keep-' + p);
      if (cb)
        cb.onchange = (e) => {
          document.getElementById('part-' + p).style.display = e.target.checked
            ? ''
            : 'none';
        };
    });
  },
  loadFromPrompt() {
    if (Store.headers.length === 0) {
      return alert('Please wait for design fields to load.');
    }

    const raw = prompt('Paste JSON:');
    if (!raw) return;

    try {
      const schema = JSON.parse(raw);

      // 1. Reset Everything First: Uncheck all and hide all parts
      ['header', 'body', 'footer'].forEach((pk) => {
        const partEl = document.getElementById('part-' + pk);
        const cb = document.getElementById('keep-' + pk);

        if (partEl) partEl.style.display = 'none';
        if (cb) cb.checked = false;

        // Clear elements from every part
        if (partEl)
          partEl
            .querySelectorAll('.canvas-element')
            .forEach((el) => el.remove());
      });

      // 2. Enable only the parts found in the JSON
      Object.keys(schema.parts).forEach((pk) => {
        const partEl = document.getElementById('part-' + pk);
        const cb = document.getElementById('keep-' + pk);

        if (!partEl) return;

        // Show part and check the box
        partEl.style.display = '';
        if (cb) cb.checked = true;

        // Set the height from JSON
        partEl.style.height = schema.parts[pk].height + 'px';

        // Reconstruct elements
        schema.parts[pk].elements.forEach((elDef) => {
          Renderer.createCanvasElement(partEl, elDef);
        });
      });
    } catch (e) {
      alert('Invalid JSON');
      console.error(e);
    }
  },
  saveSchema() {
    const schema = ReportEngine.getSchema();
    const blob = new Blob([JSON.stringify(schema, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'report_schema.json';
    a.click();
  },

  //get HTML
  showFullPreviewHTML() {
    // Get schema from ReportEngine
    const s = ReportEngine.getSchema();

    const escapeHtml = (str) =>
      String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const renderElementHtml = (def, row) => {
      let text = '';
      if (def.type === 'field') {
        if (row) text = row[def.key] ?? '';
        else text = Store.data && Store.data.length > 0 ? (Store.data[0][def.key] ?? '') : (def.content || '');
      } else if (def.type === 'calculation' && def.field) {
        const vals = Store.data.map((r) => parseFloat(r[def.field] || 0));
        let res = 0;
        if (def.function === 'SUM') res = vals.reduce((a, b) => a + b, 0);
        else if (def.function === 'AVG')
          res = vals.reduce((a, b) => a + b, 0) / vals.length;
        text = String(res);
      } else text = def.content || '';

      // Build inline style for font formatting
      let extraStyle = `left:${def.x}px;top:${def.y}px;width:${def.w}px;height:${def.h}px`;
      if (def.fontSize) extraStyle += `;font-size:${def.fontSize}px`;
      if (def.bold) extraStyle += `;font-weight:bold`;
      if (def.italic) extraStyle += `;font-style:italic`;
      if (def.underline) extraStyle += `;text-decoration:underline`;

      return `<div class="r-element" style="${extraStyle}">${escapeHtml(text)}</div>`;
    };

    let bodyHtml = '<div class="page">';
    ['header', 'body', 'footer'].forEach((partName) => {
      if (!s.parts[partName]) return;
      if (partName === 'body') {
        Store.data.forEach((row) => {
          bodyHtml += `<div class="r-part-body" style="height:${s.parts.body.height}px">`;
          s.parts.body.elements.forEach(
            (e) => (bodyHtml += renderElementHtml(e, row))
          );
          bodyHtml += '</div>';
        });
      } else {
        bodyHtml += `<div class="r-part-${partName}" style="height:${s.parts[partName].height}px">`;
        s.parts[partName].elements.forEach(
          (e) => (bodyHtml += renderElementHtml(e))
        );
        bodyHtml += '</div>';
      }
    });
    bodyHtml += '</div>';

    const styleText = `
    .r-part-header, .r-part-body, .r-part-footer { position: relative; }
    .r-part-body { border-bottom: 1px solid #ccc; } 
    .r-element { position: absolute; }
  `;

    const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Report Preview</title>
<style>${styleText}</style>
</head>
<body>${bodyHtml}</body>
</html>`;

    const modal = document.getElementById('html-modal');
    const ta = document.getElementById('html-content');
    if (ta) ta.value = full;
    if (modal) modal.style.display = 'flex';
  },
  // Copy preview HTML from modal
  copyPreviewHTML() {
    const ta = document.getElementById('html-content');
    ta.select();
    document.execCommand('copy');
    alert('HTML copied');
  },
};

Actions.init();
window.app = Actions;