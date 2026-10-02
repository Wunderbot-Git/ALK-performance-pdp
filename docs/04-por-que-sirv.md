# 04 · ¿Por qué Sirv, si es un CDN de imágenes rápido?

Sirv son en realidad dos productos distintos, y en la PDP usamos los dos:

| Parte de Sirv | Qué hace | En la PDP | ¿Es lento? |
| --- | --- | --- | --- |
| **CDN y procesamiento de imágenes** | Entrega imágenes optimizadas (AVIF/WebP, tamaño por URL con `w=`, `h=`, `scale.option=`) desde servidores cercanos | `cdn.dam.alkosto.com` (encabezado `server: Sirv.Imagination`) | **No.** La foto tarda 0,3–0,9 s en descargarse, incluso en móvil con red lenta |
| **Sirv Media Viewer** (`sirv.js`) | Visor JavaScript: galería, zoom, 360°, video, hotspots | `scripts.sirv.com/sirvjs/v3/sirv.js`, 152 KB | **Sí, por cómo está integrado** |

El problema no es la entrega de la imagen. Es que **la foto principal la crea JavaScript en el navegador**, y ese JavaScript llega tarde.

## La cadena, paso a paso (OPPO, móvil)

1. El HTML llega con un `<div class="Sirv">` vacío. No hay ninguna foto que el navegador pueda pintar o pedir.
2. `sirv.js` tiene `defer`: se descarga temprano (~4,5 s) pero **solo puede correr cuando el navegador terminó de leer todo el HTML**.
3. La lectura del HTML se frena por scripts síncronos más abajo en la página, sobre todo `widget.reviews.io/polaris/build.js` (termina a los 6,6–7,6 s).
4. Recién a los ~8 s corre `sirv.js` y pide el archivo `.view` (un JSON con la lista de imágenes y videos del producto).
5. Con esa lista arma el visor y pide la primera foto (~9,7 s).
6. El código de Alkosto (`initSirv()`) marca la galería como lista (`is-ready`) y recién entonces pasa de `opacity: 0` a `1`.

| Fase | Tiempo | Responsable |
| --- | --- | --- |
| Antes de pedir la foto (retraso de carga) | 6,2–8,6 s | Integración: JavaScript, orden de scripts, archivo `.view` |
| Descarga de la foto | 0,3–0,9 s | CDN de Sirv |
| Después de descargarla, hasta mostrarla (retraso de render) | 0,4–1,0 s en móvil, 1,4–1,9 s en escritorio | Integración: armado del visor y `opacity: 0` |

Valores de las corridas móviles en las que la foto fue el elemento LCP (ambas auditorías) y de todas las corridas de escritorio.

**El CDN explica menos del 10 % del tiempo.** El resto es la cadena de JavaScript alrededor.

Una analogía: el camión (el CDN) llega rápido, pero la tienda solo abre la puerta cuando terminó de montar toda la vitrina (el visor), y el montaje no empieza hasta que se terminó de leer todo el catálogo (el HTML).

## Por qué esto pasa con cualquier galería JavaScript

Que el elemento más grande de la pantalla dependa de JavaScript es un problema conocido de rendimiento web: el navegador no puede descubrirlo al leer el HTML ni pedirlo temprano ([web.dev: Optimize LCP](https://web.dev/articles/optimize-lcp)). Pasaría igual con otro visor (Swiper, Slick, un carrusel propio) integrado de la misma forma.

Sirv lo sabe y por eso recomienda en su documentación una imagen de marcador que se pide al cargar la página, antes de que cargue `sirv.js` y sin depender de otros scripts ([Sirv: Smart Gallery](https://sirv.com/help/articles/smart-gallery/)). Esa es exactamente la variante `imagen` del prototipo.

## Qué parte es de Alkosto y qué parte de Sirv

| Factor | Origen |
| --- | --- |
| Galería creada por JavaScript (sin foto en el HTML) | Forma de integrar Sirv (decisión de implementación) |
| Archivo `.view` como fuente de ítems (un request más) | Forma de integrar Sirv |
| `.image-gallery .Sirv { opacity: 0 }` hasta `is-ready` | CSS y JS de Alkosto |
| Preload móvil con otra URL (`w=800&q=60` contra `w=400`) | Plantilla de Alkosto |
| Scripts síncronos de Reviews.io antes que el visor pueda correr | Plantilla de Alkosto |
| `sirv.js` completo (152 KB) en lugar de un build con módulos | Configuración |

Ninguno de estos puntos requiere cambiar de proveedor. La solución está en la integración: [docs/03-implementacion-foto-sirv.md](03-implementacion-foto-sirv.md).
