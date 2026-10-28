import { MODULE_ID, SLOT_COUNT, getSlots, esc } from "./common.js";

const { ApplicationV2 } = foundry.applications.api;

/** Janela (só GM) para escolher o personagem de cada slot. Os efeitos vêm automaticamente do personagem. */
export class SlotsConfig extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "t20-obs-overlay-config",
    classes: ["t20obs-config"],
    tag: "div",
    window: { title: "T20 OBS Overlay — Personagens dos slots", icon: "fa-solid fa-tv", resizable: false },
    position: { width: 580, height: "auto" }
  };

  async _renderHTML() {
    const slots = getSlots();
    const actors = game.actors.contents.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const pcs = actors.filter((a) => a.type === "character");
    const others = actors.filter((a) => a.type !== "character");
    const opt = (a, sel) => `<option value="${a.id}" ${sel === a.id ? "selected" : ""}>${esc(a.name)}</option>`;

    const rows = slots
      .map((s, i) => {
        const options = `
          <option value="">— vazio —</option>
          ${pcs.length ? `<optgroup label="Personagens">${pcs.map((a) => opt(a, s.actorId)).join("")}</optgroup>` : ""}
          ${others.length ? `<optgroup label="Outros">${others.map((a) => opt(a, s.actorId)).join("")}</optgroup>` : ""}`;
        return `
        <div class="t20obs-cfg-row">
          <div class="t20obs-cfg-num">${i + 1}</div>
          <div class="t20obs-cfg-main">
            <select data-slot="${i}">${options}</select>
          </div>
        </div>`;
      })
      .join("");

    const bridge = game.settings.get(MODULE_ID, "bridgeUser");
    const users = game.users.contents.filter((u) => !u.isGM);
    const bridgeSel = `
      <label class="t20obs-cfg-hint"><b>Quem envia os dados ao OBS</b>
        <select data-bridge>
          <option value="">Mestre (padrão)</option>
          ${users.map((u) => `<option value="${u.id}" ${bridge === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}
        </select>
      </label>
      <p class="t20obs-cfg-hint">O usuário escolhido precisa deixar o Foundry aberto, ligar "Enviar dados ao OBS" nas configurações dele e ter permissão de Observador nos personagens dos slots. Se ele estiver offline, o mestre assume.</p>`;
    return `
      ${bridgeSel}
      <p class="t20obs-cfg-hint">
        Escolha o personagem de cada slot (1 a ${SLOT_COUNT}, na ordem da HUD). A mesma escolha vale para as
        duas telas.
      </p>
      ${rows}
      <footer class="t20obs-cfg-footer">
        <button type="button" data-t20-fill><i class="fa-solid fa-wand-magic-sparkles"></i> Preencher com os personagens dos jogadores</button>
        <button type="button" data-t20-save><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
      </footer>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender() {
    const el = this.element;
    el.querySelector("[data-t20-fill]")?.addEventListener("click", () => this.#autoFill());
    el.querySelector("[data-t20-save]")?.addEventListener("click", () => this.#save());
  }

  #autoFill() {
    let list = game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner);
    if (!list.length) list = game.users.map((u) => u.character).filter(Boolean);
    list = list.slice(0, SLOT_COUNT);
    this.element.querySelectorAll("select[data-slot]").forEach((sel, i) => {
      sel.value = list[i]?.id ?? "";
    });
  }

  async #save() {
    const slots = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      slots.push({
        actorId: this.element.querySelector(`select[data-slot="${i}"]`)?.value ?? ""
      });
    }
    const bridge = this.element.querySelector("select[data-bridge]")?.value ?? "";
    if (bridge !== game.settings.get(MODULE_ID, "bridgeUser")) await game.settings.set(MODULE_ID, "bridgeUser", bridge);
    await game.settings.set(MODULE_ID, "slots", slots);
    ui.notifications.info("T20 OBS Overlay: slots salvos.");
    this.close();
  }
}
