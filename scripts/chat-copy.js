import { MODULE_ID } from "./common.js";

const { ApplicationV2 } = foundry.applications.api;
const htmlCache = new Map(); // id -> html renderizado pelo Foundry

/** HTML do chat do usuário atual (só mensagens visíveis para ele), renderizado pelo próprio Foundry. */
async function buildChatHtml(remember = false) {
  const n = Math.max(5, Math.min(300, game.settings.get(MODULE_ID, "chatCopyLines") || 60));
  const msgs = game.messages.contents.filter((m) => m.visible).slice(-n);
  const parts = [];
  for (const m of msgs) {
    if (!htmlCache.has(m.id)) {
      try {
        const el = await m.renderHTML({ canDelete: false, canClose: false });
        const node = el instanceof HTMLElement ? el : el?.[0];
        node?.querySelectorAll(".message-delete").forEach((x) => x.remove());
        if (node) htmlCache.set(m.id, node.outerHTML);
      } catch (err) {
        console.warn("T20 OBS Overlay: não consegui renderizar a mensagem", err);
      }
    }
    if (htmlCache.has(m.id)) parts.push(htmlCache.get(m.id));
  }
  for (const id of htmlCache.keys()) if (!game.messages.has(id)) htmlCache.delete(id);
  if (remember) lastSig = msgs.map(sigOf).join("|");
  return `<section id="chat" class="chat-sidebar directory flexcol"><ol id="chat-log" class="chat-log">${parts.join("")}</ol></section>`;
}

/* ---------- Janela própria do navegador (fora do Foundry) ---------- */
let popup = null;
let popTimer = 0;

/** Assinatura leve do chat visível: muda quando chega, some ou é editada uma mensagem. */
const sigOf = (m) => `${m.id}:${m.content?.length ?? 0}:${m.flavor?.length ?? 0}:${m.rolls?.length ?? 0}:${m._source?._stats?.modifiedTime ?? ""}`;
let lastSig = "";
let watcher = 0;

function watchChat() {
  clearInterval(watcher);
  watcher = setInterval(() => {
    if (!popup || popup.closed) {
      clearInterval(watcher);
      popup = null;
      return;
    }
    try {
      const n = Math.max(5, Math.min(300, game.settings.get(MODULE_ID, "chatCopyLines") || 60));
      const msgs = game.messages.contents.filter((m) => m.visible).slice(-n);
      const sig = msgs.map(sigOf).join("|");
      if (sig === lastSig) return;
      // descarta o cache das mensagens que mudaram
      const old = new Map(lastSig.split("|").filter(Boolean).map((s) => [s.split(":")[0], s]));
      for (const m of msgs) if (old.has(m.id) && old.get(m.id) !== sigOf(m)) htmlCache.delete(m.id);
      paintPopup();
    } catch (err) {
      console.error("T20 OBS Overlay: erro ao conferir o chat", err);
    }
  }, 1000);
}

async function paintPopup() {
  if (!popup || popup.closed) return;
  try {
    await doPaint();
  } catch (err) {
    console.error("T20 OBS Overlay: erro ao atualizar a janela do chat", err);
  }
}

let slowScroll = 0;

/** Rola devagar até o fim (usado em mensagens maiores que a janela). */
function glideToBottom(win) {
  const sc = win.document.scrollingElement;
  cancelAnimationFrame(slowScroll);
  const from = sc.scrollTop;
  const dist = sc.scrollHeight - win.innerHeight - from;
  if (dist <= 0) return;
  const ms = Math.min(25000, Math.max(1500, (dist / 90) * 1000)); // ~90 px por segundo
  const t0 = performance.now();
  let last = from;
  const step = (now) => {
    if (win.closed) return;
    if (Math.abs(sc.scrollTop - last) > 3) return; // o usuário mexeu na rolagem: para
    const k = Math.min(1, (now - t0) / ms);
    last = from + (sc.scrollHeight - win.innerHeight - from) * k;
    sc.scrollTop = last;
    if (k < 1) slowScroll = requestAnimationFrame(step);
  };
  slowScroll = requestAnimationFrame(step);
}

async function doPaint() {
  const doc = popup.document;
  const root = doc.getElementById("t20-chat-root");
  if (!root) return;
  const html = await buildChatHtml(true);
  const sc = doc.scrollingElement;
  const first = !root.dataset.t20;
  const had = new Set([...root.querySelectorAll("[data-message-id]")].map((e) => e.dataset.messageId));
  const keep = sc.scrollTop;
  root.dataset.t20 = "1";
  root.innerHTML = html;
  const fresh = [...root.querySelectorAll("[data-message-id]")].filter((e) => !had.has(e.dataset.messageId));
  if (first) {
    sc.scrollTop = sc.scrollHeight;
  } else if (fresh.length) {
    cancelAnimationFrame(slowScroll);
    const el = fresh[fresh.length - 1];
    if (el.offsetHeight > popup.innerHeight * 0.85) {
      // mensagem grande: começa no topo dela e desce devagar até o fim
      sc.scrollTop = el.offsetTop - 8;
      glideToBottom(popup);
    } else {
      sc.scrollTop = sc.scrollHeight; // mensagem normal: pula para o fim
    }
  } else {
    sc.scrollTop = keep; // edição/exclusão: mantém onde estava
  }
}

function openPopup() {
  if (popup && !popup.closed) {
    popup.focus();
    paintPopup();
    return popup;
  }
  const w = window.open("", "t20obs-chat", "popup=yes,width=480,height=760");
  if (!w) return null;
  const doc = w.document;
  doc.open();
  doc.write(`<!doctype html><html class="${document.documentElement.className.replace(/\bt20-obs-on\b/g, "")}"><head><meta charset="utf-8"><title>Chat — ${game.world?.title ?? "Foundry"}</title><base href="${new URL(foundry.utils.getRoute("/"), window.location.origin).href}"></head><body class="${document.body.className.replace(/\bt20-obs-on\b/g, "")}"><div id="t20-chat-root"></div></body></html>`);
  doc.close();
  // mesmos estilos do Foundry (os endereços são resolvidos pela tag <base> acima)
  for (const node of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
    if (node.href?.includes(MODULE_ID)) continue;
    doc.head.appendChild(node.cloneNode(true));
  }
  const extra = doc.createElement("style");
  extra.textContent = `html,body{height:auto!important;min-height:100%;overflow:auto!important;margin:0;scrollbar-width:none;-ms-overflow-style:none}
html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;width:0;height:0}
#t20-chat-root #chat{height:auto;flex:none;position:static;width:auto}
#t20-chat-root .chat-log{overflow:visible;margin:0;padding:6px;list-style:none}
.message-delete,.card-buttons{display:none!important}`;
  doc.head.appendChild(extra);
  popup = w;
  lastSig = "";
  watchChat();
  setTimeout(paintPopup, 200); // dá tempo de os estilos carregarem
  return w;
}

window.addEventListener("beforeunload", () => {
  if (popup && !popup.closed) popup.close();
});

/** Janela com uma cópia do chat de quem a abriu (só o que esse usuário pode ver). Pode ser capturada no OBS. */
export class ChatCopy extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "t20-obs-overlay-chatcopy",
    classes: ["t20obs-chatcopy"],
    tag: "div",
    window: { title: "Chat (cópia)", icon: "fa-solid fa-comments", resizable: true },
    position: { width: 460, height: 700 }
  };

  static #timer = 0;

  /** Chamada pelos hooks do chat: atualiza a janela se ela estiver aberta. */
  static refresh(invalidateId = null) {
    if (invalidateId) htmlCache.delete(invalidateId);
    clearTimeout(popTimer);
    popTimer = setTimeout(paintPopup, 120);
    const app = foundry.applications.instances?.get(ChatCopy.DEFAULT_OPTIONS.id);
    if (!app?.rendered) return;
    clearTimeout(ChatCopy.#timer);
    ChatCopy.#timer = setTimeout(() => app.render(), 120);
  }

  async _renderHTML() {
    return buildChatHtml();
  }

  _replaceHTML(result, content) {
    const atBottom = content.scrollHeight - content.scrollTop - content.clientHeight < 80 || !content.dataset.t20;
    content.dataset.t20 = "1";
    content.innerHTML = result;
    if (atBottom) content.scrollTop = content.scrollHeight;
  }
}

export function openChatCopy() {
  const w = openPopup();
  if (w) return w;
  // popup bloqueado pelo navegador: abre a janela dentro do Foundry
  ui.notifications.warn("T20 OBS Overlay: o navegador bloqueou a janela externa (permita pop-ups para este site). Abri a cópia dentro do Foundry.");
  const app = foundry.applications.instances?.get(ChatCopy.DEFAULT_OPTIONS.id) ?? new ChatCopy();
  app.render({ force: true });
  return app;
}

/** Abre a janela sozinha para o usuário escolhido pelo mestre. Navegadores bloqueiam pop-up sem clique:
 *  se bloquear, a janela abre no primeiro clique/tecla do jogador (e ele é avisado). */
let armed = false;
export function autoOpenChat() {
  if (game.settings.get(MODULE_ID, "chatAutoUser") !== game.user.id) return;
  if (popup && !popup.closed) return;
  if (openPopup()) return;
  if (armed) return;
  armed = true;
  ui.notifications.info("T20 OBS Overlay: clique em qualquer lugar para abrir a janela do chat.", { permanent: false });
  const go = () => {
    window.removeEventListener("pointerdown", go, true);
    window.removeEventListener("keydown", go, true);
    armed = false;
    if (game.settings.get(MODULE_ID, "chatAutoUser") === game.user.id && !(popup && !popup.closed)) openPopup();
  };
  window.addEventListener("pointerdown", go, true);
  window.addEventListener("keydown", go, true);
}

/** Entrada no menu de configurações do módulo: em vez de mostrar uma janela de configuração, abre o chat. */
export class OpenChatCopy extends ApplicationV2 {
  async render() {
    openChatCopy();
    return this;
  }
}
