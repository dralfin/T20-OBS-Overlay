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

/** Lê PV, PM e Defesa do ator (sistema Tormenta20). */
export function readStats(actor) {
  const a = actor?.system?.attributes ?? {};
  const def = a.defesa ?? actor?.system?.defesa;
  return {
    name: actor?.name ?? "—",
    pv: { value: num(a.pv?.value), max: num(a.pv?.max), temp: num(a.pv?.temp) },
    pm: { value: num(a.pm?.value), max: num(a.pm?.max), temp: num(a.pm?.temp) },
    defesa: num(typeof def === "object" ? def?.value : def),
    effects: activeEffects(actor)
  };
}

/** Ajustes de posição/largura salvos pelo mestre: { tela1: [{x,y,w}|null ×5], tela2: [...] }. */
export function getLayout() {
  const s = game.settings.get(MODULE_ID, "layout");
  return s && typeof s === "object" ? s : {};
}

/** Tudo o que o overlay precisa, em dados simples (vai para o OBS e para o renderizador). */
export function buildPayload(obsScene = null) {
  return {
    v: 1,
    ts: Date.now(),
    scene: obsScene,
    scenes: {
      scene1: game.settings.get(MODULE_ID, "scene1"),
      scene2: game.settings.get(MODULE_ID, "scene2")
    },
    showNames: game.settings.get(MODULE_ID, "showNames"),
    showEffects: game.settings.get(MODULE_ID, "showEffects"),
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
