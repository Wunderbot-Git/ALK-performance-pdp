#!/usr/bin/env node
/**
 * Prueba de prototipo: ¿cuánto antes se ve la foto del producto en una PDP de alkosto.com
 * si cambiamos el HTML?
 *
 * Cómo funciona
 *   1. Abre la PDP en un Chrome nuevo y aislado (caché fría) por cada corrida.
 *   2. Intercepta el documento HTML con Playwright (page.route), lo modifica según la
 *      variante y lo entrega al navegador. La variante "base" pasa por el mismo camino
 *      sin cambios, para que todas las variantes se traten igual.
 *   3. Espera una ventana fija (por defecto 30 s) y lee las métricas desde la página:
 *      LCP, FCP, DOMContentLoaded, cuándo Sirv marca la galería como lista (is-ready),
 *      cuándo se pinta la foto y los tiempos de red de los scripts relevantes.
 *   4. Guarda un JSON por corrida (y una captura de la primera corrida de cada variante).
 *
 * Variantes
 *   base     HTML sin cambios.
 *   reviews  defer en widget.reviews.io/polaris/build.js y rich-snippet/dist.js; las
 *            llamadas inline (new ReviewsWidget / richSnippet) se ejecutan en DOMContentLoaded.
 *   imagen   <img> visible con la primera foto dentro de .image-gallery, antes de #sirv-container,
 *            con la misma URL que Sirv pide después; preload móvil alineado a esa URL.
 *            Se oculta cuando Sirv marca .image-gallery como is-ready.
 *   ambos    reviews + imagen.
 *
 * Uso
 *   node prueba-prototipo.cjs                         # OPPO, móvil, 5 corridas, 4 variantes
 *   node prueba-prototipo.cjs --corridas 3 --variantes base,imagen
 *   node prueba-prototipo.cjs --perfil escritorio
 *   node prueba-prototipo.cjs --url https://www.alkosto.com/.../p/884116673774 --salida ../resultados/dell
 *
 * Requisitos: Node 18+, `npm install` en esta carpeta y Google Chrome instalado
 * (se usa channel: 'chrome'; con --chromium usa el Chromium de Playwright).
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Parámetros de línea de comandos
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));
const CONFIG = {
  url: args.url || 'https://www.alkosto.com/celular-oppo-a6-256gb-4g-azul/p/6932169397902',
  corridas: Number(args.corridas || 5),
  ventanaMs: Number(args.ventana || 30) * 1000,
  perfil: args.perfil || 'movil',
  variantes: (args.variantes || 'base,reviews,imagen,ambos').split(',').map(v => v.trim()),
  salida: path.resolve(args.salida || path.join(__dirname, '..', 'resultados', 'ultima-corrida')),
  chromium: Boolean(args.chromium),
};

const VARIANTES_VALIDAS = ['base', 'reviews', 'imagen', 'ambos'];
for (const v of CONFIG.variantes) {
  if (!VARIANTES_VALIDAS.includes(v)) salirConError(`Variante desconocida: "${v}". Válidas: ${VARIANTES_VALIDAS.join(', ')}`);
}
if (!['movil', 'escritorio'].includes(CONFIG.perfil)) salirConError('--perfil debe ser "movil" o "escritorio"');

const EAN = (CONFIG.url.match(/\/p\/(\d+)/) || [])[1];
if (!EAN) salirConError('No se encontró el código del producto (/p/<EAN>) en la URL.');

// Perfiles de medición. El móvil replica el perfil usado en la auditoría:
// Moto G Power aprox., 4G 1,6 Mbit/s bajada, 0,75 Mbit/s subida, 150 ms de latencia, CPU 4× más lenta.
const PERFILES = {
  movil: {
    contexto: {
      viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
    },
    cpu: 4,
    red: { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8, connectionType: 'cellular4g' },
    anchoImagen: 400, // Ancho que Sirv pide para la primera foto en este viewport (medido el 02.10.2026)
  },
  escritorio: {
    contexto: { viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 },
    cpu: 1,
    red: null,
    anchoImagen: 700,
  },
};
const PERFIL = PERFILES[CONFIG.perfil];

// ---------------------------------------------------------------------------
// Transformaciones del HTML por variante
// ---------------------------------------------------------------------------
/**
 * Devuelve el HTML modificado y un registro de qué cambios se aplicaron.
 * Si un patrón no aparece (p. ej. porque cambió la plantilla), queda "NO APLICADO" en el registro
 * y en la salida de consola: en ese caso la corrida no es válida para comparar.
 */
function transformar(html, variante) {
  const registro = [];
  const reemplazar = (de, a, etiqueta) => {
    const antes = html;
    html = typeof de === 'string' ? html.split(de).join(a) : html.replace(de, a);
    registro.push(`${etiqueta}: ${antes === html ? 'NO APLICADO' : 'ok'}`);
  };

  if (variante === 'reviews' || variante === 'ambos') {
    reemplazar('<script src="https://widget.reviews.io/polaris/build.js"></script>',
      '<script defer src="https://widget.reviews.io/polaris/build.js"></script>', 'reviews build.js con defer');
    // Un script defer se ejecuta antes del evento DOMContentLoaded, así que la llamada inline
    // tiene que esperar a ese evento. Solo agregar defer sin esto rompe el widget.
    reemplazar(/<script>'use strict';(new ReviewsWidget\([\s\S]*?)<\/script>/,
      "<script>document.addEventListener('DOMContentLoaded',function(){$1});</script>", 'init de ReviewsWidget en DOMContentLoaded');
    reemplazar('<script src="https://widget.reviews.io/rich-snippet/dist.js"></script>',
      '<script defer src="https://widget.reviews.io/rich-snippet/dist.js"></script>', 'rich-snippet con defer');
    reemplazar(/<script>'use strict';(richSnippet\([\s\S]*?)<\/script>/,
      "<script>document.addEventListener('DOMContentLoaded',function(){$1});</script>", 'init de richSnippet en DOMContentLoaded');
  }

  if (variante === 'imagen' || variante === 'ambos') {
    // El preload móvil existente apunta a w=800&h=0&q=60, pero Sirv pide w=400&h=0: son recursos distintos.
    const m = html.match(/<link rel="preload" as="image" media="\(max-width: 1023px\)" fetchpriority="high" href="([^"]+)"/);
    if (!m) {
      registro.push('preload móvil: NO ENCONTRADO');
      return { html, registro };
    }
    const base = m[1].replace(/w=\d+&h=0(&q=\d+)?/, '');
    const srcMovil = `${base}w=400&h=0`;
    const srcEscritorio = `${base}w=700&h=0`;
    const src = PERFIL.anchoImagen === 400 ? srcMovil : srcEscritorio;

    reemplazar(m[1], srcMovil, 'preload móvil -> w=400');
    // Foto fija en el HTML. Va como hermano de #sirv-container (no adentro), porque Alkosto
    // oculta .Sirv con opacity:0 hasta is-ready; así la foto queda visible desde el inicio.
    reemplazar('<div id="sirv-container"',
      `<img id="pdp-hero" src="${src}" fetchpriority="high" width="${PERFIL.anchoImagen}" height="${PERFIL.anchoImagen}" alt="" ` +
      'style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:0">' +
      '<div id="sirv-container"', 'foto fija en el HTML');
    reemplazar('</head>',
      '<style>' +
      '.image-gallery:not(.is-ready)::before{visibility:hidden}' + // sin skeleton mientras se ve la foto
      '.image-gallery.is-ready #pdp-hero{visibility:hidden;transition:visibility 0s .25s}' + // Sirv toma el relevo
      '</style></head>', 'CSS de relevo foto -> Sirv');
  }
  return { html, registro };
}

// ---------------------------------------------------------------------------
// Una corrida
// ---------------------------------------------------------------------------
async function correr(variante, repeticion) {
  const etiqueta = `${CONFIG.perfil}-${variante}-${repeticion}`;
  const browser = await chromium.launch(CONFIG.chromium ? { headless: true } : { channel: 'chrome', headless: true });
  const versionNavegador = browser.version();
  const context = await browser.newContext(PERFIL.contexto);
  const page = await context.newPage();
  const erroresJs = [];
  page.on('pageerror', e => erroresJs.push(String(e.message).slice(0, 200)));

  // Observadores instalados antes de que cargue la página.
  await page.addInitScript(() => {
    window.__m = { lcp: [], et: [], listo: null };
    new PerformanceObserver(l => {
      for (const e of l.getEntries()) {
        const el = e.element;
        window.__m.lcp.push({ t: Math.round(e.startTime), tag: el?.tagName, id: el?.id || '', cls: el ? String(el.className).slice(0, 40) : '', url: (e.url || '').slice(-70), size: e.size });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => {
      for (const e of l.getEntries()) window.__m.et.push({ id: e.identifier, t: Math.round(e.renderTime || e.loadTime) });
    }).observe({ type: 'element', buffered: true });
    // Momento en que el código de Alkosto (initSirv) marca la galería como lista.
    new MutationObserver(() => {
      const g = document.querySelector('.image-gallery');
      if (g && g.classList.contains('is-ready') && window.__m.listo === null) window.__m.listo = Math.round(performance.now());
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
    // Element Timing para la foto fija (variantes imagen/ambos).
    new MutationObserver(() => {
      const h = document.getElementById('pdp-hero');
      if (h && !h.hasAttribute('elementtiming')) h.setAttribute('elementtiming', 'pdp-hero');
    }).observe(document, { subtree: true, childList: true });
  });

  let registro = [];
  await page.route(CONFIG.url, async route => {
    const resp = await route.fetch();
    const r = transformar(await resp.text(), variante);
    registro = r.registro;
    const headers = { ...resp.headers() };
    delete headers['content-encoding'];
    delete headers['content-length'];
    await route.fulfill({ status: resp.status(), headers, body: r.html });
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: PERFIL.cpu });
  if (PERFIL.red) await cdp.send('Network.emulateNetworkConditions', PERFIL.red);

  const inicio = Date.now();
  let errorNavegacion = null;
  try { await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
  catch (e) { errorNavegacion = e.message.slice(0, 200); }
  await page.waitForTimeout(Math.max(2000, CONFIG.ventanaMs - (Date.now() - inicio)));

  const datos = await page.evaluate(ean => {
    const nav = performance.getEntriesByType('navigation')[0];
    const R = performance.getEntriesByType('resource');
    const red = re => { const r = R.find(x => re.test(x.name)); return r ? [Math.round(r.startTime), Math.round(r.responseEnd)] : null; };
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const widget = document.querySelector('#ReviewsWidget');
    return {
      m: window.__m,
      fcp: Math.round(fcp?.startTime || 0),
      dcl: Math.round(nav.domContentLoadedEventEnd),
      ttfb: Math.round(nav.responseStart),
      red: {
        primeraFoto: red(new RegExp(ean + '-001\\.webp.*w=(400|700)&h=0$')),
        sirvJs: red(/sirvjs\/v3\/sirv\.js/),
        sirvView: red(/\.view(\?|$)/),
        reviewsBuild: red(/polaris\/build\.js/),
      },
      // Geometría: sirve para que la foto fija ocupe exactamente el mismo lugar que la diapositiva de Sirv.
      geometria: {
        galeria: rect('.image-gallery'),
        diapositivasSirv: rect('#sirv-container .smv-slides-box'),
        fotoSirv: rect('#sirv-container .smv-slide.smv-shown img'),
        fotoFija: rect('#pdp-hero'),
      },
      reviewsRenderizado: !!widget && widget.children.length > 0,
      galeriaLista: document.querySelector('.image-gallery')?.classList.contains('is-ready') || false,
    };
  }, EAN);

  fs.mkdirSync(CONFIG.salida, { recursive: true });
  if (repeticion === 1) await page.screenshot({ path: path.join(CONFIG.salida, etiqueta + '.png') });
  await browser.close();

  // Momento en que la foto del producto es visible:
  //   1) foto fija (Element Timing), si existe;
  //   2) si no, la primera entrada LCP que sea una imagen grande (la foto de Sirv);
  //   3) si Chrome no la reportó como LCP, is-ready + 200 ms de transición de opacidad.
  const lcpFinal = datos.m.lcp.at(-1) || null;
  const fotoComoLcp = datos.m.lcp.find(e => e.tag === 'IMG' && e.size > 50000) || null;
  const fotoFijaPintada = datos.m.et.find(e => e.id === 'pdp-hero')?.t ?? null;
  const fotoVisible = fotoFijaPintada ?? fotoComoLcp?.t ?? (datos.m.listo ? datos.m.listo + 200 : null);

  const resultado = {
    etiqueta, variante, repeticion, perfil: CONFIG.perfil, url: CONFIG.url, fecha: new Date().toISOString(),
    navegador: versionNavegador,
    errorNavegacion, transformaciones: registro,
    fotoVisible, fotoFijaPintada, fotoComoLcp, lcpFinal,
    erroresJs: erroresJs.length, ejemploErroresJs: erroresJs.slice(0, 3),
    ...datos,
  };
  fs.writeFileSync(path.join(CONFIG.salida, etiqueta + '.json'), JSON.stringify(resultado, null, 2));

  const noAplicados = registro.filter(x => x.includes('NO '));
  console.log(JSON.stringify({
    etiqueta, fotoVisible, lcp: lcpFinal?.t, elementoLcp: lcpFinal ? `${lcpFinal.tag}#${lcpFinal.id}.${lcpFinal.cls}` : null,
    galeriaLista: datos.m.listo, fcp: datos.fcp, dcl: datos.dcl, reviews: datos.reviewsRenderizado,
    advertencias: noAplicados.length ? noAplicados : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Serie completa: las variantes se alternan en cada ronda para que la variación
// de la red afecte a todas por igual.
// ---------------------------------------------------------------------------
(async () => {
  console.log(`Prueba de prototipo · ${CONFIG.perfil} · ${CONFIG.corridas} corridas · variantes: ${CONFIG.variantes.join(', ')}`);
  console.log(`URL: ${CONFIG.url}`);
  console.log(`Resultados en: ${CONFIG.salida}`);
  for (let r = 1; r <= CONFIG.corridas; r++) {
    const orden = CONFIG.variantes.map((_, i) => CONFIG.variantes[(i + r - 1) % CONFIG.variantes.length]);
    for (const v of orden) {
      try { await correr(v, r); }
      catch (e) { console.log(JSON.stringify({ etiqueta: `${CONFIG.perfil}-${v}-${r}`, error: String(e).slice(0, 300) })); }
    }
  }
  console.log('LISTO. Para resumir: node analizar-resultados.cjs ' + JSON.stringify(CONFIG.salida));
})();

// ---------------------------------------------------------------------------
function parseArgs(lista) {
  const out = {};
  for (let i = 0; i < lista.length; i++) {
    if (!lista[i].startsWith('--')) continue;
    const clave = lista[i].slice(2);
    const siguiente = lista[i + 1];
    if (siguiente === undefined || siguiente.startsWith('--')) out[clave] = true;
    else { out[clave] = siguiente; i++; }
  }
  return out;
}

function salirConError(msg) {
  console.error('Error: ' + msg);
  process.exit(1);
}
