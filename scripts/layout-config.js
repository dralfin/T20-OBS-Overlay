import { MODULE_ID, getLayout, esc, FONT_EXT } from "./common.js";
import { GEOMETRY, DEFAULT_ELEMS, slotGeo, elemsFor } from "./render.js";

const { ApplicationV2 } = foundry.applications.api;

const SLOT_FIELDS = [
  { f: "x", label: "Posição X", min: 0, max: 1920 },
  { f: "y", label: "Posição Y", min: 0, max: 1080 },
  { f: "w", label: "Largura do bloco", min: 100, max: 1000 }
];
const ELEMS = [
  { key: "pv", label: "Vida (PV)", fields: ["w", "h", "fs"] },
  { key: "pm", label: "Mana (PM)", fields: ["w", "h", "fs"] },
  { key: "def", label: "Defesa (armadura)", fields: ["w", "h", "fs"] },
  { key: "nm", label: "Nome", fields: ["fs"] }
];
const ELEM_FIELDS = {
  w: { label: "Largura (0 = auto)", min: 0, max: 600 },
  h: { label: "Altura", min: 10, max: 90 },
  fs: { label: "Fonte (px)", min: 8, max: 60 }
};
const SCREENS = { tela1: "Tela 1 — Séquito", tela2: "Tela 2 — Câmeras" };
const PREVIEW_SCALE = 0.25; // miniatura 480×270 do palco 1920×1080

const field = (label, attrs, min, max, value) => `
  <div class="t20obs-lay-field">
    <span>${label}</span>
    <input type="range" ${attrs} min="${min}" max="${max}" step="1" value="${value}">
    <input type="number" ${attrs} min="${min}" max="${max}" step="1" value="${value}">
  </div>`;

/** Janela (só GM): posição/largura de cada bloco e largura/altura/fonte de cada elemento, por tela.
 *  Salva sozinha; o OBS atualiza ao vivo. */
export class LayoutConfig extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "t20-obs-overlay-layout",
    classes: ["t20obs-config"],
    tag: "div",
    window: { title: "T20 OBS Overlay — Posição, tamanho e fonte", icon: "fa-solid fa-up-down-left-right", resizable: false },
    position: { width: 680, height: "auto" }
  };

  #screen = "tela1";
  #cur = []; // blocos: [{x,y,w}]
  #elems = {}; // elementos efetivos
  #fonts = { num: "", name: "", numFile: "", nameFile: "" };
  #saveTimer = 0;

  #load() {
    const layout = getLayout();
    this.#cur = GEOMETRY[this.#screen].map((_, i) => {
      const g = slotGeo(this.#screen, i, layout);
      return { x: g.x, y: g.y, w: g.w };
    });
    this.#elems = JSON.parse(JSON.stringify(elemsFor(this.#screen, layout)));
    const f = layout.fonts ?? {};
    this.#fonts = { num: f.num ?? "", name: f.name ?? "", numFile: f.numFile ?? "", nameFile: f.nameFile ?? "" };
  }

  async _renderHTML() {
    this.#load();
    const tabs = Object.entries(SCREENS)
      .map(([k, label]) => `<button type="button" data-t20-screen="${k}" class="${k === this.#screen ? "active" : ""}">${label}</button>`)
      .join("");
    const rects = this.#cur
      .map((c, i) => `<div class="t20obs-lay-rect" data-rect="${i}" style="${this.#rectStyle(c, GEOMETRY[this.#screen][i].h)}">${i + 1}</div>`)
      .join("");
    const slotRows = this.#cur
      .map(
        (c, i) => `
      <div class="t20obs-lay-row">
        <div class="t20obs-cfg-num">${i + 1}</div>
        ${SLOT_FIELDS.map(({ f, label, min, max }) => field(label, `data-i="${i}" data-f="${f}"`, min, max, c[f])).join("")}
      </div>`
      )
      .join("");
    const elemRows = ELEMS.map(
      ({ key, label, fields }) => `
      <div class="t20obs-lay-row">
        <div class="t20obs-lay-elab">${label}</div>
        ${["w", "h", "fs"]
          .map((f) => {
            if (!fields.includes(f)) return `<div class="t20obs-lay-field"></div>`;
            const { label: l, min, max } = ELEM_FIELDS[f];
            return field(l, `data-e="${key}" data-f="${f}"`, min, max, this.#elems[key][f]);
          })
          .join("")}
      </div>`
    ).join("");

    return `
      <div class="t20obs-lay-tabs">${tabs}</div>
      <p class="t20obs-cfg-hint">Arraste os sliders (ou digite). Tudo é salvo sozinho e aparece ao vivo no OBS. Medidas em pixels, base 1920×1080.</p>
      <div class="t20obs-lay-prev">${rects}</div>
      <h3 class="t20obs-lay-h">Blocos (um por personagem)</h3>
      ${slotRows}
      <h3 class="t20obs-lay-h">Elementos (valem para os 5 blocos desta tela)</h3>
      ${elemRows}
      <h3 class="t20obs-lay-h">Fontes (valem para as duas telas)</h3>
      <div class="t20obs-lay-fonts">
        ${this.#fontBox("num", "Fonte dos números", "padrão (Signika)")}
        ${this.#fontBox("name", "Fonte do nome", "padrão (Pirata One)")}
      </div>
      <p class="t20obs-cfg-hint">Duas formas: <b>arquivo de fonte</b> (.ttf, .otf, .woff, .woff2 — vai embutido nos dados enviados ao OBS, não precisa instalar nada nem ter internet) ou o <b>nome</b> de uma fonte instalada no computador do OBS / do Google Fonts (ex.: Cinzel). Se houver arquivo, ele tem prioridade. Para enviar um arquivo novo ao Foundry, use o botão de upload dentro do seletor.</p>
      <footer class="t20obs-cfg-footer">
        <button type="button" data-t20-reset><i class="fa-solid fa-rotate-left"></i> Restaurar padrão desta tela</button>
        <button type="button" data-t20-close><i class="fa-solid fa-check"></i> Fechar</button>
      </footer>`;
  }

  #fontBox(role, label, placeholder) {
    const file = this.#fonts[role + "File"];
    const base = file ? decodeURIComponent(file.split("/").pop()) : "nenhum arquivo";
    return `
        <div class="t20obs-lay-fontbox">
          <label>${label}
            <input type="text" data-font="${role}" value="${esc(this.#fonts[role])}" placeholder="${placeholder}">
          </label>
          <div class="t20obs-lay-file">
            <span data-font-label="${role}" title="${esc(file)}">${esc(base)}</span>
            <button type="button" data-font-pick="${role}"><i class="fa-solid fa-file-import"></i> Arquivo…</button>
            <button type="button" data-font-clear="${role}" title="Remover o arquivo"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>`;
  }

  #rectStyle(c, h) {
    const s = PREVIEW_SCALE;
    return `left:${c.x * s}px;top:${c.y * s}px;width:${c.w * s}px;height:${h * s}px`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender() {
    const el = this.element;
    el.querySelectorAll("[data-t20-screen]").forEach((b) =>
      b.addEventListener("click", () => {
        this.#flush();
        this.#screen = b.dataset.t20Screen;
        this.render();
      })
    );
    el.querySelectorAll("input[data-f]").forEach((inp) => inp.addEventListener("input", () => this.#onInput(inp)));
    el.querySelectorAll("input[data-font]").forEach((inp) =>
      inp.addEventListener("input", () => {
        this.#fonts[inp.dataset.font] = inp.value;
        this.#queueSave();
      })
    );
    el.querySelectorAll("[data-font-pick]").forEach((b) => b.addEventListener("click", () => this.#pickFont(b.dataset.fontPick)));
    el.querySelectorAll("[data-font-clear]").forEach((b) => b.addEventListener("click", () => this.#setFontFile(b.dataset.fontClear, "")));
    el.querySelector("[data-t20-reset]")?.addEventListener("click", () => this.#reset());
    el.querySelector("[data-t20-close]")?.addEventListener("click", () => this.close());
  }

  /** Abre o seletor de arquivos do Foundry para escolher o arquivo de fonte. */
  #pickFont(role) {
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    new FP({
      type: "any",
      current: this.#fonts[role + "File"] || "",
      callback: (path) => {
        if (!FONT_EXT.test(String(path).split("?")[0])) {
          ui.notifications.warn("Escolha um arquivo de fonte: .ttf, .otf, .woff ou .woff2.");
          return;
        }
        this.#setFontFile(role, path);
      }
    }).render({ force: true });
  }

  #setFontFile(role, path) {
    this.#fonts[role + "File"] = path;
    const label = this.element.querySelector(`[data-font-label="${role}"]`);
    if (label) {
      label.textContent = path ? decodeURIComponent(path.split("/").pop()) : "nenhum arquivo";
      label.title = path;
    }
    this.#queueSave();
  }

  #onInput(inp) {
    const f = inp.dataset.f;
    const e = inp.dataset.e;
    const lim = e ? ELEM_FIELDS[f] : SLOT_FIELDS.find((x) => x.f === f);
    const v = Math.round(Number(inp.value));
    if (!Number.isFinite(v) || inp.value === "") return;
    const val = Math.max(lim.min, Math.min(lim.max, v));
    const sel = e ? `input[data-e="${e}"][data-f="${f}"]` : `input[data-i="${inp.dataset.i}"][data-f="${f}"]`;
    this.element.querySelectorAll(sel).forEach((o) => {
      if (o !== inp) o.value = val;
    });
    if (e) this.#elems[e][f] = val;
    else {
      const i = Number(inp.dataset.i);
      this.#cur[i][f] = val;
      const rect = this.element.querySelector(`[data-rect="${i}"]`);
      if (rect) rect.style.cssText = this.#rectStyle(this.#cur[i], GEOMETRY[this.#screen][i].h);
    }
    this.#queueSave();
  }

  #queueSave() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.#save(), 150);
  }

  /** Salva só o que difere do padrão. */
  async #save() {
    this.#saveTimer = 0;
    const screen = this.#screen;
    const layout = JSON.parse(JSON.stringify(getLayout()));

    const fonts = {};
    for (const k of ["num", "name", "numFile", "nameFile"]) {
      const v = String(this.#fonts[k] ?? "").trim();
      if (v) fonts[k] = v;
    }
    if (Object.keys(fonts).length) layout.fonts = fonts;
    else delete layout.fonts;

    const slots = this.#cur.map((c, i) => {
      const d = GEOMETRY[screen][i];
      return c.x === d.x && c.y === d.y && c.w === d.w ? null : { x: c.x, y: c.y, w: c.w };
    });
    const elems = {};
    for (const [k, d] of Object.entries(DEFAULT_ELEMS[screen])) {
      for (const f of Object.keys(d)) {
        if (this.#elems[k][f] !== d[f]) (elems[k] ??= {})[f] = this.#elems[k][f];
      }
    }
    const sc = {};
    if (slots.some(Boolean)) sc.slots = slots;
    if (Object.keys(elems).length) sc.elems = elems;
    if (Object.keys(sc).length) layout[screen] = sc;
    else delete layout[screen];

    await game.settings.set(MODULE_ID, "layout", layout);
  }

  #flush() {
    if (this.#saveTimer) {
      clearTimeout(this.#saveTimer);
      this.#save();
    }
  }

  async #reset() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = 0;
    const layout = JSON.parse(JSON.stringify(getLayout()));
    delete layout[this.#screen];
    await game.settings.set(MODULE_ID, "layout", layout);
    this.render();
  }

  async close(options) {
    this.#flush();
    return super.close(options);
  }
}
