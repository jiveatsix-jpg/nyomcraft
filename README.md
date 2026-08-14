# ÑOMCRAFT

Recetario con estética pixel. La app en sí es HTML + CSS + JS a pelo, sin ninguna dependencia
de runtime; Vite y Tauri solo intervienen para servirla y empaquetarla. Los datos se guardan
en el `localStorage`.

Se usa de dos maneras, **las dos desde el mismo código** (`www/`):

- **En el navegador**:

  ```bash
  npm install
  npm run dev
  ```

- **Como aplicación de escritorio** — envoltorio [Tauri](https://tauri.app):

  ```bash
  npm run tauri dev
  ```

  Para generar el instalable: `npm run tauri build`.

## Qué hace

- **Despensa** — biblioteca de ingredientes. Cada uno tiene nombre, categoría, unidad por
  defecto y un sprite. El sprite se autocompleta a partir del nombre (`guessIcon` en
  `js/icons.js`) salvo que elijas otro a mano.
- **Índice por grupos** — bajo el título del índice, pestañas (**Comida**, **Postres**,
  **Bebidas**, **Salsas**, más **Todas**) filtran de un vistazo, cada una con su recuento. Se
  combinan con la búsqueda y con el filtro de categoría fino que ya había, así que puedes
  buscar «lima» dentro de Bebidas y quedarte solo con los cócteles que la llevan. La pestaña
  agrupa por categoría de receta, no por origen: un postre chileno y uno español conviven en
  la misma pestaña «Postres».
- **Recetario de ejemplo** — una instalación nueva arranca con 87 ingredientes y 58 recetas:
  28 de comida y 7 postres (entre ellas un buen puñado de platos chilenos — empanadas de
  pino, pastel de choclo, cazuela de pollo, carbonada, charquicán, porotos granados,
  humitas, sopaipillas, kuchen de manzana — además de las españolas, mexicanas e italianas
  ya presentes), 8 salsas (alioli, mayonesa, romesco, pebre entre ellas) y 15 bebidas — una
  por cada uno de los 9 vasos del directorio de cristalería, más zumos y batidos sin
  alcohol. Es contenido semilla: solo aparece en `localStorage` vacío, así que no toca
  instalaciones que ya tengan datos.
- **Sello** — un «✓» que marcas en una receta cuando la has hecho y te ha salido perfecta,
  distinto de la duda (que marca lo que falta por confirmar). Se pone y se quita con un botón
  en la propia ficha; las recetas con sello se distinguen en el índice con una insignia verde,
  y el botón **✓ Probadas** deja ver solo esas — útil si vas construyendo el recetario poco a
  poco y quieres separar lo ya confirmado de lo que todavía estás probando.
- **Fichas de receta** — nombre, icono, categoría, dificultad, tiempo y raciones. Para
  cócteles, zumos y demás líquidos (categoría «Bebida»), también un **vaso o copa de
  servicio** opcional: 9 tipos de cristalería a 8×8 (vaso corto, tubo, cóctel, balón de
  gin-tonic, vino, flauta, chupito, jarra, margarita), con su nombre y su icono en la
  ficha, junto a la categoría y la dificultad.
- **Ingredientes de la ficha** — se eligen de la despensa con un desplegable; al lado, la
  cantidad y otro desplegable con la unidad (`g`, `ml`, `ud`, `cda`, `diente`, `al gusto`...).
  Al elegir un ingrediente hereda su unidad por defecto. Con `al gusto` la cantidad se
  desactiva.
- **Pasos de elaboración** — lista numerada, reordenable con `^` / `v`.
- **Índice** — rejilla de fichas con buscador (por nombre de receta *o* de ingrediente) y
  filtro por categoría.
- **Dudas** — un `?` amarillo que marca «esto hay que confirmarlo». Se cuelga de un
  ingrediente, de un paso o de la receta entera, y admite una nota opcional
  («¿3 tomates o 3 kg?»). Las fichas con dudas se señalan en el índice con el número de
  cosas pendientes, y el botón **? Por confirmar** deja ver solo esas. Se imprimen con la
  ficha: son justo lo que hay que revisar.
- **Directorio de masas** — 21 masas clásicas (panes, pizza, hojaldradas, quebradas, frescas,
  batidas y el cultivo de masa madre) escritas en **porcentaje de panadero**: la harina es el
  100 % y el resto se expresa respecto a ella. Cada masa trae su calculador, que funciona en
  dos sentidos:
  - *Desde la harina* — fijas los gramos de harina y salen las demás cantidades.
  - *Desde las piezas* — dices «4 bolas de 250 g» y despeja al revés cuánta harina hace falta.

  El botón **Guardar como ficha** vuelca las cantidades ya calculadas al recetario como una
  receta normal, dando de alta en la despensa los ingredientes que falten.

  Las masas del catálogo son **editables** («Editar» en la ficha): nombre, familia, icono,
  ingredientes con su porcentaje, pasos y notas. Una masa editada muestra una etiqueta
  «Personalizada» y se puede devolver a su versión original con «Restablecer original». Los
  cambios se guardan aparte del catálogo (no lo tocan) y viajan con **Exportar/Importar JSON**.

  Cuando un ingrediente es en realidad otra masa de este mismo directorio — la «Masa madre
  activa» de un pan de masa madre, por ejemplo — su nombre es un enlace: lleva directamente a
  la receta de esa masa (la del cultivo, con sus días de refrescos) en vez de dejarte con un
  ingrediente que no sabes de dónde sale.
- **Exportar / importar** — botones fijos en la cabecera, visibles desde cualquier vista.
  `Exportar JSON` descarga el recetario entero (recetas *e* ingredientes) en
  `nomcraft-recetario.json`; la importación fusiona por `id`, sin pisar lo que ya tienes.
- **Exportar PDF** — en la ficha. Abre el diálogo de impresión del navegador, donde el destino
  a elegir es «Guardar como PDF»; la hoja `@media print` reformatea la ficha en blanco y negro
  y evita cortar pasos entre páginas. El nombre sugerido del archivo es el de la receta.

## Estructura

```
www/                 la app — fuente unica, la comparten navegador y escritorio
  index.html         maquetación base y contenedores
  css/style.css      tema pixel: paleta, bordes de 4 px, botones con relieve, scanlines
  public/js/icons.js   sprites 8x8 dibujados a mano + renderizador a SVG + guessIcon()
  public/js/store.js   modelo de datos y persistencia en localStorage (clave nomcraft.v1)
  public/js/masas.js   catálogo de masas en porcentaje de panadero (datos, sin lógica de UI)
  public/js/app.js     vistas (índice / ficha / editor / masas / despensa) y eventos
vite.config.js       root: www, build a dist/
src-tauri/           envoltorio de escritorio; frontendDist apunta a ../dist
package.json         Vite y la CLI de Tauri — la app en sí no tiene dependencias
```

No hay copias duplicadas: `www/` es el único sitio donde se toca la app. Vite construye
`dist/` y Tauri empaqueta eso.

**Los scripts van en `www/public/js/`**, no en `www/js/`. Son scripts clásicos —comparten
scope global y el orden de carga importa—, y Vite solo copia verbatim lo que vive en
`public/`. Un script global colocado fuera de `public/` desaparece del build sin error.
Está explicado a fondo en [CHANGELOG.md](CHANGELOG.md).

## Añadir un sprite

En `www/public/js/icons.js`, una entrada más en `ICONS`: una paleta de tres colores y ocho
filas de ocho caracteres, donde `.` es transparente y `1`/`2`/`3` son índices de la paleta.

```js
kiwi: { label: 'Kiwi', p: ['#7ab648', '#ffffff', '#3d2b1f'], d: [
  '..1111..', '.111111.', '11121111', '11232111',
  '11232111', '11121111', '.111111.', '..1111..'] },
```

Aparece solo en los dos selectores de icono. Para que `guessIcon` lo elija automáticamente,
añade su patrón a la lista `map` de esa misma función.

## Añadir una masa

En `www/public/js/masas.js`, una entrada más en `MASAS`. Los porcentajes son **sobre la
harina**, que va siempre primera y al 100 %; por eso la suma pasa de 100. Marca con
`liq: true` lo que cuente como hidratación y el calculador hace el resto.

```js
{
  id: 'pan-de-espelta', name: 'Pan de espelta', icon: 'pan', fam: 'Pan',
  hint: 'Absorbe menos agua que el trigo.',
  ing: [
    { n: 'Harina de espelta', p: 100 },
    { n: 'Agua', p: 60, liq: true },
    { n: 'Sal', p: 2 },
    { n: 'Levadura fresca', p: 1, nota: 'o 1/3 de seca' }
  ],
  steps: ['...'],
  notes: '...'
}
```

## Notas

- Los datos viven en el navegador: distinto navegador o perfil, distinto recetario. Usa
  **Exportar** para llevártelos.
- La fuente `Press Start 2P` se carga de Google Fonts; sin conexión cae a `monospace` y la
  app sigue siendo usable. Los rótulos en versalitas van sin tildes a propósito: la fuente
  aplasta las mayúsculas acentuadas. La eñe sí se respeta.
