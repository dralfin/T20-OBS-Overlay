/* Renderização do overlay. Não depende do Foundry: recebe um "payload" simples
   ({ slots, showNames, scenes, scene }) e desenha. É usado tanto dentro do Foundry
   quanto na página independente (overlay/t20-overlay.html, gerada por tools/build-overlay.py). */

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Geometria (px, base 1920x1080) de cada slot em cada tela.
   Tela 1: área de texto dos painéis da HUD "Séquito" (o retrato fica na arte de fundo).
   Tela 2: os 5 quadrados das câmeras. Ajuste aqui se mudar o layout. */
export const GEOMETRY = {
  tela1: [
    { x: 175, y: 370, w: 346, h: 257 },
    { x: 862, y: 370, w: 346, h: 257 },
    { x: 43, y: 698, w: 346, h: 256 },
    { x: 519, y: 698, w: 346, h: 256 },
    { x: 994, y: 698, w: 346, h: 256 }
  ],
  tela2: [35, 318, 600, 882, 1163].map((x) => ({ x, y: 766, w: 267, h: 258 }))
};

/** Layout salvo de uma tela, normalizado (aceita o formato antigo: só a lista de slots). */
export function screenLayout(layout, screen) {
  const s = layout?.[screen];
  if (Array.isArray(s)) return { slots: s, elems: {} };
  return { slots: s?.slots ?? [], elems: s?.elems ?? {} };
}

/** Padrão de cada elemento: w = largura em px (0 = automática), h = altura da barra, fs = tamanho da fonte. */
export const DEFAULT_ELEMS = {
  tela1: { pv: { w: 0, h: 21, fs: 14 }, pm: { w: 0, h: 21, fs: 14 }, def: { w: 0, h: 21, fs: 14 }, nm: { fs: 24 } },
  tela2: { pv: { w: 0, h: 18, fs: 12 }, pm: { w: 0, h: 18, fs: 12 }, def: { w: 0, h: 18, fs: 12 }, nm: { fs: 17 } }
};

/** Elementos efetivos da tela: padrão + ajustes salvos. */
export function elemsFor(screen, layout) {
  const saved = screenLayout(layout, screen).elems;
  const out = {};
  for (const [k, d] of Object.entries(DEFAULT_ELEMS[screen])) {
    out[k] = { ...d };
    for (const f of Object.keys(d)) {
      const v = saved?.[k]?.[f];
      if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) out[k][f] = Number(v);
    }
  }
  return out;
}

/** Geometria final do slot i: padrão + ajustes salvos pelo mestre (payload.layout). */
export function slotGeo(screen, i, layout) {
  const d = GEOMETRY[screen][i];
  const o = screenLayout(layout, screen).slots?.[i];
  if (!o) return d;
  const n = (v, f) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : f);
  return { x: n(o.x, d.x), y: n(o.y, d.y), w: n(o.w, d.w), h: d.h };
}

/* Ícones (gradientes definidos uma vez em DEFS e referenciados por url(#...)) */
const SHIELD_PATH = "M14 2.5 24 6v7c0 5.8-4.2 10.2-10 12.5C8.2 23.2 4 18.8 4 13V6l10-3.5z";
const ICONS = {
  pv: `<svg class="ico" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 25.5C6 19 3 14.6 3 10 3 6.4 5.6 3.8 8.9 3.8c2.3 0 4.2 1.2 5.1 3.2.9-2 2.8-3.2 5.1-3.2C22.4 3.8 25 6.4 25 10c0 4.6-3 9-11 15.5z" fill="url(#t20g-pv)" stroke="#4a0000" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="9.3" cy="8.6" rx="3.2" ry="2.1" fill="#fff" opacity=".45" transform="rotate(-30 9.3 8.6)"/></svg>`,
  pm: `<svg class="ico" viewBox="0 0 28 28" aria-hidden="true"><path d="${SHIELD_PATH}" fill="url(#t20g-pm)" stroke="#06235e" stroke-width="1.4" stroke-linejoin="round"/><path d="M14 5.2 21 7.8V13c0 4-2.9 7-7 8.9z" fill="#fff" opacity=".22"/><path d="M14 5.2v16.7M7 8l7 6.5L21 8" stroke="#bfe3ff" stroke-width=".8" fill="none" opacity=".6"/></svg>`,
  def: `<svg class="ico" viewBox="0 0 28 28" aria-hidden="true"><path d="${SHIELD_PATH}" fill="url(#t20g-def)" stroke="#c99a2e" stroke-width="2" stroke-linejoin="round"/><path d="M14 6.5 20 8.9V13c0 3.4-2.4 6-6 7.6z" fill="#000" opacity=".16"/></svg>`
};
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="t20g-pv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a5c"/><stop offset="1" stop-color="#b30f0f"/></linearGradient>
  <linearGradient id="t20g-pm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6cc0ff"/><stop offset="1" stop-color="#1546b8"/></linearGradient>
  <linearGradient id="t20g-def" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset="1" stop-color="#8a8a8a"/></linearGradient>
</defs></svg>`;

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Descobre a tela ("tela1" | "tela2" | "off") pelo nome da cena do OBS. */
export function screenForScene(name, scenes = {}) {
  const n = norm(name);
  if (!n) return "off";
  for (const [screen, key] of [["tela1", "scene1"], ["tela2", "scene2"]]) {
    const names = String(scenes?.[key] ?? "").split(",").map(norm).filter(Boolean);
    if (names.some((w) => n === w || n.includes(w))) return screen;
  }
  return "off";
}

let animCount = 0; // quantas animações de perda/ganho já foram disparadas (aparece no ?debug=1)
const pctOf = (s) => (s && s.max > 0 ? Math.max(0, Math.min(100, (s.value / s.max) * 100)) : 0);

function groupHtml(cls, s, withBar) {
  const max = withBar ? `<i>/</i><span class="max">${s.max}</span>` : "";
  const bars = withBar ? `<div class="ghost" style="width:${pctOf(s)}%"></div><div class="fill" style="width:${pctOf(s)}%"></div>` : "";
  const value = withBar ? s.value : s;
  return `<div class="grp ${cls}${cls === "pv" && s.max > 0 && pctOf(s) <= 25 ? " low" : ""}">${ICONS[cls]}${withBar ? `<b class="tmp"${s.temp > 0 ? "" : " hidden"}>${s.temp}</b>` : ""}<div class="bar">${bars}<span class="val"><span class="cur">${value}</span>${max}</span></div></div>`;
}

const applyGeo = (el, g) => {
  el.style.left = g.x + "px";
  el.style.top = g.y + "px";
  el.style.width = g.w + "px";
  el.style.height = g.h + "px";
};

/** Aplica altura, largura e fonte de cada elemento do slot. */
function applyElems(el, es) {
  for (const k of ["pv", "pm", "def"]) {
    const g = el.querySelector(`.grp.${k}`);
    if (!g) continue;
    const e = es[k];
    g.style.cssText = `--bh:${e.h}px;--fs:${e.fs}px;` + (e.w > 0 ? `flex:0 0 ${e.w}px;` : "");
  }
  const nm = el.querySelector(".nm");
  if (nm) nm.style.fontSize = es.nm.fs + "px";
}

/* Fontes personalizadas (instaladas no PC do OBS ou do Google Fonts) */
const loadedFonts = new Set();
const cleanFont = (s) => String(s ?? "").replace(/["'`;{}<>\\]/g, "").trim().slice(0, 60);
function ensureFont(name) {
  if (loadedFonts.has(name) || !document.head) return;
  loadedFonts.add(name);
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(name).replace(/%20/g, "+") + "&display=swap";
  document.head.appendChild(l);
}
/** Registra uma fonte vinda de um arquivo (.ttf/.otf/.woff/.woff2) em base64. A família criada é "T20Font-<papel>". */
const fontKeys = {};
const fontFaces = {};
export function registerFontData(role, key, b64) {
  if (fontKeys[role] === key) return Promise.resolve(true);
  fontKeys[role] = key;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const face = new FontFace(`T20Font-${role}`, bytes.buffer);
    return face.load().then(
      () => {
        if (fontFaces[role]) document.fonts.delete(fontFaces[role]);
        fontFaces[role] = face;
        document.fonts.add(face);
        return true;
      },
      (err) => {
        fontKeys[role] = null;
        console.warn("T20 OBS Overlay | arquivo de fonte inválido", err);
        return false;
      }
    );
  } catch (err) {
    fontKeys[role] = null;
    console.warn("T20 OBS Overlay | não foi possível ler a fonte", err);
    return Promise.resolve(false);
  }
}

function applyFonts(stage, layout) {
  const f = layout?.fonts ?? {};
  const roles = [
    { role: "num", prop: "--font-num", tail: `"Signika", "Segoe UI", sans-serif` },
    { role: "name", prop: "--font-name", tail: `"Pirata One", "Modesto Condensed", Georgia, serif` }
  ];
  for (const { role, prop, tail } of roles) {
    const family = cleanFont(f[role]);
    const hasFile = !!String(f[role + "File"] ?? "").trim();
    if (family) ensureFont(family);
    if (family || hasFile) {
      // arquivo de fonte (se houver) tem prioridade; depois a família digitada; depois o padrão
      const stack = [hasFile ? `"T20Font-${role}"` : "", family ? `"${family}"` : "", tail].filter(Boolean).join(", ");
      stage.style.setProperty(prop, stack);
    } else stage.style.removeProperty(prop);
  }
}

function buildSlot(s, g, showNames) {
  const el = document.createElement("div");
  el.style.cssText = `left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px`;
  if (!s) {
    el.className = "slot empty";
    return el;
  }
  el.className = "slot enter";
  el.innerHTML = `<div class="strip">${groupHtml("pv", s.pv, true)}${groupHtml("pm", s.pm, true)}${groupHtml("def", s.defesa, false)}</div>
    ${showNames ? `<div class="nm">${esc(s.name)}</div>` : ""}`;
  return el;
}

/* ---------- Animações ---------- */
function restart(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // reinicia a animação CSS
  el.classList.add(cls);
  clearTimeout(el["_t" + cls]);
  el["_t" + cls] = setTimeout(() => el.classList.remove(cls), 1000); // cobre a animação mais longa da classe
}

/** Conta o número até o novo valor (ease-out). */
function tween(el, to, ms = 650) {
  cancelAnimationFrame(el._raf);
  const from = Number(el.textContent);
  if (!Number.isFinite(from) || from === to) {
    el.textContent = to;
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function floatDelta(grp, diff, cls = "") {
  const d = document.createElement("div");
  d.className = `delta ${diff < 0 ? "neg" : "pos"} ${cls}`;
  d.textContent = diff < 0 ? `${diff}` : `+${diff}`;
  grp.appendChild(d);
  setTimeout(() => d.remove(), 1600);
}

/** Número temporário sobre o ícone. Ao perder: estilhaça (anel dourado + número treme e some). */
function patchTemp(grp, from, to) {
  const tmp = grp.querySelector(".tmp");
  if (!tmp || from === to) return;
  clearTimeout(tmp._t);
  if (to > from) {
    tmp.hidden = false;
    tmp.textContent = to;
    restart(tmp, "tgain");
    floatDelta(grp, to - from, "tmpd");
    return;
  }
  // perda: faísca/anel no ícone + número treme e se desfaz
  animCount++;
  floatDelta(grp, to - from, "tmpd");
  const burst = document.createElement("span");
  burst.className = "burst";
  grp.appendChild(burst);
  setTimeout(() => burst.remove(), 800);
  if (to > 0) {
    tmp.textContent = to;
    restart(tmp, "tloss");
  } else {
    tmp.hidden = false;
    tmp.textContent = from;
    restart(tmp, "tbreak");
    tmp._t = setTimeout(() => { tmp.hidden = true; }, 750);
  }
}

/** Atualiza uma barra (PV/PM): rastro ao perder, "enchimento" ao ganhar, número que conta, balanço/brilho. */
function patchBar(grp, prev, next, isPv) {
  const fill = grp.querySelector(".fill");
  const ghost = grp.querySelector(".ghost");
  const bar = grp.querySelector(".bar");
  const pNew = pctOf(next);
  const pOld = pctOf(prev);
  const diff = next.value - prev.value;

  if (pNew < pOld) {
    // perda: a barra cai rápido e o rastro claro encolhe devagar depois
    ghost.className = "ghost loss";
    fill.style.transition = "width .25s ease-out";
    ghost.style.transition = "width .75s ease-in .45s";
    fill.style.width = ghost.style.width = `${pNew}%`;
  } else if (pNew > pOld) {
    // ganho: o brilho já mostra o novo valor e a barra enche atrás dele
    ghost.className = "ghost gain";
    ghost.style.transition = "width .2s ease-out";
    fill.style.transition = "width .8s ease-out .15s";
    ghost.style.width = fill.style.width = `${pNew}%`;
  }
  if (diff !== 0) {
    animCount++;
    restart(bar, diff < 0 ? "hit" : "heal");
    floatDelta(grp, diff);
  }
  tween(grp.querySelector(".cur"), next.value);
  grp.querySelector(".max").textContent = next.max;
  patchTemp(grp, prev.temp || 0, next.temp || 0);
  if (isPv) grp.classList.toggle("low", next.max > 0 && pNew <= 25);
}

function patchSlot(el, prev, next) {
  const grps = el.querySelectorAll(".grp");
  patchBar(grps[0], prev.pv, next.pv, true);
  patchBar(grps[1], prev.pm, next.pm, false);
  if (prev.defesa !== next.defesa) {
    const val = grps[2].querySelector(".val");
    grps[2].querySelector(".cur").textContent = next.defesa;
    restart(val, "pop");
  }
  const nm = el.querySelector(".nm");
  if (nm && nm.textContent !== next.name) nm.textContent = next.name;
}

const snapshot = (s) => (s ? JSON.parse(JSON.stringify(s)) : null);

/** Cria o overlay (um palco 1920x1080 escalado para a janela). */
export function createOverlay() {
  let root = null;
  let stage = null;
  let curScreen = null;
  let curNames = null;
  let els = [];
  let prev = [];

  const fit = () => {
    if (!stage) return;
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `scale(${s})`;
  };

  function mount() {
    document.documentElement.classList.add("t20-obs-on");
    document.body.classList.add("t20-obs-on");
    root = document.createElement("div");
    root.id = "t20-obs-overlay";
    root.insertAdjacentHTML("afterbegin", DEFS);
    stage = document.createElement("div");
    root.appendChild(stage);
    document.body.appendChild(root);
  }

  window.addEventListener("resize", fit);

  return {
    get root() {
      return root;
    },
    /** screen = "tela1" | "tela2" | null (null = overlay vazio e transparente). */
    show(screen, payload) {
      if (!root) mount();
      if (!screen || !payload) {
        stage.className = "t20obs-stage";
        stage.innerHTML = "";
        curScreen = curNames = null;
        els = [];
        prev = [];
        return;
      }
      const showNames = !!payload.showNames;
      const slots = GEOMETRY[screen].map((_, i) => payload.slots?.[i] ?? null);
      const es = elemsFor(screen, payload.layout);
      applyFonts(stage, payload.layout);

      if (curScreen !== screen || curNames !== showNames) {
        // tela nova (ou nomes ligados/desligados): monta tudo, com animação de entrada
        stage.className = `t20obs-stage ${screen}`;
        stage.innerHTML = "";
        els = GEOMETRY[screen].map((_, i) => stage.appendChild(buildSlot(slots[i], slotGeo(screen, i, payload.layout), showNames)));
        els.forEach((el) => applyElems(el, es));
        curScreen = screen;
        curNames = showNames;
      } else {
        // mesma tela: atualiza no lugar (é o que permite animar as mudanças)
        slots.forEach((s, i) => {
          if (!!s !== !!prev[i]) {
            const fresh = buildSlot(s, slotGeo(screen, i, payload.layout), showNames);
            stage.replaceChild(fresh, els[i]);
            applyElems(fresh, es);
            els[i] = fresh;
          } else if (s) {
            patchSlot(els[i], prev[i], s);
          }
        });
        // posição/largura ajustadas no menu valem ao vivo
        els.forEach((el, i) => {
          applyGeo(el, slotGeo(screen, i, payload.layout));
          applyElems(el, es);
        });
      }
      prev = slots.map(snapshot);
      fit();
    },
    hide() {
      document.documentElement.classList.remove("t20-obs-on");
      document.body.classList.remove("t20-obs-on");
      root?.remove();
      root = stage = null;
      curScreen = curNames = null;
      els = [];
      prev = [];
    }
  };
}
