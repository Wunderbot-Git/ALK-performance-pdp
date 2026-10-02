#!/usr/bin/env python3
"""Construye presentacion/index.html a partir de fuente/deck.json y fuente/diapositivas/*.html.

Uso:  python3 presentacion/construir.py

Cada diapositiva es un <section> de 1920×1080 con estilos inline. El orden lo define
"order" en deck.json. El resultado es un único HTML que se abre en cualquier navegador:
← → / espacio / clic para navegar, N para las notas del orador (<aside> de cada diapositiva).
"""
import json
from pathlib import Path

AQUI = Path(__file__).resolve().parent
FUENTE = AQUI / "fuente"

deck = json.loads((FUENTE / "deck.json").read_text(encoding="utf-8"))
diapositivas = "\n".join(
    (FUENTE / "diapositivas" / f"{sid}.html").read_text(encoding="utf-8").strip() for sid in deck["order"]
)
fuentes = "\n".join(f'<link rel="stylesheet" href="{f["href"]}">' for f in deck["faces"].values())

PLANTILLA = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITULO__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
__FUENTES__
<style>
  html, body { margin: 0; height: 100%; background: #1A1B1E; overflow: hidden; }
  #escenario { position: absolute; left: 50%; top: 50%; width: 1920px; height: 1080px; transform-origin: center; }
  #escenario > section { position: absolute; inset: 0; width: 1920px; height: 1080px; box-sizing: border-box; overflow: hidden; display: none !important; }
  #escenario > section.activa { display: flex !important; }
  section * { margin: 0; box-sizing: border-box; }
  section ul, section ol { padding-left: 1.2em; }
  section table { border-collapse: collapse; width: 100%; }
  section th, section td { padding: 0.35em 0.6em; border-bottom: 1px solid #E4E0DC; text-align: left; vertical-align: top; }
  section aside { display: none; }
  x-shape { display: block; }
  x-shape[kind="arrow-right"] { clip-path: polygon(0 30%, 60% 30%, 60% 0, 100% 50%, 60% 100%, 60% 70%, 0 70%); }
  #notas { position: fixed; left: 0; right: 0; bottom: 0; max-height: 35vh; overflow: auto; background: rgba(20,20,22,.94); color: #EEE;
           font: 16px/1.5 system-ui, sans-serif; padding: 16px 24px; display: none; }
  #notas.visible { display: block; }
  #contador { position: fixed; right: 16px; top: 12px; color: #9A948E; font: 13px system-ui, sans-serif; }
</style>
</head>
<body>
<div id="escenario">
__DIAPOSITIVAS__
</div>
<div id="contador"></div>
<div id="notas"></div>
<script>
  const diapositivas = [...document.querySelectorAll('#escenario > section')];
  const escenario = document.getElementById('escenario');
  const notas = document.getElementById('notas');
  const contador = document.getElementById('contador');
  // La alineación definida en el encabezado (th) vale para toda la columna.
  document.querySelectorAll('#escenario table').forEach(t => {
    const ths = [...t.rows[0].cells];
    [...t.rows].slice(1).forEach(fila => [...fila.cells].forEach((c, k) => {
      if (ths[k] && ths[k].style.textAlign && !c.style.textAlign) c.style.textAlign = ths[k].style.textAlign;
    }));
  });
  let i = Math.max(0, Math.min(diapositivas.length - 1, (parseInt(location.hash.slice(1), 10) || 1) - 1));
  function ajustar() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    escenario.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  function mostrar(n) {
    i = Math.max(0, Math.min(diapositivas.length - 1, n));
    diapositivas.forEach((d, k) => d.classList.toggle('activa', k === i));
    const aside = diapositivas[i].querySelector('aside');
    notas.textContent = aside ? aside.textContent : '';
    contador.textContent = `${i + 1} / ${diapositivas.length} · N: notas`;
    history.replaceState(null, '', '#' + (i + 1));
  }
  addEventListener('keydown', e => {
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) mostrar(i + 1);
    if (['ArrowLeft', 'PageUp'].includes(e.key)) mostrar(i - 1);
    if (e.key === 'Home') mostrar(0);
    if (e.key === 'End') mostrar(diapositivas.length - 1);
    if (e.key.toLowerCase() === 'n') notas.classList.toggle('visible');
  });
  addEventListener('hashchange', () => mostrar((parseInt(location.hash.slice(1), 10) || 1) - 1));
  addEventListener('click', e => { if (!notas.contains(e.target)) mostrar(e.clientX > innerWidth / 2 ? i + 1 : i - 1); });
  addEventListener('resize', ajustar);
  ajustar(); mostrar(i);
</script>
</body>
</html>
"""

html = (PLANTILLA.replace("__TITULO__", deck["title"]).replace("__FUENTES__", fuentes)
        .replace("__DIAPOSITIVAS__", diapositivas))
(AQUI / "index.html").write_text(html, encoding="utf-8")
print(f"{len(deck['order'])} diapositivas → {AQUI / 'index.html'}")
