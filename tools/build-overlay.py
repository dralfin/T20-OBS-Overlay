#!/usr/bin/env python3
"""Gera overlay/t20-overlay.html (arquivo único, sem imports) a partir de
scripts/render.js + overlay/standalone-src.js + styles/overlay.css.
Rode de novo sempre que editar um desses arquivos:  python3 tools/build-overlay.py"""
import re, pathlib, json
root = pathlib.Path(__file__).resolve().parent.parent
render = (root / "scripts/render.js").read_text(encoding="utf-8")
render = re.sub(r"^export ", "", render, flags=re.M)          # vira script clássico
standalone = (root / "overlay/standalone-src.js").read_text(encoding="utf-8")
css = (root / "styles/overlay.css").read_text(encoding="utf-8")
version = json.loads((root / "module.json").read_text(encoding="utf-8"))["version"]
html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>T20 OBS Overlay</title>
<style>html,body{{margin:0;background:transparent;overflow:hidden}}</style>
<style>
{css}
</style></head><body>
<script>window.T20OBS_VERSION = "{version}";</script>
<script>
{render}
{standalone}
</script></body></html>
"""
out = root / "overlay/t20-overlay.html"
out.write_text(html, encoding="utf-8")
print("gerado:", out, len(html), "bytes")
