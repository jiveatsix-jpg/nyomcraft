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

const Store = {
  KEY: 'nomcraft.v1',
  data: { ingredients: [], recipes: [], masaOverrides: {} },

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
      ['Patata', 'Verdura', 'ud'],
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
      ['Zumo de naranja', 'Otro', 'ml']
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
        id: uid(), name: 'Huevos rotos con jamón', icon: 'huevo', cat: 'Principal',
        diff: 'Fácil', time: 25, portions: 2,
        items: [
          { ing: find('Patata'), qty: 500, unit: 'g' },
          { ing: find('Huevo'), qty: 4, unit: 'ud' },
          { ing: find('Jamón'), qty: 100, unit: 'g' },
          { ing: find('Aceite de oliva'), qty: 300, unit: 'ml' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pela las patatas y córtalas en bastones finos, como para patatas fritas.',
          'Fríelas en abundante aceite a fuego medio hasta que estén doradas y tiernas.',
          'Escúrrelas bien y colócalas de base en el plato.',
          'Fríe los huevos con la clara bien cuajada y la yema líquida, y ponlos encima de las patatas.',
          'Reparte el jamón en tiras por encima y rompe las yemas justo al servir, para que se mezclen con todo.'
        ],
        notes: 'Cuanto más caliente el plato, más aguanta la temperatura de las patatas mientras fríes los huevos.'
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
          { ing: find('Patata'), qty: 2, unit: 'ud' },
          { ing: find('Zanahoria'), qty: 1, unit: 'ud' },
          { ing: find('Arroz'), qty: 50, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Pon el pollo troceado en una olla grande con agua, la cebolla y el ajo. Lleva a hervor y cocina 20 minutos, retirando la espuma que suba.',
          'Añade la zanahoria y el zapallo en trozos grandes, y cocina 10 minutos más.',
          'Incorpora las patatas enteras o en mitades y el trozo de choclo.',
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
          { ing: find('Patata'), qty: 2, unit: 'ud' },
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
          'Añade la patata, la zanahoria y el zapallo en dados pequeños, y el choclo en trozos.',
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
        id: uid(), name: 'Ensalada de tomate y cebolla', icon: 'tomate', cat: 'Guarnición',
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
        id: uid(), name: 'Champiñones al ajillo', icon: 'seta', cat: 'Guarnición',
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
          { ing: find('Patata'), qty: 400, unit: 'g' },
          { ing: find('Choclo'), qty: 200, unit: 'g' },
          { ing: find('Carne picada'), qty: 200, unit: 'g' },
          { ing: find('Cebolla'), qty: 1, unit: 'ud' },
          { ing: find('Ajo'), qty: 2, unit: 'diente' },
          { ing: find('Pimentón'), qty: 1, unit: 'cdta' },
          { ing: find('Aceite de oliva'), qty: 3, unit: 'cda' },
          { ing: find('Sal'), qty: null, unit: 'al gusto' }
        ],
        steps: [
          'Cuece por separado el zapallo y la patata en agua con sal hasta que estén muy tiernos.',
          'Mientras, sofríe la cebolla y el ajo en el aceite, añade la carne picada y el pimentón, y cocina hasta que esté hecha.',
          'Escurre bien el zapallo y la patata, y májalos juntos con un tenedor hasta conseguir un puré grueso, con algo de textura.',
          'Mezcla el puré con el sofrito de carne y el choclo.',
          'Sirve caliente, tradicionalmente con un huevo frito encima.'
        ],
        notes: 'No lo tritures demasiado fino: el charquicán se distingue del puré de patatas por conservar tropezones de verdura.'
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
        id: uid(), name: 'Natillas', icon: 'huevo', cat: 'Postre',
        diff: 'Fácil', time: 25, portions: 4,
        items: [
          { ing: find('Leche'), qty: 500, unit: 'ml' },
          { ing: find('Huevo'), qty: 3, unit: 'ud' },
          { ing: find('Azúcar'), qty: 80, unit: 'g' },
          { ing: find('Canela'), qty: 1, unit: 'rama' },
          { ing: find('Limón'), qty: 1, unit: 'ud' }
        ],
        steps: [
          'Calienta la leche con la piel del limón y la rama de canela, sin que llegue a hervir.',
          'Bate los huevos con el azúcar hasta que blanqueen.',
          'Vierte la leche caliente colada sobre los huevos, poco a poco y sin dejar de remover.',
          'Vuelve todo al fuego bajo y cocina removiendo sin parar hasta que espese, sin que llegue a hervir.',
          'Reparte en cuencos y enfría en la nevera un mínimo de 2 horas.'
        ],
        notes: 'Si hierve, se corta: en cuanto veas que nape la cuchara (que la cubra como una capa fina), retírala del fuego.'
      },
      {
        id: uid(), name: 'Torrijas', icon: 'pan', cat: 'Postre',
        diff: 'Fácil', time: 40, portions: 6,
        items: [
          { ing: find('Pan'), qty: 1, unit: 'ud' },
          { ing: find('Leche'), qty: 500, unit: 'ml' },
          { ing: find('Huevo'), qty: 2, unit: 'ud' },
          { ing: find('Azúcar'), qty: 100, unit: 'g' },
          { ing: find('Canela'), qty: 1, unit: 'rama' },
          { ing: find('Aceite de oliva'), qty: 300, unit: 'ml' },
          { ing: find('Limón'), qty: 1, unit: 'ud' }
        ],
        steps: [
          'Corta el pan en rebanadas gruesas.',
          'Calienta la leche con la piel del limón, la canela y una parte del azúcar, sin que hierva. Deja templar.',
          'Remoja las rebanadas en la leche hasta que se empapen bien, sin que se deshagan.',
          'Pasa cada rebanada por huevo batido.',
          'Fríe en aceite bien caliente hasta que doren por ambos lados.',
          'Escurre sobre papel absorbente y reboza en azúcar con canela molida.'
        ],
        notes: 'Cuanto más duro esté el pan, mejor absorbe la leche sin deshacerse — por eso se hacían tradicionalmente con el pan sobrante.'
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
      }
    ];
    this.data.recipes.forEach(normalizeRecipe);
    this.save();
  }
};
