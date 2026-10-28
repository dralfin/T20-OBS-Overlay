/* Ponte Foundry (navegador do mestre) → OBS, usando o obs-websocket v5 (já incluso no OBS 28+).
   Os dados são enviados às Fontes de Navegador pelo pedido "emit_event" do fornecedor "obs-browser". */

/* SHA-256 em JS puro (crypto.subtle só existe em páginas seguras; o Foundry costuma rodar em http). */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

export function sha256(data) {
  const l = data.length;
  const padded = new Uint8Array((((l + 9 + 63) >> 6) << 6));
  padded.set(data);
  padded[l] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor((l * 8) / 0x100000000));
  dv.setUint32(padded.length - 4, (l * 8) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  H.forEach((v, i) => odv.setUint32(i * 4, v));
  return out;
}

const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
/** Autenticação do obs-websocket v5: base64(sha256(base64(sha256(senha+salt)) + challenge)). */
export function obsAuth(password, salt, challenge) {
  const secret = b64(sha256(enc.encode(password + salt)));
  return b64(sha256(enc.encode(secret + challenge)));
}

export const EVENT_NAME = "t20obs-data";
export const FONT_EVENT_NAME = "t20obs-fonts";

export class ObsBridge {
  #ws = null;
  #ready = false;
  #stopped = false;
  #timer = 0;
  #delay = 2000;
  #scene = null;
  #reqId = 0;
  #pending = new Map();
  #vendorWarned = false;

  /** opts: host, port, password, onStatus(texto, nivel), onReady(), onScene(nome) */
  constructor(opts) {
    this.opts = opts;
  }

  get ready() {
    return this.#ready;
  }
  get scene() {
    return this.#scene;
  }

  start() {
    this.#stopped = false;
    this.#open();
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#timer);
    this.#ready = false;
    try {
      this.#ws?.close();
    } catch (e) {
      /* ignora */
    }
  }

  /** Envia o payload às Fontes de Navegador do OBS. Devolve false se não estiver conectado. */
  emit(payload, eventName = EVENT_NAME) {
    if (!this.#ready) return false;
    this.#request("CallVendorRequest", {
      vendorName: "obs-browser",
      requestType: "emit_event",
      requestData: { event_name: eventName, event_data: payload }
    }).then((res) => {
      if (res && !res.requestStatus?.result && !this.#vendorWarned) {
        this.#vendorWarned = true;
        this.opts.onStatus?.(`O OBS recusou o envio (código ${res.requestStatus?.code}). Confira se a versão do OBS é 28 ou superior.`, "warn");
      }
    });
    return true;
  }

  #open() {
    const { host, port } = this.opts;
    let ws;
    try {
      ws = new WebSocket(`ws://${host}:${port}`, "obswebsocket.json");
    } catch (e) {
      this.#retry();
      return;
    }
    this.#ws = ws;
    ws.onmessage = (ev) => {
      try {
        this.#onMessage(JSON.parse(ev.data));
      } catch (e) {
        console.warn("T20 OBS Overlay | mensagem inválida do OBS", e);
      }
    };
    ws.onclose = (ev) => {
      const wasReady = this.#ready;
      this.#ready = false;
      this.#pending.clear();
      if (ev.code === 4009) this.opts.onStatus?.("Senha do OBS incorreta (WebSocket).", "warn");
      else if (wasReady) this.opts.onStatus?.("Conexão com o OBS perdida. Tentando reconectar…", "warn");
      if (!this.#stopped) this.#retry();
    };
    ws.onerror = () => {};
  }

  #retry() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => !this.#stopped && this.#open(), this.#delay);
    this.#delay = Math.min(this.#delay * 1.5, 10000);
  }

  #send(op, d) {
    this.#ws?.send(JSON.stringify({ op, d }));
  }

  #request(requestType, requestData = {}) {
    return new Promise((resolve) => {
      const requestId = `t20-${++this.#reqId}`;
      this.#pending.set(requestId, resolve);
      this.#send(6, { requestType, requestId, requestData });
      setTimeout(() => {
        if (this.#pending.delete(requestId)) resolve(null);
      }, 5000);
    });
  }

  #onMessage({ op, d }) {
    switch (op) {
      case 0: {
        // Hello → Identify (inscreve só em eventos de cenas = 1<<2)
        const ident = { rpcVersion: 1, eventSubscriptions: 4 };
        if (d.authentication) ident.authentication = obsAuth(this.opts.password ?? "", d.authentication.salt, d.authentication.challenge);
        this.#send(1, ident);
        break;
      }
      case 2:
        this.#ready = true;
        this.#delay = 2000;
        this.opts.onStatus?.("Conectado ao OBS.", "info");
        this.#request("GetCurrentProgramScene").then((res) => {
          const name = res?.responseData?.sceneName ?? res?.responseData?.currentProgramSceneName;
          if (name) this.#scene = name;
          this.opts.onReady?.();
        });
        break;
      case 5:
        if (d.eventType === "CurrentProgramSceneChanged") {
          this.#scene = d.eventData?.sceneName ?? null;
          this.opts.onScene?.(this.#scene);
        }
        break;
      case 7: {
        const resolve = this.#pending.get(d.requestId);
        if (resolve) {
          this.#pending.delete(d.requestId);
          resolve(d);
        }
        break;
      }
    }
  }
}
