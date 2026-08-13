/* ================= ÑOMCRAFT — lógica de la app ================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* La fuente pixel aplasta las mayúsculas acentuadas (Á, Í, Ó...): las quitamos
   solo en los rótulos que van en versalitas. El texto normal conserva tildes. */
const ACCENTS = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': 'U'
};
const deacc = s => String(s ?? '').replace(/[áéíóúüÁÉÍÓÚÜ]/g, c => ACCENTS[c]);
const caps = s => deacc(s).toUpperCase();

const CAT_COLOR = {
  Entrante: 'blue', Principal: 'green', Postre: 'pink',
  'Guarnición': 'yellow', Bebida: 'blue', Salsa: 'red', Otro: 'dim'
};

const view = $('#view');
let ui = { tab: 'index', search: '', filter: '' };  // pestaña visible y filtros del índice
let draft = null;                                    // receta en edición

/* ---------------------------------------------------------------- utilidades */

let toastTimer;
function toast(msg, bad = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (bad ? ' bad' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function status(left, right = '') {
  $('#status-left').textContent = left;
  $('#status-right').textContent = right;
}

function options(list, selected) {
  return list.map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

function fmtQty(item) {
  if (item.unit === 'al gusto') return 'al gusto';
  const q = item.qty;
  if (q === null || q === undefined || q === '') return item.unit;
  return `${q} ${item.unit}`;
}

/* ---------------------------------------------------------------- navegación */

function go(tab, opts = {}) {
  ui.tab = tab;
  Object.assign(ui, opts);
  $$('#tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.view === (tab === 'pantry' ? 'pantry' : 'index')));
  window.scrollTo(0, 0);
  render();
}

function render() {
  if (ui.tab === 'pantry') return renderPantry();
  if (ui.tab === 'recipe') return renderRecipe(ui.id);
  if (ui.tab === 'edit') return renderEditor();
  return renderIndex();
}

/* ---------------------------------------------------------------- ÍNDICE */

function renderIndex() {
  const q = ui.search.trim().toLowerCase();
  let recipes = Store.data.recipes;

  if (ui.filter) recipes = recipes.filter(r => r.cat === ui.filter);
  if (q) {
    recipes = recipes.filter(r => {
      if (r.name.toLowerCase().includes(q)) return true;
      return r.items.some(it => {
        const ing = Store.ingredient(it.ing);
        return ing && ing.name.toLowerCase().includes(q);
      });
    });
  }

  const cards = recipes.map(r => {
    const color = CAT_COLOR[r.cat] || 'dim';
    return `<article class="card pbox" data-open="${r.id}" role="button" tabindex="0"
             aria-label="Abrir ficha ${esc(r.name)}">
      <div class="card-top">
        ${iconSVG(r.icon, 40)}
        <div class="card-title">${esc(r.name || 'Sin nombre')}</div>
      </div>
      <div class="ficha-tags">
        <span class="tag ${color}">${esc(deacc(r.cat))}</span>
        <span class="tag dim">${esc(deacc(r.diff))}</span>
      </div>
      <div class="card-meta">
        <span>${r.items.length} ingr.</span>
        <span>${r.steps.filter(s => s.trim()).length} pasos</span>
        <span>${r.time} min</span>
      </div>
    </article>`;
  }).join('');

  view.innerHTML = `
    <div class="toolbar">
      <div class="grow">
        <input type="search" id="q" placeholder="Buscar receta o ingrediente..." value="${esc(ui.search)}">
      </div>
      <select id="filter" style="width:auto">
        <option value="">Todas las categorías</option>
        ${options(REC_CATS, ui.filter)}
      </select>
      <button class="btn green" id="new">+ Nueva receta</button>
    </div>

    <h2 class="sec">Indice — ${recipes.length} receta${recipes.length === 1 ? '' : 's'}</h2>

    ${recipes.length || q || ui.filter ? '' : `
      <div class="empty pbox">
        ${iconSVG('olla', 64)}
        <p>El recetario está vacío.<br>Crea tu primera ficha.</p>
      </div>`}

    <div class="grid">
      ${cards}
      <article class="card new pbox" id="new-card">
        <span class="plus">+</span>
        <span class="lbl">Nueva ficha</span>
      </article>
    </div>`;

  const search = $('#q');
  search.addEventListener('input', e => {
    ui.search = e.target.value;
    const pos = e.target.selectionStart;
    renderIndex();
    const s2 = $('#q');
    s2.focus();
    s2.setSelectionRange(pos, pos);
  });
  $('#filter').addEventListener('change', e => { ui.filter = e.target.value; renderIndex(); });
  $('#new').addEventListener('click', newRecipe);
  $('#new-card').addEventListener('click', newRecipe);
  $$('[data-open]').forEach(el => {
    const open = () => go('recipe', { id: el.dataset.open });
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  status(`RECETAS: ${Store.data.recipes.length}`, `INGREDIENTES: ${Store.data.ingredients.length}`);
}

function newRecipe() {
  draft = Store.blankRecipe();
  ui.isNew = true;
  go('edit');
}

/* ---------------------------------------------------------------- FICHA (lectura) */

function renderRecipe(id) {
  const r = Store.recipe(id);
  if (!r) { toast('Receta no encontrada', true); return go('index'); }

  const ings = r.items.map(it => {
    const ing = Store.ingredient(it.ing);
    return `<li>
      ${iconSVG(ing ? ing.icon : 'plato', 24)}
      <span class="ing-name">${esc(ing ? ing.name : '(ingrediente borrado)')}</span>
      <span class="ing-qty">${esc(fmtQty(it))}</span>
    </li>`;
  }).join('') || '<li class="notes">Sin ingredientes.</li>';

  const steps = r.steps.filter(s => s.trim()).map(s => `<li><span>${esc(s)}</span></li>`).join('')
    || '<li class="notes">Sin pasos de elaboración.</li>';

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn ghost" id="back">&lt; Indice</button>
      <div class="grow"></div>
      <button class="btn blue" id="edit">Editar</button>
      <button class="btn" id="print">Imprimir</button>
      <button class="btn red" id="del">Borrar</button>
    </div>

    <section class="ficha pbox">
      <div class="ficha-head">
        ${iconSVG(r.icon, 64)}
        <div style="flex:1;min-width:200px">
          <h2>${esc(r.name)}</h2>
          <div class="ficha-tags">
            <span class="tag ${CAT_COLOR[r.cat] || 'dim'}">${esc(deacc(r.cat))}</span>
            <span class="tag dim">${esc(deacc(r.diff))}</span>
            <span class="tag dim">${r.time} min</span>
            <span class="tag dim">${r.portions} raciones</span>
          </div>
        </div>
      </div>

      <div class="hr"></div>

      <div class="two-col">
        <div>
          <h3 class="sub">Ingredientes (${r.items.length})</h3>
          <ul class="ing-list">${ings}</ul>
        </div>
        <div>
          <h3 class="sub">Elaboracion</h3>
          <ol class="steps">${steps}</ol>
          ${r.notes.trim() ? `<div class="hr"></div>
            <h3 class="sub">Notas</h3><p class="notes">${esc(r.notes)}</p>` : ''}
        </div>
      </div>
    </section>`;

  $('#back').addEventListener('click', () => go('index'));
  $('#print').addEventListener('click', () => window.print());
  $('#edit').addEventListener('click', () => {
    draft = JSON.parse(JSON.stringify(r));
    if (!draft.steps.length) draft.steps = [''];
    ui.isNew = false;
    go('edit');
  });
  $('#del').addEventListener('click', () => {
    if (!confirm(`¿Borrar "${r.name}"? No se puede deshacer.`)) return;
    Store.removeRecipe(r.id);
    toast('Receta borrada');
    go('index');
  });

  status(`FICHA: ${caps(r.name)}`, `${r.items.length} INGR. / ${r.steps.filter(s => s.trim()).length} PASOS`);
}

/* ---------------------------------------------------------------- EDITOR */

function renderEditor() {
  if (!draft) return go('index');
  const d = draft;

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn ghost" id="cancel">&lt; Cancelar</button>
      <div class="grow"></div>
      <span class="tag ${ui.isNew ? 'green' : 'yellow'}">${ui.isNew ? 'Nueva ficha' : 'Editando'}</span>
    </div>

    <section class="ficha pbox">
      <div class="form-grid" style="margin-bottom:16px">
        <label class="fld" style="grid-column:1/-1">
          <span>Nombre de la receta</span>
          <input type="text" id="f-name" value="${esc(d.name)}" placeholder="Ej. Tortilla de patatas" maxlength="60">
        </label>
        <label class="fld"><span>Categoria</span>
          <select id="f-cat">${options(REC_CATS, d.cat)}</select></label>
        <label class="fld"><span>Dificultad</span>
          <select id="f-diff">${options(DIFFS, d.diff)}</select></label>
        <label class="fld"><span>Tiempo (min)</span>
          <input type="number" id="f-time" min="1" max="1440" value="${d.time}"></label>
        <label class="fld"><span>Raciones</span>
          <input type="number" id="f-port" min="1" max="99" value="${d.portions}"></label>
      </div>

      <label class="fld"><span>Icono de la ficha</span></label>
      <div class="icon-pick" id="icon-pick">
        ${ICON_KEYS.map(k => `<button type="button" data-icon="${k}" title="${esc(ICONS[k].label)}"
          class="${k === d.icon ? 'on' : ''}">${iconSVG(k, 30)}</button>`).join('')}
      </div>

      <div class="hr"></div>

      <h3 class="sub">Ingredientes</h3>
      <div id="ing-rows"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        <button class="btn small green" id="add-ing">+ Añadir ingrediente</button>
        <button class="btn small ghost" id="quick-ing">+ Nuevo en despensa</button>
      </div>

      <div class="hr"></div>

      <h3 class="sub">Pasos de elaboracion</h3>
      <div id="step-rows"></div>
      <button class="btn small green" id="add-step" style="margin-top:6px">+ Añadir paso</button>

      <div class="hr"></div>

      <label class="fld"><span>Notas (opcional)</span>
        <textarea id="f-notes" placeholder="Conservación, trucos, variantes...">${esc(d.notes)}</textarea></label>
    </section>

    <div class="sticky-actions">
      <button class="btn green" id="save">Guardar ficha</button>
      <div class="spacer"></div>
      ${ui.isNew ? '' : '<button class="btn red" id="del">Borrar</button>'}
    </div>`;

  // campos simples -> escriben directo en el borrador, sin re-render (no se pierde el foco)
  $('#f-name').addEventListener('input', e => { d.name = e.target.value; });
  $('#f-cat').addEventListener('change', e => { d.cat = e.target.value; });
  $('#f-diff').addEventListener('change', e => { d.diff = e.target.value; });
  $('#f-time').addEventListener('input', e => { d.time = +e.target.value || 0; });
  $('#f-port').addEventListener('input', e => { d.portions = +e.target.value || 1; });
  $('#f-notes').addEventListener('input', e => { d.notes = e.target.value; });

  $('#icon-pick').addEventListener('click', e => {
    const btn = e.target.closest('[data-icon]');
    if (!btn) return;
    d.icon = btn.dataset.icon;
    $$('#icon-pick button').forEach(b => b.classList.toggle('on', b === btn));
  });

  $('#add-ing').addEventListener('click', () => {
    if (!Store.data.ingredients.length) return toast('Añade ingredientes a la despensa primero', true);
    d.items.push({ ing: Store.data.ingredients[0].id, qty: 1, unit: Store.data.ingredients[0].unit });
    drawIngRows();
  });
  $('#quick-ing').addEventListener('click', quickAddIngredient);
  $('#add-step').addEventListener('click', () => {
    d.steps.push('');
    drawStepRows();
    const areas = $$('#step-rows textarea');
    if (areas.length) areas[areas.length - 1].focus();
  });

  $('#cancel').addEventListener('click', () => {
    if (ui.isNew) go('index'); else go('recipe', { id: d.id });
  });
  $('#save').addEventListener('click', saveDraft);
  const delBtn = $('#del');
  if (delBtn) delBtn.addEventListener('click', () => {
    if (!confirm(`¿Borrar "${d.name}"?`)) return;
    Store.removeRecipe(d.id);
    toast('Receta borrada');
    go('index');
  });

  drawIngRows();
  drawStepRows();
  status(ui.isNew ? 'NUEVA FICHA' : `EDITANDO: ${caps(d.name)}`, 'ESC = CANCELAR');
}

/* --- filas de ingredientes --- */

function drawIngRows() {
  const box = $('#ing-rows');
  if (!box) return;
  const d = draft;

  if (!d.items.length) {
    box.innerHTML = '<p class="notes" style="margin:0 0 8px">Todavía no hay ingredientes en esta ficha.</p>';
    return;
  }

  box.innerHTML = d.items.map((it, i) => {
    const ing = Store.ingredient(it.ing);
    const free = it.unit === 'al gusto';
    return `<div class="row-ing" data-i="${i}">
      <span class="ic">${iconSVG(ing ? ing.icon : 'plato', 32)}</span>
      <span class="sel">
        <select data-f="ing">
          ${Store.data.ingredients.map(x =>
            `<option value="${x.id}"${x.id === it.ing ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
          ${ing ? '' : `<option value="${esc(it.ing)}" selected>(borrado)</option>`}
        </select>
      </span>
      <span class="qty">
        <input type="number" data-f="qty" min="0" step="any" value="${free ? '' : (it.qty ?? '')}"
               placeholder="cant." ${free ? 'disabled' : ''}>
      </span>
      <span class="unit"><select data-f="unit">${options(UNITS, it.unit)}</select></span>
      <span class="del"><button class="btn small red" data-f="del" title="Quitar">X</button></span>
    </div>`;
  }).join('');

  box.querySelectorAll('.row-ing').forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('[data-f=ing]').addEventListener('change', e => {
      d.items[i].ing = e.target.value;
      const ing = Store.ingredient(e.target.value);
      if (ing) d.items[i].unit = ing.unit;   // hereda la unidad por defecto del ingrediente
      drawIngRows();
    });
    row.querySelector('[data-f=qty]').addEventListener('input', e => {
      d.items[i].qty = e.target.value === '' ? null : +e.target.value;
    });
    row.querySelector('[data-f=unit]').addEventListener('change', e => {
      d.items[i].unit = e.target.value;
      if (e.target.value === 'al gusto') d.items[i].qty = null;
      drawIngRows();
    });
    row.querySelector('[data-f=del]').addEventListener('click', () => {
      d.items.splice(i, 1);
      drawIngRows();
    });
  });
}

/* --- filas de pasos --- */

function drawStepRows() {
  const box = $('#step-rows');
  if (!box) return;
  const d = draft;

  box.innerHTML = d.steps.map((s, i) => `
    <div class="row-step" data-i="${i}">
      <div class="num">${String(i + 1).padStart(2, '0')}</div>
      <textarea data-f="text" placeholder="Describe el paso ${i + 1}...">${esc(s)}</textarea>
      <div class="ctl">
        <button class="btn small ghost" data-f="up"   title="Subir"  ${i === 0 ? 'disabled' : ''}>^</button>
        <button class="btn small ghost" data-f="down" title="Bajar"  ${i === d.steps.length - 1 ? 'disabled' : ''}>v</button>
        <button class="btn small red"   data-f="del"  title="Quitar">X</button>
      </div>
    </div>`).join('');

  box.querySelectorAll('.row-step').forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('[data-f=text]').addEventListener('input', e => { d.steps[i] = e.target.value; });
    row.querySelector('[data-f=up]').addEventListener('click', () => {
      if (i === 0) return;
      [d.steps[i - 1], d.steps[i]] = [d.steps[i], d.steps[i - 1]];
      drawStepRows();
    });
    row.querySelector('[data-f=down]').addEventListener('click', () => {
      if (i === d.steps.length - 1) return;
      [d.steps[i + 1], d.steps[i]] = [d.steps[i], d.steps[i + 1]];
      drawStepRows();
    });
    row.querySelector('[data-f=del]').addEventListener('click', () => {
      d.steps.splice(i, 1);
      if (!d.steps.length) d.steps = [''];
      drawStepRows();
    });
  });
}

/* --- alta rápida de ingrediente desde el editor --- */

function quickAddIngredient() {
  const name = prompt('Nombre del nuevo ingrediente:');
  if (name === null) return;
  const res = Store.addIngredient({ name });
  if (!res) return toast('El nombre no puede estar vacío', true);
  if (res.dupe) {
    toast(`"${res.dupe.name}" ya está en la despensa`, true);
    return;
  }
  draft.items.push({ ing: res.ing.id, qty: 1, unit: res.ing.unit });
  drawIngRows();
  toast(`"${res.ing.name}" añadido a la despensa`);
}

function saveDraft() {
  const d = draft;
  d.name = d.name.trim();
  if (!d.name) return toast('La receta necesita un nombre', true);
  d.steps = d.steps.map(s => s.trim()).filter(Boolean);
  if (!d.steps.length) d.steps = [''];
  Store.saveRecipe(d);
  toast('Ficha guardada');
  go('recipe', { id: d.id });
}

/* ---------------------------------------------------------------- DESPENSA */

function renderPantry() {
  const list = Store.data.ingredients;

  view.innerHTML = `
    <h2 class="sec">Despensa — ${list.length} ingrediente${list.length === 1 ? '' : 's'}</h2>

    <section class="ficha pbox" style="margin-bottom:22px">
      <h3 class="sub">Añadir ingrediente</h3>
      <div class="form-grid">
        <label class="fld" style="grid-column:1/-1"><span>Nombre</span>
          <input type="text" id="p-name" placeholder="Ej. Pimentón dulce" maxlength="40"></label>
        <label class="fld"><span>Categoria</span>
          <select id="p-cat">${options(ING_CATS, 'Verdura')}</select></label>
        <label class="fld"><span>Unidad por defecto</span>
          <select id="p-unit">${options(UNITS, 'g')}</select></label>
      </div>
      <label class="fld" style="margin-top:14px"><span>Icono</span></label>
      <div class="icon-pick" id="p-icons">
        ${ICON_KEYS.map((k, n) => `<button type="button" data-icon="${k}" title="${esc(ICONS[k].label)}"
          class="${n === 0 ? 'on' : ''}">${iconSVG(k, 30)}</button>`).join('')}
      </div>
      <button class="btn green" id="p-add" style="margin-top:14px">+ Añadir a la despensa</button>
    </section>

    <h3 class="sub">Biblioteca</h3>
    ${list.length ? `<div class="pantry-grid">${list.map(i => `
      <div class="ing-card">
        ${iconSVG(i.icon, 32)}
        <div class="body">
          <span class="nm">${esc(i.name)}</span>
          <span class="mt">${esc(i.cat)} · ${esc(i.unit)} · ${Store.usage(i.id)} recetas</span>
        </div>
        <button class="btn small red" data-del="${i.id}" title="Borrar">X</button>
      </div>`).join('')}</div>`
      : '<div class="empty pbox">' + iconSVG('legumbre', 48) + '<p>La despensa está vacía.</p></div>'}

    <div class="hr"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn blue" id="p-export">Exportar datos</button>
      <button class="btn" id="p-import">Importar datos</button>
      <input type="file" id="p-file" accept="application/json,.json" hidden>
    </div>`;

  // el icono se autocompleta mientras escribes, salvo que lo elijas a mano
  let manualIcon = false;
  let chosen = ICON_KEYS[0];
  const paint = key => {
    chosen = key;
    $$('#p-icons button').forEach(b => b.classList.toggle('on', b.dataset.icon === key));
  };

  $('#p-name').addEventListener('input', e => {
    if (!manualIcon) paint(guessIcon(e.target.value));
  });
  $('#p-name').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  $('#p-icons').addEventListener('click', e => {
    const btn = e.target.closest('[data-icon]');
    if (!btn) return;
    manualIcon = true;
    paint(btn.dataset.icon);
  });

  function add() {
    const name = $('#p-name').value;
    const res = Store.addIngredient({ name, cat: $('#p-cat').value, unit: $('#p-unit').value, icon: chosen });
    if (!res) return toast('Escribe un nombre', true);
    if (res.dupe) return toast(`"${res.dupe.name}" ya existe`, true);
    toast(`"${res.ing.name}" añadido`);
    renderPantry();
    $('#p-name').focus();
  }
  $('#p-add').addEventListener('click', add);

  $$('[data-del]').forEach(b => b.addEventListener('click', () => {
    const ing = Store.ingredient(b.dataset.del);
    const used = Store.usage(ing.id);
    const msg = used
      ? `"${ing.name}" se usa en ${used} receta(s). Si lo borras, desaparecerá de ellas. ¿Continuar?`
      : `¿Borrar "${ing.name}"?`;
    if (!confirm(msg)) return;
    Store.removeIngredient(ing.id);
    toast('Ingrediente borrado');
    renderPantry();
  }));

  $('#p-export').addEventListener('click', () => {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nomcraft-recetario.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Datos exportados');
  });

  $('#p-import').addEventListener('click', () => $('#p-file').click());
  $('#p-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const res = Store.importJSON(reader.result, 'merge');
        toast(`Importado: ${res.ings} ingr. / ${res.recs} recetas`);
        renderPantry();
      } catch (err) {
        toast('Archivo no válido', true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  status(`DESPENSA: ${list.length} INGREDIENTES`, `RECETAS: ${Store.data.recipes.length}`);
}

/* ---------------------------------------------------------------- arranque */

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (ui.tab === 'edit') { ui.isNew ? go('index') : go('recipe', { id: draft.id }); }
  else if (ui.tab === 'recipe') go('index');
});

$('#tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (btn) go(btn.dataset.view);
});

Store.load();
$('#brand-icon').innerHTML = iconSVG('olla', 36);
go('index');
