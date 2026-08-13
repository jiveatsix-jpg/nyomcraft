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
  return rec;
}

const Store = {
  KEY: 'nomcraft.v1',
  data: { ingredients: [], recipes: [] },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data.ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
        this.data.recipes = Array.isArray(parsed.recipes) ? parsed.recipes : [];
        this.data.recipes.forEach(normalizeRecipe);
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

  blankRecipe() {
    return {
      id: uid(), name: '', icon: 'plato', cat: 'Principal', diff: 'Fácil',
      time: 30, portions: 2, items: [], steps: [{ t: '', q: null }], notes: '', q: null,
      glass: null
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
    if (mode === 'replace') {
      this.data.ingredients = ings;
      this.data.recipes = recs;
    } else {
      const known = new Set(this.data.ingredients.map(i => i.id));
      ings.forEach(i => { if (!known.has(i.id)) this.data.ingredients.push(i); });
      const knownR = new Set(this.data.recipes.map(r => r.id));
      recs.forEach(r => { if (!knownR.has(r.id)) this.data.recipes.push(r); });
    }
    this.data.recipes.forEach(normalizeRecipe);
    this.sortIngredients();
    this.save();
    return { ings: ings.length, recs: recs.length };
  },

  /* ---- semilla inicial ---- */
  seed() {
    const base = [
      ['Aceite de oliva', 'Salsa', 'cda'], ['Agua con gas', 'Otro', 'ml'],
      ['Aguacate', 'Fruta', 'ud'], ['Ajo', 'Verdura', 'diente'],
      ['Albahaca', 'Especia', 'hoja'], ['Angostura', 'Especia', 'al gusto'],
      ['Arroz', 'Cereal', 'g'], ['Azúcar', 'Otro', 'g'],
      ['Brandy', 'Otro', 'ml'], ['Canela', 'Especia', 'rama'],
      ['Cava', 'Otro', 'ml'], ['Cebolla', 'Verdura', 'ud'],
      ['Cerveza', 'Otro', 'ml'], ['Cilantro', 'Especia', 'hoja'],
      ['Garbanzos', 'Legumbre', 'g'], ['Ginebra', 'Otro', 'ml'],
      ['Guindilla', 'Especia', 'ud'], ['Harina', 'Cereal', 'g'],
      ['Hielo', 'Otro', 'al gusto'], ['Huevo', 'Otro', 'ud'],
      ['Leche', 'Lácteo', 'ml'], ['Licor de limón', 'Otro', 'ml'],
      ['Lima', 'Fruta', 'ud'], ['Limón', 'Fruta', 'ud'],
      ['Mantequilla', 'Lácteo', 'g'], ['Manzana', 'Fruta', 'ud'],
      ['Menta', 'Especia', 'hoja'], ['Naranja', 'Fruta', 'ud'],
      ['Patata', 'Verdura', 'ud'], ['Pepino', 'Verdura', 'ud'],
      ['Perejil', 'Especia', 'hoja'], ['Pimienta negra', 'Especia', 'pizca'],
      ['Pimiento', 'Verdura', 'ud'], ['Pollo', 'Carne', 'g'],
      ['Queso parmesano', 'Lácteo', 'g'], ['Ron blanco', 'Otro', 'ml'],
      ['Sal', 'Especia', 'pizca'], ['Salsa inglesa', 'Salsa', 'cdta'],
      ['Salsa picante', 'Salsa', 'al gusto'], ['Tequila', 'Otro', 'ml'],
      ['Tomate', 'Verdura', 'ud'], ['Triple seco', 'Otro', 'ml'],
      ['Tónica', 'Otro', 'ml'], ['Vinagre', 'Salsa', 'ml'],
      ['Vino blanco', 'Otro', 'ml'], ['Vino tinto', 'Otro', 'ml'],
      ['Vodka', 'Otro', 'ml'], ['Whisky', 'Otro', 'ml'],
      ['Zanahoria', 'Verdura', 'ud'], ['Zumo de naranja', 'Otro', 'ml']
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
      }
    ];
    this.data.recipes.forEach(normalizeRecipe);
    this.save();
  }
};
