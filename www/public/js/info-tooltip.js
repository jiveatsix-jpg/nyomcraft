/* ── Modo Info ────────────────────────────────────────────────────────────
   Toggle opcional: cuando está activo, pasar el mouse sobre cualquier control
   con atributo `title` muestra un cuadro estilo pixel con esa misma info,
   en vez del tooltip nativo del navegador (chico y con retraso). Reutiliza
   los `title` que ya existen en el HTML/JS, así funciona también sobre
   contenido generado dinámicamente (vistas de recetas, despensa, compras). */

(function () {
  const LS_KEY = 'nomcraft.infoMode.on';
  let active = false;
  let boxEl = null;
  let currentTarget = null;

  function ensureBox() {
    if (boxEl) return boxEl;
    boxEl = document.createElement('div');
    boxEl.id = 'info-tooltip-box';
    boxEl.className = 'info-tooltip-box';
    boxEl.hidden = true;
    document.body.appendChild(boxEl);
    return boxEl;
  }

  function position(x, y) {
    const box = ensureBox();
    const pad = 14;
    const rect = box.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + rect.width > window.innerWidth) left = x - rect.width - pad;
    if (top + rect.height > window.innerHeight) top = y - rect.height - pad;
    box.style.left = Math.max(4, left) + 'px';
    box.style.top = Math.max(4, top) + 'px';
  }

  function hide() {
    currentTarget = null;
    const box = ensureBox();
    box.hidden = true;
  }

  function showFor(el, x, y) {
    const text = el.getAttribute('title');
    if (!text) { hide(); return; }
    const label = (el.textContent || '').trim().slice(0, 40);
    currentTarget = el;
    const box = ensureBox();
    box.textContent = '';
    if (label) {
      const labelEl = document.createElement('div');
      labelEl.className = 'info-tooltip-label';
      labelEl.textContent = label;
      box.appendChild(labelEl);
    }
    const textEl = document.createElement('div');
    textEl.className = 'info-tooltip-text';
    textEl.textContent = text;
    box.appendChild(textEl);
    box.hidden = false;
    position(x, y);
  }

  function onMouseOver(e) {
    if (!active) return;
    const target = e.target.closest('[title]');
    if (!target) { hide(); return; }
    if (target !== currentTarget) showFor(target, e.clientX, e.clientY);
  }

  function onMouseMove(e) {
    if (!active || !currentTarget) return;
    position(e.clientX, e.clientY);
  }

  function onMouseOut(e) {
    if (!active) return;
    const target = e.target.closest('[title]');
    if (target && e.relatedTarget && target.contains(e.relatedTarget)) return;
    hide();
  }

  function setActive(on, btn) {
    active = on;
    localStorage.setItem(LS_KEY, on ? 'true' : 'false');
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
    if (!on) hide();
  }

  function init() {
    const btn = document.getElementById('info-toggle');
    if (!btn) return;
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseout', onMouseOut);
    btn.addEventListener('click', () => setActive(!active, btn));
    setActive(localStorage.getItem(LS_KEY) === 'true', btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
