const app = {
  data: [],
  selectedElement: null,

  init() {
    this.buildFields();
    this.setupDnD();
    this.setupInteract();
    this.setupKeep();
  },
  buildFields() {
    if (!this.data.length) return;

    const list = document.getElementById('fields-list');
    Object.keys(this.data[0]).forEach((k) => {
      const d = document.createElement('div');
      d.className = 'tool-item';
      d.draggable = true;
      d.dataset.type = 'field';
      d.dataset.key = k;
      d.textContent = k;
      list.appendChild(d);
    });
  },

  setupDnD() {
    document.querySelectorAll('.tool-item').forEach((t) => {
      t.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('type', t.dataset.type);
        e.dataTransfer.setData('key', t.dataset.key || '');
        e.dataTransfer.setData('function', t.dataset.function || '');
      });
    });

    document.querySelectorAll('.part').forEach((p) => {
      // Ensure the part is the coordinate reference
      p.style.position = 'relative';

      p.ondragover = (e) => e.preventDefault();
      p.ondrop = (e) => {
        e.preventDefault();

        const rect = p.getBoundingClientRect();

        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        // Adjust for the fact that the mouse is usually in the middle of the dragged ghost image
        const dropX = Math.round(x - 70);
        const dropY = Math.round(y - 14);

        const type_raw = e.dataTransfer.getData('type');
        const key = e.dataTransfer.getData('key');
        const func = e.dataTransfer.getData('function');

        app.createElement(
          p,
          dropX < 0 ? 0 : dropX,
          dropY < 0 ? 0 : dropY,
          type_raw,
          key,
          type_raw === 'calculation' ? func : key,
          func
        );
      };
    });
  },

  createElement(
    parent,
    x,
    y,
    type,
    key,
    content,
    func,
    width = 150,
    height = 22,
    savedField = null
  ) {
    const el = document.createElement('div');
    el.className = 'canvas-element' + (type === 'label' ? ' is-label' : '');
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    el.style.transform = `translate(${x}px,${y}px)`;
    el.dataset.x = x;
    el.dataset.y = y;
    el.dataset.type = type;

    if (key) el.dataset.key = key;
    if (func) el.dataset.function = func;

    const c = document.createElement('div');
    c.className = 'element-content';
    c.style.flex = '1';

    if (type === 'calculation') {
      const select = document.createElement('select');
      select.style.width = '100%';
      select.innerHTML =
        `<option value="">--select field--</option>` +
        Object.keys(this.data[0])
          .map((k) => `<option value="${k}">${k}</option>`)
          .join('');

      const result = document.createElement('div');
      result.className = 'calc-result';
      result.style.fontSize = '12px';

      const runCalculation = (field) => {
        el.dataset.field = field;
        if (!field) {
          result.textContent = '';
          return;
        }
        const vals = this.data.map((r) => Number(r[field] || 0));
        let res = 0;
        if (func === 'SUM') res = vals.reduce((a, b) => a + b, 0);
        if (func === 'AVG') res = vals.reduce((a, b) => a + b, 0) / vals.length;
        result.textContent = `${func}(${field}) = ${res}`;
      };

      select.addEventListener('change', (e) => runCalculation(e.target.value));

      // If loading from JSON, pre-set the value and run calc
      if (savedField) {
        select.value = savedField;
        runCalculation(savedField);
      }

      c.append(select, result);
    } else if (type === 'label') {
      c.contentEditable = true;
      c.textContent = content || 'Text';
    } else if (type === 'field') {
      c.textContent = `[${key}]`;
    }

    const h = document.createElement('div');
    h.className = 'drag-handle';
    h.textContent = '⋮⋮';
    el.append(h, c);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.selectedElement) this.selectedElement.style.outline = '';
      this.selectedElement = el;
      el.style.outline = '2px dashed red';
    });

    parent.appendChild(el);
  },

  setupInteract() {
    interact('.drag-handle').draggable({
      inertia: false,
      listeners: {
        start: (e) => {
          const el = e.target.parentElement;
          const rect = el.getBoundingClientRect();
          el._dragData = {
            startParent: el.parentElement,
            pageX: rect.left,
            pageY: rect.top,
            width: rect.width,
            height: rect.height,
          };
          document.body.appendChild(el);
          el.style.position = 'fixed';
          el.style.left = rect.left + 'px';
          el.style.top = rect.top + 'px';
          el.style.transform = 'none';
          el.style.zIndex = 10000;
        },
        move: (e) => {
          const el = e.target.parentElement;
          el._dragData.pageX += e.dx;
          el._dragData.pageY += e.dy;
          el.style.left = el._dragData.pageX + 'px';
          el.style.top = el._dragData.pageY + 'px';
        },
        end: (e) => {
          const el = e.target.parentElement;
          const centerX = el._dragData.pageX + el._dragData.width / 2;
          const centerY = el._dragData.pageY + el._dragData.height / 2;
          const parts = ['part-header', 'part-body', 'part-footer']
            .map((id) => document.getElementById(id))
            .filter(Boolean);

          let target = el._dragData.startParent;
          for (const p of parts) {
            const r = p.getBoundingClientRect();
            if (
              centerX >= r.left &&
              centerX <= r.right &&
              centerY >= r.top &&
              centerY <= r.bottom
            ) {
              target = p;
              break;
            }
          }

          const pr = target.getBoundingClientRect();
          let newX = Math.max(
            0,
            Math.min(
              centerX - pr.left - el._dragData.width / 2,
              target.clientWidth - el._dragData.width
            )
          );
          let newY = Math.max(
            0,
            Math.min(
              centerY - pr.top - el._dragData.height / 2,
              target.clientHeight - el._dragData.height
            )
          );

          target.appendChild(el);
          el.style.position = 'absolute';
          el.style.left = '';
          el.style.top = '';
          el.style.transform = `translate(${Math.round(newX)}px,${Math.round(
            newY
          )}px)`;
          el.dataset.x = Math.round(newX);
          el.dataset.y = Math.round(newY);
          el.style.zIndex = '';
          delete el._dragData;
        },
      },
    });

    interact('.canvas-element').resizable({
      edges: { left: true, right: true, bottom: true, top: true },
      listeners: {
        move: (event) => {
          const t = event.target;
          let x = parseFloat(t.dataset.x) || 0;
          let y = parseFloat(t.dataset.y) || 0;
          t.style.width = event.rect.width + 'px';
          t.style.height = event.rect.height + 'px';
          x += event.deltaRect.left;
          y += event.deltaRect.top;
          t.style.transform = `translate(${x}px,${y}px)`;
          t.dataset.x = x;
          t.dataset.y = y;
        },
      },
    });
  },

  setupKeep() {
    ['header', 'body', 'footer'].forEach((p) => {
      document.getElementById('keep-' + p).onchange = (e) => {
        document.getElementById('part-' + p).style.display = e.target.checked
          ? ''
          : 'none';
      };
    });
  },

  getSchema() {
    const s = { parts: {} };
    ['header', 'body', 'footer'].forEach((p) => {
      const partEl = document.getElementById('part-' + p);
      if (partEl.style.display === 'none') return;
      s.parts[p] = {
        height: partEl.offsetHeight,
        elements: [...partEl.querySelectorAll('.canvas-element')].map((e) => {
          const type = e.dataset.type;
          let content = '';
          if (type === 'calculation') {
            content = e.querySelector('.calc-result')?.textContent || '';
          } else {
            content =
              e.querySelector('.element-content')?.textContent.trim() || '';
          }
          return {
            type: type,
            key: e.dataset.key,
            content: content,
            x: +e.dataset.x,
            y: +e.dataset.y,
            w: parseFloat(e.style.width),
            h: parseFloat(e.style.height),
            function: e.dataset.function,
            field: e.dataset.field,
          };
        }),
      };
    });
    return s;
  },

  saveSchema() {
    const schema = this.getSchema();
    const json = JSON.stringify(schema, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'schema.json';
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  loadFromPrompt() {
    const raw = prompt('Paste your JSON schema here:');
    if (!raw) return;
    try {
      const json = JSON.parse(raw);
      this.loadSchema(json);
    } catch (e) {
      alert('Invalid JSON format.');
    }
  },

  loadSchema(schema) {
    // Clear existing UI elements
    document.querySelectorAll('.canvas-element').forEach((el) => el.remove());

    Object.keys(schema.parts).forEach((partKey) => {
      const partData = schema.parts[partKey];
      const partEl = document.getElementById('part-' + partKey);
      if (!partEl) return;

      partEl.style.height = partData.height + 'px';
      partData.elements.forEach((el) => {
        this.createElement(
          partEl,
          el.x,
          el.y,
          el.type,
          el.key,
          el.content,
          el.function,
          el.w,
          el.h,
          el.field
        );
      });
    });
  },

  renderElement(def, row) {
    const d = document.createElement('div');
    d.className = 'r-element';
    d.style.left = def.x + 'px';
    d.style.top = def.y + 'px';
    d.style.width = def.w + 'px';
    d.style.height = def.h + 'px';

    if (def.type === 'field' && row) {
      d.textContent = row[def.key];
    } else if (def.type === 'calculation' && def.field) {
      const vals = this.data.map((r) => parseFloat(r[def.field] || 0));
      let res = 0;
      if (def.function === 'SUM') res = vals.reduce((a, b) => a + b, 0);
      else if (def.function === 'AVG')
        res = vals.reduce((a, b) => a + b, 0) / vals.length;
      d.textContent = `${res}`;
    } else {
      d.textContent = def.content;
    }
    return d;
  },

  generatePreview() {
    const s = this.getSchema();
    const out = document.getElementById('preview-content');
    out.innerHTML = '';
    document.getElementById('preview-modal').style.display = 'flex';
    const page = document.createElement('div');

    ['header', 'body', 'footer'].forEach((partName) => {
      if (!s.parts[partName]) return;
      if (partName === 'body') {
        this.data.forEach((row) => {
          const b = document.createElement('div');
          b.className = 'r-part-body';
          b.style.height = s.parts.body.height + 'px';
          s.parts.body.elements.forEach((e) =>
            b.appendChild(this.renderElement(e, row))
          );
          page.appendChild(b);
        });
      } else {
        const p = document.createElement('div');
        p.className = `r-part-${partName}`;
        p.style.height = s.parts[partName].height + 'px';
        s.parts[partName].elements.forEach((e) =>
          p.appendChild(this.renderElement(e))
        );
        page.appendChild(p);
      }
    });
    out.appendChild(page);
  },
  async loadDataFromAPI() {
    try {
      const res = await fetch('http://localhost:8000/demoJSON/layoutJSON.json');
      if (!res.ok) throw new Error('API failed');

      this.data = await res.json();

      // rebuild fields
      const list = document.getElementById('fields-list');
      list.innerHTML = '';
      this.buildFields();

      // rebind drag after dynamic DOM creation
      this.setupDnD();
    } catch (err) {
      console.error(err);
      alert('Failed to load data');
    }
  },
};

// Part resizing logic
['part-header', 'part-body', 'part-footer'].forEach((id) => {
  const el = document.getElementById(id);
  interact(el).resizable({
    edges: { bottom: true },
    listeners: {
      move(event) {
        event.target.style.height = event.rect.height + 'px';
      },
    },
    modifiers: [interact.modifiers.restrictSize({ min: { height: 30 } })],
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' && app.selectedElement) {
    app.selectedElement.remove();
    app.selectedElement = null;
  }
});

app.init();
