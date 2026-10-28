import { MODULE_ID, buildPayload, getLayout, loadFontFile } from "./common.js";
import { createOverlay, screenForScene, registerFontData } from "./render.js";
import { ObsBridge, FONT_EVENT_NAME } from "./obs-bridge.js";
import { SlotsConfig } from "./slots-config.js";
import { LayoutConfig } from "./layout-config.js";

const overlay = createOverlay();
let obsScene = null; // cena ativa no OBS, quando o próprio Foundry roda dentro do OBS (modo ?t20obs=)
let frame = 0;
let bridge = null;
let heartbeat = 0;
let fontBeat = 0;
let fontPayload = {}; // { num: {key, b64}, name: {...} } — arquivos de fonte escolhidos no menu
const fontWarned = new Set();
let pushTimer = 0;

/* =====================================================================
   Overlay dentro do Foundry (URL ?t20obs=tela1|tela2|auto) — exige login
   ===================================================================== */
function urlMode() {
  const p = new URLSearchParams(window.location.search).get("t20obs")?.toLowerCase();
  const map = { 1: "tela1", tela1: "tela1", 2: "tela2", tela2: "tela2", auto: "auto" };
  return map[p] ?? null;
}

function getScreen(payload) {
  const m = urlMode();
  if (m === "auto") return screenForScene(obsScene, payload.scenes);
  if (m) return m;
  return game.settings.get(MODULE_ID, "screen");
}

function render() {
  frame = 0;
  const payload = buildPayload(obsScene);
  const screen = getScreen(payload);
  // Na URL do OBS (?t20obs=...), "off" = overlay vazio e transparente (nunca mostra o Foundry)
  if (screen === "off" && !urlMode()) return overlay.hide();
  overlay.show(screen === "off" ? null : screen, payload);
}

const scheduleRender = () => {
  if (!frame) frame = requestAnimationFrame(render);
};

/* =====================================================================
   Ponte Foundry (mestre) → OBS via obs-websocket — o OBS não precisa de login
   ===================================================================== */
function pushNow() {
  if (!bridge?.ready) return;
  const active = game.users.activeGM;
  if (active && !active.isSelf) return; // só o mestre ativo envia
  bridge.emit(buildPayload(bridge.scene));
}

/* Fontes de arquivo: lê do Foundry, registra aqui (modo ?t20obs=) e envia ao OBS dentro dos dados */
function pushFonts() {
  if (!bridge?.ready || !Object.keys(fontPayload).length) return;
  const active = game.users.activeGM;
  if (active && !active.isSelf) return;
  bridge.emit({ v: 1, fonts: fontPayload }, FONT_EVENT_NAME);
}

async function syncFonts() {
  const f = getLayout().fonts ?? {};
  const out = {};
  for (const role of ["num", "name"]) {
    const path = String(f[role + "File"] ?? "").trim();
    if (!path) continue;
    try {
      const b64 = await loadFontFile(path);
      out[role] = { key: `${path}:${b64.length}`, b64 };
      registerFontData(role, out[role].key, b64);
    } catch (err) {
      if (!fontWarned.has(path)) {
        fontWarned.add(path);
        ui.notifications.warn(`T20 OBS Overlay: não consegui carregar a fonte "${path}": ${err.message}`);
      }
    }
  }
  fontPayload = out;
  pushFonts();
  scheduleRender();
}

function schedulePush() {
  if (!bridge?.ready || pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = 0;
    pushNow();
  }, 150);
}

function restartBridge() {
  bridge?.stop();
  bridge = null;
  clearInterval(heartbeat);
  clearInterval(fontBeat);
  if (!game.user.isGM || !game.settings.get(MODULE_ID, "obsEnabled")) return;
  bridge = new ObsBridge({
    host: game.settings.get(MODULE_ID, "obsHost").trim() || "localhost",
    port: game.settings.get(MODULE_ID, "obsPort") || 4455,
    password: game.settings.get(MODULE_ID, "obsPassword"),
    onStatus: (msg, level) => ui.notifications[level === "warn" ? "warn" : "info"](`T20 OBS Overlay: ${msg}`),
    onReady: () => {
      pushNow();
      pushFonts();
    },
    onScene: pushNow
  });
  bridge.start();
  heartbeat = setInterval(pushNow, 5000); // páginas recém-abertas no OBS recebem os dados em até 5 s
  fontBeat = setInterval(pushFonts, 30000); // fontes de arquivo: reenvio raro (o overlay também guarda uma cópia)
}

/* Qualquer mudança nos dados: redesenha (se o overlay estiver ligado aqui) e envia ao OBS */
function onData() {
  if (overlay.root) scheduleRender();
  schedulePush();
}

/* ---------- Configurações ---------- */
Hooks.once("init", () => {
  const dataChanged = () => {
    scheduleRender();
    schedulePush();
    syncFonts();
  };

  game.settings.register(MODULE_ID, "screen", {
    name: "Tela do overlay neste navegador",
    hint: "Só para testar no seu próprio navegador (atalho: Ctrl+Shift+O alterna). No OBS use a página overlay/t20-overlay.html (veja o README).",
    scope: "client",
    config: true,
    type: String,
    default: "off",
    choices: { off: "Desligado (Foundry normal)", tela1: "Tela 1 — Séquito (painéis dos personagens)", tela2: "Tela 2 — Câmeras (faixa no topo de cada câmera)" },
    onChange: scheduleRender
  });

  game.settings.register(MODULE_ID, "scene1", {
    name: "Cena(s) do OBS da Tela 1",
    hint: "Nome da cena do OBS em que a Tela 1 aparece. Pode listar várias separadas por vírgula. Basta o nome conter o texto (ignora maiúsculas e acentos).",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: dataChanged
  });

  game.settings.register(MODULE_ID, "scene2", {
    name: "Cena(s) do OBS da Tela 2",
    hint: "Nome da cena do OBS em que a Tela 2 (câmeras) aparece. Em qualquer outra cena o overlay fica vazio.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: dataChanged
  });

  game.settings.register(MODULE_ID, "showNames", {
    name: "Mostrar o nome do personagem",
    hint: "Escreve o nome logo abaixo da faixa de PV/PM/Defesa. Desligado por padrão para ficar mais discreto.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: dataChanged
  });

  game.settings.register(MODULE_ID, "layout", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: dataChanged
  });

  game.settings.register(MODULE_ID, "slots", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: dataChanged
  });

  /* Conexão com o OBS (por navegador do mestre) */
  game.settings.register(MODULE_ID, "obsEnabled", {
    name: "Enviar dados ao OBS (obs-websocket)",
    hint: "Ligue no navegador do mestre. O overlay no OBS (overlay/t20-overlay.html) passa a funcionar sem login. No OBS: Ferramentas → Configurações do Servidor WebSocket → ativar.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: restartBridge
  });
  game.settings.register(MODULE_ID, "obsHost", {
    name: "OBS: endereço",
    hint: "Use localhost se o OBS roda no mesmo computador do navegador do mestre.",
    scope: "client",
    config: true,
    type: String,
    default: "localhost",
    onChange: restartBridge
  });
  game.settings.register(MODULE_ID, "obsPort", {
    name: "OBS: porta",
    scope: "client",
    config: true,
    type: Number,
    default: 4455,
    onChange: restartBridge
  });
  game.settings.register(MODULE_ID, "obsPassword", {
    name: "OBS: senha do WebSocket",
    hint: "Deixe vazio se a autenticação estiver desligada no OBS. Fica salva só neste navegador.",
    scope: "client",
    config: true,
    type: String,
    default: "",
    onChange: restartBridge
  });

  game.settings.registerMenu(MODULE_ID, "layoutMenu", {
    name: "Posição e largura",
    label: "Ajustar posição e largura",
    hint: "Sliders de posição (X, Y) e largura de cada bloco, nas duas telas. O OBS atualiza ao vivo.",
    icon: "fa-solid fa-up-down-left-right",
    type: LayoutConfig,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "slotsMenu", {
    name: "Personagens dos slots",
    label: "Configurar personagens",
    hint: "Escolha qual personagem aparece em cada um dos 5 slots.",
    icon: "fa-solid fa-users",
    type: SlotsConfig,
    restricted: true
  });

  game.keybindings.register(MODULE_ID, "cycle", {
    name: "Alternar overlay de teste (desligado → tela 1 → tela 2)",
    editable: [{ key: "KeyO", modifiers: ["Control", "Shift"] }],
    onDown: () => {
      const order = ["off", "tela1", "tela2"];
      const cur = game.settings.get(MODULE_ID, "screen");
      game.settings.set(MODULE_ID, "screen", order[(order.indexOf(cur) + 1) % order.length]);
      return true;
    }
  });
});

Hooks.once("ready", () => {
  // Foundry rodando dentro do OBS (?t20obs=): acompanha a troca de cena
  if (window.obsstudio) {
    window.obsstudio.getCurrentScene?.((s) => {
      obsScene = s?.name ?? null;
      scheduleRender();
    });
    window.addEventListener("obsSceneChanged", (e) => {
      obsScene = e.detail?.name ?? null;
      scheduleRender();
    });
  }
  // Se o servidor do Foundry cair e voltar, recarrega sozinho
  if (urlMode()) game.socket?.io?.on("reconnect", () => setTimeout(() => window.location.reload(), 2500));

  restartBridge();
  syncFonts();
  scheduleRender();
});

/* ---------- Atualização em tempo real ---------- */
for (const h of ["updateActor", "createItem", "updateItem", "deleteItem"]) Hooks.on(h, onData);
