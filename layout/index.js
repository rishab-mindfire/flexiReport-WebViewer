/**
 * 1. STATE & DATA STORE
 */
const Store = {
  data: [],
  selectedElement: null,
};

/**
 * 2. REPORT ENGINE
 */
const ReportEngine = {
  calculate(funcName, fieldName) {
    if (!fieldName || !funcName || Store.data.length === 0) return 0;

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

          if (type === 'calculation') {
            cleanContent = e.querySelector('.calc-result')?.textContent || '';
          } else {
            cleanContent =
              e.querySelector('.element-content')?.textContent.trim() || '';
          }

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
    const { x, y, type, key, content, w = 150, h = 22, field } = config;
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

    const contentDiv = document.createElement('div');
    contentDiv.className = 'element-content';
    contentDiv.style.flex = '1';

    if (type === 'calculation') {
      this.setupCalculationUI(el, contentDiv, funcName, field);
    } else if (type === 'label') {
      contentDiv.contentEditable = true;
      contentDiv.textContent = content || 'Text';
    } else {
      contentDiv.textContent = `[${key}]`;
    }

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

    const fields = Store.data.length > 0 ? Object.keys(Store.data[0]) : [];
    select.innerHTML =
      `<option value="">--select field--</option>` +
      fields.map((k) => `<option value="${k}">${k}</option>`).join('');

    const resultDisplay = document.createElement('div');
    resultDisplay.className = 'calc-result';
    resultDisplay.style.fontSize = '12px';

    const update = (selectedField) => {
      el.dataset.field = selectedField;
      const res = ReportEngine.calculate(funcName, selectedField);
      const label = funcName || 'CALC';
      resultDisplay.textContent = selectedField
        ? `${label}(${selectedField}) = ${res}`
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

    // Start loading data immediately on reload
    this.loadDataFromAPI();
  },

  async loadDataFromAPI() {
    const list = document.getElementById('fields-list');

    try {
      // Show loading text immediately
      list.innerHTML = '<div class="loading-text">Loading fields...</div>';

      const res = await fetch('http://localhost:8000/demoJSON/layoutJSON.json');
      const jsonData = await res.json();

      Store.data = jsonData;

      // Only stop loading if data exists
      if (Store.data && Store.data.length > 0) {
        this.refreshToolbox();
        this.refreshCalculations();
      } else {
        list.innerHTML = '<div class="loading-text">No data found.</div>';
      }
    } catch (err) {
      list.innerHTML =
        '<div class="loading-text" style="color:red">Failed to load data.</div>';
      console.error('API failed:', err);
    }
  },

  refreshToolbox() {
    const list = document.getElementById('fields-list');
    list.innerHTML = ''; // This stops the loading state

    if (!Store.data || Store.data.length === 0) return;

    // Optimized: Only get keys from the first row
    const keys = Object.keys(Store.data[0]);

    keys.forEach((k) => {
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

  refreshCalculations() {
    document
      .querySelectorAll('.canvas-element[data-type="calculation"]')
      .forEach((el) => {
        const select = el.querySelector('select');
        const func = el.dataset.function;
        const field = el.dataset.field;

        if (select && select.options.length <= 1) {
          select.innerHTML =
            `<option value="">--select field--</option>` +
            Object.keys(Store.data[0] || {})
              .map((k) => `<option value="${k}">${k}</option>`)
              .join('');
          select.value = field || '';
        }

        const resDiv = el.querySelector('.calc-result');
        if (resDiv && field) {
          resDiv.textContent = `${func}(${field}) = ${ReportEngine.calculate(
            func,
            field
          )}`;
        }
      });
  },

  bindNativeDrag() {
    document.querySelectorAll('.tool-item').forEach((t) => {
      t.ondragstart = (e) => {
        e.dataTransfer.setData('type', t.dataset.type);
        e.dataTransfer.setData('key', t.dataset.key || '');
        const func = t.dataset.function || '';
        e.dataTransfer.setData('function', func);
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

  // ... [Keep selectElement, saveSchema, generatePreview, setupPartResizing, setupKeyboardListeners, setupSidebarToggles exactly as they were]
  selectElement(el, e) {
    e.stopPropagation();
    if (Store.selectedElement) Store.selectedElement.style.outline = '';
    Store.selectedElement = el;
    el.style.outline = '2px dashed red';
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

  generatePreview() {
    if (!Store.data.length) return alert('No data loaded');
    const s = ReportEngine.getSchema();
    const out = document.getElementById('preview-content');
    out.innerHTML = '';
    document.getElementById('preview-modal').style.display = 'flex';

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
          if (e.type === 'field' && row) el.textContent = row[e.key];
          else if (e.type === 'calculation')
            el.textContent = ReportEngine.calculate(e.function, e.field);
          else el.textContent = e.content;
          div.appendChild(el);
        });
        return div;
      };

      if (pName === 'body')
        Store.data.forEach((row) => previewPage.appendChild(renderPart(row)));
      else previewPage.appendChild(renderPart());
    });
    out.appendChild(previewPage);
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
};

Actions.init();
window.app = Actions;
