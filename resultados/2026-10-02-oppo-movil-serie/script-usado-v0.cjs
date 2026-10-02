// Prototype test: OPPO PDP, mobile profile, HTML modified in-flight via page.route.
// Every variant (incl. baseline) goes through the same route.fetch/fulfill path.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://www.alkosto.com/celular-oppo-a6-256gb-4g-azul/p/6932169397902';
const RUNS = Number(process.env.RUNS || 5);
const WINDOW_MS = 30000;
const OUT = path.resolve(__dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });

function transform(html, variant) {
  const log = [];
  const rep = (from, to, label) => {
    const before = html;
    html = typeof from === 'string' ? html.split(from).join(to) : html.replace(from, to);
    log.push(label + (before === html ? ': NOT APPLIED' : ': ok'));
  };
  if (variant === 'reviews' || variant === 'both') {
    rep('<script src="https://widget.reviews.io/polaris/build.js"></script>', '<script defer src="https://widget.reviews.io/polaris/build.js"></script>', 'reviews build.js defer');
    rep(/<script>'use strict';(new ReviewsWidget\([\s\S]*?)<\/script>/, "<script>document.addEventListener('DOMContentLoaded',function(){$1});</script>", 'ReviewsWidget init on DCL');
    rep('<script src="https://widget.reviews.io/rich-snippet/dist.js"></script>', '<script defer src="https://widget.reviews.io/rich-snippet/dist.js"></script>', 'rich-snippet defer');
    rep(/<script>'use strict';(richSnippet\([\s\S]*?)<\/script>/, "<script>document.addEventListener('DOMContentLoaded',function(){$1});</script>", 'richSnippet init on DCL');
  }
  if (variant === 'image' || variant === 'both') {
    const m = html.match(/<link rel="preload" as="image" media="\(max-width: 1023px\)" fetchpriority="high" href="([^"]+)"/);
    if (!m) { log.push('mobile preload: NOT FOUND'); return { html, log }; }
    const src400 = m[1].replace('w=800&h=0&q=60', 'w=400&h=0');
    rep(m[1], src400, 'mobile preload -> w=400');
    rep('<div id="sirv-container"', `<img id="proto-hero" src="${src400}" fetchpriority="high" width="400" height="400" alt="" elementtiming="proto-hero" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:0"><div id="sirv-container"`, 'static hero img');
    rep('</head>', '<style>.image-gallery:not(.is-ready)::before{visibility:hidden}</style></head>', 'hide skeleton while hero shows');
  }
  return { html, log };
}

async function run(variant, repeat) {
  const label = `${variant}-${repeat}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36' });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e.message).slice(0, 200)));
  await page.addInitScript(() => {
    window.__p = { lcp: [], et: [], ready: null };
    new PerformanceObserver(l => { for (const e of l.getEntries()) { const el = e.element; window.__p.lcp.push({ t: Math.round(e.startTime), tag: el?.tagName, id: el?.id || '', cls: el ? String(el.className).slice(0, 40) : '', url: (e.url || '').slice(-60), size: e.size }); } }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__p.et.push({ id: e.identifier, t: Math.round(e.renderTime || e.loadTime) }); }).observe({ type: 'element', buffered: true });
    new MutationObserver(() => { const g = document.querySelector('.image-gallery'); if (g && g.classList.contains('is-ready') && window.__p.ready === null) window.__p.ready = Math.round(performance.now()); }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  });
  let tlog = [];
  await page.route(URL, async route => {
    const resp = await route.fetch();
    const { html, log } = transform(await resp.text(), variant);
    tlog = log;
    const headers = { ...resp.headers() };
    delete headers['content-encoding']; delete headers['content-length'];
    await route.fulfill({ status: resp.status(), headers, body: html });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8, connectionType: 'cellular4g' });
  const started = Date.now();
  let navError = null;
  try { await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) { navError = e.message.slice(0, 200); }
  await page.waitForTimeout(Math.max(2000, WINDOW_MS - (Date.now() - started)));
  const data = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const R = performance.getEntriesByType('resource');
    const f = re => { const r = R.find(x => re.test(x.name)); return r ? [Math.round(r.startTime), Math.round(r.responseEnd)] : null; };
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const reviewsRendered = !!document.querySelector('#ReviewsWidget') && document.querySelector('#ReviewsWidget').children.length > 0;
    return {
      p: window.__p, fcp: Math.round(fcp?.startTime || 0), dcl: Math.round(nav.domContentLoadedEventEnd), ttfb: Math.round(nav.responseStart),
      img400: f(/6932169397902-001\.webp.*w=400&h=0$/), sirvJs: f(/sirvjs\/v3\/sirv\.js/), sirvView: f(/\.view(\?|$)/), reviewsBuild: f(/polaris\/build\.js/),
      reviewsRendered, galleryReady: document.querySelector('.image-gallery')?.classList.contains('is-ready') || false,
      sirvImgs: document.querySelectorAll('#sirv-container img').length
    };
  });
  if (repeat === 1) await page.screenshot({ path: path.join(OUT, label + '.png') });
  await browser.close();
  const lcpFinal = data.p.lcp.at(-1) || null;
  const productLcp = data.p.lcp.filter(e => e.tag === 'IMG' && e.size > 50000).at(0) || null;
  const heroPaint = data.p.et.find(e => e.id === 'proto-hero')?.t ?? null;
  const productVisible = heroPaint ?? productLcp?.t ?? (data.p.ready ? data.p.ready + 200 : null);
  const result = { label, variant, repeat, navError, transform: tlog, lcpFinal, productLcp, heroPaint, productVisible, consoleErrors: consoleErrors.length, consoleErrorSample: consoleErrors.slice(0, 3), ...data };
  fs.writeFileSync(path.join(OUT, label + '.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ label, lcp: lcpFinal?.t, lcpEl: lcpFinal ? `${lcpFinal.tag}#${lcpFinal.id}.${lcpFinal.cls}` : null, productVisible, galleryReady: data.p.ready, fcp: data.fcp, dcl: data.dcl, img400: data.img400, reviewsRendered: data.reviewsRendered, errors: consoleErrors.length, transform: tlog.filter(x => x.includes('NOT')) }));
}

(async () => {
  const variants = ['base', 'reviews', 'image', 'both'];
  const only = process.argv[2];
  for (let r = 1; r <= RUNS; r++) {
    const order = variants.map((_, i) => variants[(i + r - 1) % variants.length]);
    for (const v of order) {
      if (only && v !== only) continue;
      try { await run(v, r); } catch (e) { console.log(JSON.stringify({ label: `${v}-${r}`, error: String(e).slice(0, 300) })); }
    }
  }
  console.log('DONE');
})();
