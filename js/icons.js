/* ñomcraft — sprites 8x8 dibujados a mano.
   Cada icono: p = paleta [color1, color2, color3], d = 8 filas de 8 caracteres.
   '.' = transparente, '1'|'2'|'3' = índice de paleta.                         */

const ICONS = {
  zanahoria: { label: 'Zanahoria', p: ['#f08a2e', '#5fa83c', '#c2601a'], d: [
    '...2.2..', '....22..', '..1111..', '..1113..',
    '..1113..', '...113..', '...13...', '....3...'] },

  tomate: { label: 'Tomate', p: ['#e03b3b', '#ff6b6b', '#4caf3c'], d: [
    '...3.3..', '..33333.', '.1122111', '11122111',
    '11111111', '11111111', '.111111.', '..1111..'] },

  huevo: { label: 'Huevo', p: ['#ffffff', '#d9dce8', '#ffc93c'], d: [
    '..1111..', '.111111.', '11133111', '11133111',
    '11111111', '11111111', '.112211.', '..2222..'] },

  pescado: { label: 'Pescado', p: ['#3d9ae0', '#7fd0ff', '#10243a'], d: [
    '........', '..111..1', '.1122111', '11132111',
    '11122111', '.1111..1', '..111...', '........'] },

  carne: { label: 'Carne', p: ['#b03a3a', '#d95c5c', '#f2e0c0'], d: [
    '..1111..', '.112211.', '11222211', '11222211',
    '11122111', '.111111.', '..1111..', '...33...'] },

  pan: { label: 'Pan', p: ['#c8873c', '#e8b06a', '#8b5a20'], d: [
    '........', '..2222..', '.221122.', '22111122',
    '21111112', '21111112', '.111111.', '..3333..'] },

  queso: { label: 'Queso', p: ['#f2c744', '#d9a520', '#fff2b0'], d: [
    '........', '...1111.', '..111111', '.1121111',
    '11111211', '11211111', '11111211', '.1111111'] },

  leche: { label: 'Leche', p: ['#ffffff', '#3d9ae0', '#dfe4f2'], d: [
    '..2222..', '..2222..', '..1111..', '.111111.',
    '.111111.', '.133331.', '.133331.', '.111111.'] },

  manzana: { label: 'Manzana', p: ['#e03b3b', '#ff6b6b', '#4caf3c'], d: [
    '...3.3..', '...33...', '.11.111.', '11111111',
    '12111111', '12111111', '.111111.', '..1111..'] },

  chile: { label: 'Chile', p: ['#cc2222', '#ee4444', '#3aa22a'], d: [
    '....33..', '....3...', '...11...', '..1121..',
    '..1121..', '..1121..', '..1111..', '...11...'] },

  cebolla: { label: 'Cebolla', p: ['#b184c4', '#d9b8e6', '#6aa22a'], d: [
    '...3.3..', '....3...', '..1111..', '.112211.',
    '11122111', '11122111', '.112211.', '..1111..'] },

  seta: { label: 'Seta', p: ['#d94444', '#ffffff', '#eee8c8'], d: [
    '..1111..', '.121211.', '11111111', '12111121',
    '.111111.', '...33...', '..3333..', '..3333..'] },

  arroz: { label: 'Arroz', p: ['#ffffff', '#dfe4f2', '#3d9ae0'], d: [
    '........', '..1111..', '.111111.', '11111111',
    '33333333', '33333333', '.333333.', '..3333..'] },

  hierba: { label: 'Hierba', p: ['#3a8a2a', '#5cb03c', '#2a5a1a'], d: [
    '......2.', '....222.', '...2221.', '..22111.',
    '.2211111', '.2111111', '3.11111.', '33......'] },

  sal: { label: 'Sal', p: ['#e2e6f0', '#8b91a8', '#ffffff'], d: [
    '..3.3...', '...3.3..', '..2222..', '..2222..',
    '.111111.', '.111111.', '.111111.', '.111111.'] },

  agua: { label: 'Agua', p: ['#3d9ae0', '#7fd0ff', '#ffffff'], d: [
    '...11...', '...11...', '..1111..', '.111111.',
    '11121111', '11211111', '.111111.', '..1111..'] },

  aceite: { label: 'Aceite', p: ['#e8c44a', '#b8912a', '#4caf3c'], d: [
    '...33...', '...11...', '..1111..', '.111111.',
    '.122221.', '.122221.', '.111111.', '..1111..'] },

  ajo: { label: 'Ajo', p: ['#f0eae0', '#d8cfc0', '#6aa22a'], d: [
    '....3...', '...33...', '..1111..', '.111111.',
    '11121111', '11121111', '.112211.', '..1111..'] },

  limon: { label: 'Limón', p: ['#f5d94a', '#ffee88', '#4caf3c'], d: [
    '....3...', '...111..', '..11111.', '.1112111',
    '11111211', '11112111', '.111111.', '..1111..'] },

  legumbre: { label: 'Legumbre', p: ['#c8873c', '#8b5a20', '#e8b06a'], d: [
    '........', '..111...', '.12211..', '.12211..',
    '..111.11', '....1221', '....1221', '.....111'] },

  olla: { label: 'Olla', p: ['#5a6070', '#8a90a4', '#c0463f'], d: [
    '........', '.222222.', '22222222', '31111113',
    '31111113', '.111111.', '.111111.', '..1111..'] },

  pastel: { label: 'Pastel', p: ['#f2a8c8', '#ffffff', '#cc2222'], d: [
    '....3...', '...222..', '..22222.', '.1111111',
    '12211221', '11111111', '11111111', '.111111.'] },

  plato: { label: 'Plato', p: ['#c0c6d8', '#8a90a4', '#e6eaf5'], d: [
    '........', '.2....2.', '.21..12.', '.21..12.',
    '.211112.', '..1111..', '...11...', '...11...'] }
};

const ICON_KEYS = Object.keys(ICONS);

/** Devuelve el SVG de un sprite. size = píxeles finales de lado. */
function iconSVG(key, size = 32) {
  const ic = ICONS[key] || ICONS.plato;
  let rects = '';
  for (let y = 0; y < 8; y++) {
    const row = ic.d[y];
    let x = 0;
    while (x < 8) {
      const c = row[x];
      if (c === '.' || c === undefined) { x++; continue; }
      let run = 1;
      while (x + run < 8 && row[x + run] === c) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${ic.p[+c - 1]}"/>`;
      x += run;
    }
  }
  return `<svg class="sprite" width="${size}" height="${size}" viewBox="0 0 8 8" ` +
         `shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${rects}</svg>`;
}

/** Elige un icono plausible a partir del nombre del ingrediente. */
function guessIcon(name) {
  const n = (name || '').toLowerCase();
  const map = [
    [/zanahor|calabaz|boniato/, 'zanahoria'],
    [/tomate|pimient(?!a)|fresa|sandía|sandia/, 'tomate'],
    [/huevo|clara|yema/, 'huevo'],
    [/pescad|salmón|salmon|atún|atun|merluza|bacalao|gamba|marisc/, 'pescado'],
    [/carne|pollo|ternera|cerdo|chuleta|bacon|jamón|jamon|lomo/, 'carne'],
    [/pan|masa|harina|tostada|bollo/, 'pan'],
    [/queso|parmesan|mozzarel/, 'queso'],
    [/leche|nata|yogur|mantequilla|crema/, 'leche'],
    [/manzana|pera|melocotón|melocoton|fruta/, 'manzana'],
    [/chile|guindilla|picante|jalapeñ|cayena/, 'chile'],
    [/cebolla|puerro|chalota/, 'cebolla'],
    [/seta|champiñ|champin|hongo/, 'seta'],
    [/arroz|quinoa|cuscús|cuscus|avena/, 'arroz'],
    [/albahaca|perejil|cilantro|hierba|orégano|oregano|romero|tomillo|espinaca|lechuga|hoja/, 'hierba'],
    [/sal\b|pimienta|especia|comino|curry|pimentón|pimenton/, 'sal'],
    [/agua|caldo|vino|cerveza|vinagre|zumo/, 'agua'],
    [/aceite|oliva|girasol|sésamo|sesamo/, 'aceite'],
    [/ajo/, 'ajo'],
    [/limón|limon|lima|naranja|cítric|citric/, 'limon'],
    [/garbanz|lenteja|alubia|judía|judia|frijol|soja|guisante/, 'legumbre'],
    [/azúcar|azucar|chocolate|miel|postre|tarta|galleta|vainilla|canela/, 'pastel'],
    [/pasta|espagueti|macarr|fideo|noodle/, 'olla']
  ];
  for (const [re, key] of map) if (re.test(n)) return key;
  return 'plato';
}
