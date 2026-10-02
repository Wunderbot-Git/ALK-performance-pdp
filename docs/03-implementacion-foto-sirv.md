# 03 · Primera foto en el HTML junto con Sirv

**Objetivo:** que la primera foto del producto sea visible sin esperar a JavaScript, y que Sirv Media Viewer tome el relevo después sin salto visual y sin descargar la imagen dos veces.

**Efecto medido en el prototipo:** móvil 6,45 s → 3,49 s (mediana de 5 corridas); desktop 1,82 s → 0,68 s (1 corrida, indicio).

Este patrón es el que recomienda la propia Sirv: una imagen de marcador (*placeholder*) que se pide apenas carga la página, antes de que cargue `sirv.js`, con el visor posicionado encima ([Sirv: Smart Gallery, placeholder image](https://sirv.com/help/articles/smart-gallery/)).

## Situación actual

```html
<!-- head -->
<link rel="preload" as="image" media="(max-width: 1023px)" fetchpriority="high"
      href="https://cdn.dam.alkosto.com/products/{EAN}/{EAN}-001.webp/{SLUG}?scale.option=fill&w=800&h=0&q=60">
<script defer src="https://scripts.sirv.com/sirvjs/v3/sirv.js"></script>

<!-- body -->
<div class="image-gallery js-sirv-wrapper js-gallery ...">
  <div id="sirv-container" class="Sirv"
       data-src="https://cdn.dam.alkosto.com/products/{EAN}.view"
       data-breakpoints='[{"match":{"width":640},"options":{"thumbnails":{"position":"bottom","type":"bullets"}, ...}},
                          {"match":{"width":9999},"options":{"thumbnails":{"position":"left","type":"square","size":"85"}, ...}}]'
       data-options="autostart:created; ..."></div>
</div>
```

```css
.image-gallery          { position: relative; width: 100%; aspect-ratio: 1 / 1; overflow: hidden; }
.image-gallery::before  { /* skeleton animado */ }
.image-gallery .Sirv    { position: absolute; inset: 0; z-index: 1; opacity: 0; transition: opacity .2s ease; }
.image-gallery.is-ready .Sirv     { opacity: 1; }
.image-gallery.is-ready::before   { opacity: 0; visibility: hidden; }
```

`initSirv()` (script inline después de la galería) agrega `is-ready` cuando el visor de Sirv está listo.

Problemas: la foto no existe hasta que Sirv la crea; el contenedor está en `opacity: 0` hasta `is-ready`; y el preload móvil pide una URL que Sirv nunca usa.

## Paso 1 · Marcado

La foto va como **hermana** de `#sirv-container`, no adentro. Así no le afecta el `opacity: 0` de `.Sirv`, y Sirv no la trata como ítem de la galería.

```html
<div class="image-gallery image-gallery--con-foto js-sirv-wrapper js-gallery new-container__main-product__pdp-gallery-wrapper__gallery--new">
  <picture class="pdp-foto-inicial">
    <source media="(min-width: 1024px)"
            srcset="https://cdn.dam.alkosto.com/products/{EAN}/{EAN}-001.webp/{SLUG}?scale.option=fill&amp;w=700&amp;h=0">
    <img src="https://cdn.dam.alkosto.com/products/{EAN}/{EAN}-001.webp/{SLUG}?scale.option=fill&amp;w=400&amp;h=0"
         width="700" height="700"
         alt="{NOMBRE DEL PRODUCTO}"
         fetchpriority="high">
  </picture>
  <div id="sirv-container" class="Sirv" data-src="https://cdn.dam.alkosto.com/products/{EAN}.view" ...></div>
</div>
```

Reglas:

- **Misma URL que Sirv pide después**, carácter por carácter. Así Sirv reutiliza la imagen ya descargada. Medido el 02.10.2026: Sirv pide `…?scale.option=fill&w=400&h=0` con viewport de 412 px y `…?scale.option=fill&w=700&h=0` con viewport de 1365 px.
- **Sin `loading="lazy"`.** El ejemplo de Sirv usa `loading="lazy"` en el placeholder; para la foto principal (LCP) eso la retrasa.
- **`fetchpriority="high"`**, para que el navegador la pida antes que los scripts.
- **`alt` con el nombre del producto.** Hoy la foto principal solo existe cuando corre JavaScript.
- `{EAN}`, `{SLUG}` y `{NOMBRE DEL PRODUCTO}` salen de los mismos datos que hoy generan el preload y `data-src`.
- La clase `image-gallery--con-foto` permite activar el CSS nuevo solo donde existe la foto (productos sin imagen, rollout gradual).

## Paso 2 · Preload alineado

```html
<link rel="preload" as="image" media="(max-width: 1023px)" fetchpriority="high"
      href="https://cdn.dam.alkosto.com/products/{EAN}/{EAN}-001.webp/{SLUG}?scale.option=fill&amp;w=400&amp;h=0">
<link rel="preload" as="image" media="(min-width: 1024px)" fetchpriority="high"
      href="https://cdn.dam.alkosto.com/products/{EAN}/{EAN}-001.webp/{SLUG}?scale.option=fill&amp;w=700&amp;h=0">
```

- Móvil: cambiar `w=800&h=0&q=60` por `w=400&h=0`.
- Desktop: hoy el `href` usa otra ruta (`/products/{EAN}-001.webp/…`, sin la carpeta `/{EAN}/`), aunque el `imagesrcset` es correcto. Usar la misma URL que el `<img>`.
- El `media` del preload y el del `<source>` tienen que coincidir.

## Paso 3 · CSS de relevo

```css
/* Contenedor de consulta: el tamaño del visor de Sirv depende del ancho de la galería */
.image-gallery--con-foto { container-type: inline-size; }

.pdp-foto-inicial,
.pdp-foto-inicial img {
  position: absolute;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.pdp-foto-inicial { inset: 0; z-index: 0; }

/* Misma área que la diapositiva de Sirv, para que no haya salto en el relevo.
   Breakpoint de Sirv en data-breakpoints: hasta 640 px de ancho = miniaturas abajo (puntos). */
@container (max-width: 640px) {
  .pdp-foto-inicial { inset: 0 0 70px 0; }   /* 70 px: franja de puntos debajo de la foto */
}
@container (min-width: 641px) {
  .pdp-foto-inicial { inset: 0 0 0 95px; }   /* 95 px: columna de miniaturas (85 px + separación) */
}

/* Sin skeleton mientras se ve la foto */
.image-gallery--con-foto:not(.is-ready)::before { visibility: hidden; }

/* Relevo: Sirv (z-index 1) pasa de opacity 0 a 1 en 0,2 s; luego se oculta la foto fija */
.image-gallery--con-foto.is-ready .pdp-foto-inicial {
  visibility: hidden;
  transition: visibility 0s .25s;
}
```

De dónde salen los valores (medidos el 02.10.2026, ver `geometria` en los JSON de `resultados/2026-10-02-humo-*`):

| Perfil | Galería | Diapositiva de Sirv | Foto de Sirv |
| --- | --- | --- | --- |
| Móvil (viewport 412 px) | 380×380 | 380×310 desde arriba; 70 px de puntos debajo | 310×310, centrada |
| Desktop (viewport 1365 px) | 756×756 | desde x+95, 661 de ancho, alto completo | 661×661, centrada vertical |

Con `object-fit: contain`, la foto fija queda exactamente donde Sirv pinta la suya. En el prototipo la foto fija ocupaba toda la galería (380×380 en móvil), lo que habría causado un salto de 380 a 310 px en el relevo. Hay que verificar los valores en tablet (viewport 768–1023 px), que no se midió.

## Paso 4 · JavaScript

No hace falta JavaScript nuevo. `initSirv()` ya agrega `is-ready` cuando el visor está listo.

Recomendaciones:

- Mantener `autostart:created` en `data-options` (Sirv inicia apenas se crea el visor; el valor por defecto `visible` esperaría a que entre en pantalla).
- `is-ready` debería ponerse cuando la **primera foto de Sirv ya está pintada** (por ejemplo en `zoom:ready` o `image:ready` del primer ítem, ver [eventos de Sirv](https://sirv.com/help/articles/events-smv/)), no antes. Si se pone antes, se ve un instante vacío.
- **No agregar un timeout que oculte la foto fija.** Si Sirv falla o tarda, la foto fija sigue visible: es justamente la ventaja de este patrón.

## Paso 5 (opcional) · Menos trabajo para Sirv

Con la foto fija, estos pasos ya no influyen en el LCP, pero sí en cuándo la galería es interactiva (deslizar, zoom):

- **Ítems en el HTML en lugar del archivo `.view`.** El servidor ya conoce las imágenes del producto (las usa para el preload). Definirlas como ítems ahorra el request del JSON `.view` (0,5–0,9 s en móvil):

  ```html
  <div id="sirv-container" class="Sirv" data-options="autostart:created; ...">
    <div data-src="https://cdn.dam.alkosto.com/products/{EAN}/{EAN}-001.webp"></div>
    <div data-src="https://cdn.dam.alkosto.com/products/{EAN}/{EAN}-002.webp"></div>
    <!-- videos y 360 incluidos hoy en el .view: agregarlos con su data-type -->
  </div>
  ```
  Verificar con Sirv que el orden, los videos y los hotspots queden igual que con `.view` ([documentación del visor](https://sirv.com/help/articles/sirv-media-viewer/)).

- **Build de `sirv.js` con solo los módulos usados.** Sirv permite `sirv.js?modules=…` (módulos disponibles: `lazyimage`, `zoom`, `spin`, `hotspots`, `video`, `model`, `gallery`). Hoy se cargan 152 KB. La PDP usa al menos zoom, video y hotspots; confirmar la lista antes de cambiarlo.

## Qué no hacer

| No hacer | Por qué |
| --- | --- |
| Poner la foto dentro de `#sirv-container` | `.Sirv` está en `opacity: 0` hasta `is-ready`, y Sirv reemplaza o interpreta su contenido |
| Usar otra URL que la que pide Sirv | La imagen se descarga dos veces y compite por ancho de banda |
| `loading="lazy"` en la foto principal | La retrasa; es el elemento LCP |
| Quitar el `opacity: 0` de `.Sirv` sin foto fija | Se vería el visor a medio armar |
| Ocultar la foto fija por timeout | Si Sirv falla, la página queda sin foto |

## Lista de control (QA)

- [ ] Móvil, tablet (768 y 1024 px) y desktop: la foto fija y la foto de Sirv quedan en el mismo lugar, sin salto. CLS ≤ 0,1 en el panel Performance.
- [ ] En Network: la primera foto se descarga **una sola vez** (misma URL en `<img>`, preload y Sirv).
- [ ] Deslizar, miniaturas, zoom, pantalla completa, video y hotspots funcionan igual que antes.
- [ ] Producto con una sola imagen, con video entre los primeros ítems y sin imagen.
- [ ] Bloquear `scripts.sirv.com` en DevTools: la foto fija sigue visible.
- [ ] `alt` correcto en la foto fija.
- [ ] Repetir la prueba de prototipo contra staging: `node prueba-prototipo.cjs --url <PDP de staging> --variantes base`, antes y después del despliegue.
- [ ] Después del despliegue: comparar el LCP de campo (CrUX o RUM) de las PDP durante 28 días.
