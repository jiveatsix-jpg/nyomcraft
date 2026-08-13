# Changelog — empaquetado de escritorio (Ma'hai)

Notas para quien (humano o IA) toque este repo después y se encuentre con
decisiones que no son obvias mirando solo el código actual.

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
