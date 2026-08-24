/* ñomcraft — persistencia en localStorage */

const UNITS = ['g', 'kg', 'ml', 'l', 'ud', 'cda', 'cdta', 'taza', 'pizca', 'diente', 'rama', 'hoja', 'al gusto'];

const ING_CATS = ['Verdura', 'Fruta', 'Carne', 'Pescado', 'Lácteo', 'Cereal', 'Legumbre', 'Especia', 'Salsa', 'Otro'];
const REC_CATS = ['Entrante', 'Principal', 'Postre', 'Guarnición', 'Ensalada', 'Bebida', 'Salsa', 'Otro'];
const DIFFS = ['Fácil', 'Media', 'Difícil'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---- dudas ----
   Una duda es una marca de "esto hay que confirmarlo". Se puede colgar de un
   ingrediente, de un paso o de la receta entera, y lleva un texto opcional.
   Convenio: q === null -> sin duda; q === '' -> marcado sin texto; q === 'algo'
   -> marcado con nota. Se usa null y no false para poder guardar el texto en el
   mismo campo sin un segundo booleano.                                        */

const tieneDuda = o => !!o && o.q !== null && o.q !== undefined;

/** Cuenta todas las dudas de una receta: general + ingredientes + pasos. */
function contarDudas(rec) {
  if (!rec) return 0;
  return (tieneDuda(rec) ? 1 : 0)
    + rec.items.filter(tieneDuda).length
    + rec.steps.filter(tieneDuda).length;
}

/** Pone al día una receta venida de localStorage o de un JSON importado.
    Los pasos eran strings sueltos y ahora son { t, q }; se convierten aquí para
    que el resto del código no tenga que preguntarse de qué versión vienen. */
function normalizeRecipe(rec) {
  if (!rec) return rec;
  if (!Array.isArray(rec.steps)) rec.steps = [];
  rec.steps = rec.steps.map(s =>
    typeof s === 'string' ? { t: s, q: null } : { t: s.t || '', q: s.q ?? null });
  if (!Array.isArray(rec.items)) rec.items = [];
  rec.items.forEach(i => { if (i.q === undefined) i.q = null; });
  if (rec.q === undefined) rec.q = null;
  if (rec.glass === undefined) rec.glass = null;
  if (typeof rec.sello !== 'boolean') rec.sello = false;
  return rec;
}

const Store = {
  KEY: 'nomcraft.v1',
  data: { ingredients: [], recipes: [], masaOverrides: {}, shopping: [] },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data.ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
        this.data.recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];
        this.data.recipes.forEach(normalizeRecipe);
        this.data.masaOverrides = (parsed.masaOverrides && typeof parsed.masaOverrides === 'object')
          ? parsed.masaOverrides : {};
        this.data.shopping = Array.isArray(parsed.shopping) ? parsed.shopping : [];
      }
    } catch (e) {
      console.warn('Datos corruptos, empiezo de cero.', e);
    }
    if (!this.data.ingredients.length && !this.data.recipes.length) this.seed();
    return this.data;
  },

  save() {
    localStorage.setItem(this.KEY, JSON.stringify(this.data));
  },

  /* ---- ingredientes ---- */
  ingredient(id) { return this.data.ingredients.find(i => i.id === id) || null; },

  addIngredient({ name, cat, unit, icon }) {
    const clean = (name || '').trim();
    if (!clean) return null;
    const dupe = this.data.ingredients.find(i => i.name.toLowerCase() === clean.toLowerCase());
    if (dupe) return { dupe };
    const ing = { id: uid(), name: clean, cat: cat || 'Otro', unit: unit || 'g', icon: icon || guessIcon(clean) };
    this.data.ingredients.push(ing);
    this.sortIngredients();
    this.save();
    return { ing };
  },

  updateIngredient(id, patch) {
    const ing = this.ingredient(id);
    if (!ing) return;
    Object.assign(ing, patch);
    this.sortIngredients();
    this.save();
  },

  removeIngredient(id) {
    this.data.ingredients = this.data.ingredients.filter(i => i.id !== id);
    this.data.recipes.forEach(r => { r.items = r.items.filter(it => it.ing !== id); });
    this.save();
  },

  sortIngredients() {
    this.data.ingredients.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  },

  /** Nº de recetas que usan un ingrediente. */
  usage(id) {
    return this.data.recipes.filter(r => r.items.some(it => it.ing === id)).length;
  },

  /* ---- masas (el catalogo MASAS vive en masas.js; aquí solo la personalización) ---- */

  /** La masa del catálogo tal cual, o con la personalización del usuario encima si
      existe. La personalización sustituye por completo name/icon/fam/hint/ing/steps/
      notes — nunca los mezcla campo a campo — porque siempre se guarda desde un
      editor que ya partió del estado completo de la masa.                         */
  getMasa(id) {
    const base = MASAS.find(m => m.id === id);
    if (!base) return null;
    const ov = this.data.masaOverrides[id];
    return ov ? { ...base, ...ov } : base;
  },

  /** Todo el catálogo, ya con las personalizaciones aplicadas — para listar/filtrar. */
  allMasas() {
    return MASAS.map(m => this.getMasa(m.id));
  },

  masaIsCustom(id) { return !!this.data.masaOverrides[id]; },

  setMasaOverride(id, patch) {
    this.data.masaOverrides[id] = patch;
    this.save();
  },

  resetMasa(id) {
    delete this.data.masaOverrides[id];
    this.save();
  },

  /* ---- recetas ---- */
  recipe(id) { return this.data.recipes.find(r => r.id === id) || null; },

  saveRecipe(rec) {
    normalizeRecipe(rec);
    const i = this.data.recipes.findIndex(r => r.id === rec.id);
    if (i >= 0) this.data.recipes[i] = rec; else this.data.recipes.unshift(rec);
    this.save();
    return rec;
  },

  removeRecipe(id) {
    this.data.recipes = this.data.recipes.filter(r => r.id !== id);
    this.save();
  },

  /** El sello marca "la he hecho y me sale perfecta" — a diferencia de la
      duda, vive solo a nivel de receta entera, no por ingrediente o paso. */
  toggleSello(id) {
    const rec = this.recipe(id);
    if (!rec) return;
    rec.sello = !rec.sello;
    this.save();
    return rec.sello;
  },

  blankRecipe() {
    return {
      id: uid(), name: '', icon: 'plato', cat: 'Principal', diff: 'Fácil',
      time: 30, portions: 2, items: [], steps: [{ t: '', q: null }], notes: '', q: null,
      glass: null, sello: false
    };
  },

  /* ---- lista de compras ----
     Un ítem referencia un ingrediente de la despensa (ing) para heredar su
     categoría/icono, o lleva un name suelto cuando es algo que no está en la
     despensa (p.ej. "bolsas de basura"). Si ya hay un ítem sin marcar con el
     mismo ingrediente/nombre y unidad, se suma la cantidad en vez de duplicar
     la fila — salvo que alguna de las dos sea null (p.ej. "al gusto"), donde
     sumar no tiene sentido y se deja como estaba. */
  addShoppingItem({ ing = null, name = '', qty = null, unit = 'ud' } = {}) {
    const cleanName = (name || '').trim();
    if (!ing && !cleanName) return null;
    const num = (qty === null || qty === '' || qty === undefined) ? null : Number(qty);
    const existing = this.data.shopping.find(s => !s.checked && s.unit === unit &&
      (ing ? s.ing === ing : (!s.ing && s.name.toLowerCase() === cleanName.toLowerCase())));
    if (existing) {
      existing.qty = (existing.qty === null || num === null) ? (existing.qty ?? num) : existing.qty + num;
      this.save();
      return existing;
    }
    const item = { id: uid(), ing, name: cleanName, qty: num, unit: unit || 'ud', checked: false };
    this.data.shopping.push(item);
    this.save();
    return item;
  },

  /** Suma todos los ingredientes de una receta a la lista. Devuelve cuántas líneas tocó. */
  addRecipeToShopping(recipeId) {
    const rec = this.recipe(recipeId);
    if (!rec) return 0;
    rec.items.forEach(it => this.addShoppingItem({ ing: it.ing, qty: it.qty, unit: it.unit }));
    return rec.items.length;
  },

  toggleShoppingItem(id) {
    const it = this.data.shopping.find(s => s.id === id);
    if (!it) return;
    it.checked = !it.checked;
    this.save();
  },

  removeShoppingItem(id) {
    this.data.shopping = this.data.shopping.filter(s => s.id !== id);
    this.save();
  },

  clearCheckedShopping() {
    this.data.shopping = this.data.shopping.filter(s => !s.checked);
    this.save();
  },

  clearShoppingList() {
    this.data.shopping = [];
    this.save();
  },

  /* ---- import / export ---- */
  exportJSON() {
    return JSON.stringify({ app: 'nomcraft', v: 1, ...this.data }, null, 2);
  },

  importJSON(text, mode = 'merge') {
    const parsed = JSON.parse(text);
    const ings = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
    const recs = Array.isArray(parsed.recipes) ? parsed.recipes : [];
    const masaOv = (parsed.masaOverrides && typeof parsed.masaOverrides === 'object')
      ? parsed.masaOverrides : {};
    const shopping = Array.isArray(parsed.shopping) ? parsed.shopping : [];
    if (mode === 'replace') {
      this.data.ingredients = ings;
      this.data.recipes = recs;
      this.data.masaOverrides = masaOv;
      this.data.shopping = shopping;
    } else {
      const known = new Set(this.data.ingredients.map(i => i.id));
      ings.forEach(i => { if (!known.has(i.id)) this.data.ingredients.push(i); });
      const knownR = new Set(this.data.recipes.map(r => r.id));
      recs.forEach(r => { if (!knownR.has(r.id)) this.data.recipes.push(r); });
      Object.assign(this.data.masaOverrides, masaOv);
      const knownS = new Set(this.data.shopping.map(s => s.id));
      shopping.forEach(s => { if (!knownS.has(s.id)) this.data.shopping.push(s); });
    }
    this.data.recipes.forEach(normalizeRecipe);
    this.sortIngredients();
    this.save();
    return { ings: ings.length, recs: recs.length };
  },

  /* ---- semilla inicial ---- */
  seed() {
    const base = [
      ['Aceite de oliva', 'Salsa', 'cda'],
      ['Aceitunas negras', 'Otro', 'g'],
      ['Agua', 'Otro', 'ml'],
      ['Agua con gas', 'Otro', 'ml'],
      ['Aguacate', 'Fruta', 'ud'],
      ['Ajo', 'Verdura', 'diente'],
      ['Albahaca', 'Especia', 'hoja'],
      ['Almendras', 'Fruta', 'g'],
      ['Angostura', 'Especia', 'al gusto'],
      ['Arroz', 'Cereal', 'g'],
      ['Azafrán', 'Especia', 'al gusto'],
      ['Azúcar', 'Otro', 'g'],
      ['Berenjena', 'Verdura', 'ud'],
      ['Brandy', 'Otro', 'ml'],
      ['Calabacín', 'Verdura', 'ud'],
      ['Caldo', 'Otro', 'ml'],
      ['Canela', 'Especia', 'rama'],
      ['Carne picada', 'Carne', 'g'],
      ['Cava', 'Otro', 'ml'],
      ['Cebolla', 'Verdura', 'ud'],
      ['Cerveza', 'Otro', 'ml'],
      ['Champiñones', 'Verdura', 'g'],
      ['Choclo', 'Verdura', 'g'],
      ['Chocolate en polvo', 'Otro', 'g'],
      ['Chocolate negro', 'Otro', 'g'],
      ['Cilantro', 'Especia', 'hoja'],
      ['Comino', 'Especia', 'cdta'],
      ['Espaguetis', 'Cereal', 'g'],
      ['Espinaca', 'Verdura', 'g'],
      ['Fresa', 'Fruta', 'g'],
      ['Galletas', 'Otro', 'g'],
      ['Garbanzos', 'Legumbre', 'g'],
      ['Ginebra', 'Otro', 'ml'],
      ['Guindilla', 'Especia', 'ud'],
      ['Harina', 'Cereal', 'g'],
      ['Hielo', 'Otro', 'al gusto'],
      ['Huesillos', 'Fruta', 'g'],
      ['Huevo', 'Otro', 'ud'],
      ['Jamón', 'Carne', 'g'],
      ['Judía verde', 'Legumbre', 'g'],
      ['Leche', 'Lácteo', 'ml'],
      ['Lechuga', 'Verdura', 'ud'],
      ['Lentejas', 'Legumbre', 'g'],
      ['Licor de limón', 'Otro', 'ml'],
      ['Lima', 'Fruta', 'ud'],
      ['Limón', 'Fruta', 'ud'],
      ['Maicena', 'Cereal', 'g'],
      ['Mantequilla', 'Lácteo', 'g'],
      ['Manzana', 'Fruta', 'ud'],
      ['Menta', 'Especia', 'hoja'],
      ['Merluza', 'Pescado', 'g'],
      ['Mostaza', 'Salsa', 'cdta'],
      ['Mote', 'Cereal', 'g'],
      ['Naranja', 'Fruta', 'ud'],
      ['Nata', 'Lácteo', 'ml'],
      ['Nuez moscada', 'Especia', 'pizca'],
      ['Pan', 'Cereal', 'ud'],
      ['Pan rallado', 'Cereal', 'g'],
      ['Pasas', 'Fruta', 'g'],
      ['Papa', 'Verdura', 'ud'],
      ['Pepino', 'Verdura', 'ud'],
      ['Perejil', 'Especia', 'hoja'],
      ['Pimentón', 'Especia', 'cdta'],
      ['Pimienta negra', 'Especia', 'pizca'],
      ['Pimiento', 'Verdura', 'ud'],
      ['Plátano', 'Fruta', 'ud'],
      ['Pollo', 'Carne', 'g'],
      ['Porotos', 'Legumbre', 'g'],
      ['Queso crema', 'Lácteo', 'g'],
      ['Queso parmesano', 'Lácteo', 'g'],
      ['Ron blanco', 'Otro', 'ml'],
      ['Sal', 'Especia', 'pizca'],
      ['Salmón', 'Pescado', 'g'],
      ['Salsa inglesa', 'Salsa', 'cdta'],
      ['Salsa picante', 'Salsa', 'al gusto'],
      ['Tequila', 'Otro', 'ml'],
      ['Tomate', 'Verdura', 'ud'],
      ['Tónica', 'Otro', 'ml'],
      ['Triple seco', 'Otro', 'ml'],
      ['Vinagre', 'Salsa', 'ml'],
      ['Vino blanco', 'Otro', 'ml'],
      ['Vino tinto', 'Otro', 'ml'],
      ['Vodka', 'Otro', 'ml'],
      ['Whisky', 'Otro', 'ml'],
      ['Zanahoria', 'Verdura', 'ud'],
      ['Zapallo', 'Verdura', 'g'],
      ['Zumo de naranja', 'Otro', 'ml'],
      ['Apio', 'Verdura', 'rama'],
      ['Bulgur', 'Cereal', 'g'],
      ['Concentrado de tomate', 'Otro', 'cda'],
      ['Guisantes', 'Legumbre', 'g'],
      ['Laurel', 'Especia', 'hoja'],
      ['Mayonesa', 'Salsa', 'cda'],
      ['Nueces', 'Fruta', 'g'],
      ['Orégano', 'Especia', 'cdta'],
      ['Pasta fettuccine', 'Cereal', 'g'],
      ['Pepinillos', 'Otro', 'g'],
      ['Queso feta', 'Lácteo', 'g'],
      ['Queso mozzarella', 'Lácteo', 'g'],
      ['Tomillo', 'Especia', 'rama'],
      ['Achiote', 'Especia', 'cda'],
      ['Alubias blancas', 'Legumbre', 'g'],
      ['Anchoas', 'Pescado', 'g'],
      ['Atún en lata', 'Pescado', 'g'],
      ['Azúcar moreno', 'Otro', 'g'],
      ['Bizcochos de soletilla', 'Otro', 'ud'],
      ['Cachaça', 'Otro', 'ml'],
      ['Café', 'Otro', 'ml'],
      ['Camarones', 'Pescado', 'g'],
      ['Camote', 'Verdura', 'ud'],
      ['Campari', 'Otro', 'ml'],
      ['Carne de cerdo', 'Carne', 'g'],
      ['Cerveza de jengibre', 'Otro', 'ml'],
      ['Chalota', 'Verdura', 'ud'],
      ['Chancaca', 'Otro', 'g'],
      ['Chile guajillo', 'Especia', 'ud'],
      ['Chile verde', 'Especia', 'ud'],
      ['Chorizo', 'Carne', 'g'],
      ['Coco rallado', 'Fruta', 'g'],
      ['Crema de coco', 'Otro', 'ml'],
      ['Curry en polvo', 'Especia', 'cdta'],
      ['Estragón', 'Especia', 'rama'],
      ['Fideos finos', 'Cereal', 'g'],
      ['Flor de jamaica', 'Especia', 'g'],
      ['Fusilli', 'Cereal', 'g'],
      ['Gaseosa de limón', 'Otro', 'ml'],
      ['Gelatina en polvo', 'Otro', 'g'],
      ['Granadina', 'Otro', 'ml'],
      ['Helado de piña', 'Otro', 'ud'],
      ['Ketchup', 'Salsa', 'g'],
      ['Láminas de lasaña', 'Cereal', 'ud'],
      ['Leche condensada', 'Lácteo', 'ml'],
      ['Leche de coco', 'Otro', 'ml'],
      ['Leche evaporada', 'Lácteo', 'ml'],
      ['Levadura', 'Otro', 'cdta'],
      ['Manjar', 'Lácteo', 'g'],
      ['Marisco variado', 'Pescado', 'g'],
      ['Mascarpone', 'Lácteo', 'g'],
      ['Mirin', 'Otro', 'ml'],
      ['Morcilla', 'Carne', 'g'],
      ['Panceta', 'Carne', 'g'],
      ['Piña', 'Fruta', 'g'],
      ['Piñones', 'Fruta', 'g'],
      ['Pisco', 'Otro', 'ml'],
      ['Quinoa', 'Cereal', 'g'],
      ['Queso azul', 'Lácteo', 'g'],
      ['Repollo', 'Verdura', 'g'],
      ['Ricotta', 'Lácteo', 'g'],
      ['Sake', 'Otro', 'ml'],
      ['Salsa de soja', 'Salsa', 'ml'],
      ['Tomatillo', 'Verdura', 'ud'],
      ['Tortilla de maíz', 'Cereal', 'ud'],
      ['Vainilla', 'Especia', 'al gusto'],
      ['Vermut rojo', 'Otro', 'ml'],
      ['Zumaque', 'Especia', 'cdta'],
      ['Zumo de arándano', 'Otro', 'ml'],
      ['Zumo de piña', 'Otro', 'ml'],
      ['Zumo de tomate', 'Otro', 'ml'],
    ];
    this.data.ingredients = base.map(([name, cat, unit]) => ({
      id: uid(), name, cat, unit, icon: guessIcon(name)
    }));
    this.sortIngredients();

    const find = n => this.data.ingredients.find(i => i.name === n).id;
    this.data.recipes = [
      {
        id: uid(), name: 'Tomates al horno', icon: 'tomate', cat: 'Entrante',
        diff: 'Fácil', time: 35, portions: 2,
        items: [
          { ing: find('Tomate'), qty: 4, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: 2, unit: 'cda' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Albahaca'), qty: 6, unit: 'hoja' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Precalienta el horno a 180 °C.',
          'Corta los tomates por la mitad y colócalos en una bandeja con el corte hacia arriba.',
          'Pica el ajo muy fino y repártelo por encima. Riega con el aceite y sala.',
          'Hornea 30 minutos hasta que los bordes se doren.',
          'Añade la albahaca fresca justo al sacarlos.'
        ],
        notes: 'Aguantan 3 días en la nevera y mejoran al día siguiente.'
      },

      /* ---- cocina ---- */
      {
        id: uid(), name: 'Tortilla de Papas', icon: 'huevo', cat: 'Principal',
        diff: 'Media', time: 45, portions: 4,
        items: [
          { ing: find('Papa'), qty: 800, unit: 'g' },
          { ing: find('Huevo'), qty: 6, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: 300, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pela las papas y córtalas en láminas finas; la cebolla en juliana fina.',
          'Ponlas a confitar juntas en el aceite a fuego suave, 20-25 minutos, hasta que estén tiernas sin dorarse.',
          'Escurre bien el aceite y resérvalo — te sirve para otra tortilla.',
          'Bate los huevos con sal y mézclalos con las papas templadas.',
          'Cuaja la mezcla en una sartén antiadherente con un poco del aceite reservado, a fuego medio.',
          'Dale la vuelta con un plato cuando el borde esté cuajado y el centro aún jugoso, y termina de cuajar por el otro lado.'
        ],
        notes: 'Jugosa o cuajada es cuestión de gustos: para jugosa, menos tiempo en la sartén tras la vuelta.'
      },
      {
        id: uid(), name: 'Gazpacho', icon: 'tomate', cat: 'Entrante',
        diff: 'Fácil', time: 20, portions: 4,
        items: [
          { ing: find('Tomate'), qty: 1, unit: 'kg' },
          { ing: find('Pimiento'), qty: 1, unit: 'ud' },
          { ing: find('Pepino'), qty: 1, unit: 'ud' },
          { ing: find('Cebolla'), qty: 0.5, unit: 'ud' },
          { ing: find('Ajo'), qty: 1, unit: 'diente' },
          { ing: find('Aceite de oliva'), qty: 60, unit: 'ml' },
          { ing: find('Vinagre'), qty: 30, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Trocea todas las verduras, quitando las semillas del pimiento y el pepino.',
          'Tritura todo junto con el aceite, el vinagre y la sal hasta que quede muy fino.',
          'Cuela con un colador fino si te gusta sin pieles ni pepitas.',
          'Enfría en la nevera un mínimo de 2 horas.',
          'Rectifica de sal y vinagre antes de servir: el frío apaga los sabores.'
        ],
        notes: 'Se conserva 3-4 días en la nevera, bien tapado.'
      },
      {
        id: uid(), name: 'Ajoblanco', icon: 'plato', cat: 'Entrante',
        diff: 'Fácil', time: 20, portions: 4,
        items: [
          { ing: find('Pan'), qty: 150, unit: 'g' },
          { ing: find('Almendras'), qty: 150, unit: 'g' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Aceite de oliva'), qty: 100, unit: 'ml' },
          { ing: find('Vinagre'), qty: 30, unit: 'ml' },
          { ing: find('Agua'), qty: 500, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pon el pan a remojo en agua unos 15 minutos y escúrrelo bien.',
          'Tritura las almendras con el ajo hasta conseguir una pasta fina.',
          'Añade el pan escurrido y sigue triturando.',
          'Incorpora el aceite en hilo, sin dejar de triturar, como si montaras una mayonesa.',
          'Añade el vinagre, la sal y el agua necesaria hasta conseguir la textura de una crema ligera.',
          'Cuela si quieres que quede más fino, y enfría en la nevera un mínimo de 2 horas.'
        ],
        notes: 'Se sirve tradicionalmente con unas uvas o taquitos de melón por encima — el contraste dulce es parte de la gracia.'
      },
      {
        id: uid(), name: 'Pollo al ajo', icon: 'carne', cat: 'Principal',
        diff: 'Fácil', time: 35, portions: 4,
        items: [
          { ing: find('Pollo'), qty: 800, unit: 'g' },
          { ing: find('Ajo'), qty: 8, unit: 'diente' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Vino blanco'), qty: 100, unit: 'ml' },
          { ing: find('Perejil'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Salpimenta el pollo troceado y dóralo en el aceite bien caliente por todos los lados.',
          'Añade los ajos con piel, ligeramente machacados, y baja el fuego.',
          'Deja que los ajos se doren despacio junto al pollo, removiendo de vez en cuando.',
          'Sube el fuego, añade el vino blanco y deja que reduzca un par de minutos.',
          'Espolvorea con perejil picado antes de servir.'
        ],
        notes: 'Los ajos con piel se ablandan y se comen untados, casi confitados.'
      },
      {
        id: uid(), name: 'Guacamole', icon: 'plato', cat: 'Entrante',
        diff: 'Fácil', time: 15, portions: 4,
        items: [
          { ing: find('Aguacate'), qty: 3, unit: 'ud' },
          { ing: find('Tomate'), qty: 1, unit: 'ud' },
          { ing: find('Cebolla'), qty: 0.25, unit: 'ud' },
          { ing: find('Lima'), qty: 1, unit: 'ud' },
          { ing: find('Cilantro'), qty: null, unit: 'al gusto' },
          { ing: find('Guindilla'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Machaca la pulpa del aguacate con un tenedor, hasta la textura que más te guste.',
          'Pica muy fino el tomate, la cebolla y la guindilla, y añádelos.',
          'Exprime la lima por encima y mezcla.',
          'Añade cilantro picado y sal al gusto.',
          'Sirve enseguida: el aguacate se oxida rápido.'
        ],
        notes: 'Guardar el hueso del aguacate dentro del bol ralentiza un poco la oxidación, pero no la evita del todo.'
      },
      {
        id: uid(), name: 'Flan de huevo', icon: 'pastel', cat: 'Postre',
        diff: 'Media', time: 60, portions: 6,
        items: [
          { ing: find('Huevo'), qty: 4, unit: 'ud' },
          { ing: find('Leche'), qty: 500, unit: 'ml' },
          { ing: find('Azúcar'), qty: 150, unit: 'g' },
          { ing: find('Limón'), qty: 1, unit: 'ud' }
        ],
        steps: [
          'Reparte un tercio del azúcar en los moldes y caramelízalo directamente al fuego, con cuidado de no quemarlo.',
          'Bate los huevos con el resto del azúcar.',
          'Calienta la leche con la piel del limón sin que llegue a hervir, y retira la piel.',
          'Mezcla la leche templada con los huevos batidos, poco a poco y sin dejar de remover.',
          'Reparte en los moldes ya caramelizados y cuece al baño maría en el horno a 160 °C, 40-45 minutos.',
          'Deja enfriar y refrigera un mínimo de 4 horas antes de desmoldar.'
        ],
        notes: 'Está en su punto cuando, al mover el molde, el centro tiembla pero ya no está líquido.'
      },
      {
        id: uid(), name: 'Alioli', icon: 'ajo', cat: 'Salsa',
        diff: 'Fácil', time: 10, portions: 4,
        items: [
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Aceite de oliva'), qty: 200, unit: 'ml' },
          { ing: find('Huevo'), qty: 1, unit: 'ud' },
          { ing: find('Limón'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pon el ajo, el huevo y la sal en el vaso de la batidora.',
          'Añade el aceite y deja reposar unos segundos sin batir, para que el huevo quede abajo.',
          'Introduce la batidora hasta el fondo y empieza a batir sin mover, hasta que emulsione.',
          'Cuando empiece a ligar, ve subiendo la batidora despacio para integrar el resto del aceite.',
          'Ajusta de sal y unas gotas de limón al final.'
        ],
        notes: 'Con huevo es más estable y perdona mejor los fallos que el alioli tradicional solo con ajo y aceite.'
      },
      {
        id: uid(), name: 'Fabada asturiana', icon: 'legumbre', cat: 'Principal',
        diff: 'Media', time: 150, portions: 6,
        items: [
          { ing: find('Alubias blancas'), qty: 500, unit: 'g' },
          { ing: find('Chorizo'), qty: 200, unit: 'g' },
          { ing: find('Morcilla'), qty: 150, unit: 'g' },
          { ing: find('Panceta'), qty: 150, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Laurel'), qty: 1, unit: 'hoja' },
          { ing: find('Azafrán'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Deja las alubias en remojo con agua fría toda la noche, para que se hidraten bien y no se rompan al cocer.',
          'Escurre las alubias y ponlas en una olla amplia junto al chorizo, la morcilla, la panceta, la cebolla entera pelada, los ajos y el laurel. Cubre con agua fría, sin sal todavía.',
          'Lleva a hervor a fuego medio y retira con espumadera la espuma que suba a la superficie.',
          'Baja el fuego al mínimo y deja cocer tapado, muy suave, durante unas 2 horas. Si hierve fuerte las alubias se rompen — el punto justo es asustarlas de vez en cuando con un chorrito de agua fría.',
          'Cuando las alubias estén tiernas, saca un cucharón, tritúralo y devuélvelo a la olla — esto espesa el caldo sin necesidad de harina.',
          'Añade el azafrán disuelto en un poco de caldo caliente, rectifica de sal y deja reposar unos minutos antes de servir.'
        ],
        notes: 'La fabada gana con el reposo: muchos asturianos dicen que sabe mejor al día siguiente, recalentada muy despacio.'
      },
      {
        id: uid(), name: 'Fideuá', icon: 'pescado', cat: 'Principal',
        diff: 'Media', time: 45, portions: 4,
        items: [
          { ing: find('Fideos finos'), qty: 300, unit: 'g' },
          { ing: find('Marisco variado'), qty: 400, unit: 'g' },
          { ing: find('Tomate'), qty: 2, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Caldo'), qty: 750, unit: 'ml' },
          { ing: find('Azafrán'), qty: null, unit: 'al gusto' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Calienta el caldo aparte y mantenlo hirviendo suave — nunca lo añadas frío, o corta la cocción de golpe.',
          'En una paellera o sartén ancha, dora el marisco en el aceite hasta que tome color y retíralo.',
          'En el mismo aceite, sofríe la cebolla y el ajo picados finos hasta que estén tiernos, y añade el tomate rallado hasta que pierda el agua.',
          'Incorpora el pimentón, remueve un segundo para que no se queme y añade enseguida los fideos, tostándolos removiendo un par de minutos — este tueste es lo que le da su sabor a la fideuá.',
          'Vierte el caldo caliente con el azafrán y reparte los fideos en una capa pareja. A partir de aquí no vuelvas a remover.',
          'Cocina a fuego vivo unos 10 minutos, reparte el marisco por encima, baja el fuego y deja 5-6 minutos más, hasta que el caldo se haya evaporado casi del todo.',
          'Deja reposar 5 minutos fuera del fuego antes de servir, idealmente con alioli aparte.'
        ],
        notes: 'La señal de que está en su punto es el socarrat del fondo, igual que en la paella: un fideo bien tostado pegado a la sartén.'
      },
      {
        id: uid(), name: 'Tacos al pastor', icon: 'carne', cat: 'Principal',
        diff: 'Media', time: 45, portions: 4,
        items: [
          { ing: find('Carne de cerdo'), qty: 600, unit: 'g' },
          { ing: find('Chile guajillo'), qty: 3, unit: 'ud' },
          { ing: find('Achiote'), qty: 2, unit: 'cda' },
          { ing: find('Piña'), qty: 200, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Vinagre'), qty: 2, unit: 'cda' },
          { ing: find('Cilantro'), qty: null, unit: 'al gusto' },
          { ing: find('Tortilla de maíz'), qty: 12, unit: 'ud' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Remoja los chiles guajillo en agua caliente 10 minutos hasta que se ablanden, y lícualos con el achiote, un trozo de piña, la mitad de la cebolla, el ajo, el vinagre y sal, hasta lograr una pasta fina.',
          'Corta la carne en filetes delgados y báñala bien con el adobo por todos lados. Tapa y deja marinar en la nevera al menos 4 horas, mejor toda la noche — es lo que da el color y el sabor característicos.',
          'Corta el resto de la piña en dados pequeños y pica la cebolla y el cilantro que falten, para el acompañamiento.',
          'Cocina la carne marinada en una sartén o plancha muy caliente, por tandas, hasta que se dore bien por fuera y quede jugosa por dentro. Pica en trozos pequeños.',
          'Calienta las tortillas de maíz en una sartén seca hasta que estén flexibles.',
          'Rellena cada tortilla con la carne, corona con piña, cebolla y cilantro picados, y un chorrito de limón.'
        ],
        notes: 'En las taquerías la carne se asa en un trompo vertical con un trozo de piña goteando encima mientras gira — en casa, la plancha bien caliente y la piña picada aparte dan un resultado muy parecido.'
      },
      {
        id: uid(), name: 'Enchiladas verdes', icon: 'chile', cat: 'Principal',
        diff: 'Media', time: 50, portions: 4,
        items: [
          { ing: find('Tomatillo'), qty: 500, unit: 'g' },
          { ing: find('Pollo'), qty: 400, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Guindilla'), qty: 1, unit: 'ud' },
          { ing: find('Cilantro'), qty: null, unit: 'al gusto' },
          { ing: find('Tortilla de maíz'), qty: 8, unit: 'ud' },
          { ing: find('Nata'), qty: 100, unit: 'ml' },
          { ing: find('Queso crema'), qty: 100, unit: 'g' },
          { ing: find('Caldo'), qty: 100, unit: 'ml' },
          { ing: find('Aceite de oliva'), qty: 2, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece el pollo en agua con un trozo de cebolla y un diente de ajo hasta que esté hecho, unos 20 minutos. Desmenúzalo cuando se entibie.',
          'Hierve los tomatillos con el resto de la cebolla, el ajo y la guindilla durante 6-7 minutos, hasta que los tomatillos cambien de color y se ablanden.',
          'Licúa los tomatillos escurridos con el cilantro y un poco de caldo, hasta obtener una salsa lisa. Cocínala unos minutos en una sartén con el aceite para que pierda el sabor a crudo.',
          'Pasa cada tortilla por la salsa caliente para que se impregne por los dos lados, sin dejarla tanto tiempo que se rompa.',
          'Rellena cada tortilla con el pollo desmenuzado, enróllala y colócala en la fuente con el cierre hacia abajo.',
          'Cubre todas las enchiladas con el resto de la salsa, la nata y el queso crema, y sirve enseguida antes de que la tortilla se ablande demasiado.'
        ],
        notes: 'El tomatillo no es un tomate sin madurar, sino una fruta distinta de cáscara papel — su acidez es la que le da a la salsa ese punto fresco tan característico.'
      },
      {
        id: uid(), name: 'Risotto de champiñones', icon: 'seta', cat: 'Principal',
        diff: 'Media', time: 35, portions: 4,
        items: [
          { ing: find('Arroz'), qty: 320, unit: 'g' },
          { ing: find('Champiñones'), qty: 300, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 1, unit: 'diente' },
          { ing: find('Caldo'), qty: 1, unit: 'l' },
          { ing: find('Vino blanco'), qty: 100, unit: 'ml' },
          { ing: find('Mantequilla'), qty: 40, unit: 'g' },
          { ing: find('Queso parmesano'), qty: 60, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 2, unit: 'cda' },
          { ing: find('Perejil'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Calienta el caldo en una olla aparte y mantenlo siempre hirviendo suave — el arroz debe recibirlo caliente, nunca frío.',
          'Sofríe la cebolla picada fina en el aceite y la mitad de la mantequilla hasta que esté transparente, sin dejar que se dore.',
          'Añade los champiñones laminados y el ajo, y cocina a fuego medio-alto hasta que suelten el agua y tomen algo de color.',
          'Incorpora el arroz y tuéstalo removiendo 1-2 minutos, hasta que los granos se vean nacarados y algo translúcidos por los bordes.',
          'Sube el fuego, añade el vino blanco y deja que se evapore removiendo, hasta que no huela a alcohol crudo.',
          'Añade el caldo caliente de a poco, un cucharón cada vez, sin dejar de remover y esperando a que el arroz absorba cada tanda antes de la siguiente. Repite durante 16-18 minutos.',
          'Retira del fuego cuando el arroz esté al dente y el conjunto quede meloso. Añade la mantequilla restante y el parmesano, y remueve con energía fuera del fuego — esta mantecatura es la que da la cremosidad final.',
          'Deja reposar un minuto tapado, espolvorea perejil picado y sirve enseguida, porque el risotto no espera a nadie.'
        ],
        notes: 'El arroz ideal para risotto es uno con mucho almidón, como el arborio o el carnaroli — ese almidón liberado al remover es lo que crea la cremosidad, sin necesidad de nata.'
      },
      {
        id: uid(), name: 'Lasaña a la boloñesa', icon: 'queso', cat: 'Principal',
        diff: 'Media', time: 90, portions: 6,
        items: [
          { ing: find('Láminas de lasaña'), qty: 12, unit: 'ud' },
          { ing: find('Carne picada'), qty: 500, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Zanahoria'), qty: 1, unit: 'ud' },
          { ing: find('Apio'), qty: 1, unit: 'rama' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Concentrado de tomate'), qty: 3, unit: 'cda' },
          { ing: find('Vino tinto'), qty: 100, unit: 'ml' },
          { ing: find('Mantequilla'), qty: 50, unit: 'g' },
          { ing: find('Harina'), qty: 50, unit: 'g' },
          { ing: find('Leche'), qty: 600, unit: 'ml' },
          { ing: find('Nuez moscada'), qty: 1, unit: 'pizca' },
          { ing: find('Queso parmesano'), qty: 80, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 2, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pica la cebolla, la zanahoria, el apio y el ajo bien finos, y sofríelos en el aceite a fuego bajo hasta que estén tiernos, unos 10 minutos.',
          'Sube el fuego, añade la carne picada y desmenúzala bien mientras se dora, hasta que no quede nada de color rosado.',
          'Añade el vino tinto y deja que se evapore. Incorpora el concentrado de tomate, un poco de agua y sal. Tapa y cuece a fuego muy bajo al menos 40 minutos, removiendo de vez en cuando — cuanto más lenta y larga la cocción, mejor sabe la boloñesa.',
          'Para la bechamel, derrite la mantequilla en un cazo, añade la harina y cocina un minuto sin dejar de remover, hasta formar una pasta.',
          'Vierte la leche poco a poco sin dejar de batir, para que no se formen grumos, y cocina a fuego bajo hasta que espese. Sazona con sal y nuez moscada.',
          'En una fuente de horno, pon una capa fina de bechamel en el fondo, luego láminas de lasaña, una capa de boloñesa y otra de bechamel. Repite el orden hasta terminar los ingredientes, dejando bechamel para cubrir la última capa.',
          'Espolvorea el parmesano por encima y hornea a 200°C durante 25-30 minutos, hasta que la superficie esté dorada y burbujeante.',
          'Deja reposar 10 minutos fuera del horno antes de cortar — así las capas no se desarman al servir.'
        ],
        notes: 'En Bolonia la salsa lleva también un chorrito de leche al final de su cocción, para suavizar la acidez del tomate — un truco que muchas recetas fuera de Italia se saltan.'
      },
      {
        id: uid(), name: 'Chupe de camarones', icon: 'pescado', cat: 'Principal',
        diff: 'Media', time: 40, portions: 4,
        items: [
          { ing: find('Camarones'), qty: 500, unit: 'g' },
          { ing: find('Pan'), qty: 2, unit: 'ud' },
          { ing: find('Leche'), qty: 300, unit: 'ml' },
          { ing: find('Nata'), qty: 100, unit: 'ml' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Pimiento'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Vino blanco'), qty: 100, unit: 'ml' },
          { ing: find('Queso parmesano'), qty: 80, unit: 'g' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Aceite de oliva'), qty: 2, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pela los camarones y reserva las cáscaras y cabezas. Si tienes tiempo, hiérvelas unos minutos en agua para hacer un caldo corto — le da mucho más fondo al chupe.',
          'Corta el pan en trozos y déjalo remojar en la leche hasta que quede bien empapado.',
          'Sofríe la cebolla y el pimiento picados finos en el aceite hasta que estén tiernos, añade el ajo y el pimentón, y remueve un momento para que no se queme.',
          'Añade los camarones y saltea un par de minutos, solo hasta que cambien de color por fuera.',
          'Vierte el vino blanco y deja que se evapore el alcohol.',
          'Licúa el pan remojado con la nata hasta formar una crema lisa, e incorpórala a la sartén junto con un poco del caldo de cáscaras si lo preparaste.',
          'Cocina a fuego bajo removiendo, hasta que espese a textura de crema. Rectifica de sal.',
          'Reparte en cazuelas individuales, cubre con el queso parmesano y gratina en el horno unos minutos hasta que la superficie se dore.'
        ],
        notes: 'Lo que distingue a la versión chilena de otros chupes sudamericanos es justamente el pan remojado en leche como espesante, en vez de arroz o harina — le da una cremosidad muy particular.'
      },
      {
        id: uid(), name: 'Pastel de papas', icon: 'pastel', cat: 'Principal',
        diff: 'Fácil', time: 60, portions: 6,
        items: [
          { ing: find('Papa'), qty: 1000, unit: 'g' },
          { ing: find('Carne picada'), qty: 400, unit: 'g' },
          { ing: find('Cebolla'), qty: 2, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Aceitunas negras'), qty: 8, unit: 'ud' },
          { ing: find('Huevo'), qty: 2, unit: 'ud' },
          { ing: find('Leche'), qty: 100, unit: 'ml' },
          { ing: find('Mantequilla'), qty: 50, unit: 'g' },
          { ing: find('Comino'), qty: 1, unit: 'cdta' },
          { ing: find('Azúcar'), qty: 1, unit: 'cdta' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece los huevos hasta que estén duros, unos 10 minutos, enfríalos y córtalos en rodajas.',
          'Pela y cuece las papas en agua con sal hasta que estén blandas. Escúrrelas y hazlas puré con la leche y la mantequilla, batiendo hasta que quede suave.',
          'Para el pino, sofríe una cebolla picada y el ajo hasta que estén transparentes, añade la carne picada y el comino, y cocina hasta que la carne esté hecha. Sazona con sal.',
          'En una fuente de horno, extiende una base de puré, cubre con el pino de carne y reparte las aceitunas y las rodajas de huevo duro.',
          'Cubre todo con el resto del puré, alisando bien la superficie con un tenedor para que se dore de forma pareja.',
          'Espolvorea con un poco de azúcar por encima — es lo que da esa costra ligeramente caramelizada, típica de este plato.',
          'Hornea a 200°C durante 20-25 minutos, hasta que la superficie esté dorada.'
        ],
        notes: 'Es primo directo del pastel de choclo, pero con puré de papa en vez de crema de choclo — igual de casero, y se sirve bien caliente en la misma fuente donde se horneó.'
      },
      {
        id: uid(), name: 'Berenjenas rellenas', icon: 'tomate', cat: 'Entrante',
        diff: 'Fácil', time: 50, portions: 4,
        items: [
          { ing: find('Berenjena'), qty: 2, unit: 'ud' },
          { ing: find('Carne picada'), qty: 200, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Tomate'), qty: 2, unit: 'ud' },
          { ing: find('Queso mozzarella'), qty: 100, unit: 'g' },
          { ing: find('Pan rallado'), qty: 2, unit: 'cda' },
          { ing: find('Orégano'), qty: 1, unit: 'cdta' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta las berenjenas por la mitad a lo largo, haz unos cortes en cruz en la pulpa sin llegar a la piel, riega con un poco de aceite y ásalas en el horno a 200°C durante 25-30 minutos, hasta que estén tiernas.',
          'Deja templar y, con una cuchara, vacía con cuidado la pulpa dejando la piel entera como un barquito. Pica la pulpa que has sacado.',
          'Sofríe la cebolla y el ajo en el aceite restante hasta que estén tiernos, añade la carne picada y dórala.',
          'Incorpora el tomate picado y la pulpa de berenjena reservada, y cocina a fuego medio unos 10 minutos, hasta que espese y no quede agua suelta. Sazona con el orégano y sal.',
          'Rellena las pieles de berenjena con esta mezcla, presionando un poco.',
          'Cubre cada mitad con el queso mozzarella y el pan rallado, y vuelve a hornear 10 minutos más, hasta que el queso gratine y se dore.'
        ],
        notes: 'Puedes saltarte la carne y rellenarlas solo con más verdura salteada (pimiento, champiñones) para una versión vegetariana igual de sabrosa.'
      },
      {
        id: uid(), name: 'Arroz a la cubana', icon: 'arroz', cat: 'Principal',
        diff: 'Fácil', time: 30, portions: 4,
        items: [
          { ing: find('Arroz'), qty: 300, unit: 'g' },
          { ing: find('Huevo'), qty: 4, unit: 'ud' },
          { ing: find('Plátano'), qty: 4, unit: 'ud' },
          { ing: find('Tomate'), qty: 4, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Orégano'), qty: 1, unit: 'cdta' },
          { ing: find('Azúcar'), qty: 1, unit: 'cdta' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Para el arroz blanco, dora un diente de ajo laminado en un poco de aceite, añade el arroz y remuévelo un minuto para que se impregne.',
          'Cubre con agua fría, en proporción de unas 2 partes de agua por cada parte de arroz, sazona con sal y cuece tapado a fuego bajo hasta que absorba el líquido y quede suelto, unos 18 minutos.',
          'Para la salsa, sofríe la cebolla picada y el otro diente de ajo en aceite hasta que se doren.',
          'Añade el tomate picado, el orégano y el azúcar, y cocina a fuego bajo 15-20 minutos, hasta lograr una salsa espesa y de sabor concentrado.',
          'Pela los plátanos, córtalos por la mitad a lo largo y fríelos en aceite caliente hasta que se doren por ambos lados.',
          'Fríe los huevos en el mismo aceite, dejando la yema líquida.',
          'Sirve el arroz en el centro del plato, cubre con abundante salsa de tomate, corona con el huevo frito y acompaña con el plátano frito a un lado.'
        ],
        notes: 'Pese al nombre, es un plato típico español, sobre todo de posguerra — la teoría más aceptada es que el plátano llegaba entonces de Canarias, y "cubana" se usaba como sinónimo de exótico o tropical.'
      },

      {
        id: uid(), name: 'Ensalada César', icon: 'hierba', cat: 'Ensalada',
        diff: 'Fácil', time: 20, portions: 4,
        items: [
          { ing: find('Pollo'), qty: 300, unit: 'g' },
          { ing: find('Lechuga'), qty: 1, unit: 'ud' },
          { ing: find('Pan'), qty: 2, unit: 'ud' },
          { ing: find('Queso parmesano'), qty: 40, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Ajo'), qty: 1, unit: 'diente' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta el pan en dados y tuéstalo en una sartén con un chorrito de aceite y el ajo machacado, hasta que esté dorado y crujiente.',
          'Cocina el pollo a la plancha, salpimentado, y córtalo en tiras cuando esté hecho.',
          'Lava y trocea la lechuga en un bol grande.',
          'Añade el pollo, los picatostes y el queso parmesano en lascas.',
          'Aliña con aceite de oliva y un chorro de limón justo antes de servir.'
        ],
        notes: 'La versión clásica lleva anchoas y una salsa con huevo; esta es la versión rápida de cada día.'
      },
      {
        id: uid(), name: 'Ensalada griega', icon: 'hierba', cat: 'Ensalada',
        diff: 'Fácil', time: 15, portions: 4,
        items: [
          { ing: find('Tomate'), qty: 4, unit: 'ud' },
          { ing: find('Pepino'), qty: 1, unit: 'ud' },
          { ing: find('Cebolla'), qty: 0.5, unit: 'ud' },
          { ing: find('Pimiento'), qty: 1, unit: 'ud' },
          { ing: find('Aceitunas negras'), qty: 100, unit: 'g' },
          { ing: find('Queso feta'), qty: 200, unit: 'g' },
          { ing: find('Orégano'), qty: 1, unit: 'cdta' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Vinagre'), qty: 1, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta los tomates y el pepino en trozos grandes, no en dados pequeños: es un rasgo típico de la horiatiki griega.',
          'Corta la cebolla en aros finos y el pimiento en tiras.',
          'Reparte las verduras en una fuente, sin mezclarlas demasiado.',
          'Añade las aceitunas negras por encima.',
          'Coloca el bloque de queso feta entero encima, sin desmenuzar.',
          'Riega con el aceite de oliva y el vinagre, y espolvorea el orégano sobre el queso.',
          'Sazona con sal y sirve enseguida, sin remover: el aliño se mezcla al servir en el plato.'
        ],
        notes: 'La horiatiki auténtica no lleva lechuga ni se mezcla antes de servir — el feta va entero encima, no en dados.'
      },
      {
        id: uid(), name: 'Ensalada rusa', icon: 'plato', cat: 'Ensalada',
        diff: 'Media', time: 50, portions: 6,
        items: [
          { ing: find('Papa'), qty: 3, unit: 'ud' },
          { ing: find('Zanahoria'), qty: 1, unit: 'ud' },
          { ing: find('Guisantes'), qty: 150, unit: 'g' },
          { ing: find('Pollo'), qty: 300, unit: 'g' },
          { ing: find('Huevo'), qty: 3, unit: 'ud' },
          { ing: find('Pepinillos'), qty: 3, unit: 'ud' },
          { ing: find('Manzana'), qty: 1, unit: 'ud' },
          { ing: find('Mayonesa'), qty: 200, unit: 'g' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' },
          { ing: find('Pimienta negra'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece las papas y la zanahoria con piel en agua con sal hasta que estén tiernas; cuece los huevos aparte hasta que estén duros.',
          'Cuece o hierve el pollo hasta que esté hecho y desmenúzalo o córtalo en dados pequeños.',
          'Cuando las papas, la zanahoria y los huevos estén templados, pélalos y córtalos en dados pequeños y regulares.',
          'Cuece los guisantes 2-3 minutos en agua hirviendo, hasta que estén tiernos, y escúrrelos.',
          'Corta la manzana y los pepinillos en dados del mismo tamaño que el resto.',
          'Mezcla todos los ingredientes en un bol grande con la mayonesa, la sal y la pimienta, con cuidado de no aplastarlos.',
          'Enfría al menos 1 hora en la nevera antes de servir.'
        ],
        notes: 'Es la ensalada Olivier, creada en Moscú en el siglo XIX — la clave está en cortar todo en dados del mismo tamaño pequeño y dejarla enfriar bien antes de servir.'
      },
      {
        id: uid(), name: 'Tabulé', icon: 'hierba', cat: 'Ensalada',
        diff: 'Fácil', time: 25, portions: 4,
        items: [
          { ing: find('Perejil'), qty: 200, unit: 'g' },
          { ing: find('Bulgur'), qty: 60, unit: 'g' },
          { ing: find('Tomate'), qty: 2, unit: 'ud' },
          { ing: find('Cebolla'), qty: 0.25, unit: 'ud' },
          { ing: find('Menta'), qty: 6, unit: 'hoja' },
          { ing: find('Limón'), qty: 2, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Lava el perejil y sécalo muy bien: con la hoja húmeda se apelmaza al picar.',
          'Pica el perejil muy fino, junto con la menta y la cebolla.',
          'Pica el tomate en dados pequeños, reservando el jugo que suelte.',
          'Pon el bulgur fino en un bol con el jugo de limón y el jugo del tomate, y déjalo en remojo 15-20 minutos sin hervirlo: se ablanda solo con el líquido ácido.',
          'Mezcla el bulgur ya hidratado con el perejil, la menta, la cebolla y el tomate.',
          'Aliña con el aceite de oliva y sal, y remueve bien.',
          'Deja reposar al menos 30 minutos en la nevera antes de servir, para que se asienten los sabores.'
        ],
        notes: 'El tabulé auténtico es una ensalada de perejil con un toque de bulgur, no al revés: la proporción tradicional es casi dos manojos de perejil por cada taza de bulgur.'
      },
      {
        id: uid(), name: 'Caprese', icon: 'tomate', cat: 'Ensalada',
        diff: 'Fácil', time: 15, portions: 4,
        items: [
          { ing: find('Tomate'), qty: 4, unit: 'ud' },
          { ing: find('Queso mozzarella'), qty: 250, unit: 'g' },
          { ing: find('Albahaca'), qty: 8, unit: 'hoja' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' },
          { ing: find('Pimienta negra'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta el tomate y la mozzarella en rodajas de un grosor similar, de medio centímetro.',
          'Seca las rodajas de tomate con papel de cocina y sazona con un poco de sal: ayuda a que suelten menos agua y concentren sabor.',
          'Ve alternando las rodajas de tomate y mozzarella en un plato o fuente, superpuestas.',
          'Reparte las hojas de albahaca fresca entre las rodajas, rasgándolas con la mano en vez de cortarlas con cuchillo.',
          'Riega con el aceite de oliva y sazona con sal y pimienta recién molida.',
          'Deja reposar 15-30 minutos a temperatura ambiente antes de servir, para que suelte los jugos y se mezclen los sabores.'
        ],
        notes: 'Rasga la albahaca con los dedos, no la cortes con cuchillo: el filo la oxida y ennegrece los bordes.'
      },
      {
        id: uid(), name: 'Ensalada Waldorf', icon: 'manzana', cat: 'Ensalada',
        diff: 'Fácil', time: 15, portions: 4,
        items: [
          { ing: find('Manzana'), qty: 3, unit: 'ud' },
          { ing: find('Apio'), qty: 2, unit: 'rama' },
          { ing: find('Nueces'), qty: 60, unit: 'g' },
          { ing: find('Mayonesa'), qty: 100, unit: 'g' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta la manzana en dados, dejando la piel, y rocíala enseguida con el zumo de limón para que no se oxide.',
          'Pica el apio en rodajas finas.',
          'Trocea las nueces groseramente.',
          'Mezcla la manzana, el apio y las nueces con la mayonesa hasta que quede todo bien cubierto.',
          'Sazona con una pizca de sal y enfría al menos 30 minutos antes de servir.'
        ],
        notes: 'La receta original de 1893 del hotel Waldorf-Astoria solo llevaba manzana, apio y mayonesa: las nueces se añadieron después y hoy son casi inseparables de la ensalada.'
      },
      {
        id: uid(), name: 'Ensalada Cobb', icon: 'carne', cat: 'Ensalada',
        diff: 'Media', time: 35, portions: 4,
        items: [
          { ing: find('Pollo'), qty: 300, unit: 'g' },
          { ing: find('Panceta'), qty: 150, unit: 'g' },
          { ing: find('Huevo'), qty: 3, unit: 'ud' },
          { ing: find('Aguacate'), qty: 1, unit: 'ud' },
          { ing: find('Tomate'), qty: 2, unit: 'ud' },
          { ing: find('Queso azul'), qty: 100, unit: 'g' },
          { ing: find('Lechuga'), qty: 1, unit: 'ud' },
          { ing: find('Vinagre'), qty: 3, unit: 'cda' },
          { ing: find('Aceite de oliva'), qty: 6, unit: 'cda' },
          { ing: find('Mostaza'), qty: 1, unit: 'cdta' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' },
          { ing: find('Pimienta negra'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece los huevos 10 minutos, pásalos por agua fría, pélalos y pícalos.',
          'Cocina el pollo a la plancha con sal y pimienta hasta que quede dorado y jugoso, y córtalo en cubos.',
          'Fríe la panceta en trozos hasta que quede crujiente y escúrrela sobre papel absorbente.',
          'Corta la lechuga bien fina y extiéndela como base en una fuente grande.',
          'Coloca por encima el pollo, la panceta, el huevo, el aguacate en cubos, el tomate y el queso azul desmenuzado, cada uno en su propia franja, sin mezclar.',
          'Bate el vinagre con el aceite y la mostaza hasta que emulsione y riega la ensalada justo antes de servir.'
        ],
        notes: 'La gracia de la Cobb es servirla en filas separadas, no mezclada: cada uno la revuelve a su gusto en el plato. Se dice que nació en Hollywood, en el restaurante Brown Derby, con las sobras de la nevera.'
      },
      {
        id: uid(), name: 'Ensalada Niçoise', icon: 'pescado', cat: 'Ensalada',
        diff: 'Media', time: 35, portions: 4,
        items: [
          { ing: find('Atún en lata'), qty: 250, unit: 'g' },
          { ing: find('Judía verde'), qty: 200, unit: 'g' },
          { ing: find('Papa'), qty: 3, unit: 'ud' },
          { ing: find('Huevo'), qty: 3, unit: 'ud' },
          { ing: find('Aceitunas negras'), qty: 80, unit: 'g' },
          { ing: find('Anchoas'), qty: 30, unit: 'g' },
          { ing: find('Tomate'), qty: 3, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Mostaza'), qty: 1, unit: 'cdta' },
          { ing: find('Vinagre'), qty: 2, unit: 'cda' },
          { ing: find('Aceite de oliva'), qty: 5, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece las papas con piel en agua con sal hasta que estén tiernas, escúrrelas y córtalas en rodajas cuando templen.',
          'Blanquea las judías verdes en agua hirviendo unos 4 minutos y pásalas enseguida por agua fría para que queden firmes y verdes.',
          'Cuece los huevos 9-10 minutos, enfríalos, pélalos y pártelos en cuartos.',
          'Corta el tomate en gajos y la cebolla en aros finos.',
          'Bate el aceite con el vinagre y la mostaza para hacer la vinagreta.',
          'Reparte en una fuente las papas, las judías, el tomate, la cebolla, los huevos, el atún desmenuzado, las aceitunas y las anchoas, cada cosa en su sector, y termina con la vinagreta por encima.'
        ],
        notes: 'Es una ensalada de reparto, no de mezcla: en Niza cada ingrediente va en su rincón del plato y se sirve tibio o a temperatura ambiente, nunca recién sacado de la nevera.'
      },
      {
        id: uid(), name: 'Panzanella', icon: 'pan', cat: 'Ensalada',
        diff: 'Fácil', time: 75, portions: 4,
        items: [
          { ing: find('Pan'), qty: 4, unit: 'ud' },
          { ing: find('Agua'), qty: 200, unit: 'ml' },
          { ing: find('Tomate'), qty: 4, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Albahaca'), qty: 6, unit: 'hoja' },
          { ing: find('Vinagre'), qty: 3, unit: 'cda' },
          { ing: find('Aceite de oliva'), qty: 5, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Remoja el pan duro en un bol con el agua y un chorrito de vinagre unos 10 minutos, dándole vuelta a mitad de camino.',
          'Escurre el pan y apriétalo bien con las manos para quitarle el exceso de líquido, luego desmígalo en trozos con los dedos.',
          'Corta el tomate en trozos pequeños dejando que caiga su jugo en el bol, y corta la cebolla en láminas finas.',
          'Mezcla el pan escurrido con el tomate y su jugo, la cebolla y la albahaca troceada.',
          'Aliña con el aceite de oliva, el resto del vinagre y sal, y deja reposar en la nevera al menos una hora para que el pan absorba bien los jugos antes de servir.'
        ],
        notes: 'Cuanto más reposa, mejor sabe: nació para aprovechar el pan de varios días, y de un día para otro queda todavía más sabrosa.'
      },
      {
        id: uid(), name: 'Fattoush', icon: 'limon', cat: 'Ensalada',
        diff: 'Fácil', time: 25, portions: 4,
        items: [
          { ing: find('Pan'), qty: 2, unit: 'ud' },
          { ing: find('Pepino'), qty: 2, unit: 'ud' },
          { ing: find('Tomate'), qty: 3, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Perejil'), qty: 10, unit: 'hoja' },
          { ing: find('Menta'), qty: 6, unit: 'hoja' },
          { ing: find('Zumaque'), qty: 1, unit: 'cdta' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 1, unit: 'diente' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta el pan pita en triángulos, pincélalos con un poco de aceite y tuéstalos en el horno o en una sartén hasta que queden bien crujientes y dorados.',
          'Corta el pepino, el tomate y la cebolla en trozos pequeños, y pica el perejil y la menta.',
          'Machaca el ajo con una pizca de sal, mézclalo con el zumo de limón y déjalo un par de minutos para que pierda fuerza.',
          'Añade el zumaque y el aceite de oliva al majado de ajo y limón, batiendo hasta que quede una vinagreta homogénea.',
          'Junta las verduras y las hierbas en un bol grande, incorpora el pan tostado en el último momento y termina con la vinagreta, mezclando justo antes de servir para que el pan no se ablande.'
        ],
        notes: 'El zumaque aporta ese toque ácido y afrutado típico de la cocina levantina; si no lo consigues, un poco más de limón y su ralladura son un sustituto aceptable.'
      },
      {
        id: uid(), name: 'Coleslaw', icon: 'zanahoria', cat: 'Ensalada',
        diff: 'Fácil', time: 75, portions: 6,
        items: [
          { ing: find('Repollo'), qty: 500, unit: 'g' },
          { ing: find('Zanahoria'), qty: 2, unit: 'ud' },
          { ing: find('Mayonesa'), qty: 6, unit: 'cda' },
          { ing: find('Vinagre'), qty: 2, unit: 'cda' },
          { ing: find('Azúcar'), qty: 1, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' },
          { ing: find('Pimienta negra'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta el repollo en tiras lo más finas posible y ralla la zanahoria.',
          'Mezcla el repollo y la zanahoria en un bol grande.',
          'Bate la mayonesa con el vinagre, el azúcar, sal y pimienta hasta que quede una salsa lisa.',
          'Vierte la salsa sobre las verduras y mezcla bien hasta que todo quede cubierto.',
          'Tapa y deja reposar en la nevera al menos una hora antes de servir, para que el repollo suelte agua y se ablande un poco.'
        ],
        notes: 'El nombre viene del holandés koolsla, "ensalada de repollo": llegó a Estados Unidos con los colonos holandeses y de ahí se quedó como coleslaw.'
      },
      {
        id: uid(), name: 'Ensalada de quinoa', icon: 'arroz', cat: 'Ensalada',
        diff: 'Fácil', time: 30, portions: 4,
        items: [
          { ing: find('Quinoa'), qty: 200, unit: 'g' },
          { ing: find('Agua'), qty: 400, unit: 'ml' },
          { ing: find('Pepino'), qty: 1, unit: 'ud' },
          { ing: find('Tomate'), qty: 2, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Perejil'), qty: 8, unit: 'hoja' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Enjuaga la quinoa bajo el agua fría frotándola con las manos, para quitarle el sabor amargo de su capa natural.',
          'Cuece la quinoa en el agua con una pizca de sal: llévala a hervor, baja el fuego y déjala a fuego lento hasta que absorba todo el líquido, unos 12-15 minutos.',
          'Retira del fuego, tapa y deja reposar 10 minutos más, luego suéltala con un tenedor y déjala enfriar.',
          'Corta el pepino, el tomate y la cebolla en dados pequeños y pica el perejil.',
          'Mezcla la quinoa fría con las verduras, riega con el zumo de limón y el aceite de oliva, y ajusta de sal.'
        ],
        notes: 'La quinoa se cultiva en los Andes desde hace miles de años; enjuagarla bien evita el regusto amargo de la saponina que la recubre de forma natural.'
      },
      {
        id: uid(), name: 'Ensalada de garbanzos', icon: 'legumbre', cat: 'Ensalada',
        diff: 'Fácil', time: 20, portions: 4,
        items: [
          { ing: find('Garbanzos'), qty: 400, unit: 'g' },
          { ing: find('Tomate'), qty: 2, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Queso feta'), qty: 100, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Perejil'), qty: 8, unit: 'hoja' },
          { ing: find('Orégano'), qty: 1, unit: 'cdta' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Escurre y enjuaga bien los garbanzos, y sécalos con un paño para que la ensalada no quede aguada.',
          'Corta el tomate y la cebolla en dados pequeños.',
          'Mezcla los garbanzos con el tomate y la cebolla en un bol grande.',
          'Desmenuza el queso feta por encima y espolvorea el orégano.',
          'Riega con el aceite de oliva y el zumo de limón, sazona y deja reposar unos minutos para que se mezclen los sabores antes de servir.'
        ],
        notes: 'Es de esas ensaladas que mejoran con el tiempo: si la preparas un par de horas antes, los garbanzos absorben mucho mejor el aliño.'
      },
      {
        id: uid(), name: 'Ensalada de pollo', icon: 'manzana', cat: 'Ensalada',
        diff: 'Fácil', time: 20, portions: 4,
        items: [
          { ing: find('Pollo'), qty: 400, unit: 'g' },
          { ing: find('Apio'), qty: 2, unit: 'rama' },
          { ing: find('Manzana'), qty: 1, unit: 'ud' },
          { ing: find('Nueces'), qty: 40, unit: 'g' },
          { ing: find('Mayonesa'), qty: 5, unit: 'cda' },
          { ing: find('Mostaza'), qty: 1, unit: 'cdta' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' },
          { ing: find('Pimienta negra'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece o cocina a la plancha el pollo, déjalo enfriar y desmenúzalo o córtalo en cubos pequeños.',
          'Pica el apio en trozos finos y corta la manzana en dados, rociándola con un poco de zumo de limón para que no se oscurezca.',
          'Tuesta las nueces unos minutos en una sartén sin aceite hasta que huelan bien, y trocéalas.',
          'Mezcla la mayonesa con la mostaza y un chorrito de limón.',
          'Junta el pollo, el apio, la manzana y las nueces con la salsa, mezcla con cuidado para no aplastar la fruta, y ajusta de sal y pimienta.'
        ],
        notes: 'Es la base perfecta para un sándwich o para servir sobre hojas de lechuga; la fruta aporta ese punto dulce que equilibra la mayonesa.'
      },
      {
        id: uid(), name: 'Ensalada de pasta', icon: 'rodillo', cat: 'Ensalada',
        diff: 'Fácil', time: 70, portions: 6,
        items: [
          { ing: find('Fusilli'), qty: 300, unit: 'g' },
          { ing: find('Tomate'), qty: 2, unit: 'ud' },
          { ing: find('Pimiento'), qty: 1, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Aceitunas negras'), qty: 60, unit: 'g' },
          { ing: find('Queso mozzarella'), qty: 150, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Vinagre'), qty: 2, unit: 'cda' },
          { ing: find('Orégano'), qty: 1, unit: 'cdta' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece la pasta en agua bien salada hasta que esté al dente, escúrrela y pásala por agua fría para cortar la cocción y quitarle el exceso de almidón.',
          'Corta el tomate, el pimiento y la cebolla en trozos pequeños, y el queso mozzarella en cubos.',
          'Bate el aceite de oliva con el vinagre y el orégano para hacer la vinagreta.',
          'Mezcla la pasta fría con las verduras, las aceitunas y el queso.',
          'Riega con la vinagreta, mezcla bien y deja reposar en la nevera al menos una hora antes de servir para que coja sabor.'
        ],
        notes: 'Enfriar la pasta bajo el chorro de agua corta la cocción residual y evita que quede pasada cuando la mezcles con el aliño.'
      },
      {
        id: uid(), name: 'Ensalada de espinacas con nueces y queso', icon: 'hierba', cat: 'Ensalada',
        diff: 'Fácil', time: 20, portions: 4,
        items: [
          { ing: find('Espinaca'), qty: 200, unit: 'g' },
          { ing: find('Panceta'), qty: 100, unit: 'g' },
          { ing: find('Nueces'), qty: 60, unit: 'g' },
          { ing: find('Queso azul'), qty: 80, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Vinagre'), qty: 3, unit: 'cda' },
          { ing: find('Mostaza'), qty: 1, unit: 'cdta' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Lava y seca bien las hojas de espinaca y ponlas en un bol grande.',
          'Fríe la panceta en trozos hasta que quede crujiente y reserva un par de cucharadas de la grasa que suelte.',
          'Tuesta las nueces unos minutos en una sartén seca hasta que huelan tostado.',
          'En la misma sartén con la grasa reservada, calienta el vinagre, la mostaza y el aceite de oliva removiendo bien, para hacer una vinagreta tibia.',
          'Vierte la vinagreta caliente sobre las espinacas y mezcla rápido: el calor las marchita apenas un poco, sin llegar a cocerlas.',
          'Reparte por encima la panceta, las nueces tostadas, el queso azul desmenuzado y la cebolla en aros finos.'
        ],
        notes: 'El truco está en que la vinagreta llegue bien caliente pero la espinaca no se cocine: solo debe ablandarse un poco al contacto, quedando todavía fresca.'
      },
      {
        id: uid(), name: 'Croquetas de jamón', icon: 'carne', cat: 'Entrante',
        diff: 'Media', time: 60, portions: 4,
        items: [
          { ing: find('Jamón'), qty: 150, unit: 'g' },
          { ing: find('Harina'), qty: 60, unit: 'g' },
          { ing: find('Leche'), qty: 500, unit: 'ml' },
          { ing: find('Mantequilla'), qty: 50, unit: 'g' },
          { ing: find('Huevo'), qty: 2, unit: 'ud' },
          { ing: find('Pan rallado'), qty: 150, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 500, unit: 'ml' },
          { ing: find('Nuez moscada'), qty: null, unit: 'pizca' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Derrite la mantequilla y añade la harina, removiendo 2 minutos para que pierda el sabor a crudo.',
          'Vierte la leche poco a poco, sin dejar de remover, hasta conseguir una bechamel espesa y sin grumos.',
          'Añade el jamón picado muy fino, la nuez moscada y la sal, y cuece 5 minutos más.',
          'Extiende la masa en una bandeja, cúbrela con film pegado a la superficie y enfría en la nevera un mínimo de 4 horas.',
          'Forma las croquetas, pásalas por huevo batido y pan rallado.',
          'Fríe en abundante aceite caliente hasta que estén doradas por fuera.'
        ],
        notes: 'Cuanto más fría y reposada esté la masa, más fácil es formar las croquetas sin que se rompan.'
      },
      {
        id: uid(), name: 'Empanadas de pino', icon: 'carne', cat: 'Entrante',
        diff: 'Media', time: 90, portions: 12,
        items: [
          { ing: find('Carne picada'), qty: 600, unit: 'g' },
          { ing: find('Cebolla'), qty: 4, unit: 'ud' },
          { ing: find('Aceitunas negras'), qty: 12, unit: 'ud' },
          { ing: find('Pasas'), qty: 50, unit: 'g' },
          { ing: find('Huevo'), qty: 2, unit: 'ud' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Comino'), qty: 1, unit: 'cdta' },
          { ing: find('Harina'), qty: 500, unit: 'g' },
          { ing: find('Mantequilla'), qty: 100, unit: 'g' },
          { ing: find('Agua'), qty: 150, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pica la cebolla en cuadraditos pequeños y ponla a cocinar a fuego bajo, hasta que esté muy tierna y dulce (unos 20-30 minutos): esto es "el pino".',
          'Añade la carne picada, el pimentón y el comino, y cocina hasta que la carne esté hecha. Deja enfriar del todo.',
          'Para la masa, mezcla la harina con la mantequilla derretida, el agua tibia y sal, hasta formar una masa lisa. Deja reposar 15 minutos.',
          'Estira la masa y corta círculos. Rellena cada uno con el pino frío, una aceituna, un poco de pasas y un trozo de huevo duro.',
          'Cierra las empanadas doblando por la mitad y sellando el borde, y pinta con huevo batido.',
          'Hornea a 200 °C unos 25-30 minutos, hasta que estén doradas.'
        ],
        notes: 'El pino se hace siempre el día antes y se enfría del todo: si está caliente, humedece la masa y no cierra bien.'
      },
      {
        id: uid(), name: 'Humitas', icon: 'plato', cat: 'Entrante',
        diff: 'Media', time: 60, portions: 6,
        items: [
          { ing: find('Choclo'), qty: 1200, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Albahaca'), qty: null, unit: 'al gusto' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Pimentón'), qty: null, unit: 'al gusto' },
          { ing: find('Azúcar'), qty: 1, unit: 'cdta' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Ralla o tritura el choclo hasta conseguir una pasta gruesa, sin que quede totalmente líquida.',
          'Sofríe la cebolla picada en el aceite hasta que esté tierna, sin dorarse.',
          'Mezcla la cebolla con el choclo molido, la albahaca picada, el pimentón, el azúcar y la sal.',
          'Envuelve porciones de la mezcla en hojas de choclo o papel de horno, formando paquetitos atados.',
          'Cuece los paquetitos al vapor o hervidos, 40-45 minutos.',
          'Sirve calientes, dentro de su propia hoja.'
        ],
        notes: 'Cada casa tiene su punto de sal y azúcar: algunas familias las hacen más dulces, otras más saladas — no hay una única receta correcta.'
      },
      {
        id: uid(), name: 'Espaguetis a la boloñesa', icon: 'olla', cat: 'Principal',
        diff: 'Media', time: 60, portions: 4,
        items: [
          { ing: find('Espaguetis'), qty: 400, unit: 'g' },
          { ing: find('Carne picada'), qty: 400, unit: 'g' },
          { ing: find('Tomate'), qty: 800, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Zanahoria'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Vino tinto'), qty: 100, unit: 'ml' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pica muy fino la cebolla, la zanahoria y el ajo, y sofríelos en el aceite hasta que estén tiernos.',
          'Sube el fuego, añade la carne picada y dórala bien, deshaciendo los grumos.',
          'Vierte el vino tinto y deja que reduzca un par de minutos.',
          'Añade el tomate triturado, sala y cocina a fuego bajo 30-40 minutos, removiendo de vez en cuando.',
          'Cuece los espaguetis en agua con sal según el paquete, y mézclalos con la salsa antes de servir.'
        ],
        notes: 'Cuanto más lento y largo el sofrito, más profunda sabe la salsa — no tengas prisa con la cebolla y la zanahoria.'
      },
      {
        id: uid(), name: 'Salmón al horno', icon: 'pescado', cat: 'Principal',
        diff: 'Fácil', time: 25, portions: 4,
        items: [
          { ing: find('Salmón'), qty: 4, unit: 'ud' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Perejil'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Precalienta el horno a 200 °C.',
          'Coloca los lomos de salmón en una bandeja, sala y riega con el aceite.',
          'Reparte el ajo laminado y unas rodajas de limón por encima.',
          'Hornea 12-15 minutos, según el grosor, hasta que se separe fácilmente en lascas.',
          'Espolvorea con perejil picado antes de servir.'
        ],
        notes: 'Se pasa enseguida: en cuanto pierde el rosa intenso del centro, sácalo.'
      },
      {
        id: uid(), name: 'Lentejas guisadas', icon: 'legumbre', cat: 'Principal',
        diff: 'Fácil', time: 50, portions: 4,
        items: [
          { ing: find('Lentejas'), qty: 300, unit: 'g' },
          { ing: find('Zanahoria'), qty: 2, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pica la cebolla, la zanahoria y el ajo, y sofríelos en el aceite hasta que estén tiernos.',
          'Añade el pimentón fuera del fuego un segundo, removiendo, y vuelve a poner al fuego enseguida.',
          'Incorpora las lentejas y cubre con agua unos tres dedos por encima.',
          'Cuece a fuego bajo 35-40 minutos, hasta que estén tiernas, añadiendo agua si hace falta.',
          'Sala al final de la cocción, nunca al principio.'
        ],
        notes: 'Salar desde el principio endurece la piel de la legumbre y tarda más en cocerse.'
      },
      {
        id: uid(), name: 'Albóndigas en salsa', icon: 'carne', cat: 'Principal',
        diff: 'Media', time: 50, portions: 4,
        items: [
          { ing: find('Carne picada'), qty: 500, unit: 'g' },
          { ing: find('Huevo'), qty: 1, unit: 'ud' },
          { ing: find('Pan rallado'), qty: 50, unit: 'g' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Perejil'), qty: null, unit: 'al gusto' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Tomate'), qty: 400, unit: 'g' },
          { ing: find('Vino blanco'), qty: 100, unit: 'ml' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Mezcla la carne picada con el huevo, el pan rallado, un diente de ajo picado, perejil y sal. Amasa bien.',
          'Forma las albóndigas del tamaño de una nuez y enharínalas ligeramente.',
          'Dóralas en aceite por todos los lados y resérvalas.',
          'En el mismo aceite, sofríe la cebolla y el ajo restante hasta que estén tiernos.',
          'Añade el tomate triturado y el vino blanco, y cocina 10 minutos.',
          'Incorpora las albóndigas a la salsa y cuece 20 minutos más a fuego bajo.'
        ],
        notes: 'Enharinarlas antes de dorarlas ayuda a que la salsa espese sola, sin necesidad de más harina.'
      },
      {
        id: uid(), name: 'Merluza en salsa verde', icon: 'pescado', cat: 'Principal',
        diff: 'Media', time: 30, portions: 4,
        items: [
          { ing: find('Merluza'), qty: 4, unit: 'ud' },
          { ing: find('Ajo'), qty: 3, unit: 'diente' },
          { ing: find('Perejil'), qty: null, unit: 'al gusto' },
          { ing: find('Harina'), qty: 1, unit: 'cda' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Vino blanco'), qty: 100, unit: 'ml' },
          { ing: find('Caldo'), qty: 200, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Sala los lomos de merluza y enharínalos ligeramente.',
          'Dora el ajo laminado en el aceite, sin que llegue a quemarse.',
          'Añade la harina sobrante y remueve un momento para que se cocine.',
          'Vierte el vino blanco y el caldo, y deja que reduzca un poco.',
          'Incorpora la merluza y cocina a fuego bajo 8-10 minutos, moviendo la cazuela en círculos para que la salsa ligue.',
          'Espolvorea con perejil picado antes de servir.'
        ],
        notes: 'La salsa liga sola moviendo la cazuela con un gesto de muñeca, sin remover con cuchara: es la gelatina de la propia merluza la que la espesa.'
      },
      {
        id: uid(), name: 'Paella de pollo y verduras', icon: 'arroz', cat: 'Principal',
        diff: 'Media', time: 50, portions: 4,
        items: [
          { ing: find('Arroz'), qty: 350, unit: 'g' },
          { ing: find('Pollo'), qty: 500, unit: 'g' },
          { ing: find('Pimiento'), qty: 1, unit: 'ud' },
          { ing: find('Judía verde'), qty: 150, unit: 'g' },
          { ing: find('Tomate'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Azafrán'), qty: null, unit: 'al gusto' },
          { ing: find('Caldo'), qty: 800, unit: 'ml' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Sala el pollo troceado y dóralo en el aceite en la paellera hasta que esté dorado.',
          'Añade el pimiento, la judía verde y el ajo, y sofríe unos minutos.',
          'Incorpora el tomate rallado y cocina hasta que se evapore el agua.',
          'Añade el arroz y remueve un minuto para que se impregne del sofrito.',
          'Vierte el caldo caliente con el azafrán disuelto, y reparte bien los ingredientes sin volver a remover.',
          'Cuece a fuego fuerte 10 minutos y luego a fuego medio-bajo otros 8-10, hasta que el caldo se absorba.',
          'Deja reposar 5 minutos tapada con un paño antes de servir.'
        ],
        notes: 'No remover el arroz una vez añadido el caldo es la regla de oro: es lo que permite que se forme el socarrat en el fondo.'
      },
      {
        id: uid(), name: 'Pastel de choclo', icon: 'plato', cat: 'Principal',
        diff: 'Media', time: 80, portions: 6,
        items: [
          { ing: find('Choclo'), qty: 800, unit: 'g' },
          { ing: find('Carne picada'), qty: 400, unit: 'g' },
          { ing: find('Cebolla'), qty: 2, unit: 'ud' },
          { ing: find('Aceitunas negras'), qty: 8, unit: 'ud' },
          { ing: find('Pasas'), qty: 30, unit: 'g' },
          { ing: find('Huevo'), qty: 2, unit: 'ud' },
          { ing: find('Leche'), qty: 100, unit: 'ml' },
          { ing: find('Mantequilla'), qty: 40, unit: 'g' },
          { ing: find('Azúcar'), qty: 1, unit: 'cdta' },
          { ing: find('Albahaca'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Prepara el pino: sofríe la cebolla picada hasta que esté tierna, añade la carne picada y cocina hasta que esté hecha. Sazona y reserva.',
          'Tritura el choclo con la leche, la mantequilla y el azúcar hasta conseguir una crema espesa.',
          'Cocina la crema de choclo a fuego bajo, removiendo a menudo, hasta que espese un poco más. Añade la albahaca picada.',
          'En una fuente para horno, reparte el pino, unas aceitunas, pasas y trozos de huevo duro.',
          'Cubre todo con la crema de choclo, alisando la superficie.',
          'Espolvorea con un poco de azúcar por encima y hornea a 200 °C unos 25-30 minutos, hasta que la superficie se dore.'
        ],
        notes: 'El toque dulce de la superficie es tradicional: no te pases de azúcar, es solo para ayudar a que gratine y dore.'
      },
      {
        id: uid(), name: 'Cazuela de pollo', icon: 'carne', cat: 'Principal',
        diff: 'Media', time: 60, portions: 4,
        items: [
          { ing: find('Pollo'), qty: 800, unit: 'g' },
          { ing: find('Zapallo'), qty: 300, unit: 'g' },
          { ing: find('Choclo'), qty: 2, unit: 'ud' },
          { ing: find('Papa'), qty: 2, unit: 'ud' },
          { ing: find('Zanahoria'), qty: 1, unit: 'ud' },
          { ing: find('Arroz'), qty: 50, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pon el pollo troceado en una olla grande con agua, la cebolla y el ajo. Lleva a hervor y cocina 20 minutos, retirando la espuma que suba.',
          'Añade la zanahoria y el zapallo en trozos grandes, y cocina 10 minutos más.',
          'Incorpora las papas enteras o en mitades y el trozo de choclo.',
          'Añade el arroz y cocina otros 15-20 minutos, hasta que todas las verduras estén tiernas.',
          'Sala al gusto y sirve bien caliente, con un trozo de cada verdura en cada plato.'
        ],
        notes: 'Una buena cazuela se sirve con el caldo bien caliente y un trozo de choclo entero — es casi tan importante como la carne.'
      },
      {
        id: uid(), name: 'Carbonada', icon: 'carne', cat: 'Principal',
        diff: 'Media', time: 60, portions: 4,
        items: [
          { ing: find('Carne picada'), qty: 400, unit: 'g' },
          { ing: find('Papa'), qty: 2, unit: 'ud' },
          { ing: find('Zanahoria'), qty: 2, unit: 'ud' },
          { ing: find('Zapallo'), qty: 200, unit: 'g' },
          { ing: find('Choclo'), qty: 1, unit: 'ud' },
          { ing: find('Arroz'), qty: 50, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Agua'), qty: 1000, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Dora la carne picada en el aceite junto con la cebolla y el ajo picados.',
          'Añade el pimentón y remueve un momento.',
          'Incorpora el agua y lleva a hervor.',
          'Añade la papa, la zanahoria y el zapallo en dados pequeños, y el choclo en trozos.',
          'Cuece 25-30 minutos, y añade el arroz los últimos 15 minutos.',
          'Sala al gusto y sirve bien caliente, como una sopa espesa.'
        ],
        notes: 'A diferencia de la cazuela, en la carbonada todo se corta en dados pequeños: es más sopa que guiso de trozos grandes.'
      },
      {
        id: uid(), name: 'Porotos granados', icon: 'legumbre', cat: 'Principal',
        diff: 'Media', time: 60, portions: 4,
        items: [
          { ing: find('Porotos'), qty: 400, unit: 'g' },
          { ing: find('Zapallo'), qty: 300, unit: 'g' },
          { ing: find('Choclo'), qty: 400, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Albahaca'), qty: null, unit: 'al gusto' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Si usas porotos secos, déjalos en remojo la noche anterior y cuécelos hasta que estén tiernos.',
          'Sofríe la cebolla y el ajo en el aceite hasta que estén tiernos, y añade el pimentón.',
          'Incorpora el zapallo en dados y cocina unos minutos.',
          'Añade los porotos con un poco de su caldo de cocción, y el choclo triturado grueso.',
          'Cuece a fuego bajo 20-25 minutos, hasta que el zapallo esté tierno y el guiso haya espesado.',
          'Añade la albahaca picada al final y sala al gusto.'
        ],
        notes: 'El choclo molido es lo que espesa el guiso de forma natural — cuanto más grueso lo dejes, más textura tendrá.'
      },
      {
        id: uid(), name: 'Papas bravas', icon: 'plato', cat: 'Guarnición',
        diff: 'Fácil', time: 30, portions: 4,
        items: [
          { ing: find('Papa'), qty: 800, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 200, unit: 'ml' },
          { ing: find('Tomate'), qty: 2, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Guindilla'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pela las papas y córtalas en dados grandes e irregulares.',
          'Fríelas en abundante aceite a fuego medio hasta que estén doradas y tiernas por dentro.',
          'Para la salsa: sofríe el ajo picado, añade el tomate triturado y cocina 10 minutos.',
          'Añade el pimentón y la guindilla al gusto, y sala.',
          'Sirve las papas recién fritas con la salsa brava por encima.'
        ],
        notes: 'El pimentón se añade fuera del fuego o con el fuego muy bajo: se quema y amarga enseguida.'
      },
      {
        id: uid(), name: 'Puré de papas', icon: 'plato', cat: 'Guarnición',
        diff: 'Fácil', time: 30, portions: 4,
        items: [
          { ing: find('Papa'), qty: 800, unit: 'g' },
          { ing: find('Leche'), qty: 150, unit: 'ml' },
          { ing: find('Mantequilla'), qty: 50, unit: 'g' },
          { ing: find('Nuez moscada'), qty: null, unit: 'pizca' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece las papas peladas y troceadas en agua con sal hasta que estén muy tiernas.',
          'Escúrrelas bien y cháfalas todavía calientes con un pasapurés o un tenedor.',
          'Calienta la leche con la mantequilla, sin que llegue a hervir.',
          'Incorpora la leche caliente al puré poco a poco, removiendo hasta la textura que te guste.',
          'Sazona con sal y nuez moscada.'
        ],
        notes: 'No lo batas con batidora eléctrica: el almidón se rompe y queda pegajoso, casi como cola.'
      },
      {
        id: uid(), name: 'Arroz blanco', icon: 'arroz', cat: 'Guarnición',
        diff: 'Fácil', time: 20, portions: 4,
        items: [
          { ing: find('Arroz'), qty: 300, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 1, unit: 'cda' },
          { ing: find('Ajo'), qty: 1, unit: 'diente' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Sofríe el ajo entero en el aceite hasta que aromatice, y retíralo.',
          'Añade el arroz y remueve un minuto para que se impregne del aceite.',
          'Cubre con el doble de volumen de agua que de arroz y sala.',
          'Cuece tapado a fuego bajo 18-20 minutos, sin destapar ni remover.',
          'Deja reposar 5 minutos tapado antes de servir, para que se suelte el grano.'
        ],
        notes: 'Un arroz blanco suelto siempre es un buen comodín para acompañar guisos con mucha salsa.'
      },
      {
        id: uid(), name: 'Ensalada de tomate y cebolla', icon: 'tomate', cat: 'Ensalada',
        diff: 'Fácil', time: 10, portions: 4,
        items: [
          { ing: find('Tomate'), qty: 4, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Vinagre'), qty: 1, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta los tomates en rodajas o gajos, y la cebolla en juliana fina.',
          'Colócalos en una fuente alternando capas.',
          'Riega con el aceite y el vinagre, y sala.',
          'Deja reposar 10 minutos antes de servir para que se mezclen los sabores.'
        ],
        notes: 'Si la cebolla pica demasiado, déjala 10 minutos en agua fría antes de usarla: suaviza mucho el sabor.'
      },
      {
        id: uid(), name: 'Champiñones al ajo', icon: 'seta', cat: 'Guarnición',
        diff: 'Fácil', time: 15, portions: 4,
        items: [
          { ing: find('Champiñones'), qty: 400, unit: 'g' },
          { ing: find('Ajo'), qty: 3, unit: 'diente' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Guindilla'), qty: null, unit: 'al gusto' },
          { ing: find('Perejil'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Limpia los champiñones y córtalos en láminas o en cuartos.',
          'Calienta el aceite y dora el ajo laminado con la guindilla.',
          'Sube el fuego, añade los champiñones y saltea hasta que suelten el agua y se evapore.',
          'Sala y espolvorea con perejil picado antes de servir.'
        ],
        notes: 'No los amontones en la sartén: si van muy apretados, se cuecen en su propio jugo en vez de dorarse.'
      },
      {
        id: uid(), name: 'Pisto', icon: 'tomate', cat: 'Guarnición',
        diff: 'Fácil', time: 40, portions: 4,
        items: [
          { ing: find('Calabacín'), qty: 2, unit: 'ud' },
          { ing: find('Pimiento'), qty: 1, unit: 'ud' },
          { ing: find('Berenjena'), qty: 1, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Tomate'), qty: 400, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta todas las verduras en dados pequeños y uniformes.',
          'Sofríe la cebolla y el pimiento en el aceite hasta que estén tiernos.',
          'Añade la berenjena y el calabacín, y cocina removiendo de vez en cuando.',
          'Incorpora el tomate triturado y cocina a fuego bajo 25-30 minutos, hasta que espese y las verduras estén melosas.',
          'Sala al gusto.'
        ],
        notes: 'Cuanto más tiempo y más bajo el fuego, más se concentran los sabores — el pisto mejora de un día para otro.'
      },
      {
        id: uid(), name: 'Charquicán', icon: 'plato', cat: 'Guarnición',
        diff: 'Fácil', time: 45, portions: 4,
        items: [
          { ing: find('Zapallo'), qty: 300, unit: 'g' },
          { ing: find('Papa'), qty: 400, unit: 'g' },
          { ing: find('Choclo'), qty: 200, unit: 'g' },
          { ing: find('Carne picada'), qty: 200, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece por separado el zapallo y la papa en agua con sal hasta que estén muy tiernos.',
          'Mientras, sofríe la cebolla y el ajo en el aceite, añade la carne picada y el pimentón, y cocina hasta que esté hecha.',
          'Escurre bien el zapallo y la papa, y májalos juntos con un tenedor hasta conseguir un puré grueso, con algo de textura.',
          'Mezcla el puré con el sofrito de carne y el choclo.',
          'Sirve caliente, tradicionalmente con un huevo frito encima.'
        ],
        notes: 'No lo tritures demasiado fino: el charquicán se distingue del puré de papas por conservar tropezones de verdura.'
      },
      {
        id: uid(), name: 'Sopaipillas', icon: 'pan', cat: 'Guarnición',
        diff: 'Fácil', time: 30, portions: 6,
        items: [
          { ing: find('Zapallo'), qty: 200, unit: 'g' },
          { ing: find('Harina'), qty: 400, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 500, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece el zapallo en trozos hasta que esté muy tierno, escúrrelo bien y hazlo puré.',
          'Mezcla el puré de zapallo con la harina y la sal, hasta formar una masa que no se pegue en las manos.',
          'Estira la masa y corta círculos con un vaso o un cortapastas.',
          'Pincha cada disco un par de veces con un tenedor, para que no suban demasiado al freírlas.',
          'Fríe en aceite bien caliente hasta que doren por ambos lados.'
        ],
        notes: 'Se comen solas, con pebre, o bañadas en chancaca (miel de caña) para la versión dulce.'
      },
      {
        id: uid(), name: 'Tarta de queso', icon: 'pastel', cat: 'Postre',
        diff: 'Media', time: 70, portions: 8,
        items: [
          { ing: find('Queso crema'), qty: 500, unit: 'g' },
          { ing: find('Huevo'), qty: 3, unit: 'ud' },
          { ing: find('Azúcar'), qty: 150, unit: 'g' },
          { ing: find('Nata'), qty: 200, unit: 'ml' },
          { ing: find('Galletas'), qty: 150, unit: 'g' },
          { ing: find('Mantequilla'), qty: 60, unit: 'g' }
        ],
        steps: [
          'Tritura las galletas y mézclalas con la mantequilla fundida. Extiende en la base de un molde y enfría 15 minutos.',
          'Bate el queso crema con el azúcar hasta que quede liso.',
          'Añade los huevos de uno en uno, batiendo entre cada uno, y por último la nata.',
          'Vierte la mezcla sobre la base fría.',
          'Hornea a 180 °C unos 45-50 minutos, hasta que los bordes estén cuajados y el centro tiemble ligeramente.',
          'Deja enfriar del todo y refrigera un mínimo de 4 horas antes de desmoldar.'
        ],
        notes: 'Se agrieta si se hornea a demasiada temperatura o se enfría de golpe: déjala templar dentro del horno apagado y entreabierto.'
      },
      {
        id: uid(), name: 'Arroz con leche', icon: 'arroz', cat: 'Postre',
        diff: 'Fácil', time: 45, portions: 6,
        items: [
          { ing: find('Arroz'), qty: 150, unit: 'g' },
          { ing: find('Leche'), qty: 1, unit: 'l' },
          { ing: find('Azúcar'), qty: 100, unit: 'g' },
          { ing: find('Canela'), qty: 1, unit: 'rama' },
          { ing: find('Limón'), qty: 1, unit: 'ud' }
        ],
        steps: [
          'Pon a hervir la leche con la piel del limón y la rama de canela.',
          'Cuando hierva, añade el arroz y baja el fuego al mínimo.',
          'Cuece 35-40 minutos removiendo a menudo, hasta que esté cremoso y el arroz tierno.',
          'Añade el azúcar en los últimos 10 minutos de cocción.',
          'Retira la piel de limón y la canela, y sirve templado o frío, con canela molida por encima.'
        ],
        notes: 'Remover a menudo es lo que suelta el almidón y hace que quede cremoso sin necesidad de nata.'
      },
      {
        id: uid(), name: 'Brownie de chocolate', icon: 'pastel', cat: 'Postre',
        diff: 'Media', time: 45, portions: 8,
        items: [
          { ing: find('Chocolate negro'), qty: 200, unit: 'g' },
          { ing: find('Mantequilla'), qty: 150, unit: 'g' },
          { ing: find('Huevo'), qty: 3, unit: 'ud' },
          { ing: find('Azúcar'), qty: 200, unit: 'g' },
          { ing: find('Harina'), qty: 100, unit: 'g' }
        ],
        steps: [
          'Funde el chocolate con la mantequilla al baño maría o en el microondas, en tandas cortas.',
          'Bate los huevos con el azúcar hasta que espumen un poco.',
          'Incorpora el chocolate fundido a los huevos, mezclando con movimientos envolventes.',
          'Añade la harina tamizada y mezcla justo hasta que desaparezca, sin batir de más.',
          'Vierte en un molde forrado y hornea a 180 °C unos 20-25 minutos.',
          'Debe quedar húmedo en el centro: un palillo debe salir con algunas migas pegadas, no limpio.'
        ],
        notes: 'Un brownie perfecto se hornea de menos, no de más — si el palillo sale limpio, ya se ha pasado.'
      },
      {
        id: uid(), name: 'Kuchen de manzana', icon: 'pastel', cat: 'Postre',
        diff: 'Media', time: 60, portions: 8,
        items: [
          { ing: find('Manzana'), qty: 4, unit: 'ud' },
          { ing: find('Harina'), qty: 250, unit: 'g' },
          { ing: find('Mantequilla'), qty: 150, unit: 'g' },
          { ing: find('Huevo'), qty: 2, unit: 'ud' },
          { ing: find('Azúcar'), qty: 150, unit: 'g' },
          { ing: find('Canela'), qty: 1, unit: 'cdta' }
        ],
        steps: [
          'Bate la mantequilla con la mitad del azúcar hasta que quede cremosa.',
          'Añade los huevos uno a uno, y luego la harina, hasta formar una masa blanda.',
          'Extiende la masa en un molde, cubriendo también un poco los bordes.',
          'Pela las manzanas, córtalas en láminas finas y colócalas encima de la masa, en forma de abanico.',
          'Espolvorea con el resto del azúcar mezclado con la canela.',
          'Hornea a 180 °C unos 40-45 minutos, hasta que la masa esté dorada y las manzanas tiernas.'
        ],
        notes: 'Los kuchen llegaron con la inmigración alemana al sur de Chile, y hoy son tan chilenos como cualquier otro postre de la lista.'
      },
      {
        id: uid(), name: 'Churros con chocolate', icon: 'pastel', cat: 'Postre',
        diff: 'Media', time: 40, portions: 4,
        items: [
          { ing: find('Harina'), qty: 250, unit: 'g' },
          { ing: find('Agua'), qty: 250, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' },
          { ing: find('Aceite de oliva'), qty: 500, unit: 'ml' },
          { ing: find('Leche'), qty: 500, unit: 'ml' },
          { ing: find('Chocolate negro'), qty: 200, unit: 'g' },
          { ing: find('Azúcar'), qty: 50, unit: 'g' }
        ],
        steps: [
          'Pon el agua con una pizca de sal a calentar hasta que hierva.',
          'Retira del fuego e incorpora la harina de golpe, mezclando enérgicamente hasta obtener una masa espesa y lisa.',
          'Deja templar la masa unos minutos y pásala a una manga pastelera con boquilla rizada.',
          'Da forma a los churros directamente sobre una sartén con aceite bien caliente, cortando con un cuchillo o tijera.',
          'Fríe hasta que estén dorados y crujientes por fuera, y escúrrelos sobre papel absorbente.',
          'Para el chocolate, calienta la leche con el chocolate troceado, removiendo hasta que se funda y espese ligeramente.',
          'Reboza los churros en azúcar si te gustan así, y sírvelos calientes para mojar en el chocolate.'
        ],
        notes: 'La masa debe quedar espesa pero manejable: si se desmorona al freír, le falta cocción tras añadir la harina; si no sale bien de la manga, añade un poco más de agua.'
      },
      {
        id: uid(), name: 'Crema catalana', icon: 'huevo', cat: 'Postre',
        diff: 'Media', time: 40, portions: 6,
        items: [
          { ing: find('Leche'), qty: 1, unit: 'l' },
          { ing: find('Huevo'), qty: 4, unit: 'ud' },
          { ing: find('Azúcar'), qty: 150, unit: 'g' },
          { ing: find('Maicena'), qty: 40, unit: 'g' },
          { ing: find('Canela'), qty: 1, unit: 'rama' },
          { ing: find('Naranja'), qty: 1, unit: 'ud' },
          { ing: find('Limón'), qty: 1, unit: 'ud' }
        ],
        steps: [
          'Calienta la leche con la piel de la naranja, la piel del limón y la rama de canela, sin que llegue a hervir. Retira del fuego y deja infusionar 30 minutos.',
          'Bate las yemas con la mitad del azúcar hasta que blanqueen, y añade la maicena disuelta en un poco de leche fría.',
          'Cuela la leche infusionada y viértela poco a poco sobre la mezcla de yemas, sin dejar de remover.',
          'Vuelve todo al fuego bajo y cocina removiendo sin parar hasta que espese, sin que llegue a hervir.',
          'Reparte en cazuelitas individuales y deja enfriar sin tapar.',
          'Justo antes de servir, espolvorea con el resto del azúcar y quema la superficie con un soplete de cocina hasta que se caramelice.'
        ],
        notes: 'Si no tienes soplete, un momento bajo el grill del horno también carameliza el azúcar — vigílala de cerca, se quema en segundos.'
      },
      {
        id: uid(), name: 'Tiramisú', icon: 'pastel', cat: 'Postre',
        diff: 'Media', time: 40, portions: 8,
        items: [
          { ing: find('Huevo'), qty: 4, unit: 'ud' },
          { ing: find('Azúcar'), qty: 100, unit: 'g' },
          { ing: find('Mascarpone'), qty: 500, unit: 'g' },
          { ing: find('Café'), qty: 300, unit: 'ml' },
          { ing: find('Bizcochos de soletilla'), qty: 24, unit: 'ud' },
          { ing: find('Chocolate en polvo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Separa las yemas de las claras. Bate las yemas con la mitad del azúcar hasta que blanqueen y dupliquen su volumen.',
          'Añade el mascarpone a las yemas batidas y mezcla con movimientos envolventes, sin batir fuerte, hasta lograr una crema lisa.',
          'Monta las claras a punto de nieve con el resto del azúcar e incorpóralas a la crema en dos o tres tandas, de abajo hacia arriba, para no bajar el aire.',
          'Prepara el café bien cargado y déjalo enfriar. Moja cada bizcocho por ambos lados durante un segundo, sin empaparlo o se deshará, y forma una primera capa en el molde.',
          'Cubre con la mitad de la crema, repite con otra capa de bizcochos mojados y termina con el resto de la crema, alisando la superficie.',
          'Tapa y refrigera al menos 4 horas, mejor toda la noche. Justo antes de servir, espolvorea generosamente con cacao en polvo.'
        ],
        notes: 'El nombre significa "tírame para arriba" en dialecto véneto, por el subidón del café. La receta original de los años 60-70 no lleva nata montada ni licor: solo huevo, mascarpone, café y cacao.'
      },
      {
        id: uid(), name: 'Panna cotta', icon: 'leche', cat: 'Postre',
        diff: 'Fácil', time: 20, portions: 6,
        items: [
          { ing: find('Nata'), qty: 500, unit: 'ml' },
          { ing: find('Leche'), qty: 100, unit: 'ml' },
          { ing: find('Azúcar'), qty: 80, unit: 'g' },
          { ing: find('Vainilla'), qty: null, unit: 'al gusto' },
          { ing: find('Gelatina en polvo'), qty: 7, unit: 'g' }
        ],
        steps: [
          'Hidrata la gelatina en polvo con un par de cucharadas de agua fría durante unos 5 minutos, hasta que se hinche.',
          'Calienta la nata junto con la leche, el azúcar y la vainilla en un cazo a fuego suave, removiendo, sin dejar que llegue a hervir.',
          'Retira del fuego y añade la gelatina hidratada, removiendo hasta que se disuelva por completo y no queden grumos.',
          'Reparte en moldes individuales y deja templar a temperatura ambiente antes de meter en la nevera.',
          'Refrigera un mínimo de 4 horas, hasta que cuaje con una textura temblorosa pero firme. Para desmoldar, sumerge la base del molde unos segundos en agua caliente.'
        ],
        notes: 'Panna cotta significa literalmente "nata cocida". No lleva huevo: toda la textura viene de la gelatina, así que si te pasas de cantidad queda como goma, la clave es que tiemble como un flan muy suave.'
      },
      {
        id: uid(), name: 'Tres leches', icon: 'pastel', cat: 'Postre',
        diff: 'Media', time: 70, portions: 10,
        items: [
          { ing: find('Huevo'), qty: 5, unit: 'ud' },
          { ing: find('Azúcar'), qty: 180, unit: 'g' },
          { ing: find('Harina'), qty: 200, unit: 'g' },
          { ing: find('Levadura'), qty: 1, unit: 'cdta' },
          { ing: find('Leche'), qty: 60, unit: 'ml' },
          { ing: find('Leche evaporada'), qty: 350, unit: 'ml' },
          { ing: find('Leche condensada'), qty: 350, unit: 'ml' },
          { ing: find('Nata'), qty: 300, unit: 'ml' },
          { ing: find('Canela'), qty: 1, unit: 'rama' }
        ],
        steps: [
          'Bate los huevos con el azúcar hasta que la mezcla blanquee y triplique su volumen. Añade la leche y mezcla suave.',
          'Incorpora la harina tamizada con la levadura en dos tandas, con movimientos envolventes para no perder el aire.',
          'Vierte en un molde engrasado y hornea a 180°C unos 25-30 minutos, hasta que al pinchar con un palillo salga limpio. Deja enfriar por completo.',
          'Mezcla la leche evaporada, la leche condensada y la mitad de la nata. Pincha el bizcocho frío por toda la superficie con un tenedor y vierte la mezcla poco a poco, dejando que se absorba.',
          'Cubre y refrigera mínimo 4 horas, mejor toda la noche, para que quede bien empapado.',
          'Antes de servir, monta el resto de la nata y cubre el pastel. Espolvorea con canela desmenuzada.'
        ],
        notes: 'Aunque se asocia a México y Nicaragua, la técnica de empapar bizcochos en leche viene de recetas europeas de "sopa borracha"; la lata de leche condensada lo popularizó a mediados del siglo XX.'
      },
      {
        id: uid(), name: 'Alfajores de maicena', icon: 'rodillo', cat: 'Postre',
        diff: 'Media', time: 50, portions: 12,
        items: [
          { ing: find('Mantequilla'), qty: 150, unit: 'g' },
          { ing: find('Azúcar'), qty: 100, unit: 'g' },
          { ing: find('Huevo'), qty: 3, unit: 'ud' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Maicena'), qty: 300, unit: 'g' },
          { ing: find('Harina'), qty: 100, unit: 'g' },
          { ing: find('Levadura'), qty: 1, unit: 'cdta' },
          { ing: find('Manjar'), qty: 400, unit: 'g' },
          { ing: find('Coco rallado'), qty: 100, unit: 'g' }
        ],
        steps: [
          'Bate la mantequilla en pomada con el azúcar hasta que quede cremosa. Añade las yemas de huevo una a una y la ralladura de limón.',
          'Tamiza juntas la maicena, la harina y la levadura, e incorpóralas a la mezcla hasta formar una masa blanda que no se pegue en las manos.',
          'Estira la masa con rodillo dejándola de un centímetro de grosor y corta círculos con un cortapastas o un vaso.',
          'Hornea a 180°C unos 10-12 minutos, vigilando que no se doren: los alfajores chilenos deben quedar pálidos, no tostados.',
          'Deja enfriar por completo y une de a dos galletas con una capa generosa de manjar en el centro, dejando que rebose un poco por los bordes.',
          'Pasa los bordes de cada alfajor por coco rallado, presionando suavemente para que se pegue. Deja reposar un par de horas antes de comer.'
        ],
        notes: 'Usar maicena en vez de solo harina es lo que da esa textura que se deshace en la boca. Se dice que mejoran al día siguiente, cuando el manjar humedece un poco la masa.'
      },
      {
        id: uid(), name: 'Torrijas', icon: 'pan', cat: 'Postre',
        diff: 'Fácil', time: 30, portions: 6,
        items: [
          { ing: find('Pan'), qty: 1, unit: 'ud' },
          { ing: find('Leche'), qty: 500, unit: 'ml' },
          { ing: find('Canela'), qty: 1, unit: 'rama' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Azúcar'), qty: 100, unit: 'g' },
          { ing: find('Huevo'), qty: 2, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta el pan del día anterior en rebanadas de 2-3 cm: cuanto más duro esté, mejor absorbe sin deshacerse.',
          'Calienta la leche con la rama de canela y la piel de limón, sin dejar que hierva, y deja infusionar tapada unos minutos. Cuela y añade la mitad del azúcar.',
          'Remoja cada rebanada en la leche templada, dejándola unos segundos por cada lado hasta que esté húmeda pero entera.',
          'Pasa las rebanadas por huevo batido y fríelas en abundante aceite bien caliente hasta que doren por ambos lados.',
          'Escurre sobre papel absorbente y reboza en caliente con el resto del azúcar mezclado con canela.'
        ],
        notes: 'Es el postre típico de Semana Santa en España, pensado originalmente para aprovechar el pan duro. En algunas regiones se remojan en vino dulce en vez de leche, las "torrijas de vino".'
      },
      {
        id: uid(), name: 'Natillas', icon: 'huevo', cat: 'Postre',
        diff: 'Fácil', time: 30, portions: 6,
        items: [
          { ing: find('Leche'), qty: 600, unit: 'ml' },
          { ing: find('Canela'), qty: 1, unit: 'rama' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Huevo'), qty: 4, unit: 'ud' },
          { ing: find('Azúcar'), qty: 75, unit: 'g' },
          { ing: find('Maicena'), qty: 15, unit: 'g' },
          { ing: find('Galletas'), qty: 6, unit: 'ud' }
        ],
        steps: [
          'Calienta la leche junto con la rama de canela y la piel de limón a fuego suave unos 10 minutos, sin que llegue a hervir. Retira la canela y el limón.',
          'Bate las yemas con el azúcar hasta que blanqueen, y añade la maicena disuelta en un poco de leche fría.',
          'Vierte un poco de la leche caliente sobre las yemas sin dejar de batir, para atemperarlas, y luego incorpora todo de nuevo al cazo.',
          'Cocina a fuego bajo removiendo constantemente hasta que espese y nape la cuchara, unos 10 minutos. No dejes que hierva o se cortará.',
          'Reparte en boles individuales, apoya una galleta encima de cada uno y deja enfriar en la nevera al menos 2 horas antes de servir.'
        ],
        notes: 'La diferencia con el flan es que las natillas no se cuajan al horno ni llevan caramelo: espesan solo con el calor y la maicena, quedando más líquidas y sedosas.'
      },
      {
        id: uid(), name: 'Cannoli sicilianos', icon: 'queso', cat: 'Postre',
        diff: 'Difícil', time: 60, portions: 12,
        items: [
          { ing: find('Harina'), qty: 250, unit: 'g' },
          { ing: find('Mantequilla'), qty: 30, unit: 'g' },
          { ing: find('Azúcar'), qty: 100, unit: 'g' },
          { ing: find('Vino blanco'), qty: 60, unit: 'ml' },
          { ing: find('Huevo'), qty: 1, unit: 'ud' },
          { ing: find('Ricotta'), qty: 400, unit: 'g' },
          { ing: find('Chocolate negro'), qty: 50, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Mezcla la harina con una cucharada de azúcar, añade la mantequilla derretida y el vino blanco, y amasa hasta obtener una masa lisa y elástica. Envuélvela y deja reposar 30 minutos.',
          'Estira la masa muy fina, corta círculos y enróllalos alrededor de un tubo o caña metálica, sellando el borde con un poco de huevo batido.',
          'Fríe los tubos en aceite bien caliente 2-3 minutos, hasta que salgan burbujas y se doren de forma pareja. Retira sobre papel absorbente y deja enfriar antes de sacar el molde.',
          'Escurre bien la ricotta para quitar el suero y bátela con el resto del azúcar hasta que quede cremosa. Añade el chocolate negro picado.',
          'Rellena los tubos de masa fría con la crema de ricotta usando una manga pastelera, justo antes de servir.'
        ],
        notes: 'Rellenar los cannoli con antelación es el error más común: la humedad de la ricotta reblandece la masa frita en minutos, así que se rellenan literalmente al momento de comer, nunca antes.'
      },
      {
        id: uid(), name: 'Buñuelos de rodilla', icon: 'harina', cat: 'Postre',
        diff: 'Media', time: 70, portions: 12,
        items: [
          { ing: find('Harina'), qty: 300, unit: 'g' },
          { ing: find('Levadura'), qty: 1, unit: 'cdta' },
          { ing: find('Sal'), qty: 1, unit: 'pizca' },
          { ing: find('Huevo'), qty: 1, unit: 'ud' },
          { ing: find('Mantequilla'), qty: 30, unit: 'g' },
          { ing: find('Leche'), qty: 120, unit: 'ml' },
          { ing: find('Azúcar'), qty: 50, unit: 'g' },
          { ing: find('Chancaca'), qty: 200, unit: 'g' },
          { ing: find('Canela'), qty: 1, unit: 'rama' },
          { ing: find('Naranja'), qty: 1, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Mezcla la harina con la levadura y la sal. Añade el huevo, la mantequilla derretida y la leche tibia, y amasa hasta lograr una masa suave que no se pegue.',
          'Deja reposar la masa tapada unos 30 minutos y divide en bolas del tamaño de una pelota de golf.',
          'Estira cada bola muy fina, apoyándola sobre la rodilla cubierta con un paño o sobre una superficie enharinada, hasta casi transparentar.',
          'Fríe cada disco en abundante aceite caliente unos 30-40 segundos por lado, hasta que dore y se llene de burbujas.',
          'Para la miel, hierve la chancaca troceada con agua, la rama de canela y la piel de naranja hasta que espese ligeramente.',
          'Sirve los buñuelos calientes espolvoreados con azúcar y canela, o bañados con la miel de chancaca.'
        ],
        notes: 'Se llaman "de rodilla" porque tradicionalmente la masa se estira apoyándola literalmente sobre la rodilla hasta dejarla casi transparente, antes de freírla.'
      },
      {
        id: uid(), name: 'Mousse de chocolate', icon: 'huevo', cat: 'Postre',
        diff: 'Media', time: 25, portions: 6,
        items: [
          { ing: find('Chocolate negro'), qty: 200, unit: 'g' },
          { ing: find('Mantequilla'), qty: 20, unit: 'g' },
          { ing: find('Huevo'), qty: 4, unit: 'ud' },
          { ing: find('Azúcar'), qty: 30, unit: 'g' },
          { ing: find('Sal'), qty: 1, unit: 'pizca' }
        ],
        steps: [
          'Funde el chocolate junto con la mantequilla al baño maría, removiendo hasta obtener una mezcla lisa y brillante. Retira del fuego y deja templar un par de minutos.',
          'Separa las claras de las yemas. Incorpora las yemas una a una al chocolate templado, batiendo bien después de cada una.',
          'Monta las claras con la pizca de sal a punto de nieve suave, añadiendo el azúcar a mitad de camino para que se estabilicen.',
          'Incorpora un tercio de las claras montadas al chocolate para aligerarlo, mezclando con energía. Añade el resto en dos tandas, con movimientos envolventes de abajo hacia arriba, hasta que no queden grumos blancos.',
          'Reparte en vasitos o copas y refrigera un mínimo de 3 horas antes de servir.'
        ],
        notes: 'La receta francesa clásica no lleva nata: toda la textura aireada viene de las claras montadas. Sobrebatir las claras es el fallo más común, si quedan demasiado firmes se cortan y el mousse pierde volumen.'
      },
      {
        id: uid(), name: 'Picarones', icon: 'aceite', cat: 'Postre',
        diff: 'Media', time: 90, portions: 15,
        items: [
          { ing: find('Zapallo'), qty: 300, unit: 'g' },
          { ing: find('Camote'), qty: 2, unit: 'ud' },
          { ing: find('Canela'), qty: 1, unit: 'rama' },
          { ing: find('Harina'), qty: 250, unit: 'g' },
          { ing: find('Levadura'), qty: 1, unit: 'cdta' },
          { ing: find('Azúcar'), qty: 30, unit: 'g' },
          { ing: find('Chancaca'), qty: 300, unit: 'g' },
          { ing: find('Naranja'), qty: 1, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cocina el zapallo y el camote pelados y troceados en agua con la rama de canela hasta que estén muy blandos. Escurre y aplasta hasta obtener un puré fino, sin grumos.',
          'Disuelve la levadura con un poco de azúcar y agua tibia y déjala reposar 10 minutos hasta que espume.',
          'Mezcla el puré tibio con la harina, la levadura activada y el resto del azúcar, hasta lograr una masa pegajosa, más líquida que una masa de pan.',
          'Deja fermentar tapada en un lugar cálido durante una hora, hasta que doble su volumen y esté llena de burbujas.',
          'Con las manos mojadas, forma anillos con la masa y fríelos en abundante aceite caliente hasta que doren y floten, unos 3-4 minutos por lado.',
          'Para la miel, hierve la chancaca troceada con agua, canela y piel de naranja hasta que espese. Sirve los picarones calientes bañados con la miel.'
        ],
        notes: 'Es el postre criollo más antiguo de Perú: nació como adaptación colonial de los buñuelos españoles, reemplazando la harina de trigo por zapallo y camote, productos americanos más baratos en la época virreinal.'
      },

      /* ---- salsas (además del alioli, arriba) ---- */
      {
        id: uid(), name: 'Mayonesa', icon: 'huevo', cat: 'Salsa',
        diff: 'Fácil', time: 5, portions: 4,
        items: [
          { ing: find('Huevo'), qty: 1, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: 200, unit: 'ml' },
          { ing: find('Limón'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pon el huevo entero en el vaso de la batidora, con el aceite por encima.',
          'Introduce la batidora hasta el fondo, pégala bien al fondo del vaso y no la muevas.',
          'Bate sin mover hasta que empiece a emulsionar y blanquear en la base.',
          'Cuando esté ligada por abajo, ve subiendo la batidora muy despacio.',
          'Ajusta de sal y unas gotas de limón al final.'
        ],
        notes: 'El truco es no mover la batidora al principio: así se forma la emulsión desde el fondo.'
      },
      {
        id: uid(), name: 'Salsa de tomate casera', icon: 'tomate', cat: 'Salsa',
        diff: 'Fácil', time: 40, portions: 4,
        items: [
          { ing: find('Tomate'), qty: 1, unit: 'kg' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Albahaca'), qty: null, unit: 'al gusto' },
          { ing: find('Azúcar'), qty: 1, unit: 'cdta' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pica muy fino la cebolla y el ajo, y sofríelos en el aceite a fuego bajo hasta que estén tiernos y dulces.',
          'Añade el tomate triturado, la sal y el azúcar (para corregir la acidez).',
          'Cocina a fuego bajo 30-35 minutos, removiendo de vez en cuando, hasta que espese.',
          'Añade la albahaca fresca los últimos minutos.',
          'Tritura si la quieres fina, o déjala tal cual si te gusta con tropezones.'
        ],
        notes: 'Se congela perfectamente en raciones — merece la pena hacer el doble.'
      },
      {
        id: uid(), name: 'Vinagreta', icon: 'aceite', cat: 'Salsa',
        diff: 'Fácil', time: 5, portions: 4,
        items: [
          { ing: find('Aceite de oliva'), qty: 6, unit: 'cda' },
          { ing: find('Vinagre'), qty: 2, unit: 'cda' },
          { ing: find('Mostaza'), qty: 1, unit: 'cdta' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' },
          { ing: find('Pimienta negra'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pon el vinagre, la mostaza, la sal y la pimienta en un bote con tapa.',
          'Añade el aceite y cierra bien el bote.',
          'Agita con fuerza hasta que emulsione y quede homogénea.',
          'Vuelve a agitar justo antes de usarla: se separa en reposo.'
        ],
        notes: 'La mostaza no es solo sabor: ayuda a que el aceite y el vinagre liguen y no se separen tan rápido.'
      },
      {
        id: uid(), name: 'Bechamel', icon: 'leche', cat: 'Salsa',
        diff: 'Fácil', time: 15, portions: 4,
        items: [
          { ing: find('Mantequilla'), qty: 50, unit: 'g' },
          { ing: find('Harina'), qty: 50, unit: 'g' },
          { ing: find('Leche'), qty: 500, unit: 'ml' },
          { ing: find('Nuez moscada'), qty: null, unit: 'pizca' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Derrite la mantequilla a fuego medio-bajo.',
          'Añade la harina de golpe y cocina 2 minutos removiendo, sin dejar que se dore.',
          'Vierte la leche poco a poco, sin dejar de remover con varillas, para que no se formen grumos.',
          'Cocina 8-10 minutos a fuego bajo hasta que espese, removiendo a menudo.',
          'Sazona con sal y nuez moscada.'
        ],
        notes: 'Si salen grumos, pasa la batidora un momento: no pasa nada, se arregla.'
      },
      {
        id: uid(), name: 'Chimichurri', icon: 'hierba', cat: 'Salsa',
        diff: 'Fácil', time: 10, portions: 4,
        items: [
          { ing: find('Perejil'), qty: null, unit: 'al gusto' },
          { ing: find('Ajo'), qty: 3, unit: 'diente' },
          { ing: find('Aceite de oliva'), qty: 150, unit: 'ml' },
          { ing: find('Vinagre'), qty: 30, unit: 'ml' },
          { ing: find('Guindilla'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pica muy fino el perejil y el ajo.',
          'Mézclalos en un bote con el aceite, el vinagre, la guindilla picada y la sal.',
          'Remueve bien y deja reposar al menos 1 hora antes de usarla, para que se integren los sabores.',
          'Se conserva en la nevera varios días, tapada.'
        ],
        notes: 'Es la salsa clásica para carnes a la parrilla, pero también anima una verdura asada o un pan tostado.'
      },
      {
        id: uid(), name: 'Pebre', icon: 'tomate', cat: 'Salsa',
        diff: 'Fácil', time: 10, portions: 4,
        items: [
          { ing: find('Tomate'), qty: 3, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Cilantro'), qty: null, unit: 'al gusto' },
          { ing: find('Ajo'), qty: 1, unit: 'diente' },
          { ing: find('Guindilla'), qty: null, unit: 'al gusto' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Lima'), qty: 1, unit: 'ud' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pica el tomate, la cebolla, el cilantro, el ajo y la guindilla muy finos, en dados pequeños.',
          'Mezcla todo en un bol.',
          'Añade el aceite, el zumo de lima y la sal, y remueve bien.',
          'Deja reposar 10 minutos antes de servir, para que se mezclen los sabores.'
        ],
        notes: 'Se sirve con pan o con sopaipillas — es el condimento que acompaña casi cualquier comida chilena.'
      },
      {
        id: uid(), name: 'Salsa romesco', icon: 'tomate', cat: 'Salsa',
        diff: 'Media', time: 40, portions: 4,
        items: [
          { ing: find('Tomate'), qty: 4, unit: 'ud' },
          { ing: find('Ajo'), qty: 4, unit: 'diente' },
          { ing: find('Almendras'), qty: 50, unit: 'g' },
          { ing: find('Pan'), qty: 1, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: 4, unit: 'cda' },
          { ing: find('Vinagre'), qty: 1, unit: 'cda' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Guindilla'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Asa los tomates y los ajos con piel en el horno a 200 °C, 15-20 minutos, hasta que estén tiernos.',
          'Tuesta ligeramente las almendras y el pan en una sartén, hasta que doren.',
          'Pela los tomates y los ajos ya templados.',
          'Tritura todo junto: tomate, ajo, almendras, pan, aceite, vinagre, pimentón, guindilla y sal, hasta conseguir una salsa espesa.',
          'Ajusta de sal y vinagre al gusto.'
        ],
        notes: 'La receta tradicional catalana lleva ñoras (pimientos secos); el pimentón es una versión simplificada que funciona muy bien en casa.'
      },
      {
        id: uid(), name: 'Salsa pomodoro', icon: 'tomate', cat: 'Salsa',
        diff: 'Fácil', time: 25, portions: 4,
        items: [
          { ing: find('Tomate'), qty: 1, unit: 'kg' },
          { ing: find('Aceite de oliva'), qty: 5, unit: 'cda' },
          { ing: find('Ajo'), qty: 3, unit: 'diente' },
          { ing: find('Albahaca'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Calienta el aceite de oliva a fuego bajo con los dientes de ajo machacados (sin picar), para que aromaticen el aceite sin quemarse.',
          'Cuando el ajo esté dorado y fragante, retíralo si prefieres un sabor más suave, o déjalo si te gusta más presente.',
          'Añade el tomate, triturándolo a mano al echarlo a la sartén, para que quede con textura y no como puré.',
          'Cocina a fuego medio-bajo, sin tapar, 15-20 minutos, hasta que el tomate espese y pierda el sabor a crudo.',
          'Sazona con sal y añade la albahaca fresca troceada con la mano en el último minuto, para que no pierda su aroma.'
        ],
        notes: 'A diferencia de una salsa de tomate con sofrito de cebolla y cocción larga, el pomodoro es más directo: solo tomate, aceite, ajo y albahaca — la cebolla es opcional y no lleva azúcar.'
      },
      {
        id: uid(), name: 'Salsa Alfredo', icon: 'queso', cat: 'Salsa',
        diff: 'Media', time: 20, portions: 4,
        items: [
          { ing: find('Pasta fettuccine'), qty: 400, unit: 'g' },
          { ing: find('Mantequilla'), qty: 100, unit: 'g' },
          { ing: find('Queso parmesano'), qty: 150, unit: 'g' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' },
          { ing: find('Pimienta negra'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece la pasta en agua con sal hasta que esté al dente, y reserva 1 taza del agua de cocción antes de escurrir.',
          'Deja templar el agua reservada un par de minutos: demasiado caliente derrite el queso de golpe y corta la salsa.',
          'En la misma olla, ya fuera del fuego, añade la mantequilla y el queso parmesano rallado sobre la pasta escurrida.',
          'Ve añadiendo el agua de cocción, una cucharada cada vez, removiendo sin parar, hasta que ligue en una salsa sedosa que cubra la pasta.',
          'Sazona con pimienta negra recién molida y un poco de sal si hace falta.'
        ],
        notes: 'La receta italiana original no lleva nata: la cremosidad viene solo de emulsionar mantequilla, parmesano y el almidón del agua de cocción. La versión con nata es una adaptación americana, también válida pero distinta.'
      },
      {
        id: uid(), name: 'Demi-glace rápida', icon: 'olla', cat: 'Salsa',
        diff: 'Difícil', time: 70, portions: 6,
        items: [
          { ing: find('Caldo'), qty: 1, unit: 'l' },
          { ing: find('Vino tinto'), qty: 200, unit: 'ml' },
          { ing: find('Cebolla'), qty: 0.5, unit: 'ud' },
          { ing: find('Zanahoria'), qty: 0.5, unit: 'ud' },
          { ing: find('Apio'), qty: 1, unit: 'rama' },
          { ing: find('Concentrado de tomate'), qty: 1, unit: 'cda' },
          { ing: find('Mantequilla'), qty: 20, unit: 'g' },
          { ing: find('Harina'), qty: 20, unit: 'g' },
          { ing: find('Tomillo'), qty: 1, unit: 'rama' },
          { ing: find('Laurel'), qty: 1, unit: 'hoja' },
          { ing: find('Pimienta negra'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Sofríe la cebolla, la zanahoria y el apio en un poco de aceite o mantequilla, a fuego medio, hasta que estén bien dorados.',
          'Añade el concentrado de tomate y cocina 1-2 minutos para que pierda el sabor a crudo.',
          'Vierte el vino tinto y raspa el fondo de la olla con una cuchara de madera para despegar los jugos dorados pegados: ahí está gran parte del sabor.',
          'Deja reducir el vino a fuego medio hasta que quede casi un jarabe, unos 3-5 minutos.',
          'Añade el caldo, el tomillo, el laurel y la pimienta, y deja cocer a fuego bajo 40-50 minutos, hasta que se reduzca a la mitad aproximadamente.',
          'Cuela la salsa presionando bien las verduras para sacarles todo el jugo, y descarta los sólidos.',
          'Vuelve a poner la salsa colada al fuego. Amasa la mantequilla con la harina hasta formar una pasta y añádela poco a poco, sin dejar de remover, hasta que la salsa espese y quede brillante.'
        ],
        notes: 'La demi-glace clásica francesa se hace con huesos de ternera asados y muchas horas de cocción (salsa española reducida sobre fondo oscuro). Esta es la versión rápida para casa, a partir de caldo ya hecho: no tiene la misma profundidad, pero se acerca mucho en mucho menos tiempo.'
      },
      {
        id: uid(), name: 'Salsa holandesa', icon: 'huevo', cat: 'Salsa',
        diff: 'Difícil', time: 20, portions: 4,
        items: [
          { ing: find('Mantequilla'), qty: 200, unit: 'g' },
          { ing: find('Huevo'), qty: 3, unit: 'ud' },
          { ing: find('Agua'), qty: 1, unit: 'cda' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Clarifica la mantequilla al baño maría a fuego muy suave, dejando que se separe en una capa dorada arriba y el suero blanco abajo; usa solo la parte clara y resérvala tibia, entre 50 y 55 °C — ni fría (no liga) ni muy caliente (cuaja el huevo).',
          'Bate las yemas con la cucharada de agua en un bol al baño maría, sin que el fondo toque el agua, a fuego muy bajo y sin parar, hasta que espesen y doblen su volumen formando una crema pálida que deja rastro al levantar las varillas.',
          'Si notas que el bol se calienta demasiado rápido, retíralo un momento del fuego: si las yemas pasan de los 70 °C cuajan y ya no hay vuelta atrás.',
          'Incorpora la mantequilla clarificada en un hilo muy fino sin dejar de batir, empezando gota a gota hasta que la mezcla empiece a ligar, y luego en chorro más seguido.',
          'Sazona con zumo de limón y sal, y sirve enseguida o consérvala al baño maría a no más de 50 °C — no aguanta bien ni el frío ni el recalentado.'
        ],
        notes: 'Si se corta, rescátala batiendo una yema nueva con una cucharada de agua en un bol limpio e incorporando la salsa cortada poco a poco, como si fuera la mantequilla.'
      },
      {
        id: uid(), name: 'Salsa bearnesa', icon: 'hierba', cat: 'Salsa',
        diff: 'Difícil', time: 25, portions: 4,
        items: [
          { ing: find('Chalota'), qty: 2, unit: 'ud' },
          { ing: find('Vinagre'), qty: 100, unit: 'ml' },
          { ing: find('Vino blanco'), qty: 50, unit: 'ml' },
          { ing: find('Estragón'), qty: 2, unit: 'rama' },
          { ing: find('Huevo'), qty: 3, unit: 'ud' },
          { ing: find('Mantequilla'), qty: 200, unit: 'g' },
          { ing: find('Pimienta negra'), qty: null, unit: 'pizca' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pica la chalota bien fina y ponla en un cazo con el vinagre, el vino blanco, la pimienta y la mitad del estragón; reduce a fuego medio hasta que quede casi seco, apenas un par de cucharadas de líquido concentrado.',
          'Cuela la reducción para quedarte solo con el líquido, y déjala templar.',
          'Clarifica la mantequilla al baño maría y resérvala tibia, entre 50 y 55 °C, igual que para una holandesa.',
          'Bate las yemas con la reducción templada en un bol al baño maría, sin parar, hasta que espesen y doblen su volumen.',
          'Añade la mantequilla clarificada en un hilo fino, batiendo sin parar, hasta que emulsione y espese como una mayonesa.',
          'Termina con el resto del estragón fresco picado y ajusta de sal.'
        ],
        notes: 'Es una salsa "hija" de la holandesa: el mismo montaje de yema y mantequilla clarificada, pero cambia el limón por una reducción ácida de vinagre, vino, chalota y estragón.'
      },
      {
        id: uid(), name: 'Pesto genovés', icon: 'hierba', cat: 'Salsa',
        diff: 'Media', time: 15, portions: 4,
        items: [
          { ing: find('Albahaca'), qty: 60, unit: 'g' },
          { ing: find('Piñones'), qty: 30, unit: 'g' },
          { ing: find('Queso parmesano'), qty: 50, unit: 'g' },
          { ing: find('Ajo'), qty: 1, unit: 'diente' },
          { ing: find('Aceite de oliva'), qty: 100, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'pizca' }
        ],
        steps: [
          'Machaca el ajo con una pizca de sal gruesa en el mortero, girando la maja contra las paredes, hasta hacer una pasta.',
          'Añade los piñones y sigue majando hasta integrarlos con el ajo.',
          'Incorpora la albahaca en tandas pequeñas y macha con movimientos circulares, aplastando las hojas en vez de cortarlas — así no se oxidan ni se oscurecen tan rápido.',
          'Ve añadiendo el aceite de oliva poco a poco mientras sigues trabajando la pasta, hasta que ligue en una salsa untuosa.',
          'Fuera del mortero, mezcla el parmesano rallado a mano con una cuchara — si lo majas junto con el resto, el calor de la fricción lo apelmaza.',
          'Prueba y ajusta de sal. Si usas batidora en lugar de mortero, trabaja en pulsos cortos y con el vaso bien frío, porque el calor del motor quema la albahaca y la vuelve marrón.'
        ],
        notes: 'El Consorzio del Pesto Genovese estandariza esta receta desde 2005, y desde 2008 existe un campeonato mundial de pesto al mortero en Génova.'
      },
      {
        id: uid(), name: 'Salsa teriyaki', icon: 'sal', cat: 'Salsa',
        diff: 'Fácil', time: 20, portions: 4,
        items: [
          { ing: find('Salsa de soja'), qty: 120, unit: 'ml' },
          { ing: find('Mirin'), qty: 60, unit: 'ml' },
          { ing: find('Sake'), qty: 60, unit: 'ml' },
          { ing: find('Azúcar'), qty: 2, unit: 'cda' }
        ],
        steps: [
          'Mezcla la salsa de soja, el mirin, el sake y el azúcar en un cazo pequeño.',
          'Lleva a hervor suave y baja el fuego al mínimo, sin tapar.',
          'Cuece 10-15 minutos sin remover demasiado, dejando que reduzca — el propio azúcar concentrándose es lo que espesa la salsa, no hace falta maicena.',
          'Sabrás que está lista cuando pase de un marrón oscuro y líquido a un tono cobrizo brillante que se queda pegado a la cuchara.',
          'Úsala para pincelar carne o pescado a la plancha en los últimos minutos de cocción, no antes: el azúcar se quema si toca el fuego directo demasiado pronto.'
        ],
        notes: 'El nombre viene de teri (brillo, por el glaseado) y yaki (a la plancha): es una técnica de acabado, no un adobo largo.'
      },
      {
        id: uid(), name: 'Salsa BBQ', icon: 'tomate', cat: 'Salsa',
        diff: 'Media', time: 40, portions: 6,
        items: [
          { ing: find('Ketchup'), qty: 200, unit: 'g' },
          { ing: find('Vinagre'), qty: 2, unit: 'cda' },
          { ing: find('Azúcar moreno'), qty: 3, unit: 'cda' },
          { ing: find('Salsa inglesa'), qty: 1, unit: 'cdta' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Ajo'), qty: 1, unit: 'diente' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pica el ajo muy fino.',
          'Junta todos los ingredientes en un cazo y mezcla bien.',
          'Lleva a hervor suave y baja el fuego enseguida a mínimo.',
          'Cuece destapada 25-30 minutos, removiendo de vez en cuando, hasta que espese notablemente y se pegue a la cuchara — aquí no hay espesante, todo el cuerpo viene de reducir el agua.',
          'Prueba y ajusta el equilibrio entre dulce y ácido con más azúcar o vinagre antes de retirar del fuego.'
        ],
        notes: 'Es del estilo Kansas City: la más espesa y dulce de las salsas barbacoa regionales de EE.UU., frente a las más líquidas y avinagradas de Carolina.'
      },
      {
        id: uid(), name: 'Salsa agridulce', icon: 'tomate', cat: 'Salsa',
        diff: 'Fácil', time: 15, portions: 4,
        items: [
          { ing: find('Ketchup'), qty: 3, unit: 'cda' },
          { ing: find('Vinagre'), qty: 3, unit: 'cda' },
          { ing: find('Azúcar'), qty: 3, unit: 'cda' },
          { ing: find('Salsa de soja'), qty: 1, unit: 'cda' },
          { ing: find('Agua'), qty: 150, unit: 'ml' },
          { ing: find('Maicena'), qty: 1, unit: 'cda' }
        ],
        steps: [
          'Disuelve la maicena en un par de cucharadas del agua fría, aparte, hasta que no queden grumos.',
          'En un cazo, mezcla el ketchup, el vinagre, el azúcar, la salsa de soja y el resto del agua.',
          'Lleva a hervor a fuego medio-alto, removiendo para que el azúcar se disuelva.',
          'En cuanto hierva, añade la mezcla de maicena sin dejar de remover, y deja burbujear 1-2 minutos — la maicena solo espesa de verdad cuando llega a hervir, no antes.',
          'Retira cuando tenga una textura brillante y espesa que cubre la cuchara.'
        ],
        notes: 'La versión de restaurante suele sumar piña y pimiento; esta es la base rápida de casa, la misma que sirve para bañar rollitos o cerdo agridulce.'
      },
      {
        id: uid(), name: 'Salsa verde mexicana', icon: 'chile', cat: 'Salsa',
        diff: 'Fácil', time: 25, portions: 4,
        items: [
          { ing: find('Tomatillo'), qty: 8, unit: 'ud' },
          { ing: find('Chile verde'), qty: 2, unit: 'ud' },
          { ing: find('Cebolla'), qty: 0.25, unit: 'ud' },
          { ing: find('Ajo'), qty: 1, unit: 'diente' },
          { ing: find('Cilantro'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Quita la cáscara seca a los tomatillos y lávalos para sacarles lo pegajoso.',
          'Ponlos en una olla pequeña con los chiles y el ajo, cubiertos apenas con agua, y cuece tapado a fuego medio 10-15 minutos, hasta que los tomatillos pasen de verde brillante a un verde oliva apagado y se ablanden.',
          'Escurre, guardando un poco del agua de cocción.',
          'Licúa los tomatillos con los chiles, el ajo, la cebolla y el cilantro, añadiendo agua de cocción poco a poco hasta el espesor que prefieras.',
          'No licúes de más: queda mejor con algo de textura, no como puré fino.',
          'Ajusta de sal.'
        ],
        notes: 'Esta es la versión cocida; la cruda se licúa todo en verde sin cocer antes, y queda más ácida y de color más vivo.'
      },
      {
        id: uid(), name: 'Salsa ranchera', icon: 'tomate', cat: 'Salsa',
        diff: 'Media', time: 30, portions: 4,
        items: [
          { ing: find('Tomate'), qty: 4, unit: 'ud' },
          { ing: find('Chile verde'), qty: 2, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Cebolla'), qty: 0.5, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: 1, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Asa los tomates enteros, los ajos sin pelar y los chiles directamente en una sartén o comal muy caliente, sin aceite, dando vueltas hasta que la piel se queme de manera pareja por todos lados.',
          'Deja templar y pela los ajos ya asados.',
          'Licúa los tomates con su piel y jugo, los ajos, los chiles y la cebolla, hasta lograr una salsa de textura media, no del todo fina.',
          'Calienta el aceite en una sartén y vierte la salsa licuada — este paso de "freír la salsa" no es opcional: le quita el sabor a crudo y la espesa de verdad.',
          'Cocina a fuego medio 8-10 minutos, removiendo de vez en cuando, hasta que oscurezca ligeramente y espese.',
          'Sazona con sal.'
        ],
        notes: 'El asado de los tomates es lo que distingue a la ranchera de una salsa de tomate hervida: da un dulzor caramelizado y un toque ahumado que el tomate crudo no tiene.'
      },
      {
        id: uid(), name: 'Salsa de champiñones', icon: 'seta', cat: 'Salsa',
        diff: 'Media', time: 25, portions: 4,
        items: [
          { ing: find('Champiñones'), qty: 300, unit: 'g' },
          { ing: find('Cebolla'), qty: 0.5, unit: 'ud' },
          { ing: find('Mantequilla'), qty: 30, unit: 'g' },
          { ing: find('Vino blanco'), qty: 100, unit: 'ml' },
          { ing: find('Nata'), qty: 200, unit: 'ml' },
          { ing: find('Pimienta negra'), qty: null, unit: 'pizca' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta los champiñones en láminas y dóralos en tandas, sin amontonarlos, con parte de la mantequilla a fuego fuerte — si pones demasiados de golpe, sueltan agua y se cuecen en vez de dorarse.',
          'Retira los champiñones y en la misma sartén pocha la cebolla picada fina con el resto de la mantequilla, a fuego medio, hasta que esté transparente.',
          'Vierte el vino blanco y raspa el fondo de la sartén con una cuchara de madera para despegar los restos dorados — ahí está buena parte del sabor.',
          'Deja reducir el vino casi del todo, hasta que apenas quede líquido.',
          'Añade la nata y los champiñones dorados, baja el fuego y cuece 10-15 minutos, hasta que espese y nape el dorso de una cuchara.',
          'Sazona con sal y pimienta negra recién molida.'
        ],
        notes: 'Con un vino blanco seco queda más clásica; con uno más afrutado, más suave y dulce — ambas versiones son válidas.'
      },
      {
        id: uid(), name: 'Salsa de curry', icon: 'arroz', cat: 'Salsa',
        diff: 'Media', time: 30, portions: 4,
        items: [
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Curry en polvo'), qty: 2, unit: 'cdta' },
          { ing: find('Leche de coco'), qty: 400, unit: 'ml' },
          { ing: find('Caldo'), qty: 100, unit: 'ml' },
          { ing: find('Aceite de oliva'), qty: 2, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pica la cebolla y el ajo bien finos.',
          'Calienta el aceite a fuego medio-bajo y pocha la cebolla y el ajo 5 minutos, removiendo, hasta que la cebolla esté transparente y el ajo apenas dorado, sin quemarse.',
          'Añade el curry en polvo directo a la grasa y tuéstalo removiendo unos segundos, hasta que huela intenso — así se despiertan los aceites de las especias; si lo echas directo al líquido, queda con sabor plano.',
          'Vierte la leche de coco y el caldo, y remueve para integrar.',
          'Cuece a fuego suave, sin que llegue a hervir fuerte, 10 minutos — un hervor muy fuerte puede cortar la leche de coco.',
          'Ajusta de sal y sirve.'
        ],
        notes: 'Esta versión con leche de coco es más cercana al curry del sur de India; la versión británica clásica de restaurante lleva un roux de harina y queda más espesa y menos aromática.'
      },

      /* ---- bebidas: una receta por cada vaso del directorio de cristalería ---- */
      {
        id: uid(), name: 'Mojito', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Ron blanco'), qty: 50, unit: 'ml' },
          { ing: find('Lima'), qty: 1, unit: 'ud' },
          { ing: find('Menta'), qty: 8, unit: 'hoja' },
          { ing: find('Azúcar'), qty: 2, unit: 'cdta' },
          { ing: find('Agua con gas'), qty: 100, unit: 'ml' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta la lima en cuartos y májala en el vaso junto con el azúcar y las hojas de menta, sin triturarlas del todo.',
          'Llena el vaso con hielo picado.',
          'Añade el ron y remueve bien de abajo arriba.',
          'Termina de rellenar con el agua con gas y remueve una última vez.',
          'Decora con una ramita de menta.'
        ],
        notes: 'Machaca la menta suave: si la trituras demasiado suelta amargor.'
      },
      {
        id: uid(), name: 'Margarita', icon: 'copa-margarita', cat: 'Bebida', glass: 'copa-margarita',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Tequila'), qty: 50, unit: 'ml' },
          { ing: find('Triple seco'), qty: 25, unit: 'ml' },
          { ing: find('Lima'), qty: 1, unit: 'ud' },
          { ing: find('Sal'), qty: null, unit: 'pizca' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Escarcha el borde de la copa: pasa un gajo de lima por el borde y presiónalo sobre un plato con sal.',
          'Exprime la lima y viértela en una coctelera junto con el tequila y el triple seco.',
          'Añade hielo y agita con fuerza 10-15 segundos.',
          'Cuela y sirve en la copa ya escarchada, con hielo si la quieres on the rocks.'
        ],
        notes: 'A partes iguales de tequila, triple seco y lima nunca falla — memorízalo así.'
      },
      {
        id: uid(), name: 'Gin-tonic', icon: 'copa-balon', cat: 'Bebida', glass: 'copa-balon',
        diff: 'Fácil', time: 3, portions: 1,
        items: [
          { ing: find('Ginebra'), qty: 50, unit: 'ml' },
          { ing: find('Tónica'), qty: 150, unit: 'ml' },
          { ing: find('Lima'), qty: 1, unit: 'ud' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Enfría bien la copa balón antes de empezar; el hielo aguanta mucho más en un vaso frío.',
          'Llena la copa de hielo hasta arriba.',
          'Vierte la ginebra sobre el hielo.',
          'Termina con la tónica, dejándola caer despacio por la pared de la copa para no perder el gas.',
          'Remueve una vez, apenas, y decora con lima.'
        ],
        notes: 'La proporción clásica es 1 parte de ginebra por 3 de tónica.'
      },
      {
        id: uid(), name: 'Daiquiri', icon: 'copa-coctel', cat: 'Bebida', glass: 'copa-coctel',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Ron blanco'), qty: 60, unit: 'ml' },
          { ing: find('Lima'), qty: 1, unit: 'ud' },
          { ing: find('Azúcar'), qty: 2, unit: 'cdta' }
        ],
        steps: [
          'Exprime la lima directamente en la coctelera.',
          'Añade el ron y el azúcar.',
          'Llena de hielo y agita con fuerza hasta que la coctelera se escarche por fuera.',
          'Cuela y sirve en la copa de cóctel bien fría, sin hielo.'
        ],
        notes: 'El daiquiri original no lleva nada más — desconfía de las versiones con demasiado azúcar.'
      },
      {
        id: uid(), name: 'Sangría', icon: 'copa-vino', cat: 'Bebida', glass: 'copa-vino',
        diff: 'Fácil', time: 20, portions: 6,
        items: [
          { ing: find('Vino tinto'), qty: 750, unit: 'ml' },
          { ing: find('Naranja'), qty: 1, unit: 'ud' },
          { ing: find('Manzana'), qty: 1, unit: 'ud' },
          { ing: find('Azúcar'), qty: 2, unit: 'cda' },
          { ing: find('Brandy'), qty: 50, unit: 'ml' },
          { ing: find('Canela'), qty: 1, unit: 'rama' }
        ],
        steps: [
          'Corta la naranja y la manzana en trozos pequeños, sin pelar.',
          'Mézclalo todo en una jarra grande: vino, fruta, azúcar, brandy y la rama de canela.',
          'Remueve hasta que el azúcar se disuelva.',
          'Deja reposar en la nevera un mínimo de 4 horas, mejor de un día para otro.',
          'Sirve con hielo y un poco de la fruta macerada en cada copa.'
        ],
        notes: 'Cuanto más reposa, mejor sabe: la fruta va soltando su jugo en el vino.'
      },
      {
        id: uid(), name: 'Mimosa', icon: 'copa-flauta', cat: 'Bebida', glass: 'copa-flauta',
        diff: 'Fácil', time: 2, portions: 1,
        items: [
          { ing: find('Cava'), qty: 75, unit: 'ml' },
          { ing: find('Zumo de naranja'), qty: 75, unit: 'ml' }
        ],
        steps: [
          'Sirve el zumo de naranja bien frío en la copa flauta, hasta la mitad.',
          'Termina de llenar con el cava, despacio.',
          'No remuevas: se mezcla solo al servir.'
        ],
        notes: 'A partes iguales queda equilibrado; con más cava, más seco.'
      },
      {
        id: uid(), name: 'Old Fashioned', icon: 'vaso-corto', cat: 'Bebida', glass: 'vaso-corto',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Whisky'), qty: 60, unit: 'ml' },
          { ing: find('Azúcar'), qty: 1, unit: 'cdta' },
          { ing: find('Angostura'), qty: null, unit: 'al gusto' },
          { ing: find('Naranja'), qty: 1, unit: 'ud' }
        ],
        steps: [
          'Pon el azúcar en el vaso y añade unas gotas de angostura hasta empaparlo.',
          'Añade un chorrito de agua y machaca hasta disolver el azúcar.',
          'Llena el vaso con un hielo grande y vierte el whisky.',
          'Remueve despacio unos segundos.',
          'Exprime la piel de una rodaja de naranja sobre el vaso para soltar sus aceites y déjala caer dentro.'
        ],
        notes: 'Cuanto más grande el hielo, más lento se diluye la bebida.'
      },
      {
        id: uid(), name: 'Michelada', icon: 'jarra', cat: 'Bebida', glass: 'jarra',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Cerveza'), qty: 350, unit: 'ml' },
          { ing: find('Lima'), qty: 1, unit: 'ud' },
          { ing: find('Salsa picante'), qty: null, unit: 'al gusto' },
          { ing: find('Salsa inglesa'), qty: 1, unit: 'cdta' },
          { ing: find('Sal'), qty: null, unit: 'pizca' }
        ],
        steps: [
          'Escarcha el borde de la jarra con sal, igual que en la margarita.',
          'Exprime la lima dentro de la jarra.',
          'Añade la salsa inglesa y la salsa picante al gusto.',
          'Termina de llenar con la cerveza bien fría, despacio para que no se suba toda la espuma.'
        ],
        notes: 'Ajusta el picante poco a poco: siempre puedes añadir más, pero no quitar.'
      },
      {
        id: uid(), name: 'Lemon Drop', icon: 'chupito', cat: 'Bebida', glass: 'chupito',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Vodka'), qty: 40, unit: 'ml' },
          { ing: find('Licor de limón'), qty: 20, unit: 'ml' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Azúcar'), qty: null, unit: 'pizca' }
        ],
        steps: [
          'Escarcha el borde del chupito con azúcar, pasando una rodaja de limón y presionando sobre un plato con azúcar.',
          'Agita el vodka y el licor de limón con hielo en una coctelera.',
          'Cuela y sirve en el chupito ya escarchado.',
          'Bébelo de un trago.'
        ],
        notes: 'El toque cítrico del licor de limón es lo que lo distingue de un chupito de vodka a secas.'
      },
      {
        id: uid(), name: 'Limonada casera', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 10, portions: 4,
        items: [
          { ing: find('Limón'), qty: 4, unit: 'ud' },
          { ing: find('Azúcar'), qty: 100, unit: 'g' },
          { ing: find('Agua'), qty: 800, unit: 'ml' },
          { ing: find('Menta'), qty: null, unit: 'al gusto' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Exprime los limones y cuela el zumo.',
          'Disuelve el azúcar en un poco de agua caliente para hacer un almíbar ligero.',
          'Mezcla el zumo de limón, el almíbar y el resto del agua.',
          'Sirve con mucho hielo y unas hojas de menta.'
        ],
        notes: 'Ajusta el azúcar al gusto: cuanto más ácidos sean los limones, más almíbar necesitarás.'
      },
      {
        id: uid(), name: 'Horchata de arroz', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 15, portions: 4,
        items: [
          { ing: find('Arroz'), qty: 150, unit: 'g' },
          { ing: find('Agua'), qty: 1, unit: 'l' },
          { ing: find('Leche'), qty: 250, unit: 'ml' },
          { ing: find('Azúcar'), qty: 80, unit: 'g' },
          { ing: find('Canela'), qty: 1, unit: 'rama' }
        ],
        steps: [
          'Deja el arroz en remojo con el agua y la rama de canela un mínimo de 4 horas, mejor toda la noche.',
          'Tritura todo junto, arroz incluido, hasta que quede muy fino.',
          'Cuela con un paño o una bolsa de leche vegetal, apretando bien para sacar todo el líquido.',
          'Mezcla el líquido colado con la leche y el azúcar.',
          'Sirve bien fría, con hielo.'
        ],
        notes: 'Esta es la versión mexicana, con arroz; la española lleva chufa y es otra bebida distinta, aunque comparten nombre.'
      },
      {
        id: uid(), name: 'Batido de fresa y plátano', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 5, portions: 2,
        items: [
          { ing: find('Fresa'), qty: 200, unit: 'g' },
          { ing: find('Plátano'), qty: 1, unit: 'ud' },
          { ing: find('Leche'), qty: 250, unit: 'ml' },
          { ing: find('Azúcar'), qty: null, unit: 'al gusto' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Lava y trocea las fresas, quitando el rabito.',
          'Pon las fresas, el plátano troceado y la leche en la batidora.',
          'Tritura hasta que quede fino y sin trozos.',
          'Prueba y añade azúcar solo si lo necesitas.',
          'Sirve con hielo bien frío.'
        ],
        notes: 'Cuanto más maduro el plátano, más dulce sale el batido sin necesidad de azúcar.'
      },
      {
        id: uid(), name: 'Batido de chocolate', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 5, portions: 2,
        items: [
          { ing: find('Leche'), qty: 300, unit: 'ml' },
          { ing: find('Chocolate en polvo'), qty: 30, unit: 'g' },
          { ing: find('Azúcar'), qty: 20, unit: 'g' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Bate la leche fría con el chocolate en polvo y el azúcar hasta que se disuelva bien.',
          'Añade hielo y bate unos segundos más si lo quieres tipo batido espumoso.',
          'Sirve inmediatamente.'
        ],
        notes: 'Para uno más cremoso, cambia el azúcar por medio vaso de leche condensada.'
      },
      {
        id: uid(), name: 'Batido verde', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 10, portions: 2,
        items: [
          { ing: find('Espinaca'), qty: 60, unit: 'g' },
          { ing: find('Manzana'), qty: 1, unit: 'ud' },
          { ing: find('Limón'), qty: null, unit: 'al gusto' },
          { ing: find('Agua'), qty: 200, unit: 'ml' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Lava bien la espinaca y trocea la manzana, sin necesidad de pelarla.',
          'Tritura todo junto con el agua hasta que quede fino.',
          'Añade un chorro de limón para que no oxide y equilibre el dulzor.',
          'Sirve con hielo.'
        ],
        notes: 'Si no tienes espinaca fresca, la congelada funciona igual de bien y no cambia el sabor.'
      },
      {
        id: uid(), name: 'Mote con huesillo', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 20, portions: 4,
        items: [
          { ing: find('Huesillos'), qty: 200, unit: 'g' },
          { ing: find('Mote'), qty: 150, unit: 'g' },
          { ing: find('Azúcar'), qty: 150, unit: 'g' },
          { ing: find('Canela'), qty: 1, unit: 'rama' },
          { ing: find('Agua'), qty: 1500, unit: 'ml' }
        ],
        steps: [
          'Deja los huesillos en remojo la noche anterior, en agua suficiente para cubrirlos.',
          'Cuece los huesillos con su agua de remojo, el azúcar y la canela, 15-20 minutos, hasta que estén tiernos.',
          'Deja enfriar el cocimiento en la nevera.',
          'Cuece el mote por separado en agua hasta que esté tierno, y enfríalo.',
          'Para servir, pon unas cucharadas de mote en el fondo de un vaso, añade un huesillo y cubre con el jugo frío.'
        ],
        notes: 'Se toma bien frío, casi siempre en la calle, en verano: es la bebida veraniega por excelencia en Chile.'
      },
      {
        id: uid(), name: 'Piña colada', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Ron blanco'), qty: 60, unit: 'ml' },
          { ing: find('Zumo de piña'), qty: 90, unit: 'ml' },
          { ing: find('Crema de coco'), qty: 45, unit: 'ml' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Echa el ron, el zumo de piña y la crema de coco en la licuadora junto con hielo picado.',
          'Licúa unos 10-15 segundos hasta lograr una textura espesa y homogénea, sin trozos de hielo sueltos.',
          'Sirve de inmediato en vaso alto bien frío, antes de que empiece a separarse.'
        ],
        notes: 'Nació en 1954 en el Caribe Hilton de Puerto Rico; no cambies la crema de coco espesa por leche de coco líquida, porque la mezcla queda aguada y no monta bien en la licuadora.'
      },
      {
        id: uid(), name: 'Caipirinha', icon: 'vaso-corto', cat: 'Bebida', glass: 'vaso-corto',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Cachaça'), qty: 60, unit: 'ml' },
          { ing: find('Lima'), qty: 1, unit: 'ud' },
          { ing: find('Azúcar'), qty: 2, unit: 'cda' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Corta la lima en cuartos sin pelar y ponla en el fondo del vaso corto junto con el azúcar.',
          'Machaca solo lo justo para romper la pulpa y soltar el jugo y los aceites de la cáscara; si te pasas, sacas amargor de la piel.',
          'Rellena con hielo picado, añade la cachaça y remueve bien raspando el fondo del vaso.'
        ],
        notes: 'El machacado suave es la clave de esta receta: en Brasil se suele usar azúcar blanca normal pese al mito de que debe ser rubia, y la cachaça no se sustituye por ron sin cambiar por completo el carácter del trago.'
      },
      {
        id: uid(), name: 'Bloody Mary', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Vodka'), qty: 45, unit: 'ml' },
          { ing: find('Zumo de tomate'), qty: 90, unit: 'ml' },
          { ing: find('Limón'), qty: 0.5, unit: 'ud' },
          { ing: find('Salsa inglesa'), qty: 1, unit: 'cdta' },
          { ing: find('Salsa picante'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'pizca' },
          { ing: find('Pimienta negra'), qty: null, unit: 'pizca' },
          { ing: find('Apio'), qty: 1, unit: 'rama' }
        ],
        steps: [
          'Llena un vaso alto con hielo y añade el vodka, el zumo de medio limón, la salsa inglesa y unas gotas de salsa picante.',
          'Sazona con sal y pimienta negra y remueve con una cuchara de bar; nunca lo prepares en coctelera.',
          'Termina de llenar con el zumo de tomate, remueve otra vez con suavidad y decora con la rama de apio.'
        ],
        notes: 'Se remueve en vez de agitarse porque el zumo de tomate hace espuma y queda turbio si se shakea; la rama de apio no es solo decoración, sirve para seguir removiendo el trago mientras se bebe.'
      },
      {
        id: uid(), name: 'Cosmopolitan', icon: 'copa-coctel', cat: 'Bebida', glass: 'copa-coctel',
        diff: 'Media', time: 5, portions: 1,
        items: [
          { ing: find('Vodka'), qty: 45, unit: 'ml' },
          { ing: find('Triple seco'), qty: 15, unit: 'ml' },
          { ing: find('Zumo de arándano'), qty: 30, unit: 'ml' },
          { ing: find('Lima'), qty: 0.5, unit: 'ud' }
        ],
        steps: [
          'Llena la coctelera con hielo y añade el vodka, el triple seco, el zumo de arándano y el zumo de media lima.',
          'Agita con energía unos 10-15 segundos, hasta que la coctelera quede bien fría por fuera.',
          'Cuela sobre una copa de cóctel previamente enfriada y exprime un twist de piel de naranja por encima.'
        ],
        notes: 'El color rosado lo da el zumo de arándano, no el triple seco; enfriar la copa antes de servir marca la diferencia entre un cosmopolitan bien logrado y uno que se entibia en segundos.'
      },
      {
        id: uid(), name: 'Negroni', icon: 'vaso-corto', cat: 'Bebida', glass: 'vaso-corto',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Ginebra'), qty: 30, unit: 'ml' },
          { ing: find('Vermut rojo'), qty: 30, unit: 'ml' },
          { ing: find('Campari'), qty: 30, unit: 'ml' }
        ],
        steps: [
          'Llena un vaso corto con hielo, a ser posible en cubos grandes que se derritan despacio.',
          'Vierte la ginebra, el vermut rojo y el Campari en partes exactamente iguales, directo sobre el hielo.',
          'Remueve con cuchara de bar unos 20-30 segundos para enfriar y diluir sin batir, y remata con un twist de piel de naranja.'
        ],
        notes: 'La proporción clásica es siempre a partes iguales, sin excepciones; nació en Florencia cuando el conde Negroni pidió reforzar su Americano cambiando el agua con gas por ginebra.'
      },
      {
        id: uid(), name: 'Pisco sour', icon: 'copa-coctel', cat: 'Bebida', glass: 'copa-coctel',
        diff: 'Media', time: 8, portions: 1,
        items: [
          { ing: find('Pisco'), qty: 90, unit: 'ml' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Azúcar'), qty: 20, unit: 'g' },
          { ing: find('Huevo'), qty: 0.5, unit: 'ud' },
          { ing: find('Angostura'), qty: null, unit: 'al gusto' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pon en la coctelera el pisco, el zumo de limón colado, el azúcar y la clara de huevo, y agita fuerte SIN hielo unos 15-20 segundos (dry shake) para que la clara empiece a emulsionar.',
          'Añade el hielo y agita otros 10-15 segundos más, ahora sí con hielo, para enfriar y terminar de montar la espuma.',
          'Cuela sobre una copa fría para que no pase pulpa ni hielo picado, y si quieres remata con unas gotas de angostura sobre la espuma.'
        ],
        notes: 'El truco no está en el pisco sino en el doble agitado: primero en seco para emulsionar la clara y luego con hielo para enfriar; si metes el hielo desde el principio, la espuma nunca coge cuerpo.'
      },
      {
        id: uid(), name: 'Terremoto', icon: 'jarra', cat: 'Bebida', glass: 'jarra',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Vino blanco'), qty: 350, unit: 'ml' },
          { ing: find('Helado de piña'), qty: 2, unit: 'ud' },
          { ing: find('Granadina'), qty: 15, unit: 'ml' }
        ],
        steps: [
          'Sirve el vino bien frío en la jarra, dejando espacio libre arriba.',
          'Añade una o dos bochas de helado de piña y deja que floten, sin remover demasiado.',
          'Termina con un chorrito de granadina, que se hunde despacio y crea el efecto de "marea" que le da nombre al trago.'
        ],
        notes: 'Se llama terremoto porque el vino barato (tradicionalmente pipeño) sube directo a la cabeza; si no encuentras pipeño, un vino blanco joven y afrutado cumple bien la función. Es el trago típico de las fondas en Fiestas Patrias.'
      },
      {
        id: uid(), name: 'Agua de jamaica', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 15, portions: 4,
        items: [
          { ing: find('Flor de jamaica'), qty: 25, unit: 'g' },
          { ing: find('Agua'), qty: 1, unit: 'l' },
          { ing: find('Azúcar'), qty: 100, unit: 'g' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pon el agua a hervir y, cuando rompa el hervor, añade la flor de jamaica y baja el fuego a medio.',
          'Deja infusionar unos 8-10 minutos sin que hierva con fuerza, para que no amargue.',
          'Cuela las flores, disuelve el azúcar mientras la infusión sigue caliente y deja enfriar antes de servir con hielo.'
        ],
        notes: 'El azúcar hay que disolverlo en caliente porque en frío cuesta mucho más; las flores coladas no se tiran, se pueden volver a hervir para un segundo lote más suave.'
      },
      {
        id: uid(), name: 'Tinto de verano', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Vino tinto'), qty: 100, unit: 'ml' },
          { ing: find('Gaseosa de limón'), qty: 100, unit: 'ml' },
          { ing: find('Limón'), qty: 1, unit: 'ud' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Llena un vaso alto con bastante hielo.',
          'Vierte el vino tinto y la gaseosa de limón a partes iguales.',
          'Remueve apenas, sin que pierda burbuja, y decora con una rodaja de limón.'
        ],
        notes: 'A diferencia de la sangría, aquí no hay maceración ni fruta troceada: es la versión rápida y del día a día que se pide en cualquier terraza española en verano.'
      },
      {
        id: uid(), name: 'Moscow Mule', icon: 'vaso-alto', cat: 'Bebida', glass: 'vaso-alto',
        diff: 'Fácil', time: 5, portions: 1,
        items: [
          { ing: find('Vodka'), qty: 60, unit: 'ml' },
          { ing: find('Lima'), qty: 0.5, unit: 'ud' },
          { ing: find('Cerveza de jengibre'), qty: 120, unit: 'ml' },
          { ing: find('Hielo'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Llena un vaso alto (o la clásica taza de cobre) con hielo hasta arriba.',
          'Añade el vodka y el zumo de media lima recién exprimida.',
          'Termina de llenar con la cerveza de jengibre y remueve con suavidad para no perder la burbuja.'
        ],
        notes: 'Usa cerveza de jengibre (ginger beer), que es picante y con más cuerpo, no ginger ale, que es más suave y dulce; la taza de cobre no es solo estética, mantiene el trago frío por fuera más tiempo.'
      }
    ];
    this.data.recipes.forEach(normalizeRecipe);
    this.save();
  }
};
