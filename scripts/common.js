export const MODULE_ID = "t20-obs-overlay";
export const SLOT_COUNT = 5;

export { esc } from "./render.js";

export function defaultSlots() {
  return Array.from({ length: SLOT_COUNT }, () => ({ actorId: "" }));
}

/** Configuração dos 5 slots (mundo). Sempre devolve SLOT_COUNT itens completos. */
export function getSlots() {
  const saved = game.settings.get(MODULE_ID, "slots");
  const list = Array.isArray(saved) ? saved : [];
  return defaultSlots().map((d, i) => ({ ...d, ...(list[i] ?? {}) }));
}

const num = (v) => Number(v ?? 0) || 0;

/** Nomes de exibição das condições do Tormenta20 (os ids vêm sem acento e em minúsculas). */
const T20_NOMES = {
  abalado: "Abalado", agarrado: "Agarrado", alquebrado: "Alquebrado", apavorado: "Apavorado", atordoado: "Atordoado",
  caido: "Caído", cego: "Cego", confuso: "Confuso", debilitado: "Debilitado", doente: "Doente", emchamas: "Em Chamas",
  enfeiticado: "Enfeitiçado", enjoado: "Enjoado", enredado: "Enredado", lento: "Lento", fatigado: "Fatigado",
  vulneravel: "Vulnerável", paralisado: "Paralisado", imovel: "Imóvel", ofuscado: "Ofuscado", fascinado: "Fascinado",
  morto: "Morto", esmorecido: "Esmorecido", envenenado: "Envenenado", invisivel: "Invisível", pasmo: "Pasmo",
  petrificado: "Petrificado", inconsciente: "Inconsciente", indefeso: "Indefeso", sangrando: "Sangrando",
  sobrecarregado: "Sobrecarregado", surdo: "Surdo", surpreendido: "Surpreendido", desprevenido: "Desprevenido",
  sustentando: "Sustentando"
};
const pretty = (n) => T20_NOMES[String(n).toLowerCase()] ?? n;

/** Nomes dos efeitos/condições nativos ativos. Junta três fontes, porque o sistema pode usar qualquer uma:
 *  1) actor.statuses (ids das condições ativas, traduzidos pela lista CONFIG.statusEffects);
 *  2) efeitos ativos marcados como status (statuses / flags.core.statusId);
 *  3) efeitos ativos cujo nome é o de uma condição da lista. */
function activeEffects(actor) {
  const list = CONFIG.statusEffects ?? [];
  const label = (s) => String(game.i18n?.localize?.(s.name ?? s.label ?? "") || s.name || s.label || s.id || "").trim();
  const byId = new Map(list.map((s) => [s.id, label(s)]));
  const known = new Set([...byId.values()].map((n) => n.toLowerCase()));
  const out = [];
  const add = (n) => {
    n = pretty(String(n ?? "").trim());
    if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  };
  for (const id of actor?.statuses ?? []) add(byId.get(id) ?? id);
  for (const e of actor?.effects ?? []) {
    if (e.disabled || e.isSuppressed) continue;
    const name = String(e.name ?? e.label ?? "").trim();
    const isStatus = e.statuses?.size > 0 || (e.statuses && [...e.statuses].length > 0) || T20_NOMES[name.toLowerCase()] || e.getFlag?.("core", "statusId") || known.has(name.toLowerCase());
    if (isStatus) add(name);
  }
  return out.slice(0, 6);
}

/** Lê PV, PM e Defesa do ator, conforme o sistema do mundo (Tormenta20, D&D 5e ou genérico). */
export function readStats(actor) {
  const sys = game.system?.id;
  const a = actor?.system?.attributes ?? {};
  const base = { name: actor?.name ?? "—", effects: activeEffects(actor), hasPm: true };

  if (sys === "dnd5e") {
    // PV = pontos de vida; "PM" = espaços de magia (soma de todos os níveis + pacto); Defesa = CA
    const hp = a.hp ?? {};
    const max = num(hp.effectiveMax ?? num(hp.max) + num(hp.tempmax));
    const spells = actor?.system?.spells ?? {};
    let sv = 0;
    let sm = 0;
    for (const [k, s] of Object.entries(spells)) {
      if (!/^spell\d+$|^pact$/.test(k)) continue;
      sv += num(s?.value);
      sm += num(s?.max);
    }
    return {
      ...base,
      hasPm: sm > 0,
      pv: { value: num(hp.value), max, temp: num(hp.temp) },
      pm: { value: sv, max: sm, temp: 0 },
      defesa: num(a.ac?.value)
    };
  }

  if (sys && sys !== "tormenta20") {
    // sistema desconhecido: tenta os nomes mais comuns (hp/pv, mp/pm, ac/defesa); sem mana, o PM some
    const hp = a.hp ?? a.pv ?? actor?.system?.hp ?? {};
    const mp = a.mp ?? a.pm ?? actor?.system?.mp ?? {};
    const ac = a.ac ?? a.defesa ?? actor?.system?.ac ?? {};
    return {
      ...base,
      hasPm: num(mp.max) > 0,
      pv: { value: num(hp.value), max: num(hp.max), temp: num(hp.temp) },
      pm: { value: num(mp.value), max: num(mp.max), temp: num(mp.temp) },
      defesa: num(typeof ac === "object" ? ac.value : ac)
    };
  }

  const def = a.defesa ?? actor?.system?.defesa;
  return {
    ...base,
    pv: { value: num(a.pv?.value), max: num(a.pv?.max), temp: num(a.pv?.temp) },
    pm: { value: num(a.pm?.value), max: num(a.pm?.max), temp: num(a.pm?.temp) },
    defesa: num(typeof def === "object" ? def?.value : def)
  };
}

/** Ajustes de posição/largura salvos pelo mestre: { tela1: [{x,y,w}|null ×5], tela2: [...] }. */
export function getLayout() {
  const s = game.settings.get(MODULE_ID, "layout");
  return s && typeof s === "object" ? s : {};
}

/* ---------- Chat ---------- */
const plain = (html) => {
  const d = new DOMParser().parseFromString(String(html ?? ""), "text/html");
  d.querySelectorAll("script,style,button,.dice-tooltip,.dice-formula").forEach((n) => n.remove());
  return (d.body.textContent ?? "").replace(/\s+/g, " ").trim();
};

/* Chat "do jeito do Foundry": HTML pronto de cada mensagem (renderizado pelo próprio Foundry, de forma assíncrona) */
const chatHtml = new Map(); // id -> html
let chatPriming = false;

export async function primeChatHtml(invalidate = null) {
  if (chatPriming || !game.settings.get(MODULE_ID, "showChat") || game.settings.get(MODULE_ID, "chatStyle") !== "foundry") return false;
  chatPriming = true;
  let changed = false;
  try {
    if (invalidate) chatHtml.delete(invalidate);
    const n = Math.max(1, Math.min(15, game.settings.get(MODULE_ID, "chatLines") || 6));
    for (const m of game.messages.contents.filter((x) => !x.whisper?.length && !x.blind).slice(-n)) {
      if (chatHtml.has(m.id)) continue;
      try {
        const el = await m.renderHTML({ canDelete: false, canClose: false });
        const node = el instanceof HTMLElement ? el : el?.[0];
        if (node) {
          node.querySelectorAll(".message-delete,.card-buttons").forEach((x) => x.remove());
          chatHtml.set(m.id, node.outerHTML);
          changed = true;
        }
      } catch (err) {
        console.warn("T20 OBS Overlay: não consegui renderizar a mensagem", err);
      }
    }
    for (const id of chatHtml.keys()) if (!game.messages.has(id)) chatHtml.delete(id);
  } finally {
    chatPriming = false;
  }
  return changed;
}

/** Todo o CSS que o Foundry está usando, em texto (URLs relativas viram absolutas). Vai ao OBS uma vez e fica guardado lá. */
export function collectFrameCss() {
  const abs = (css, base) =>
    css.replace(/url\(\s*(['"]?)(?!data:|https?:|blob:|#)([^'")]+)\1\s*\)/g, (m, q, u) => {
      try {
        return `url("${new URL(u, base).href}")`;
      } catch (err) {
        return m;
      }
    });
  const sheets = [...document.styleSheets, ...(document.adoptedStyleSheets ?? [])];
  const out = [];
  for (const sheet of sheets) {
    if (sheet.href?.includes(MODULE_ID)) continue;
    try {
      const base = sheet.href || document.baseURI;
      out.push(abs([...sheet.cssRules].map((r) => r.cssText).join("\n"), base));
    } catch (err) {
      /* folha de outro domínio: o iframe a carrega pelo link */
    }
  }
  return out.join("\n");
}

export function frameBase() {
  return {
    base: new URL(foundry.utils.getRoute("/"), window.location.origin).href,
    htmlClass: document.documentElement.className.replace(/\bt20-obs-on\b/g, "").trim(),
    bodyClass: document.body.className.replace(/\bt20-obs-on\b/g, "").trim()
  };
}

/** Cabeçalho do iframe: CSS e classes do próprio Foundry (endereço absoluto, como o navegador do mestre enxerga). */
function chatFrame() {
  return {
    ...frameBase(),
    css: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).filter(Boolean)
  };
}

/** Mensagens públicas recentes do chat (sem sussurros nem rolagens cegas), em dados simples. */
export function buildChat() {
  const g = (k) => game.settings.get(MODULE_ID, k);
  if (!g("showChat")) return null;
  const rollsOnly = g("chatRollsOnly");
  const foundryStyle = g("chatStyle") === "foundry";
  const msgs = game.messages.contents
    .filter((m) => !(m.whisper?.length) && !m.blind && (!rollsOnly || m.rolls?.length))
    .slice(-Math.max(1, Math.min(15, g("chatLines") || 6)))
    .map((m) => {
      const roll = m.rolls?.[0];
      const alias = m.speaker?.alias || m.author?.name || "";
      const text = roll ? "" : plain(m.content);
      return {
        id: m.id,
        ts: m.timestamp,
        who: alias,
        flavor: plain(m.flavor).slice(0, 80),
        text: text.slice(0, 200),
        html: foundryStyle ? chatHtml.get(m.id) ?? null : null,
        roll: roll ? { formula: String(roll.formula ?? "").slice(0, 40), total: Number(roll.total ?? 0) } : null
      };
    });
  return {
    style: foundryStyle ? "foundry" : "simple",
    frame: foundryStyle ? chatFrame() : null,
    h: g("chatH"),
    scr: { x: g("chatScrX"), y: g("chatScrY"), w: g("chatScrW"), h: g("chatScrH") },
    screens: g("chatScreens"),
    x: g("chatX"), y: g("chatY"), w: g("chatW"), fs: g("chatFs"), fade: g("chatFade"),
    msgs
  };
}

/** Tudo o que o overlay precisa, em dados simples (vai para o OBS e para o renderizador). */
export function buildPayload(obsScene = null) {
  return {
    v: 1,
    ts: Date.now(),
    scene: obsScene,
    scenes: {
      scene1: game.settings.get(MODULE_ID, "scene1"),
      scene2: game.settings.get(MODULE_ID, "scene2"),
      scene3: game.settings.get(MODULE_ID, "scene3")
    },
    showNames: game.settings.get(MODULE_ID, "showNames"),
    showEffects: game.settings.get(MODULE_ID, "showEffects"),
    chat: buildChat(),
    layout: getLayout(),
    slots: getSlots().map((s) => {
      const actor = s.actorId ? game.actors.get(s.actorId) : null;
      return actor ? readStats(actor) : null;
    })
  };
}

/* ---------- Arquivos de fonte ---------- */
export const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
const MAX_FONT_BYTES = 2 * 1024 * 1024; // acima disso o envio ao OBS fica pesado; prefira .woff2
const fontCache = new Map();

/** Lê um arquivo de fonte do Foundry (mesma origem) e devolve o conteúdo em base64. */
export async function loadFontFile(path) {
  if (fontCache.has(path)) return fontCache.get(path);
  const clean = String(path).split("?")[0];
  const url = foundry.utils.getRoute?.(clean.includes("%") ? clean : encodeURI(clean)) ?? "/" + clean;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_FONT_BYTES) throw new Error(`arquivo muito grande (${(buf.byteLength / 1048576).toFixed(1)} MB; máximo 2 MB)`);
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  fontCache.set(path, b64);
  return b64;
}
