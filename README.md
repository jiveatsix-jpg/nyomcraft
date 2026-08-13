# ÑOMCRAFT

Recetario con estética pixel. Sin dependencias, sin build, sin servidor: HTML + CSS + JS a pelo.
Los datos se guardan en el `localStorage` del navegador.

## Abrir

Doble clic en `index.html`, o sirviéndolo en local:

```bash
python -m http.server 5173
```

## Qué hace

- **Despensa** — biblioteca de ingredientes. Cada uno tiene nombre, categoría, unidad por
  defecto y un sprite. El sprite se autocompleta a partir del nombre (`guessIcon` en
  `js/icons.js`) salvo que elijas otro a mano.
- **Fichas de receta** — nombre, icono, categoría, dificultad, tiempo y raciones.
- **Ingredientes de la ficha** — se eligen de la despensa con un desplegable; al lado, la
  cantidad y otro desplegable con la unidad (`g`, `ml`, `ud`, `cda`, `diente`, `al gusto`...).
  Al elegir un ingrediente hereda su unidad por defecto. Con `al gusto` la cantidad se
  desactiva.
- **Pasos de elaboración** — lista numerada, reordenable con `^` / `v`.
- **Índice** — rejilla de fichas con buscador (por nombre de receta *o* de ingrediente) y
  filtro por categoría.
- **Exportar / importar** — JSON, desde la pestaña Despensa. La importación fusiona por `id`.
- Imprimir una ficha (`Imprimir`) usa una hoja de estilos aparte, en blanco y negro.

## Estructura

```
index.html          maquetación base y contenedores
css/style.css       tema pixel: paleta, bordes de 4 px, botones con relieve, scanlines
js/icons.js         sprites 8x8 dibujados a mano + renderizador a SVG + guessIcon()
js/store.js         modelo de datos y persistencia en localStorage (clave nomcraft.v1)
js/app.js           vistas (índice / ficha / editor / despensa) y eventos
```

## Añadir un sprite

En `js/icons.js`, una entrada más en `ICONS`: una paleta de tres colores y ocho filas de
ocho caracteres, donde `.` es transparente y `1`/`2`/`3` son índices de la paleta.

```js
kiwi: { label: 'Kiwi', p: ['#7ab648', '#ffffff', '#3d2b1f'], d: [
  '..1111..', '.111111.', '11121111', '11232111',
  '11232111', '11121111', '.111111.', '..1111..'] },
```

Aparece solo en los dos selectores de icono. Para que `guessIcon` lo elija automáticamente,
añade su patrón a la lista `map` de esa misma función.

## Notas

- Los datos viven en el navegador: distinto navegador o perfil, distinto recetario. Usa
  **Exportar** para llevártelos.
- La fuente `Press Start 2P` se carga de Google Fonts; sin conexión cae a `monospace` y la
  app sigue siendo usable. Los rótulos en versalitas van sin tildes a propósito: la fuente
  aplasta las mayúsculas acentuadas. La eñe sí se respeta.
