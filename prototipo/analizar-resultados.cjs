#!/usr/bin/env node
/**
 * Resume los JSON de una serie de la prueba de prototipo.
 *
 * Uso
 *   node analizar-resultados.cjs ../resultados/ultima-corrida
 *
 * Imprime una tabla Markdown (mediana, rango y diferencia contra "base" del momento en que
 * la foto del producto es visible) y escribe resumen.json en la misma carpeta.
 * Las corridas sin foto visible dentro de la ventana se excluyen de la mediana y se listan aparte.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const carpeta = path.resolve(process.argv[2] || path.join(__dirname, '..', 'resultados', 'ultima-corrida'));
if (!fs.existsSync(carpeta)) {
  console.error(`No existe la carpeta: ${carpeta}`);
  process.exit(1);
}

// Admite también los nombres en inglés de la primera serie (02.10.2026).
const ALIAS = { image: 'imagen', both: 'ambos' };
const ORDEN = ['base', 'reviews', 'imagen', 'ambos'];

const corridas = fs.readdirSync(carpeta)
  .filter(f => f.endsWith('.json') && f !== 'resumen.json')
  .map(f => JSON.parse(fs.readFileSync(path.join(carpeta, f), 'utf8')))
  .map(d => ({
    variante: ALIAS[d.variante ?? d.variant] || d.variante || d.variant,
    perfil: d.perfil || 'movil',
    etiqueta: d.etiqueta || d.label,
    fotoVisible: d.fotoVisible ?? d.productVisible ?? null,
    fcp: d.fcp,
    dcl: d.dcl,
    reviews: d.reviewsRenderizado ?? d.reviewsRendered,
    advertencias: (d.transformaciones || d.transform || []).filter(x => /NO /.test(x)),
  }));

const mediana = xs => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const seg = ms => (ms == null ? '–' : (ms / 1000).toFixed(2).replace('.', ',') + ' s');

const resumen = {};
for (const v of ORDEN) {
  const grupo = corridas.filter(c => c.variante === v);
  if (!grupo.length) continue;
  const validas = grupo.filter(c => c.fotoVisible != null && !c.advertencias.length);
  const tiempos = validas.map(c => c.fotoVisible);
  resumen[v] = {
    corridas: grupo.length,
    validas: validas.length,
    excluidas: grupo.filter(c => !validas.includes(c)).map(c => c.etiqueta),
    fotoVisible: { mediana: mediana(tiempos), min: Math.min(...tiempos), max: Math.max(...tiempos), valores: tiempos },
    fcpMediana: mediana(grupo.map(c => c.fcp)),
    dclMediana: mediana(grupo.map(c => c.dcl)),
    reviewsRenderizado: `${grupo.filter(c => c.reviews).length}/${grupo.length}`,
  };
}
const base = resumen.base?.fotoVisible.mediana;

console.log(`\nResultados: ${carpeta}\n`);
console.log('| Variante | Foto visible (mediana) | Rango | Δ vs. base | FCP (mediana) | Corridas válidas | Reviews renderizado |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const [v, r] of Object.entries(resumen)) {
  const delta = base != null && v !== 'base' ? '−' + seg(base - r.fotoVisible.mediana).replace('−', '') : '–';
  console.log(`| ${v} | ${seg(r.fotoVisible.mediana)} | ${seg(r.fotoVisible.min)}–${seg(r.fotoVisible.max)} | ${delta} | ${seg(r.fcpMediana)} | ${r.validas}/${r.corridas} | ${r.reviewsRenderizado} |`);
}
const excluidas = Object.values(resumen).flatMap(r => r.excluidas);
if (excluidas.length) console.log(`\nExcluidas (sin foto visible en la ventana o transformación no aplicada): ${excluidas.join(', ')}`);

fs.writeFileSync(path.join(carpeta, 'resumen.json'), JSON.stringify(resumen, null, 2));
console.log(`\nresumen.json escrito en ${carpeta}`);
