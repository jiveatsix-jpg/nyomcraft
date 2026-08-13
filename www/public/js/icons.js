/* ñomcraft — sprites pixel dibujados a mano.
   Cada icono: p = paleta de colores, d = filas de caracteres (una por fila de
   la rejilla). '.' = transparente, '1'..'9' = índice de paleta (1 -> p[0]).

   Rejilla por defecto 8x8. El renderizador (iconSVG, mas abajo) admite
   tambien 16x16 sin ningun cambio de codigo: basta con que el icono declare
   n: 16 y traiga 16 filas de 16 caracteres en vez de 8x8. Se probo con un
   tomate de muestra: la mecanica funciona, pero encontrar un estilo a 16x16
   que convenza cuesta mucho a mano, así que el catalogo se queda en 8x8
   por ahora.

   Para retomarlo mas adelante: sustituye la entrada de un icono por otra con
   n: 16 y sus 16 filas, ej.
     tomate: { label: 'Tomate', n: 16, p: [...6 colores...], d: [
       '................', ...16 filas de 16 caracteres... ] },
   y ya funciona en toda la app — nada fuera de este archivo sabe a que
   tamaño de rejilla esta dibujado cada icono. Se puede migrar de uno en uno,
   los 8x8 y los 16x16 conviven sin conflicto.                               */

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

  harina: { label: 'Harina', p: ['#efe3c8', '#cbb894', '#8b6f47'], d: [
    '...33...', '..1111..', '.111111.', '11111111',
    '11211211', '11111111', '.122221.', '..1111..'] },

  pizza: { label: 'Pizza', p: ['#f2c744', '#cc3333', '#c8873c'], d: [
    '33333333', '31111113', '11211211', '11111111',
    '.111111.', '..1211..', '..1111..', '...11...'] },

  rodillo: { label: 'Rodillo', p: ['#e8c9a0', '#c8a070', '#8b5a20'], d: [
    '........', '..2222..', '.111111.', '31111113',
    '31111113', '.111111.', '..2222..', '........'] },

  plato: { label: 'Plato', p: ['#c0c6d8', '#8a90a4', '#e6eaf5'], d: [
    '........', '.2....2.', '.21..12.', '.21..12.',
    '.211112.', '..1111..', '...11...', '...11...'] },

  /* -- cristalería, para cócteles, zumos y demás líquidos --
     mismo convenio que el resto: p[0] = líquido, p[1] = brillo/espuma,
     p[2] = detalle de cristal (tallo, base, asa o hielo) en un gris-azulado
     neutro compartido por las que llevan tallo, para que se lean como
     "vidrio" y no como parte de la bebida.                                 */

  'vaso-corto': { label: 'Vaso corto (rocas)', p: ['#c9812e', '#ffce8a', '#e8ecf5'], d: [
    '........', '........', '.222222.', '.113311.',
    '.111111.', '.111111.', '.111111.', '........'] },

  'vaso-alto': { label: 'Vaso alto (tubo)', p: ['#5cae4e', '#b8eab0', '#e8ecf5'], d: [
    '........', '..2222..', '..1111..', '..1111..',
    '..1131..', '..1111..', '..1111..', '..1111..'] },

  'copa-coctel': { label: 'Copa de cóctel', p: ['#d9c98a', '#f5efc8', '#aab2d4'], d: [
    '........', '.222222.', '.111111.', '..1111..',
    '...11...', '...33...', '...33...', '..3333..'] },

  'copa-balon': { label: 'Copa balón (gin-tonic)', p: ['#8fd3e8', '#dff6fb', '#aab2d4'], d: [
    '..2222..', '.111111.', '11111111', '.111111.',
    '..1111..', '...33...', '...33...', '..3333..'] },

  'copa-vino': { label: 'Copa de vino', p: ['#7a1f3a', '#c4507a', '#aab2d4'], d: [
    '..2222..', '.111111.', '.111111.', '..1111..',
    '...33...', '...33...', '...33...', '..3333..'] },

  'copa-flauta': { label: 'Copa flauta (champán)', p: ['#e8c94a', '#fff2b0', '#aab2d4'], d: [
    '...22...', '...11...', '...11...', '...11...',
    '...11...', '...33...', '...33...', '..3333..'] },

  chupito: { label: 'Vaso de chupito', p: ['#b9701e', '#f0b868', '#e8ecf5'], d: [
    '........', '........', '........', '........',
    '........', '..2222..', '..1111..', '..1111..'] },

  jarra: { label: 'Jarra de cerveza', p: ['#e0a83c', '#fce8a0', '#aab2d4'], d: [
    '........', '.22222..', '.11111..', '.111113.',
    '.11111..', '.111113.', '.11111..', '.11111..'] },

  'copa-margarita': { label: 'Copa margarita', p: ['#8ac93c', '#d8f588', '#aab2d4'], d: [
    '.222222.', '11111111', '..1111..', '...11...',
    '...33...', '...33...', '..3333..', '..3333..'] }
};

const ICON_KEYS = Object.keys(ICONS);

/** Las claves de ICONS que son cristalería, en el orden en que se muestran
    en el selector de vaso de una receta. El nombre para mostrar es siempre
    ICONS[clave].label — un solo sitio con los nombres, no dos.             */
const GLASSES = [
  'vaso-corto', 'vaso-alto', 'copa-coctel', 'copa-balon', 'copa-vino',
  'copa-flauta', 'chupito', 'jarra', 'copa-margarita'
];

/** Devuelve el SVG de un sprite. size = píxeles finales de lado.
    La rejilla puede ser 8x8 o 16x16: la marca ic.n (por defecto 8), así que
    los dos tamaños conviven sin que el resto del código note la diferencia. */
function iconSVG(key, size = 32) {
  const ic = ICONS[key] || ICONS.plato;
  const n = ic.n || 8;
  let rects = '';
  for (let y = 0; y < n; y++) {
    const row = ic.d[y] || '';
    let x = 0;
    while (x < n) {
      const c = row[x];
      if (c === '.' || c === undefined) { x++; continue; }
      let run = 1;
      while (x + run < n && row[x + run] === c) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${ic.p[+c - 1]}"/>`;
      x += run;
    }
  }
  return `<svg class="sprite" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" ` +
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
    [/albahaca|perejil|cilantro|menta|hierbabuena|hierba|orégano|oregano|romero|tomillo|espinaca|lechuga|hoja/, 'hierba'],
    [/sal\b|pimienta|especia|comino|curry|pimentón|pimenton/, 'sal'],
    [/agua\b|caldo|vino|cerveza|vinagre|zumo|hielo|cava|ron\b|ginebra|vodka|tequila|whisky|brandy|licor|tónica|tonica|refresco|angostura/, 'agua'],
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
