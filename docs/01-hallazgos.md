# 01 · Hallazgos de la auditoría

PDP analizadas (2 de octubre de 2026):

- OPPO A6: `https://www.alkosto.com/celular-oppo-a6-256gb-4g-azul/p/6932169397902`
- Dell Essential 15,6″: `https://www.alkosto.com/computador-portatil-dell-essential-156-pulgadas-9kp97/p/884116673774`
- Whirlpool 21 kg: `https://www.alkosto.com/lavadora-whirlpool-carga-frontal-21-kilos-7mwfw5605mc-gris/p/883049644622`

Perfiles: móvil (412×823, DPR 1,75, 4G 1,6 Mbit/s y 150 ms, CPU 4× más lenta) y escritorio (sin limitación). Caché fría, banner de cookies sin aceptar, sin clics.

## 1. La foto depende de una cadena de JavaScript

La galería de producto no existe en el HTML. Solo hay un contenedor vacío:

```html
<div class="image-gallery js-sirv-wrapper js-gallery ...">
  <div id="sirv-container" class="Sirv" data-src="https://cdn.dam.alkosto.com/products/6932169397902.view" ...></div>
</div>
```

Además, la hoja de estilos de Alkosto oculta la galería hasta que el código propio (`initSirv()`) la marca como lista:

```css
.image-gallery .Sirv { position: absolute; inset: 0; z-index: 1; opacity: 0; transition: opacity .2s ease; }
.image-gallery.is-ready .Sirv { opacity: 1; }
```

La foto aparece recién al final de esta cadena (OPPO, móvil):

| Paso | Momento |
| --- | --- |
| `sirv.js` descargado (tiene `defer`) | ~4,5 s |
| `widget.reviews.io/polaris/build.js` (síncrono en el `<body>`) termina | 6,6–7,6 s |
| El navegador termina de leer el HTML; recién ahora corre `sirv.js` | ~8,0 s |
| Sirv pide el JSON de la galería (`.view`) | 8,05–8,87 s |
| Sirv pide la foto (`w=400`) | 9,70–10,97 s |
| `is-ready`, la galería pasa de `opacity: 0` a `1` | tras la foto |

En escritorio la foto ya está descargada a los 0,4–0,5 s (gracias al preload), pero se pinta a los 1,9–2,4 s: 1,4–1,9 s de espera de render por la misma cadena.

## 2. Mediciones

| PDP | Perfil | LCP corrida 1 | LCP corrida 2 | Elemento LCP | Foto cargada |
| --- | --- | --- | --- | --- | --- |
| OPPO A6 | móvil | 5,72 s | 5,01 s | banner del preheader (ver punto 5) | 10,98 / 10,97 s |
| OPPO A6 | escritorio | 2,40 s | 2,20 s | foto | 0,51 s |
| Dell 15,6″ | móvil | 9,15 s | 8,83 s | H1 movido por JS (ver punto 6) | 10,38 / 10,21 s |
| Dell 15,6″ | escritorio | 1,90 s | 1,90 s | foto | – |
| Whirlpool | móvil | 5,50 s | 10,10 s | banner / foto | 10,93 / 9,39 s |
| Whirlpool | escritorio | 17,08 s | 2,01 s | foto (corrida 1: CSS de jsDelivr colgado 15,4 s) | – |

La segunda auditoría independiente (Playwright, Chrome 154) midió el LCP con la foto como elemento final en las 12 corridas base: móvil 9,58 s (OPPO), 7,87 s (Dell) y 7,96 s (Whirlpool); escritorio 3,88 s, 1,92 s y 2,01 s (medianas de 2 corridas).

### Desglose del LCP (ms)

| Corrida | Elemento | TTFB | Retraso de carga | Duración de carga | Retraso de render | LCP |
| --- | --- | --- | --- | --- | --- | --- |
| OPPO · móvil · 1 | banner | 84 | 4.010 | 892 | 736 | 5.722 |
| OPPO · escritorio · 2 | foto | 58 | 6 | 380 | 1.755 | 2.199 |
| Dell · escritorio · 2 | foto | 69 | 6 | 325 | 1.496 | 1.896 |
| Whirlpool · móvil · 2 | foto | 70 | 8.554 | 763 | 709 | 10.096 |
| Whirlpool · escritorio · 2 | foto | 151 | 15 | 313 | 1.534 | 2.012 |

La duración de la descarga de la imagen nunca supera 1 segundo. El tiempo se pierde antes (la foto se pide tarde) y después (la foto ya está, pero la galería no se muestra).

## 3. Inventario de scripts

92 etiquetas `<script>` (49 externas, 43 inline incluyendo JSON-LD), igual en las tres PDP.

**Solo 1 de 49 scripts externos es render-blocking (2 %): `app.varify.io/varify.js`.** Pero otros detienen la lectura del HTML y eso no aparece en esa métrica:

| Script | Carga | Efecto medido |
| --- | --- | --- |
| `widget.reviews.io/polaris/build.js` + `rich-snippet/dist.js` | `<body>`, síncrono | build.js termina a los 6,6–7,6 s y retrasa todo lo que es `defer`, incluido Sirv |
| CSS `cdn.jsdelivr.net/npm/@algolia/autocomplete-theme-classic` (sin versión) | `<body>`, antes de un script inline | El script inline espera a este CSS. En 1 de 6 corridas colgó 15,4 s → LCP 17,1 s |
| `app.varify.io/varify.js` (A/B testing) | `<head>`, síncrono | Bloquea el render 0,64–3,0 s. Bloqueado: FCP igual, LCP −1,18 s (2 corridas) |
| `cdn.dam.alkosto.com/ecommerce/algolia/widget/alkosto-ia.min.js` (solo Dell) | `<body>`, síncrono | 1,1–2,4 s; atributos sin renderizar (`data-product-id="{{product_id}}"`) y `data-debug="true"` en producción |
| Inline `var ACC={config:…}` (116 KB) | `<head>`, inline | Espera a que cargue el CSS (hasta 4,0 s) y luego parsea 116 KB |
| `scripts.sirv.com/sirvjs/v3/sirv.js` | `<head>`, `defer` | Arma la galería; 580 ms de hilo principal en móvil |
| `pdp_responsive.min.js` → `relocateMainTitleForMobile()` | `<body>`, `defer` | Mueve el H1 después de DOMContentLoaded: crea un LCP intermedio tardío (8,2–9,1 s); luego la foto pasa a ser el LCP |
| GTM (`gtm.js` + 5 gtag + 4 Ads) | `async` | 2,3 s de hilo principal; ~1,33 MB de JS. Bloqueado: LCP −0,99 s (2 corridas). `gtm.js` llega después del LCP, pero compite por ancho de banda |
| Contentsquare | `async` | 1,8 s de hilo principal |
| Facebook, TikTok, Storyly, Kevel | `async` | FB 516 ms, Storyly 312 ms, TikTok 284 ms de hilo principal |

Otros detalles: `algoliasearch@5.20.0` se carga dos veces (UMD completo y lite); el JSON-LD de producto aparece dos veces.

## 4. Preload desalineado

- Móvil: el preload pide `…&w=800&h=0&q=60` (listo a los 1,8 s), pero Sirv pide `…&w=400&h=0`. Son recursos distintos: el preload solo consume ancho de banda.
- Escritorio: el `imagesrcset` del preload contiene la URL correcta (`w=700`), pero el `href` usa otra ruta (sin la carpeta `/{EAN}/`).

## 5. Trampa de medición: el banner del preheader

El banner “Expotronika” (`a.preheader-events-expotronika`) es una imagen de fondo CSS. A veces Chrome lo reporta como LCP aunque la foto aparece segundos después: 3 de 6 corridas en una auditoría, 1 de 5 corridas base en el prototipo, 0 de 12 en la otra. Explicación probable (no verificada): la galería pasa de `opacity: 0` a `1`, y esa aparición no siempre cuenta como LCP. Por eso el prototipo mide **cuándo se ve la foto**, no solo el número de LCP.

## 6. El H1 movido por JavaScript

`relocateMainTitleForMobile()` mueve el título a otro contenedor después de cargar la página. El título ya estaba pintado a los 4,7 s, pero el movimiento crea una nueva entrada LCP a los 8,2–9,1 s. Corregirlo no mejora el LCP por sí solo, porque después llega la foto como LCP final. Conviene resolverlo con CSS o en el servidor de todos modos.

## 7. TTFB y caché

El HTML de la PDP sale directo del origen SAP Commerce (`pragma: no-cache`, sin encabezados de CDN). Con caché fría, el TTFB fue de 1,0 s; en campo, el p75 es de 0,85–0,95 s.

## 8. Datos de campo (CrUX, p75, usuarios reales de Chrome)

| PDP | LCP | INP | CLS | TTFB |
| --- | --- | --- | --- | --- |
| OPPO, móvil | 2,49 s | 229 ms | 0,05 | – |
| OPPO, escritorio | 2,76 s | 113 ms | 0,16 | 953 ms |
| Dell, móvil | 3,07 s | 166 ms | 0,02 | 849 ms |
| Whirlpool | sin datos en CrUX | | | |

El laboratorio es más estricto que el usuario promedio. Aun así, el campo muestra la misma estructura: retraso de carga de 1,2–1,6 s y TTFB cercano a 0,9 s.
