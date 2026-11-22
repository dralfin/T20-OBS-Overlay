import { MODULE_ID, buildPayload, getLayout, loadFontFile, primeChatHtml, collectFrameCss, frameBase } from "./common.js";
import { createOverlay, screenForScene, registerFontData } from "./render.js";
import { ObsBridge, FONT_EVENT_NAME, FRAME_EVENT_NAME } from "./obs-bridge.js";
import { SlotsConfig } from "./slots-config.js";
import { LayoutConfig } from "./layout-config.js";
import { ChatCopy, OpenChatCopy, openChatCopy, autoOpenChat } from "./chat-copy.js";

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
  const map = { 1: "tela1", tela1: "tela1", 2: "tela2", tela2: "tela2", 3: "chat", chat: "chat", auto: "auto" };
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
/** Quem envia: o usuário escolhido (se estiver online); senão o mestre ativo. */
function isSender() {
  const chosen = game.settings.get(MODULE_ID, "bridgeUser");
  const cu = chosen ? game.users.get(chosen) : null;
  if (cu?.active) return cu.isSelf;
  const gm = game.users.activeGM;
  return !gm || gm.isSelf;
}

function canBridge() {
  const chosen = game.settings.get(MODULE_ID, "bridgeUser");
  return game.user.isGM || (chosen && chosen === game.user.id);
}

function pushNow() {
  if (!bridge?.ready) return;
  if (!isSender()) return;
  bridge.emit(buildPayload(bridge.scene));
}

/* Fontes de arquivo: lê do Foundry, registra aqui (modo ?t20obs=) e envia ao OBS dentro dos dados */
function pushFonts() {
  if (!bridge?.ready || !Object.keys(fontPayload).length) return;
  if (!isSender()) return;
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

/* Visual (CSS) do Foundry para o chat "do jeito do Foundry": enviado ao OBS, que o guarda */
let frameCss = "";
function pushFrame() {
  if (!bridge?.ready || !isSender()) return;
  if (!game.settings.get(MODULE_ID, "showChat") || game.settings.get(MODULE_ID, "chatStyle") !== "foundry") return;
  if (!frameCss) frameCss = collectFrameCss();
  if (frameCss) bridge.emit({ v: 1, ...frameBase(), css: frameCss, n: frameCss.length }, FRAME_EVENT_NAME);
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
  if (!canBridge() || !game.settings.get(MODULE_ID, "obsEnabled")) return;
  bridge = new ObsBridge({
    host: game.settings.get(MODULE_ID, "obsHost").trim() || "localhost",
    port: game.settings.get(MODULE_ID, "obsPort") || 4455,
    password: game.settings.get(MODULE_ID, "obsPassword"),
    onStatus: (msg, level) => ui.notifications[level === "warn" ? "warn" : "info"](`T20 OBS Overlay: ${msg}`),
    onReady: () => {
      pushNow();
      pushFonts();
      pushFrame();
    },
    onScene: pushNow
  });
  bridge.start();
  heartbeat = setInterval(pushNow, 5000); // páginas recém-abertas no OBS recebem os dados em até 5 s
  fontBeat = setInterval(() => {
    pushFonts();
    pushFrame();
  }, 30000); // fontes de arquivo: reenvio raro (o overlay também guarda uma cópia)
}

/* Qualquer mudança nos dados: redesenha (se o overlay estiver ligado aqui) e envia ao OBS */
function onData() {
  if (overlay.root) scheduleRender();
  schedulePush();
}

/* ---------- Configurações ---------- */
Hooks.once("init", () => {
  const dataChanged = () => {
    primeChatHtml().then((ch) => ch && schedulePush());
    frameCss = "";
    setTimeout(pushFrame, 300);
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
    choices: { off: "Desligado (Foundry normal)", chat: "Tela do Chat (só o chat)", tela1: "Tela 1 — Séquito (painéis dos personagens)", tela2: "Tela 2 — Câmeras (faixa no topo de cada câmera)" },
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

  game.settings.register(MODULE_ID, "scene3", {
    name: "Cena(s) do OBS da Tela do Chat",
    hint: "Nome da cena do OBS que mostra só o chat (sem os personagens). Exige \"Chat no OBS: mostrar\" ligado. Vários nomes separados por vírgula.",
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

  game.settings.register(MODULE_ID, "showEffects", {
    name: "Mostrar efeitos ativos (condições)",
    hint: "Mostra uma etiqueta com o nome de cada condição/efeito nativo do Tormenta20 ativo no personagem (ex.: Abalado, Atordoado), logo abaixo da faixa. Desligado por padrão.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: dataChanged
  });

  /* Chat no OBS */
  const chatOpt = (key, name, type, def, extra = {}) =>
    game.settings.register(MODULE_ID, key, { name, scope: "world", config: true, type, default: def, onChange: dataChanged, ...extra });
  chatOpt("showChat", "Chat no OBS: mostrar", Boolean, false, { hint: "Mostra no overlay as mensagens públicas do chat do Foundry (falas e rolagens). Sussurros e rolagens cegas nunca são enviados." });
  chatOpt("chatStyle", "Chat no OBS: aparência", String, "foundry", {
    choices: { foundry: "Do jeito do Foundry (recorte fiel, usa o visual do próprio Foundry)", simple: "Simples (caixas escuras leves)" },
    hint: "No modo Foundry o OBS precisa alcançar o endereço do Foundry (ele baixa o visual de lá, sem login). Mensagens longas aumentam o volume de dados enviados."
  });
  chatOpt("chatH", "Chat no OBS: altura da caixa (px, modo Foundry)", Number, 420);
  chatOpt("chatRollsOnly", "Chat no OBS: só rolagens de dados", Boolean, false);
  chatOpt("chatScreens", "Chat no OBS: em quais telas", String, "both", { choices: { both: "Tela 1 e Tela 2", tela1: "Só Tela 1", tela2: "Só Tela 2", none: "Nenhuma delas (só na Tela do Chat)" } });
  chatOpt("chatLines", "Chat no OBS: quantas mensagens", Number, 6, { hint: "De 1 a 15." });
  chatOpt("chatFade", "Chat no OBS: some após (segundos)", Number, 25, { hint: "0 = nunca some (fica só as últimas mensagens)." });
  chatOpt("chatScrX", "Tela do Chat: posição X (px)", Number, 40);
  chatOpt("chatScrY", "Tela do Chat: posição Y da borda de baixo (px)", Number, 1040);
  chatOpt("chatScrW", "Tela do Chat: largura (px)", Number, 760);
  chatOpt("chatScrH", "Tela do Chat: altura (px, modo Foundry)", Number, 1000);
  chatOpt("chatX", "Chat no OBS: posição X (px, tela 1920×1080)", Number, 20);
  chatOpt("chatY", "Chat no OBS: posição Y da borda de baixo (px)", Number, 1040);
  chatOpt("chatW", "Chat no OBS: largura (px)", Number, 440);
  chatOpt("chatFs", "Chat no OBS: tamanho da fonte (px)", Number, 18);

  game.settings.register(MODULE_ID, "layout", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: dataChanged
  });

  game.settings.register(MODULE_ID, "bridgeUser", {
    scope: "world",
    config: false,
    type: String,
    default: "",
    onChange: restartBridge
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

  game.settings.register(MODULE_ID, "chatAutoUser", {
    scope: "world",
    config: false,
    type: String,
    default: "",
    onChange: () => autoOpenChat()
  });

  game.settings.register(MODULE_ID, "chatCopySpeed", {
    name: "Chat em janela: velocidade da rolagem automática",
    hint: "Em pixels por segundo, para mensagens maiores que a janela (5 a 300; menor = mais devagar). Padrão: 30.",
    scope: "client",
    config: true,
    type: Number,
    default: 30
  });

  game.settings.register(MODULE_ID, "chatCopyLines", {
    name: "Chat em janela: quantas mensagens",
    hint: "Quantas mensagens recentes a janela de cópia do chat mostra (5 a 300). Vale só para este navegador.",
    scope: "client",
    config: true,
    type: Number,
    default: 60
  });

  game.settings.registerMenu(MODULE_ID, "chatCopyMenu", {
    name: "Chat em janela",
    label: "Abrir cópia do chat",
    hint: "Abre uma janela com uma cópia do seu chat (só o que você pode ver), com o visual do Foundry. Dá para redimensionar e capturar no OBS. Atalho: Ctrl+Shift+C.",
    icon: "fa-solid fa-comments",
    type: OpenChatCopy,
    restricted: false
  });

  game.keybindings.register(MODULE_ID, "chatCopy", {
    name: "Abrir cópia do chat em janela",
    editable: [{ key: "KeyC", modifiers: ["Control", "Shift"] }],
    onDown: () => {
      openChatCopy();
      return true;
    }
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
      const order = ["off", "tela1", "tela2", "chat"];
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

  // diagnóstico no console: game.modules.get("t20-obs-overlay").api.buildPayload()
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { buildPayload, version: mod.version, openChat: openChatCopy };

  restartBridge();
  syncFonts();
  rePrime();
  setTimeout(autoOpenChat, 1500); // jogador escolhido pelo mestre: abre a janela do chat ao entrar
  scheduleRender();
});

/* ---------- Atualização em tempo real ---------- */
for (const h of ["updateActor", "createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateToken", "createChatMessage", "updateChatMessage", "deleteChatMessage"]) {
  // lê de novo logo depois: valores derivados (como a Defesa) só ficam prontos após o sistema recalcular
  Hooks.on(h, (doc) => {
    onData();
    setTimeout(onData, 400);
  });
}

// Chat do jeito do Foundry: renderiza o HTML da mensagem (assíncrono) e só então envia
const rePrime = (id) => primeChatHtml(id).then((ch) => ch && onData());
Hooks.on("createChatMessage", () => {
  setTimeout(() => rePrime(), 150);
  ChatCopy.refresh();
});
Hooks.on("updateChatMessage", (m) => {
  rePrime(m.id);
  ChatCopy.refresh(m.id);
});
Hooks.on("deleteChatMessage", (m) => ChatCopy.refresh(m.id));

/* Rede de segurança: a cada 1 s compara os números e reenvia se algo mudou por um caminho sem hook
   (Defesa recalculada por efeito, item equipado, etc.) */
let lastSig = "";
setInterval(() => {
  try {
    if (!game.ready) return;
    const sig = JSON.stringify(buildPayload(null).slots);
    if (sig === lastSig) return;
    lastSig = sig;
    onData();
  } catch (err) { /* ignora */ }
}, 1000);
