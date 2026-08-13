# Changelog — empaquetado de escritorio (Ma'hai)

Notas para quien (humano o IA) toque este repo después y se encuentre con
decisiones que no son obvias mirando solo el código actual.

## 2026-08-13 — Marcador de dudas: cambia el formato de los pasos

Sin implicaciones para el empaquetado (no toca Vite, Tauri ni capabilities),
pero **sí cambia el formato de los datos guardados**, que es lo que importa
si alguien tiene una versión instalada:

- Los pasos de una receta eran `string[]` y ahora son `[{ t, q }]`, donde `t`
  es el texto y `q` la duda (`null` = sin duda, `''` = marcada sin nota,
  `'texto'` = marcada con nota). Los ingredientes ganan el mismo campo `q`, y
  la receta uno propio para la duda general.
- **La migración es automática y en un solo sitio**: `normalizeRecipe()` en
  `store.js`, llamada desde `load()`, `importJSON()`, `saveRecipe()` y
  `seed()`. Convierte los pasos antiguos en cuanto se leen, así que una
  instalación existente se actualiza sola al abrirla y ningún otro punto del
  código tiene que preguntarse de qué versión vienen los datos. Verificado
  sembrando localStorage con el formato viejo: el texto sobrevive intacto.
- **Compatibilidad hacia atrás, no hacia delante**: un JSON exportado por una
  versión anterior se importa sin problema (se normaliza al entrar). Al revés
  no: un JSON exportado a partir de aquí, abierto en un build anterior,
  mostraría los pasos vacíos, porque el código viejo espera strings y se
  encontraría objetos. Relevante solo si conviven dos versiones instaladas.

## 2026-08-13 — Directorio de masas (feature)

Sin implicaciones para el empaquetado: no toca `vite.config.js`,
`tauri.conf.json`, `Cargo.toml` ni las capabilities. Se anota solo por el
punto que afecta al build:

- **Se añadió un script global nuevo**, `masas.js` (catálogo de masas en
  porcentaje de panadero). Siguiendo la nota de la entrada de abajo, va en
  `www/public/js/`, no en `www/` directo — es un script clásico más, sin
  `type="module"`, y desde `public/` se copia verbatim a `dist/`. El
  `<script src="js/masas.js">` de `index.html` se cargó antes que `app.js`
  porque este consume `MASAS`, `masaTotalPct()` y `masaHidratacion()`.
- Verificado tras el cambio que los cuatro scripts siguen resolviéndose y
  que la app arranca sin errores de consola.

## 2026-08-13 — Migración a Vite + fix del crash al exportar JSON

**Contexto**: este repo se empaqueta como app de escritorio Tauri para el
hub [Ma'hai](https://github.com/jiveatsix-jpg/mahai). Hasta este commit,
`www/` (la carpeta que Tauri realmente empaqueta) era una copia mantenida
a mano de los archivos que antes vivían en la raíz del repo. Un commit
anterior (`4b8c5db`) ya había eliminado la copia de la raíz para dejar
`www/` como fuente única — este cambio va un paso más allá y le agrega
Vite para que `dist/` (lo que Tauri empaqueta) se genere solo, en vez de
mantenerse a mano.

**Qué cambió**:

- Se agregó `vite.config.js` (`root: 'www'`, `build.outDir: '../dist'`).
- `src-tauri/tauri.conf.json`: `frontendDist` pasa de `../www` a `../dist`,
  con `beforeBuildCommand`/`beforeDevCommand` corriendo `npm run build`/`dev`.
- **Gotcha real que costó tiempo diagnosticar**: Vite NO copia
  `<script src="...">` sin `type="module"` a `dist/` — los deja como
  referencia sin resolver y el build "termina bien" sin avisar que falta
  todo el JS. Los tres scripts de `www/js/` (`icons.js`, `store.js`,
  `app.js`) son scripts clásicos (scope global, sin `import`/`export`,
  orden de carga importa). Convertirlos a `type="module"` habría roto el
  scope global compartido entre ellos. La solución fue moverlos a
  `www/public/js/` — todo lo que vive en `public/` se copia a `dist/`
  verbatim, sin procesar, en la misma ruta relativa, así que los
  `<script src="js/...">` del HTML siguen funcionando sin tocar ni una
  línea de JS. Si se agrega un script global nuevo, va en `public/`, no
  en `www/` directo.
- `.gitignore`: se agrega `dist/` (ya no se commitea, se regenera en cada
  build, igual que en las otras apps del ecosistema Ma'hai que usan Vite).

**Bug separado, encontrado al verificar el empaquetado**: el botón
"Exportar JSON" (antes `#p-export`, ahora `#export` en la cabecera, ver
`exportAll()` en `www/public/js/app.js`) usaba
`window.__TAURI__.fs.writeTextFile(path, json)` tras elegir la ruta con el
diálogo nativo. Esto crashea/falla en silencio en el build de escritorio:
el permission set `fs:default` (declarado en
`src-tauri/capabilities/default.json`) **solo concede lectura** de los
directorios propios de la app (AppConfig/AppData/AppLocalData/AppCache/
AppLog) — no escritura, y no da alcance a rutas arbitrarias fuera de esos
directorios (como la que devuelve el diálogo de guardado). Confirmado
contra el esquema vendorizado en `src-tauri/gen/schemas/desktop-schema.json`.

**Fix**: en vez de agregar permisos de scope de `fs` (frágil: o se abre a
`**` sin restricción, o hay que mantener el scope sincronizado con cada
ruta posible), se agregó un comando Rust propio
(`write_text_file` en `src-tauri/src/lib.rs`) que llama directo a
`std::fs::write`, evitando el sistema de scopes del plugin `fs` por
completo. El JS invoca `window.__TAURI__.core.invoke('write_text_file', {
path, contents })` en vez de `fs.writeTextFile`. Verificado en vivo:
exporta sin error y confirma la ruta real (`Exportado en: C:\...\Downloads\
nomcraft-recetario.json`).

**Verificado también**: el botón "Exportar PDF" de la ficha de receta
(`window.print()` + hoja `@media print`, agregado en `d10ec25`) funciona
correctamente dentro del WebView2 del build de escritorio — abre el
diálogo de impresión nativo con vista previa correcta.

**Nota**: `captain-log` (otro repo del mismo hub) tenía exactamente la
misma duplicación raíz/`www/` y el mismo patrón de export roto — recibió
el mismo tratamiento (Vite + comando Rust propio) el mismo día.

**Limpieza adicional**: como `write_text_file` reemplaza por completo el
único uso que tenía este repo del plugin `tauri-plugin-fs`, se removió
la dependencia (`Cargo.toml`), su registro en `lib.rs` y el permiso
`fs:default` de `capabilities/default.json` — ya no hace falta. Verificado
que el export sigue funcionando después de la remoción (archivo
actualizado en Descargas, proceso no crashea).
