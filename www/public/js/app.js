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
  'Guarnición': 'yellow', Ensalada: 'green', Bebida: 'blue', Salsa: 'red', Otro: 'dim'
};

// agrupación amplia del índice: cada categoría de receta cae en uno de estos
// cinco cajones. Todo lo que no es ensalada, postre, bebida ni salsa es "Comida".
const REC_GROUPS = ['Comida', 'Ensaladas', 'Postres', 'Bebidas', 'Salsas'];
const GROUP_OF_CAT = {
  Entrante: 'Comida', Principal: 'Comida', Postre: 'Postres',
  'Guarnición': 'Comida', Otro: 'Comida', Ensalada: 'Ensaladas', Bebida: 'Bebidas', Salsa: 'Salsas'
};

const view = $('#view');
let ui = { tab: 'index', search: '', filter: '' };  // pestaña visible y filtros del índice
let draft = null;                                    // receta en edición
let masaDraft = null;                                // masa en edición

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

/** Marca de duda para la vista de lectura: el "?" amarillo y su nota si la tiene. */
function marcaDuda(o) {
  if (!tieneDuda(o)) return '';
  const txt = (o.q || '').trim();
  return `<span class="duda" title="${txt ? esc(txt) : 'Por confirmar'}">?</span>` +
         (txt ? `<span class="duda-txt">${esc(txt)}</span>` : '');
}

/* ---------------------------------------------------------------- navegación */

// que pestaña queda encendida en cada vista
const TAB_OF = {
  index: 'index', recipe: 'index', edit: 'index',
  masas: 'masas', masa: 'masas', 'masa-edit': 'masas',
  pantry: 'pantry'
};

function go(tab, opts = {}) {
  ui.tab = tab;
  Object.assign(ui, opts);
  $$('#tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.view === (TAB_OF[tab] || 'index')));
  window.scrollTo(0, 0);
  render();
}

function render() {
  if (ui.tab === 'pantry') return renderPantry();
  if (ui.tab === 'recipe') return renderRecipe(ui.id);
  if (ui.tab === 'edit') return renderEditor();
  if (ui.tab === 'masas') return renderMasas();
  if (ui.tab === 'masa') return renderMasa(ui.masaId);
  if (ui.tab === 'masa-edit') return renderMasaEdit(ui.masaId);
  return renderIndex();
}

/* ---------------------------------------------------------------- ÍNDICE */

function renderIndex() {
  const q = ui.search.trim().toLowerCase();
  const group = ui.group || '';
  let recipes = Store.data.recipes;

  // cuenta de cada pestaña de grupo sobre el total, sin aplicar el resto de
  // filtros — así "Bebidas (11)" es siempre cuántas bebidas hay en total
  const groupCount = g => Store.data.recipes.filter(r => (GROUP_OF_CAT[r.cat] || 'Comida') === g).length;

  if (group) recipes = recipes.filter(r => (GROUP_OF_CAT[r.cat] || 'Comida') === group);
  if (ui.filter) recipes = recipes.filter(r => r.cat === ui.filter);
  if (ui.soloDudas) recipes = recipes.filter(r => contarDudas(r) > 0);
  if (ui.soloSello) recipes = recipes.filter(r => r.sello);
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
    const dudas = contarDudas(r);
    return `<article class="card pbox" data-open="${r.id}" role="button" tabindex="0"
             aria-label="Abrir ficha ${esc(r.name)}${r.sello ? ', con sello' : ''}${dudas ? `, ${dudas} por confirmar` : ''}">
      <div class="card-top">
        ${iconSVG(r.icon, 40)}
        <div class="card-title">${esc(r.name || 'Sin nombre')}</div>
        ${r.sello ? '<span class="sello-badge" title="Probada y perfecta">✓</span>' : ''}
        ${dudas ? `<span class="duda" title="${dudas} cosa(s) por confirmar">?${dudas > 1 ? dudas : ''}</span>` : ''}
      </div>
      <div class="ficha-tags">
        <span class="tag ${color}">${esc(deacc(r.cat))}</span>
        <span class="tag dim">${esc(deacc(r.diff))}</span>
      </div>
      <div class="card-meta">
        <span>${r.items.length} ingr.</span>
        <span>${r.steps.filter(s => s.t.trim()).length} pasos</span>
        <span>${r.time} min</span>
      </div>
    </article>`;
  }).join('');

  view.innerHTML = `
    <div class="subtabs" id="group-tabs">
      <button class="subtab ${!group ? 'on' : ''}" data-group="">Todas
        <span class="count">${Store.data.recipes.length}</span></button>
      ${REC_GROUPS.map(g => `<button class="subtab ${group === g ? 'on' : ''}" data-group="${g}">${g}
        <span class="count">${groupCount(g)}</span></button>`).join('')}
    </div>

    <div class="toolbar">
      <div class="grow">
        <input type="search" id="q" placeholder="Buscar receta o ingrediente..." value="${esc(ui.search)}">
      </div>
      <select id="filter" style="width:auto">
        <option value="">Todas las categorías</option>
        ${options(REC_CATS, ui.filter)}
      </select>
      <button class="btn ${ui.soloDudas ? 'yellow-on' : 'ghost'}" id="only-q"
              title="Ver solo las recetas con algo por confirmar">? Por confirmar</button>
      <button class="btn ${ui.soloSello ? 'green-on' : 'ghost'}" id="only-sello"
              title="Ver solo las recetas con sello">✓ Probadas</button>
      <button class="btn green" id="new">+ Nueva receta</button>
    </div>

    <h2 class="sec">Indice — ${recipes.length} receta${recipes.length === 1 ? '' : 's'}</h2>

    ${recipes.length || q || ui.filter || ui.soloDudas || ui.soloSello || group ? '' : `
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
  $('#group-tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-group]');
    if (!btn) return;
    ui.group = btn.dataset.group;
    renderIndex();
  });
  $('#filter').addEventListener('change', e => { ui.filter = e.target.value; renderIndex(); });
  $('#only-q').addEventListener('click', () => { ui.soloDudas = !ui.soloDudas; renderIndex(); });
  $('#only-sello').addEventListener('click', () => { ui.soloSello = !ui.soloSello; renderIndex(); });
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
    return `<li${tieneDuda(it) ? ' class="con-duda"' : ''}>
      ${iconSVG(ing ? ing.icon : 'plato', 24)}
      <span class="ing-name">${esc(ing ? ing.name : '(ingrediente borrado)')}${marcaDuda(it)}</span>
      <span class="ing-qty">${esc(fmtQty(it))}</span>
    </li>`;
  }).join('') || '<li class="notes">Sin ingredientes.</li>';

  const steps = r.steps.filter(s => s.t.trim())
    .map(s => `<li${tieneDuda(s) ? ' class="con-duda"' : ''}><span>${esc(s.t)}${marcaDuda(s)}</span></li>`)
    .join('') || '<li class="notes">Sin pasos de elaboración.</li>';

  const dudas = contarDudas(r);

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn ghost" id="back">&lt; Indice</button>
      <div class="grow"></div>
      <button class="btn ${r.sello ? 'green' : 'ghost'}" id="sello-btn"
              title="${r.sello ? 'Quitar el sello' : 'Marcar como probada y perfecta'}">
        ✓ ${r.sello ? 'Con sello' : 'Poner sello'}</button>
      <button class="btn blue" id="edit">Editar</button>
      <button class="btn" id="pdf" title="Guardar esta ficha como PDF">Exportar PDF</button>
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
            ${r.glass ? `<span class="tag dim glass-tag">${iconSVG(r.glass, 16)} ${esc(ICONS[r.glass].label)}</span>` : ''}
            ${r.sello ? '<span class="tag green">✓ Probada y perfecta</span>' : ''}
            ${dudas ? `<span class="tag yellow">${dudas} por confirmar</span>` : ''}
          </div>
        </div>
      </div>

      ${tieneDuda(r) ? `<div class="duda-banner">
        <span class="duda">?</span>
        <span>${r.q.trim() ? esc(r.q) : 'Esta receta está pendiente de confirmar.'}</span>
      </div>` : ''}

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
  $('#sello-btn').addEventListener('click', () => {
    const puesto = Store.toggleSello(r.id);
    toast(puesto ? 'Sello puesto: probada y perfecta' : 'Sello quitado');
    renderRecipe(r.id);
  });
  // El navegador toma el título del documento como nombre sugerido del PDF.
  $('#pdf').addEventListener('click', () => {
    const prev = document.title;
    document.title = r.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'receta';
    const restore = () => {
      document.title = prev;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  });
  $('#edit').addEventListener('click', () => {
    draft = JSON.parse(JSON.stringify(r));
    if (!draft.steps.length) draft.steps = [{ t: '', q: null }];
    ui.isNew = false;
    go('edit');
  });
  $('#del').addEventListener('click', () => {
    if (!confirm(`¿Borrar "${r.name}"? No se puede deshacer.`)) return;
    Store.removeRecipe(r.id);
    toast('Receta borrada');
    go('index');
  });

  status(`FICHA: ${caps(r.name)}`,
    `${r.items.length} INGR. / ${r.steps.filter(s => s.t.trim()).length} PASOS` +
    (dudas ? ` / ${dudas} POR CONFIRMAR` : ''));
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
          <input type="text" id="f-name" value="${esc(d.name)}" placeholder="Ej. Tortilla de Papas" maxlength="60">
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

      <label class="fld" style="margin-top:14px"><span>Vaso o copa de servicio (opcional)</span></label>
      <div class="icon-pick" id="glass-pick">
        <button type="button" data-glass="" title="Sin vaso específico"
          class="${!d.glass ? 'on' : ''}">—</button>
        ${GLASSES.map(k => `<button type="button" data-glass="${k}" title="${esc(ICONS[k].label)}"
          class="${k === d.glass ? 'on' : ''}">${iconSVG(k, 30)}</button>`).join('')}
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

      <div class="hr"></div>

      <h3 class="sub">Duda general</h3>
      <div class="duda-general">
        <button class="btn small ${tieneDuda(d) ? 'yellow-on' : 'ghost'}" id="f-q"
                title="Marcar la receta entera como pendiente de confirmar">?</button>
        <span class="notes">Marca la receta entera si hay algo que confirmar antes de fiarte de ella.</span>
      </div>
      <div id="f-qbox">${tieneDuda(d) ? `
        <input type="text" id="f-qtxt" value="${esc(d.q)}" maxlength="160"
               placeholder="¿Qué hay que confirmar? (opcional)">` : ''}</div>
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

  // la duda general se redibuja sola para no repintar todo el editor
  $('#f-q').addEventListener('click', () => {
    d.q = tieneDuda(d) ? null : '';
    $('#f-q').className = `btn small ${tieneDuda(d) ? 'yellow-on' : 'ghost'}`;
    $('#f-qbox').innerHTML = tieneDuda(d)
      ? `<input type="text" id="f-qtxt" value="" maxlength="160"
                placeholder="¿Qué hay que confirmar? (opcional)">` : '';
    bindQtxt();
    if ($('#f-qtxt')) $('#f-qtxt').focus();
  });
  function bindQtxt() {
    const el = $('#f-qtxt');
    if (el) el.addEventListener('input', e => { d.q = e.target.value; });
  }
  bindQtxt();

  $('#icon-pick').addEventListener('click', e => {
    const btn = e.target.closest('[data-icon]');
    if (!btn) return;
    d.icon = btn.dataset.icon;
    $$('#icon-pick button').forEach(b => b.classList.toggle('on', b === btn));
  });

  $('#glass-pick').addEventListener('click', e => {
    const btn = e.target.closest('[data-glass]');
    if (!btn) return;
    d.glass = btn.dataset.glass || null;
    $$('#glass-pick button').forEach(b => b.classList.toggle('on', b === btn));
  });

  $('#add-ing').addEventListener('click', () => {
    if (!Store.data.ingredients.length) return toast('Añade ingredientes a la despensa primero', true);
    d.items.push({ ing: Store.data.ingredients[0].id, qty: 1, unit: Store.data.ingredients[0].unit });
    drawIngRows();
  });
  $('#quick-ing').addEventListener('click', quickAddIngredient);
  $('#add-step').addEventListener('click', () => {
    d.steps.push({ t: '', q: null });
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
      <span class="del">
        <button class="btn small ${tieneDuda(it) ? 'yellow-on' : 'ghost'}" data-f="q"
                title="Marcar como pendiente de confirmar">?</button>
        <button class="btn small red" data-f="del" title="Quitar">X</button>
      </span>
      ${tieneDuda(it) ? `<span class="qnote">
        <input type="text" data-f="qtxt" value="${esc(it.q)}" maxlength="120"
               placeholder="¿Qué hay que confirmar? (opcional)">
      </span>` : ''}
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
    row.querySelector('[data-f=q]').addEventListener('click', () => {
      d.items[i].q = tieneDuda(d.items[i]) ? null : '';
      drawIngRows();
      const inp = box.querySelector(`.row-ing[data-i="${i}"] [data-f=qtxt]`);
      if (inp) inp.focus();
    });
    const qtxt = row.querySelector('[data-f=qtxt]');
    if (qtxt) qtxt.addEventListener('input', e => { d.items[i].q = e.target.value; });
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
      <textarea data-f="text" placeholder="Describe el paso ${i + 1}...">${esc(s.t)}</textarea>
      <div class="ctl">
        <button class="btn small ghost" data-f="up"   title="Subir"  ${i === 0 ? 'disabled' : ''}>^</button>
        <button class="btn small ghost" data-f="down" title="Bajar"  ${i === d.steps.length - 1 ? 'disabled' : ''}>v</button>
        <button class="btn small ${tieneDuda(s) ? 'yellow-on' : 'ghost'}" data-f="q"
                title="Marcar como pendiente de confirmar">?</button>
        <button class="btn small red"   data-f="del"  title="Quitar">X</button>
      </div>
      ${tieneDuda(s) ? `<div class="qnote">
        <input type="text" data-f="qtxt" value="${esc(s.q)}" maxlength="120"
               placeholder="¿Qué hay que confirmar de este paso? (opcional)">
      </div>` : ''}
    </div>`).join('');

  box.querySelectorAll('.row-step').forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('[data-f=text]').addEventListener('input', e => { d.steps[i].t = e.target.value; });
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
      if (!d.steps.length) d.steps = [{ t: '', q: null }];
      drawStepRows();
    });
    row.querySelector('[data-f=q]').addEventListener('click', () => {
      d.steps[i].q = tieneDuda(d.steps[i]) ? null : '';
      drawStepRows();
      const inp = box.querySelector(`.row-step[data-i="${i}"] [data-f=qtxt]`);
      if (inp) inp.focus();
    });
    const qtxt = row.querySelector('[data-f=qtxt]');
    if (qtxt) qtxt.addEventListener('input', e => { d.steps[i].q = e.target.value; });
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
  // un paso vacío se descarta, salvo que lleve una duda colgada: eso es
  // justamente "aquí falta algo por confirmar" y hay que conservarlo
  d.steps = d.steps.map(s => ({ ...s, t: s.t.trim() })).filter(s => s.t || tieneDuda(s));
  if (!d.steps.length) d.steps = [{ t: '', q: null }];
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
    <p class="notes">Copia de seguridad: los botones <b>Exportar JSON</b> / <b>Importar</b> de la
    cabecera guardan y recuperan el recetario entero — recetas e ingredientes.</p>`;

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

  status(`DESPENSA: ${list.length} INGREDIENTES`, `RECETAS: ${Store.data.recipes.length}`);
}

/* ---------------------------------------------------------------- MASAS */

const FAM_COLOR = {
  Pan: 'yellow', Pizza: 'red', Enriquecida: 'pink', Hojaldrada: 'blue',
  Quebrada: 'dim', Fresca: 'green', Batida: 'blue', Cultivo: 'dim'
};

/** Redondeo util en cocina: los gramos gordos enteros, las pizcas con decimal. */
function fmtG(n) {
  if (!isFinite(n) || n <= 0) return '0 g';
  if (n < 1) return `${n.toFixed(2)} g`;
  if (n < 10) return `${n.toFixed(1)} g`;
  return `${Math.round(n)} g`;
}

function renderMasas() {
  const q = (ui.masaSearch || '').trim().toLowerCase();
  const fam = ui.masaFam || '';

  let list = Store.allMasas();
  if (fam) list = list.filter(m => m.fam === fam);
  if (q) list = list.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.fam.toLowerCase().includes(q) ||
    m.ing.some(i => i.n.toLowerCase().includes(q)));

  const cards = list.map(m => `
    <article class="card pbox" data-masa="${m.id}" role="button" tabindex="0"
             aria-label="Abrir masa ${esc(m.name)}">
      <div class="card-top">
        ${iconSVG(m.icon, 40)}
        <div class="card-title">${esc(m.name)}</div>
      </div>
      <div class="ficha-tags">
        <span class="tag ${FAM_COLOR[m.fam] || 'dim'}">${esc(deacc(m.fam))}</span>
        <span class="tag dim">${masaHidratacion(m)} % hidr.</span>
        ${Store.masaIsCustom(m.id) ? '<span class="tag yellow">Editada</span>' : ''}
      </div>
      <div class="card-meta"><span>${esc(m.hint)}</span></div>
    </article>`).join('');

  view.innerHTML = `
    <div class="toolbar">
      <div class="grow">
        <input type="search" id="mq" placeholder="Buscar masa o ingrediente..." value="${esc(ui.masaSearch || '')}">
      </div>
      <select id="mfam" style="width:auto">
        <option value="">Todas las familias</option>
        ${options(MASA_FAMS, fam)}
      </select>
    </div>

    <h2 class="sec">Masas — ${list.length} de ${MASAS.length}</h2>
    <p class="notes" style="margin:-6px 0 18px">
      Recetas en porcentaje de panadero. Abre cualquiera y fija los gramos de harina:
      el resto de cantidades se calculan solas.</p>

    <div class="grid">${cards || '<p class="notes">Ninguna masa coincide.</p>'}</div>`;

  const search = $('#mq');
  search.addEventListener('input', e => {
    ui.masaSearch = e.target.value;
    const pos = e.target.selectionStart;
    renderMasas();
    const s2 = $('#mq');
    s2.focus();
    s2.setSelectionRange(pos, pos);
  });
  $('#mfam').addEventListener('change', e => { ui.masaFam = e.target.value; renderMasas(); });

  $$('[data-masa]').forEach(el => {
    const open = () => go('masa', { masaId: el.dataset.masa });
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  status(`MASAS: ${MASAS.length}`, 'PORCENTAJE DE PANADERO');
}

function renderMasa(id) {
  const m = Store.getMasa(id);
  if (!m) { toast('Masa no encontrada', true); return go('masas'); }
  const isCustom = Store.masaIsCustom(id);

  const totalPct = masaTotalPct(m);
  if (ui.masaFlour == null) ui.masaFlour = 500;
  if (ui.masaPieces == null) ui.masaPieces = 4;
  if (ui.masaPieceW == null) ui.masaPieceW = 250;
  ui.masaMode = ui.masaMode || 'harina';

  const steps = m.steps.map(s => `<li><span>${esc(s)}</span></li>`).join('');

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn ghost" id="back">&lt; Masas</button>
      <div class="grow"></div>
      <button class="btn blue" id="masa-edit-btn">Editar</button>
      <button class="btn green" id="to-ficha" title="Crear una receta en el índice con estas cantidades">Guardar como ficha</button>
    </div>

    <section class="ficha pbox">
      <div class="ficha-head">
        ${iconSVG(m.icon, 64)}
        <div style="flex:1;min-width:200px">
          <h2>${esc(m.name)}</h2>
          <div class="ficha-tags">
            <span class="tag ${FAM_COLOR[m.fam] || 'dim'}">${esc(deacc(m.fam))}</span>
            <span class="tag dim">${masaHidratacion(m)} % hidratacion</span>
            <span class="tag dim">${m.ing.length} ingredientes</span>
            ${isCustom ? '<span class="tag yellow">Personalizada</span>' : ''}
          </div>
          <p class="notes" style="margin:10px 0 0">${esc(m.hint)}</p>
        </div>
      </div>

      <div class="hr"></div>

      <h3 class="sub">Calculador</h3>
      <div class="calc-modes">
        <button class="btn small ${ui.masaMode === 'harina' ? 'green' : 'ghost'}" data-mode="harina">Desde la harina</button>
        <button class="btn small ${ui.masaMode === 'piezas' ? 'green' : 'ghost'}" data-mode="piezas">Desde las piezas</button>
      </div>

      <div class="calc-fields" id="f-harina" ${ui.masaMode === 'harina' ? '' : 'hidden'}>
        <label class="fld"><span>Gramos de harina</span>
          <input type="number" id="c-flour" min="1" step="10" value="${ui.masaFlour}"></label>
      </div>

      <div class="calc-fields" id="f-piezas" ${ui.masaMode === 'piezas' ? '' : 'hidden'}>
        <label class="fld"><span>Nº de piezas</span>
          <input type="number" id="c-pieces" min="1" step="1" value="${ui.masaPieces}"></label>
        <label class="fld"><span>Peso por pieza (g)</span>
          <input type="number" id="c-piecew" min="1" step="10" value="${ui.masaPieceW}"></label>
      </div>

      <div class="ficha-tags" id="calc-chips" style="margin:14px 0"></div>

      <table class="calc-table">
        <thead><tr><th>Ingrediente</th><th class="num">%</th><th class="num">Cantidad</th></tr></thead>
        <tbody id="calc-rows"></tbody>
        <tfoot><tr><th>Masa total</th><th class="num">${totalPct.toFixed(1)}</th>
          <th class="num" id="calc-total"></th></tr></tfoot>
      </table>

      <div class="hr"></div>

      <h3 class="sub">Elaboracion</h3>
      <ol class="steps">${steps}</ol>

      <div class="hr"></div>
      <h3 class="sub">Notas</h3>
      <p class="notes">${esc(m.notes)}</p>
    </section>`;

  $('#back').addEventListener('click', () => go('masas'));
  $('#masa-edit-btn').addEventListener('click', () => go('masa-edit', { masaId: id }));

  $$('[data-mode]').forEach(b => b.addEventListener('click', () => {
    ui.masaMode = b.dataset.mode;
    renderMasa(id);
  }));

  $('#c-flour').addEventListener('input', e => {
    ui.masaFlour = Math.max(0, +e.target.value || 0);
    drawCalc(m);
  });
  $('#c-pieces').addEventListener('input', e => {
    ui.masaPieces = Math.max(0, +e.target.value || 0);
    drawCalc(m);
  });
  $('#c-piecew').addEventListener('input', e => {
    ui.masaPieceW = Math.max(0, +e.target.value || 0);
    drawCalc(m);
  });

  $('#to-ficha').addEventListener('click', () => masaToFicha(m));

  drawCalc(m);
  status(`MASA: ${caps(m.name)}`, `${masaHidratacion(m)}% HIDRATACION`);
}

/** Gramos de harina segun el modo activo. En modo piezas se despeja al reves:
    si 100 g de harina dan `totalPct` g de masa, para X g de masa hacen falta
    X * 100 / totalPct g de harina. */
function flourFor(masa) {
  if (ui.masaMode === 'piezas') {
    const total = (ui.masaPieces || 0) * (ui.masaPieceW || 0);
    return total * 100 / masaTotalPct(masa);
  }
  return ui.masaFlour || 0;
}

function drawCalc(masa) {
  const flour = flourFor(masa);
  const total = flour * masaTotalPct(masa) / 100;

  const rows = $('#calc-rows');
  if (!rows) return;

  // la harina es la referencia; en la masa madre el agua tambien va al 100 %,
  // asi que se marca solo la primera coincidencia, no todas
  const baseIdx = masa.ing.findIndex(i => i.p === 100);

  // un ingrediente puede llevar ref: el id de otra masa de este mismo directorio
  // que lo produce (p. ej. "Masa madre activa" -> la receta del cultivo). Se
  // muestra como un enlace en vez de solo texto, para no dejar al usuario
  // atascado sin saber de dónde sale ese ingrediente.
  const nombreCelda = i => i.ref
    ? `<button type="button" class="ing-ref" data-ref="${esc(i.ref)}">${esc(i.n)}<span class="ref-arrow">→</span></button>`
    : esc(i.n);

  rows.innerHTML = masa.ing.map((i, n) => `
    <tr${n === baseIdx ? ' class="base"' : ''}>
      <td>${nombreCelda(i)}${i.nota ? `<span class="nota">${esc(i.nota)}</span>` : ''}</td>
      <td class="num">${i.p}</td>
      <td class="num qty">${fmtG(i.p * flour / 100)}</td>
    </tr>`).join('');

  $$('.ing-ref').forEach(b => b.addEventListener('click', () => go('masa', { masaId: b.dataset.ref })));

  $('#calc-total').textContent = fmtG(total);

  const chips = [`<span class="tag yellow">Harina: ${fmtG(flour)}</span>`,
                 `<span class="tag dim">Masa total: ${fmtG(total)}</span>`];
  if (ui.masaMode === 'piezas') {
    chips.push(`<span class="tag dim">${ui.masaPieces} x ${ui.masaPieceW} g</span>`);
  } else {
    const piezas = ui.masaPieceW ? total / ui.masaPieceW : 0;
    chips.push(`<span class="tag dim">≈ ${piezas.toFixed(1)} piezas de ${ui.masaPieceW} g</span>`);
  }
  $('#calc-chips').innerHTML = chips.join('');
}

/** Vuelca la masa calculada al recetario como una ficha normal, dando de alta
    en la despensa los ingredientes que falten. */
function masaToFicha(masa) {
  const flour = flourFor(masa);
  if (flour <= 0) return toast('Pon una cantidad primero', true);

  const items = masa.ing.map(i => {
    const name = i.n;
    let ing = Store.data.ingredients.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!ing) {
      const res = Store.addIngredient({ name, cat: 'Otro', unit: 'g' });
      ing = res && (res.ing || res.dupe);
    }
    return ing ? { ing: ing.id, qty: Math.round(i.p * flour / 100 * 10) / 10, unit: 'g' } : null;
  }).filter(Boolean);

  const rec = Store.blankRecipe();
  rec.name = `${masa.name} (${Math.round(flour)} g de harina)`;
  rec.icon = masa.icon;
  rec.cat = 'Otro';
  rec.diff = 'Media';
  rec.time = 120;
  rec.portions = ui.masaMode === 'piezas' ? (ui.masaPieces || 1) : 1;
  rec.items = items;
  rec.steps = masa.steps.map(t => ({ t, q: null }));
  rec.notes = `${masa.notes}\n\nCalculado desde el directorio de masas: ${masaTotalPct(masa).toFixed(1)} % sobre la harina.`;

  Store.saveRecipe(rec);
  toast('Ficha creada en el índice');
  go('recipe', { id: rec.id });
}

/* ---------------------------------------------------------------- EDITOR DE MASAS */

function renderMasaEdit(id) {
  if (!masaDraft || masaDraft.id !== id) {
    const base = Store.getMasa(id);
    if (!base) { toast('Masa no encontrada', true); return go('masas'); }
    masaDraft = JSON.parse(JSON.stringify(base));
  }
  const d = masaDraft;
  const isCustom = Store.masaIsCustom(id);

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn ghost" id="m-cancel">&lt; Cancelar</button>
      <div class="grow"></div>
      <span class="tag ${isCustom ? 'yellow' : 'dim'}">${isCustom ? 'Personalizada' : 'Editando el original'}</span>
    </div>

    <section class="ficha pbox">
      <div class="form-grid" style="margin-bottom:16px">
        <label class="fld" style="grid-column:1/-1"><span>Nombre</span>
          <input type="text" id="m-name" value="${esc(d.name)}" maxlength="60"></label>
        <label class="fld"><span>Familia</span>
          <select id="m-fam">${options(MASA_FAMS, d.fam)}</select></label>
      </div>

      <label class="fld"><span>Icono</span></label>
      <div class="icon-pick" id="m-icon-pick">
        ${ICON_KEYS.map(k => `<button type="button" data-icon="${k}" title="${esc(ICONS[k].label)}"
          class="${k === d.icon ? 'on' : ''}">${iconSVG(k, 30)}</button>`).join('')}
      </div>

      <label class="fld" style="margin-top:14px"><span>Pista (se ve en la tarjeta del índice)</span>
        <input type="text" id="m-hint" value="${esc(d.hint)}" maxlength="90"></label>

      <div class="hr"></div>

      <h3 class="sub">Ingredientes (% sobre la harina)</h3>
      <div id="m-ing-rows"></div>
      <button class="btn small green" id="m-add-ing" style="margin-top:6px">+ Añadir ingrediente</button>

      <div class="hr"></div>

      <h3 class="sub">Pasos de elaboración</h3>
      <div id="m-step-rows"></div>
      <button class="btn small green" id="m-add-step" style="margin-top:6px">+ Añadir paso</button>

      <div class="hr"></div>

      <label class="fld"><span>Notas</span>
        <textarea id="m-notes" placeholder="Trucos, variantes...">${esc(d.notes)}</textarea></label>
    </section>

    <div class="sticky-actions">
      <button class="btn green" id="m-save">Guardar cambios</button>
      <div class="spacer"></div>
      ${isCustom ? '<button class="btn red" id="m-reset">Restablecer original</button>' : ''}
    </div>`;

  $('#m-name').addEventListener('input', e => { d.name = e.target.value; });
  $('#m-fam').addEventListener('change', e => { d.fam = e.target.value; });
  $('#m-hint').addEventListener('input', e => { d.hint = e.target.value; });
  $('#m-notes').addEventListener('input', e => { d.notes = e.target.value; });

  $('#m-icon-pick').addEventListener('click', e => {
    const btn = e.target.closest('[data-icon]');
    if (!btn) return;
    d.icon = btn.dataset.icon;
    $$('#m-icon-pick button').forEach(b => b.classList.toggle('on', b === btn));
  });

  $('#m-add-ing').addEventListener('click', () => {
    d.ing.push({ n: '', p: 0 });
    drawMasaIngRows();
  });
  $('#m-add-step').addEventListener('click', () => {
    d.steps.push('');
    drawMasaStepRows();
    const areas = $$('#m-step-rows textarea');
    if (areas.length) areas[areas.length - 1].focus();
  });

  $('#m-cancel').addEventListener('click', () => { masaDraft = null; go('masa', { masaId: id }); });
  $('#m-save').addEventListener('click', () => saveMasaDraft(id));

  const resetBtn = $('#m-reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (!confirm('¿Restablecer esta masa a su versión original? Se perderán tus cambios.')) return;
    Store.resetMasa(id);
    masaDraft = null;
    toast('Masa restablecida');
    go('masa', { masaId: id });
  });

  drawMasaIngRows();
  drawMasaStepRows();
  status(`EDITANDO MASA: ${caps(d.name)}`, 'ESC = CANCELAR');
}

function drawMasaIngRows() {
  const box = $('#m-ing-rows');
  if (!box) return;
  const d = masaDraft;

  box.innerHTML = d.ing.map((it, i) => `
    <div class="row-masa-ing" data-i="${i}">
      <input type="text" data-f="n" value="${esc(it.n)}" placeholder="Ingrediente">
      <input type="number" data-f="p" min="0" step="0.1" value="${it.p}" placeholder="%">
      <label class="chk"><input type="checkbox" data-f="liq" ${it.liq ? 'checked' : ''}> líquido</label>
      <input type="text" data-f="nota" value="${esc(it.nota || '')}" placeholder="nota (opcional)">
      <button class="btn small red" data-f="del" title="Quitar">X</button>
    </div>`).join('');

  box.querySelectorAll('.row-masa-ing').forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('[data-f=n]').addEventListener('input', e => { d.ing[i].n = e.target.value; });
    row.querySelector('[data-f=p]').addEventListener('input', e => { d.ing[i].p = +e.target.value || 0; });
    row.querySelector('[data-f=liq]').addEventListener('change', e => {
      if (e.target.checked) d.ing[i].liq = true; else delete d.ing[i].liq;
    });
    row.querySelector('[data-f=nota]').addEventListener('input', e => {
      const v = e.target.value.trim();
      if (v) d.ing[i].nota = v; else delete d.ing[i].nota;
    });
    row.querySelector('[data-f=del]').addEventListener('click', () => {
      d.ing.splice(i, 1);
      drawMasaIngRows();
    });
  });
}

function drawMasaStepRows() {
  const box = $('#m-step-rows');
  if (!box) return;
  const d = masaDraft;

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
      drawMasaStepRows();
    });
    row.querySelector('[data-f=down]').addEventListener('click', () => {
      if (i === d.steps.length - 1) return;
      [d.steps[i + 1], d.steps[i]] = [d.steps[i], d.steps[i + 1]];
      drawMasaStepRows();
    });
    row.querySelector('[data-f=del]').addEventListener('click', () => {
      d.steps.splice(i, 1);
      if (!d.steps.length) d.steps = [''];
      drawMasaStepRows();
    });
  });
}

function saveMasaDraft(id) {
  const d = masaDraft;
  d.name = d.name.trim();
  if (!d.name) return toast('La masa necesita un nombre', true);

  // un ingrediente sin nombre o sin porcentaje no significa nada aquí
  d.ing = d.ing.map(i => ({ ...i, n: i.n.trim() })).filter(i => i.n && i.p > 0);
  if (!d.ing.length) return toast('Añade al menos un ingrediente', true);

  d.steps = d.steps.map(s => s.trim()).filter(Boolean);
  if (!d.steps.length) return toast('Añade al menos un paso', true);

  // solo se guardan los campos editables: el id es fijo y viene del catálogo
  Store.setMasaOverride(id, {
    name: d.name, icon: d.icon, fam: d.fam, hint: d.hint,
    ing: d.ing, steps: d.steps, notes: d.notes
  });
  masaDraft = null;
  toast('Masa actualizada');
  go('masa', { masaId: id });
}

/* ---------------------------------------------------------------- datos (global) */

const resumen = () =>
  `${Store.data.recipes.length} recetas / ${Store.data.ingredients.length} ingr.`;

async function exportAll() {
  const json = Store.exportJSON();

  // en la app de escritorio (Tauri) usamos el dialogo nativo de guardado
  if (window.__TAURI__ && window.__TAURI__.dialog) {
    try {
      const { save } = window.__TAURI__.dialog;
      const path = await save({
        filters: [{ name: 'Recetario JSON', extensions: ['json'] }],
        defaultPath: 'nomcraft-recetario.json'
      });
      if (!path) return;
      // comando propio (std::fs::write en Rust): evita el sistema de scopes
      // del plugin fs, que por defecto no cubre rutas fuera de la app.
      await window.__TAURI__.core.invoke('write_text_file', { path, contents: json });
      toast(`Exportado en: ${path}`);
    } catch (err) {
      toast('Error al exportar', true);
    }
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nomcraft-recetario.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Exportado: ${resumen()}`);
}

function importAll(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const res = Store.importJSON(reader.result, 'merge');
      toast(`Importado: ${res.recs} recetas / ${res.ings} ingr.`);
      render();
    } catch (err) {
      toast('Archivo no válido', true);
    }
  };
  reader.readAsText(file);
}

/* ---------------------------------------------------------------- arranque */

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (ui.tab === 'edit') { ui.isNew ? go('index') : go('recipe', { id: draft.id }); }
  else if (ui.tab === 'recipe') go('index');
  else if (ui.tab === 'masa') go('masas');
  else if (ui.tab === 'masa-edit') { masaDraft = null; go('masa', { masaId: ui.masaId }); }
});

$('#tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (btn) go(btn.dataset.view);
});

$('#export').addEventListener('click', exportAll);
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) importAll(file);
  e.target.value = '';
});

Store.load();
$('#brand-icon').innerHTML = iconSVG('olla', 36);
go('index');
