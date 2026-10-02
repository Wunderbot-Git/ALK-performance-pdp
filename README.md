# Rendimiento de PDP en alkosto.com: la foto del producto

Auditoría de scripts y LCP de las páginas de producto (PDP) de alkosto.com, con una prueba de prototipo reproducible y una guía de implementación.

**Resultado principal:** en móvil, el cliente ve la foto del producto recién entre 8 y 11 segundos (laboratorio, red 4G lenta, CPU 4× más lenta). No es culpa de la descarga de la imagen, que tarda menos de 1 segundo. La galería la arma JavaScript (Sirv Media Viewer), que arranca tarde y queda invisible hasta estar lista. Si la primera foto viene directamente en el HTML, se ve a los **3,5 s en lugar de 6,5 s** (prototipo, mediana de 5 corridas).

## Resultados del prototipo (02.10.2026, OPPO A6, móvil)

| Variante | Cambio en el HTML | Foto visible (mediana) | Rango | Δ vs. base |
| --- | --- | --- | --- | --- |
| base | sin cambios | 6,45 s | 6,20–9,76 s | – |
| reviews | `defer` en los scripts de Reviews.io | 5,99 s | 5,58–6,88 s | −0,46 s |
| **imagen** | primera foto como `<img>` en el HTML + preload alineado | **3,49 s** | 3,22–3,78 s | **−2,96 s** |
| **ambos** | reviews + imagen | **3,17 s** | 2,92–3,27 s | **−3,28 s** |

Escritorio, prueba corta (1 corrida, solo indicio): base 1,82 s → imagen 0,68 s.

Los valores absolutos son más bajos que en la auditoría general porque en este montaje el HTML no pasa por la red limitada. Lo que cuenta es la comparación entre variantes. Detalles y límites en [docs/02-prueba-prototipo.md](docs/02-prueba-prototipo.md).

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/01-hallazgos.md](docs/01-hallazgos.md) | Hallazgos de la auditoría: cadena de dependencias, scripts, desglose del LCP, datos de campo |
| [docs/02-prueba-prototipo.md](docs/02-prueba-prototipo.md) | Cómo funciona la prueba de prototipo, cómo correrla y cómo leer los resultados |
| [docs/03-implementacion-foto-sirv.md](docs/03-implementacion-foto-sirv.md) | Guía concreta: primera foto en el HTML junto con Sirv, sin salto visual |
| [docs/04-por-que-sirv.md](docs/04-por-que-sirv.md) | Por qué Sirv produce este efecto aunque su CDN de imágenes es rápido |

## Estructura

```
.
├── README.md
├── docs/                       Documentación en español
├── prototipo/
│   ├── prueba-prototipo.cjs    Prueba con HTML modificado (Playwright + Chrome)
│   ├── analizar-resultados.cjs Resumen de una serie (tabla Markdown + resumen.json)
│   └── package.json
└── resultados/
    ├── 2026-10-02-oppo-movil-serie/   Serie principal: 4 variantes × 5 corridas
    ├── 2026-10-02-humo-movil/         Prueba corta del script actual, móvil
    └── 2026-10-02-humo-escritorio/    Prueba corta del script actual, escritorio
```

## Inicio rápido

Requisitos: Node 18 o más reciente y Google Chrome instalado.

```bash
cd prototipo
npm install
node prueba-prototipo.cjs --corridas 5
node analizar-resultados.cjs ../resultados/ultima-corrida
```

Opciones: `--url`, `--perfil movil|escritorio`, `--variantes base,reviews,imagen,ambos`, `--corridas`, `--ventana` (segundos), `--salida`, `--chromium`. Ver [docs/02-prueba-prototipo.md](docs/02-prueba-prototipo.md).

Una serie completa (4 variantes × 5 corridas) tarda unos 12 minutos.

## Prioridades recomendadas

1. **Primera foto del producto en el HTML** (medido en prototipo: −3,0 s en móvil). Guía: [docs/03](docs/03-implementacion-foto-sirv.md).
2. **Reviews.io fuera de la ruta crítica** (`defer` + inits en `DOMContentLoaded`, o carga diferida). Mediana −0,5 s; evita los casos en que la foto se va a 8–10 s.
3. **CSS de terceros sin versión fuera de la ruta crítica** (`@algolia/autocomplete-theme-classic` desde jsDelivr): en una corrida colgó la página 15 s.
4. **Varify y carga de tags** (bloqueados: Varify −1,18 s, GTM −0,99 s; 2 corridas cada uno, indicio).
5. **HTML de PDP en caché del CDN** (TTFB de campo p75: 0,85–0,95 s).

## Fuentes de datos

- Auditoría con Chrome DevTools (MCP): trazas de rendimiento, Resource Timing, datos de campo CrUX, 3 PDP × 2 perfiles × 2 corridas.
- Segunda auditoría independiente (Playwright + Chrome 154, 12 corridas base, contrapruebas con bloqueo de requests). Los hallazgos centrales coinciden; las diferencias están anotadas en [docs/01-hallazgos.md](docs/01-hallazgos.md).
- Prueba de prototipo de este repositorio.

Fecha de las mediciones: 2 de octubre de 2026. La plantilla de PDP correspondía a la versión `2026-09-v11.15.1-a`. Si la plantilla cambia, las transformaciones del prototipo pueden dejar de aplicarse; el script lo indica con `NO APLICADO`.
