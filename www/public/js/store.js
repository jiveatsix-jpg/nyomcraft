/* ñomcraft — persistencia en localStorage */

const UNITS = ['g', 'kg', 'ml', 'l', 'ud', 'cda', 'cdta', 'taza', 'pizca', 'diente', 'rama', 'hoja', 'al gusto'];

const ING_CATS = ['Verdura', 'Fruta', 'Carne', 'Pescado', 'Lácteo', 'Cereal', 'Legumbre', 'Especia', 'Salsa', 'Otro'];
const REC_CATS = ['Entrante', 'Principal', 'Postre', 'Guarnición', 'Bebida', 'Salsa', 'Otro'];
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

/** Un valor nutricional valido es un numero >= 0; cualquier otra cosa (falta,
    texto, negativo) se trata como "no se sabe" y se guarda como null, nunca
    como 0 — 0 significa "de verdad no tiene calorias/proteina/...", no
    "no se ha rellenado todavia".                                           */
const numOrNull = v => (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null;

/** Pone al día un ingrediente: los cuatro valores nutricionales aproximados
    (por 100 g o 100 ml) son opcionales y pueden faltar en datos antiguos. */
function normalizeIngredient(ing) {
  if (!ing) return ing;
  ing.kcal = numOrNull(ing.kcal);
  ing.protein = numOrNull(ing.protein);
  ing.carbs = numOrNull(ing.carbs);
  ing.fat = numOrNull(ing.fat);
  return ing;
}

const Store = {
  KEY: 'nomcraft.v1',
  data: { ingredients: [], recipes: [], masaOverrides: {} },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data.ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
        this.data.ingredients.forEach(normalizeIngredient);
        this.data.recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];
        this.data.recipes.forEach(normalizeRecipe);
        this.data.masaOverrides = (parsed.masaOverrides && typeof parsed.masaOverrides === 'object')
          ? parsed.masaOverrides : {};
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

  addIngredient({ name, cat, unit, icon, kcal, protein, carbs, fat }) {
    const clean = (name || '').trim();
    if (!clean) return null;
    const dupe = this.data.ingredients.find(i => i.name.toLowerCase() === clean.toLowerCase());
    if (dupe) return { dupe };
    const ing = {
      id: uid(), name: clean, cat: cat || 'Otro', unit: unit || 'g', icon: icon || guessIcon(clean),
      kcal: numOrNull(kcal), protein: numOrNull(protein), carbs: numOrNull(carbs), fat: numOrNull(fat)
    };
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
    if (mode === 'replace') {
      this.data.ingredients = ings;
      this.data.recipes = recs;
      this.data.masaOverrides = masaOv;
    } else {
      const known = new Set(this.data.ingredients.map(i => i.id));
      ings.forEach(i => { if (!known.has(i.id)) this.data.ingredients.push(i); });
      const knownR = new Set(this.data.recipes.map(r => r.id));
      recs.forEach(r => { if (!knownR.has(r.id)) this.data.recipes.push(r); });
      Object.assign(this.data.masaOverrides, masaOv);
    }
    this.data.recipes.forEach(normalizeRecipe);
    this.data.ingredients.forEach(normalizeIngredient);
    this.sortIngredients();
    this.save();
    return { ings: ings.length, recs: recs.length };
  },

  /* ---- semilla inicial ---- */
  seed() {
    const base = [
      ['Aceite de oliva', 'Salsa', 'cda', 884, 0, 0, 100],
      ['Agua', 'Otro', 'ml', 0, 0, 0, 0],
      ['Agua con gas', 'Otro', 'ml', 0, 0, 0, 0],
      ['Aguacate', 'Fruta', 'ud', 160, 2, 9, 15],
      ['Ajo', 'Verdura', 'diente', 149, 6.4, 33, 0.5],
      ['Albahaca', 'Especia', 'hoja', 23, 3.2, 2.7, 0.6],
      ['Almendras', 'Fruta', 'g', 579, 21, 22, 50],
      ['Angostura', 'Especia', 'al gusto', 250, 0, 25, 0],
      ['Arroz', 'Cereal', 'g', 365, 7.1, 80, 0.7],
      ['Azúcar', 'Otro', 'g', 387, 0, 100, 0],
      ['Brandy', 'Otro', 'ml', 231, 0, 0.5, 0],
      ['Canela', 'Especia', 'rama', 247, 4, 81, 1.2],
      ['Carne picada', 'Carne', 'g', 215, 18, 0, 15],
      ['Cava', 'Otro', 'ml', 80, 0.1, 1.5, 0],
      ['Cebolla', 'Verdura', 'ud', 40, 1.1, 9.3, 0.1],
      ['Cerveza', 'Otro', 'ml', 43, 0.5, 3.6, 0],
      ['Chocolate en polvo', 'Otro', 'g', 228, 20, 58, 14],
      ['Cilantro', 'Especia', 'hoja', 23, 2.1, 3.7, 0.5],
      ['Espaguetis', 'Cereal', 'g', 371, 13, 75, 1.5],
      ['Espinaca', 'Verdura', 'g', 23, 2.9, 3.6, 0.4],
      ['Fresa', 'Fruta', 'g', 32, 0.7, 7.7, 0.3],
      ['Galletas', 'Otro', 'g', 440, 7, 68, 15],
      ['Garbanzos', 'Legumbre', 'g', 364, 19, 61, 6],
      ['Ginebra', 'Otro', 'ml', 231, 0, 0, 0],
      ['Guindilla', 'Especia', 'ud', 40, 1.9, 9, 0.4],
      ['Harina', 'Cereal', 'g', 364, 10, 76, 1],
      ['Hielo', 'Otro', 'al gusto', 0, 0, 0, 0],
      ['Huevo', 'Otro', 'ud', 155, 13, 1.1, 11],
      ['Jamón', 'Carne', 'g', 241, 30, 0, 13],
      ['Leche', 'Lácteo', 'ml', 61, 3.2, 4.8, 3.3],
      ['Lechuga', 'Verdura', 'ud', 15, 1.4, 2.9, 0.2],
      ['Lentejas', 'Legumbre', 'g', 353, 25, 60, 1],
      ['Licor de limón', 'Otro', 'ml', 270, 0, 30, 0],
      ['Lima', 'Fruta', 'ud', 30, 0.7, 11, 0.2],
      ['Limón', 'Fruta', 'ud', 29, 1.1, 9.3, 0.3],
      ['Mantequilla', 'Lácteo', 'g', 717, 0.9, 0.1, 81],
      ['Manzana', 'Fruta', 'ud', 52, 0.3, 14, 0.2],
      ['Menta', 'Especia', 'hoja', 70, 3.8, 15, 0.9],
      ['Mostaza', 'Salsa', 'cdta', 66, 4.4, 5.8, 4],
      ['Naranja', 'Fruta', 'ud', 47, 0.9, 12, 0.1],
      ['Nata', 'Lácteo', 'ml', 340, 2, 3, 35],
      ['Nuez moscada', 'Especia', 'pizca', 525, 5.8, 49, 36],
      ['Pan', 'Cereal', 'ud', 265, 9, 49, 3.2],
      ['Pan rallado', 'Cereal', 'g', 395, 13, 72, 5],
      ['Patata', 'Verdura', 'ud', 77, 2, 17, 0.1],
      ['Pepino', 'Verdura', 'ud', 15, 0.7, 3.6, 0.1],
      ['Perejil', 'Especia', 'hoja', 36, 3, 6.3, 0.8],
      ['Pimentón', 'Especia', 'cdta', 282, 14, 54, 13],
      ['Pimienta negra', 'Especia', 'pizca', 251, 10, 64, 3.3],
      ['Pimiento', 'Verdura', 'ud', 20, 0.9, 4.6, 0.2],
      ['Plátano', 'Fruta', 'ud', 89, 1.1, 23, 0.3],
      ['Pollo', 'Carne', 'g', 165, 31, 0, 3.6],
      ['Queso crema', 'Lácteo', 'g', 342, 6, 4, 34],
      ['Queso parmesano', 'Lácteo', 'g', 392, 35, 3.2, 26],
      ['Ron blanco', 'Otro', 'ml', 231, 0, 0, 0],
      ['Sal', 'Especia', 'pizca', 0, 0, 0, 0],
      ['Salmón', 'Pescado', 'g', 208, 20, 0, 13],
      ['Salsa inglesa', 'Salsa', 'cdta', 78, 0, 19.5, 0],
      ['Salsa picante', 'Salsa', 'al gusto', 12, 0.5, 2, 0.2],
      ['Tequila', 'Otro', 'ml', 231, 0, 0, 0],
      ['Tomate', 'Verdura', 'ud', 18, 0.9, 3.9, 0.2],
      ['Triple seco', 'Otro', 'ml', 260, 0, 28, 0],
      ['Tónica', 'Otro', 'ml', 34, 0, 8.8, 0],
      ['Vinagre', 'Salsa', 'ml', 18, 0, 0.4, 0],
      ['Vino blanco', 'Otro', 'ml', 82, 0.1, 2.6, 0],
      ['Vino tinto', 'Otro', 'ml', 85, 0.1, 2.6, 0],
      ['Vodka', 'Otro', 'ml', 231, 0, 0, 0],
      ['Whisky', 'Otro', 'ml', 231, 0, 0, 0],
      ['Zanahoria', 'Verdura', 'ud', 41, 0.9, 9.6, 0.2],
      ['Zumo de naranja', 'Otro', 'ml', 45, 0.7, 10.4, 0.2]
    ];
    this.data.ingredients = base.map(([name, cat, unit, kcal, protein, carbs, fat]) => ({
      id: uid(), name, cat, unit, icon: guessIcon(name), kcal, protein, carbs, fat
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
        id: uid(), name: 'Tortilla de patatas', icon: 'huevo', cat: 'Principal',
        diff: 'Media', time: 45, portions: 4,
        items: [
          { ing: find('Patata'), qty: 800, unit: 'g' },
          { ing: find('Huevo'), qty: 6, unit: 'ud' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Aceite de oliva'), qty: 300, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pela las patatas y córtalas en láminas finas; la cebolla en juliana fina.',
          'Ponlas a confitar juntas en el aceite a fuego suave, 20-25 minutos, hasta que estén tiernas sin dorarse.',
          'Escurre bien el aceite y resérvalo — te sirve para otra tortilla.',
          'Bate los huevos con sal y mézclalos con las patatas templadas.',
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
          'Incorpora el aceite en hilo, sin dejar de triturar, como si montaras una mahonesa.',
          'Añade el vinagre, la sal y el agua necesaria hasta conseguir la textura de una crema ligera.',
          'Cuela si quieres que quede más fino, y enfría en la nevera un mínimo de 2 horas.'
        ],
        notes: 'Se sirve tradicionalmente con unas uvas o taquitos de melón por encima — el contraste dulce es parte de la gracia.'
      },
      {
        id: uid(), name: 'Pollo al ajillo', icon: 'carne', cat: 'Principal',
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
        id: uid(), name: 'Ensalada César', icon: 'hierba', cat: 'Entrante',
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
        id: uid(), name: 'Patatas bravas', icon: 'plato', cat: 'Guarnición',
        diff: 'Fácil', time: 30, portions: 4,
        items: [
          { ing: find('Patata'), qty: 800, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 200, unit: 'ml' },
          { ing: find('Tomate'), qty: 2, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Guindilla'), qty: null, unit: 'al gusto' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pela las patatas y córtalas en dados grandes e irregulares.',
          'Fríelas en abundante aceite a fuego medio hasta que estén doradas y tiernas por dentro.',
          'Para la salsa: sofríe el ajo picado, añade el tomate triturado y cocina 10 minutos.',
          'Añade el pimentón y la guindilla al gusto, y sala.',
          'Sirve las patatas recién fritas con la salsa brava por encima.'
        ],
        notes: 'El pimentón se añade fuera del fuego o con el fuego muy bajo: se quema y amarga enseguida.'
      },
      {
        id: uid(), name: 'Puré de patatas', icon: 'plato', cat: 'Guarnición',
        diff: 'Fácil', time: 30, portions: 4,
        items: [
          { ing: find('Patata'), qty: 800, unit: 'g' },
          { ing: find('Leche'), qty: 150, unit: 'ml' },
          { ing: find('Mantequilla'), qty: 50, unit: 'g' },
          { ing: find('Nuez moscada'), qty: null, unit: 'pizca' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece las patatas peladas y troceadas en agua con sal hasta que estén muy tiernas.',
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

      /* ---- salsas (además del alioli, arriba) ---- */
      {
        id: uid(), name: 'Mahonesa', icon: 'huevo', cat: 'Salsa',
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
      }
    ];
    this.data.recipes.forEach(normalizeRecipe);
    this.save();
  }
};
