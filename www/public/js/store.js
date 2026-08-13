/* ñomcraft — persistencia en localStorage */

const UNITS = ['g', 'kg', 'ml', 'l', 'ud', 'cda', 'cdta', 'taza', 'pizca', 'diente', 'rama', 'hoja', 'al gusto'];

const ING_CATS = ['Verdura', 'Fruta', 'Carne', 'Pescado', 'Lácteo', 'Cereal', 'Legumbre', 'Especia', 'Salsa', 'Otro'];
const REC_CATS = ['Entrante', 'Principal', 'Postre', 'Guarnición', 'Bebida', 'Salsa', 'Otro'];
const DIFFS = ['Fácil', 'Media', 'Difícil'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

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
      time: 30, portions: 2, items: [], steps: [''], notes: ''
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
    this.sortIngredients();
    this.save();
    return { ings: ings.length, recs: recs.length };
  },

  /* ---- semilla inicial ---- */
  seed() {
    const base = [
      ['Aceite de oliva', 'Salsa', 'cda'], ['Ajo', 'Verdura', 'diente'],
      ['Albahaca', 'Especia', 'hoja'], ['Arroz', 'Cereal', 'g'],
      ['Azúcar', 'Otro', 'g'], ['Cebolla', 'Verdura', 'ud'],
      ['Garbanzos', 'Legumbre', 'g'], ['Harina', 'Cereal', 'g'],
      ['Huevo', 'Otro', 'ud'], ['Leche', 'Lácteo', 'ml'],
      ['Limón', 'Fruta', 'ud'], ['Mantequilla', 'Lácteo', 'g'],
      ['Pimienta negra', 'Especia', 'pizca'], ['Pollo', 'Carne', 'g'],
      ['Queso parmesano', 'Lácteo', 'g'], ['Sal', 'Especia', 'pizca'],
      ['Tomate', 'Verdura', 'ud'], ['Zanahoria', 'Verdura', 'ud']
    ];
    this.data.ingredients = base.map(([name, cat, unit]) => ({
      id: uid(), name, cat, unit, icon: guessIcon(name)
    }));
    this.sortIngredients();

    const find = n => this.data.ingredients.find(i => i.name === n).id;
    this.data.recipes = [{
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
    }];
    this.save();
  }
};
