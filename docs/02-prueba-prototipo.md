# 02 · Prueba de prototipo

La prueba responde una pregunta concreta: **¿cuánto antes se ve la foto del producto si cambiamos el HTML de la PDP?** Lo hace sin tocar el sitio: intercepta el HTML en el navegador de prueba, lo modifica y mide.

## Cómo funciona

Por cada corrida, `prototipo/prueba-prototipo.cjs`:

1. Abre un Chrome nuevo, sin caché ni service worker.
2. Aplica el perfil de medición (móvil o escritorio).
3. Intercepta el documento HTML de la PDP con `page.route` de Playwright, lo modifica según la variante y lo entrega al navegador. La variante `base` pasa por el mismo camino **sin cambios**, para que todas se traten igual.
4. Espera una ventana fija (30 s por defecto) y lee las métricas de la página.
5. Guarda un JSON por corrida y una captura de pantalla de la primera corrida de cada variante.

Las variantes se alternan en cada ronda (base, reviews, imagen, ambos; luego reviews, imagen, ambos, base; etc.), para que los cambios en la red afecten a todas por igual.

## Variantes

| Variante | Cambio en el HTML |
| --- | --- |
| `base` | Ninguno |
| `reviews` | `defer` en `widget.reviews.io/polaris/build.js` y `rich-snippet/dist.js`. Las llamadas inline `new ReviewsWidget(…)` y `richSnippet(…)` se envuelven en `DOMContentLoaded`. Un script `defer` corre antes de ese evento, así que el widget sigue funcionando |
| `imagen` | `<img id="pdp-hero" fetchpriority="high">` con la primera foto, como hermano de `#sirv-container` dentro de `.image-gallery`, con la misma URL que Sirv pide después (`w=400` en móvil, `w=700` en escritorio). Preload móvil cambiado de `w=800&h=0&q=60` a `w=400&h=0`. CSS: sin skeleton mientras se ve la foto; la foto se oculta cuando la galería recibe `is-ready` |
| `ambos` | `reviews` + `imagen` |

Si un patrón no aparece en el HTML (por ejemplo, porque cambió la plantilla), la consola muestra `advertencias: [... NO APLICADO]` y el analizador excluye esa corrida.

## Qué se mide

| Campo | Significado |
| --- | --- |
| `fotoVisible` | **Métrica principal.** Momento (ms desde el inicio de la navegación) en que la foto del producto es visible. Se toma, en este orden: (1) Element Timing de la foto fija, (2) la primera entrada LCP que sea una imagen grande (la foto de Sirv), (3) si Chrome no la reportó como LCP: `is-ready` + 200 ms de transición de opacidad |
| `lcpFinal` | Última entrada LCP que reportó Chrome, con elemento y tamaño |
| `m.listo` | Momento en que `.image-gallery` recibe la clase `is-ready` |
| `fcp`, `dcl`, `ttfb` | First Contentful Paint, fin de DOMContentLoaded, Time to First Byte |
| `red` | Inicio y fin de: primera foto, `sirv.js`, JSON `.view`, `build.js` de Reviews.io |
| `geometria` | Posición y tamaño de la galería, de la diapositiva de Sirv, de la foto de Sirv y de la foto fija. Sirve para alinear la foto fija con Sirv (ver [03](03-implementacion-foto-sirv.md)) |
| `reviewsRenderizado` | Si el widget de reseñas quedó renderizado (control funcional) |
| `erroresJs` | Cantidad de errores JavaScript no capturados en la página |

### Por qué no basta con el LCP

En la PDP actual, la galería pasa de `opacity: 0` a `1`. Chrome a veces no cuenta esa aparición como LCP y reporta el banner del preheader, aunque la foto aparece segundos después. Medir `fotoVisible` evita esa trampa.

## Perfiles

| Perfil | Viewport | CPU | Red |
| --- | --- | --- | --- |
| `movil` | 412×823, DPR 1,75, táctil, UA Android | 4× más lenta | 1,6 Mbit/s bajada, 0,75 Mbit/s subida, 150 ms de latencia |
| `escritorio` | 1365×768, DPR 1 | sin limitación | sin limitación |

## Cómo correrla

```bash
cd prototipo
npm install

# Serie completa en móvil (4 variantes × 5 corridas, ~12 min)
node prueba-prototipo.cjs

# Solo base contra imagen, 3 corridas
node prueba-prototipo.cjs --corridas 3 --variantes base,imagen

# Escritorio
node prueba-prototipo.cjs --perfil escritorio --ventana 20

# Otra PDP o un ambiente de staging
node prueba-prototipo.cjs --url https://www.alkosto.com/computador-portatil-dell-essential-156-pulgadas-9kp97/p/884116673774 --salida ../resultados/dell-movil

# Resumen
node analizar-resultados.cjs ../resultados/ultima-corrida
```

| Opción | Por defecto | Descripción |
| --- | --- | --- |
| `--url` | PDP de OPPO A6 | URL de la PDP; tiene que contener `/p/<EAN>` |
| `--perfil` | `movil` | `movil` o `escritorio` |
| `--variantes` | `base,reviews,imagen,ambos` | Lista separada por comas |
| `--corridas` | `5` | Corridas por variante |
| `--ventana` | `30` | Segundos de observación por corrida |
| `--salida` | `../resultados/ultima-corrida` | Carpeta de resultados |
| `--chromium` | – | Usa el Chromium de Playwright en lugar del Chrome instalado |

## Resultados del 02.10.2026

Serie principal (`resultados/2026-10-02-oppo-movil-serie`, Chrome 154, OPPO, móvil):

| Variante | Foto visible (mediana) | Rango | Δ vs. base | FCP (mediana) | Corridas válidas |
| --- | --- | --- | --- | --- | --- |
| base | 6,45 s | 6,20–9,76 s | – | 3,56 s | 5/5 |
| reviews | 5,99 s | 5,58–6,88 s | −0,46 s | 3,10 s | 4/5 |
| imagen | 3,49 s | 3,22–3,78 s | −2,96 s | 3,42 s | 5/5 |
| ambos | 3,17 s | 2,92–3,27 s | −3,28 s | 3,08 s | 5/5 |

Esta serie se corrió con una versión anterior del script (`script-usado-v0.cjs` en la misma carpeta). Los cambios de la versión actual: nombres en español, perfil de escritorio, geometría, y la foto fija se oculta cuando la galería está lista. Eso último ocurre después de que la foto ya es visible y no cambia la métrica.

Prueba corta con el script actual (1 corrida cada una, solo indicio):

| Perfil | base | imagen |
| --- | --- | --- |
| móvil | 7,71 s | 3,80 s |
| escritorio | 1,82 s | 0,68 s |

### Cómo leerlos

- **imagen** es el cambio con más efecto: la foto aparece unos 0,1 s después del primer pintado y casi no varía (rango 0,6 s contra 3,6 s en base). Ya no depende de Sirv, de Reviews.io ni de requests de terceros que se cuelguen.
- **reviews** ayuda poco en la mediana porque en este montaje `build.js` suele llegar temprano (~3,5 s). Cuando llega tarde (5,6–6,8 s en dos corridas base), la foto se va a 8,0–9,8 s. Bloquearlo por completo dio −3,5 s en las auditorías: es el máximo posible.
- El widget de Reseñas quedó renderizado en todas las corridas de todas las variantes.

## Límites

- **El HTML no pasa por la red limitada.** `route.fetch()` lo descarga fuera de la emulación de red. Por eso todos los valores son más bajos que en la auditoría general (base 6,45 s contra ~9,6 s). La comparación entre variantes sigue siendo válida porque todas pasan por el mismo camino.
- **Solo se probó la PDP de OPPO** en la serie completa. Dell y Whirlpool usan la misma plantilla.
- **Una corrida de `reviews` falló:** DOMContentLoaded llegó a los 35 s y la galería no estuvo lista en la ventana de 30 s. La causa no se identificó; el patrón coincide con el CSS de jsDelivr colgado en la auditoría. Quedó excluida de la mediana.
- **Error `hj is not defined`** en todas las corridas, incluida base: un script inline llama a Hotjar sin que Hotjar esté cargado. No es causado por el prototipo.
- **5 corridas por variante** alcanzan para ver la dirección y el orden de magnitud, no para un intervalo de confianza estrecho.
- **Laboratorio, no campo.** Para confirmar el efecto en usuarios reales hay que comparar CrUX o la herramienta de RUM antes y después del despliegue.

## Cómo agregar una variante

1. Agregar el nombre a `VARIANTES_VALIDAS` en `prueba-prototipo.cjs`.
2. Agregar las transformaciones en `transformar()` con `reemplazar(de, a, etiqueta)`. Cada reemplazo queda registrado como `ok` o `NO APLICADO`.
3. Agregar el nombre a `ORDEN` en `analizar-resultados.cjs`.
