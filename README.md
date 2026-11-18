# VRTourBuilder

**English** · [Español](#español)

A 100% client-side web app (no server) for building **virtual tours** from 360º photos and
exporting them as a self-contained package powered by
[Photo Sphere Viewer](https://photo-sphere-viewer.js.org/) v5.

Instead of hand-writing the nodes, links and marker coordinates for every hotspot, you upload
your photos through a GUI, connect them by clicking on the image to place the markers, preview
the result and export a ready-to-run ZIP.

## How it works

1. **Photos** — Upload your 360º photos (drag & drop or click). Each photo is a **node** of the
   tour. You can give it a display name, adjust its filename under `./pano` and mark the
   **start node**.
2. **Editor** — Select a node, add links to other nodes and, with the **Place** button, click on
   the 360º image to fix the marker position (the navigation arrow).
   - Each link can be **bidirectional** (↔, the default) or **one-way** (→). A bidirectional
     link needs a marker at both ends (from A and from B); a one-way link only needs the marker
     on its origin node. While a required marker is missing, a warning is shown and export stays
     **blocked**.
3. **Diagram** — Graph view of all nodes and their links. Incomplete edges appear in
   red/dashed; complete ones in green.
4. **Preview** — The real tour mounted live with the VirtualTourPlugin (WYSIWYG).
5. **Export ZIP** — Downloads `index.html` + `tour.js` + `./pano/*` along with a readme and server
   launchers. Their names and contents follow the **tour language** (chosen in Settings,
   independent of the app language): in English you get `README.txt` + `start-server.bat` /
   `start-server.sh`, in Spanish `LEEME.txt` + `iniciar-servidor.bat` / `iniciar-servidor.sh`.
   The tour uses ES modules, so it **won't run from a double-click** (`file://` is blocked by
   browsers): the folder must be served over HTTP. The launchers start a local server;
   alternatively use `npx serve` or `python -m http.server`. If opened via `file://`,
   `index.html` itself shows these instructions.
   - **Tiles** (Settings, on by default): each photo is split into tiles under `./pano_tiles`
     and the tour uses Photo Sphere Viewer's `EquirectangularTilesAdapter`. The viewer first
     shows a small `base.jpg` and then downloads, always at full resolution, only the tiles in
     view. Tours load much faster and phones no longer have to decode a huge photo at once
     (the cause of "Error loading panorama" with 50-70 Mpx photos). With regular camera JPEGs
     the split is **lossless**: the tiles hold exactly the same JPEG data as the original (a
     coefficient-level crop, like `jpegtran -crop`). PNGs, progressive JPEGs and sizes that
     don't fit the JPEG block grid are re-encoded at quality 95. Tiles require full 360º
     panoramas (2:1); otherwise the tour is exported with whole photos and a warning.

Progress is **auto-saved** in the browser (IndexedDB). Under **Project ▾** you can export or
import a `.vrtour.zip` file (model + photos) for backup or to continue on another machine.
`.vrtour.json` files from earlier versions can also be imported.

## Development

```bash
npm install
npm run dev      # dev server
npm run build    # production build (typecheck + bundle)
npm run preview  # serve the build
```

### Desktop app (Electron)

```bash
npm run dist:win     # Windows installer + portable
npm run dist:mac     # macOS dmg + zip
npm run dist:linux   # Linux AppImage + deb
```

Builds are also produced automatically by GitHub Actions: pushing a `v*` tag (e.g. `v0.1.0`)
publishes a GitHub Release with the installers for all three platforms.

## Technical notes

- **Stack:** Vite + React + TypeScript, Zustand (state), React Flow (diagram),
  `idb` (IndexedDB for photo blobs), JSZip + FileSaver (export), Electron (desktop app).
- **Marker coordinates:** Photo Sphere Viewer's `click` event delivers `yaw`/`pitch` in radians;
  they are stored as-is, in the same format `link.position` expects.
- **Exported tour:** the `index.html` loads Photo Sphere Viewer from a CDN (jsDelivr) with
  versions pinned via `importmap`; photos are served locally from `./pano` (or `./pano_tiles`).
  It only needs an internet connection to load the library.
- **Tiling:** `src/lib/tiles/jpegLossless.ts` parses baseline JPEGs down to their DCT
  coefficients and rewrites each tile with optimized Huffman tables, without decoding to
  pixels. It runs in Web Workers (`tiler.worker.ts`), so the UI stays responsive.

## License

See [LICENSE.txt](LICENSE.txt).

---

# Español

[English](#vrtourbuilder) · **Español**

Aplicación web (100% cliente, sin servidor) para construir **tours virtuales** a partir de
fotos 360º y exportarlos como un paquete autónomo que usa la librería
[Photo Sphere Viewer](https://photo-sphere-viewer.js.org/) v5.

En lugar de escribir a mano los nodos, conexiones y coordenadas de cada marcador, subes tus
fotos por una GUI, las conectas haciendo clic sobre la imagen para colocar los marcadores, lo
previsualizas y exportas un ZIP ejecutable.

## Cómo funciona

1. **Fotos** — Sube tus fotos 360º (arrastrar y soltar o clic). Cada foto es un **nodo** del
   tour. Puedes darle un nombre visible, ajustar el nombre de archivo en `./pano` y marcar el
   **nodo inicial**.
2. **Editor** — Selecciona un nodo, añade conexiones a otros nodos y, con el botón **Colocar**,
   haz clic sobre la imagen 360º para fijar la posición del marcador (la flecha de navegación).
   - Cada conexión puede ser **bidireccional** (↔, por defecto) o de **solo ida** (→). Una
     conexión bidireccional necesita un marcador en cada extremo (desde A y desde B); una de
     solo ida solo necesita el marcador en su nodo de origen. Mientras falte un marcador
     requerido, se muestra un aviso y la exportación queda **bloqueada**.
3. **Diagrama** — Vista de grafo de todos los nodos y sus conexiones. Las aristas incompletas
   aparecen en rojo/discontinuo; las completas en verde.
4. **Vista previa** — El tour real montado en vivo con el VirtualTourPlugin (WYSIWYG).
5. **Exportar ZIP** — Descarga `index.html` + `tour.js` + `./pano/*` junto a un archivo de ayuda
   y lanzadores de servidor. Sus nombres y contenidos siguen el **idioma del tour** (elegido en
   Ajustes, independiente del idioma de la aplicación): en español obtienes `LEEME.txt` +
   `iniciar-servidor.bat` / `iniciar-servidor.sh`, y en inglés `README.txt` + `start-server.bat`
   / `start-server.sh`. El tour usa ES modules, así que **no funciona con doble clic**
   (`file://` lo bloquea el navegador): hay que servir la carpeta por HTTP. Los lanzadores
   levantan un servidor local; alternativamente `npx serve` o `python -m http.server`. Si se
   abre por `file://`, el propio `index.html` muestra estas instrucciones.
   - **Teselas** (Ajustes, activado por defecto): cada foto se trocea en teselas en
     `./pano_tiles` y el tour usa el `EquirectangularTilesAdapter` de Photo Sphere Viewer. El
     visor muestra primero un `base.jpg` reducido y después descarga, siempre a resolución
     completa, solo las teselas que se están viendo. Los tours cargan mucho más rápido y el
     móvil ya no tiene que decodificar de golpe una foto enorme (la causa de «Error loading
     panorama» con fotos de 50-70 Mpx). Con los JPEG normales de cámara el troceado es **sin
     pérdida**: las teselas contienen exactamente los mismos datos JPEG que el original (un
     recorte a nivel de coeficientes, como `jpegtran -crop`). Los PNG, JPEG progresivos y
     tamaños que no encajan en los bloques del JPEG se recomprimen a calidad 95. Las teselas
     exigen panorámicas 360º completas (2:1); si no, el tour se exporta con las fotos enteras
     y se avisa.

El progreso se **autoguarda** en el navegador (IndexedDB). Con **Proyecto ▾** puedes exportar
o importar un archivo `.vrtour.zip` (modelo + fotos) para respaldo o continuar en otra máquina.
También se pueden importar los `.vrtour.json` de versiones anteriores.

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # build de producción (typecheck + bundle)
npm run preview  # sirve el build
```

### Aplicación de escritorio (Electron)

```bash
npm run dist:win     # instalador + portable de Windows
npm run dist:mac     # dmg + zip de macOS
npm run dist:linux   # AppImage + deb de Linux
```

Los binarios también se generan automáticamente con GitHub Actions: al empujar un tag `v*`
(p. ej. `v0.1.0`) se publica un GitHub Release con los instaladores para las tres plataformas.

## Notas técnicas

- **Stack:** Vite + React + TypeScript, Zustand (estado), React Flow (diagrama),
  `idb` (IndexedDB para los blobs de las fotos), JSZip + FileSaver (exportación),
  Electron (app de escritorio).
- **Coordenadas de marcadores:** el evento `click` de Photo Sphere Viewer entrega `yaw`/`pitch`
  en radianes; se guardan tal cual, en el mismo formato que espera `link.position`.
- **Tour exportado:** el `index.html` carga Photo Sphere Viewer por CDN (jsDelivr) con versiones
  fijadas mediante `importmap`; las fotos se sirven localmente desde `./pano` (o `./pano_tiles`).
  Requiere conexión a internet solo para cargar la librería.
- **Teselas:** `src/lib/tiles/jpegLossless.ts` lee los JPEG secuenciales hasta sus coeficientes
  DCT y reescribe cada tesela con tablas Huffman optimizadas, sin decodificar a píxeles. Se
  ejecuta en Web Workers (`tiler.worker.ts`), así que la interfaz no se bloquea.

## Licencia

Ver [LICENSE.txt](LICENSE.txt).
