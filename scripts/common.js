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

/** Lê PV, PM e Defesa do ator (sistema Tormenta20). */
export function readStats(actor) {
  const a = actor?.system?.attributes ?? {};
  const def = a.defesa ?? actor?.system?.defesa;
  return {
    name: actor?.name ?? "—",
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
