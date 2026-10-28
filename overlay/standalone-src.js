/* Página independente do overlay (sem login). Recebe os dados do Foundry (navegador do mestre)
   pelo obs-websocket: evento "t20obs-data" disparado pelo OBS nesta Fonte de Navegador.
   Parâmetros de URL (opcionais):  ?tela=1 | ?tela=2  (força uma tela)   ?debug=1  (mostra o estado) */
(function () {
  var EVENT_NAME = "t20obs-data";
  var STALE_MS = 60000; // sem dados do Foundry por 1 min → esconde (evita mostrar números velhos)

  var params = new URLSearchParams(window.location.search);
  var forcedMap = { 1: "tela1", tela1: "tela1", 2: "tela2", tela2: "tela2" }[(params.get("tela") || "").toLowerCase()];
  var forced = forcedMap || null;
  var debug = params.has("debug");

  var overlay = createOverlay();
  var last = null;
  var lastAt = 0;
  var obsScene = null;
  var dbg = null;

  overlay.show(null, null);
  if (debug) {
    dbg = document.createElement("div");
    dbg.style.cssText = "position:absolute;left:8px;bottom:8px;padding:4px 8px;background:rgba(0,0,0,.7);color:#fff;font:14px sans-serif;border-radius:4px";
    overlay.root.appendChild(dbg);
  }

  function draw() {
    var fresh = last && Date.now() - lastAt < STALE_MS;
    var scene = (last && last.scene) || obsScene;
    var screen = forced || (last ? screenForScene(scene, last.scenes) : "off");
    overlay.show(fresh && screen !== "off" ? screen : null, last);
    if (dbg) {
      dbg.textContent = !last
        ? "v" + (window.T20OBS_VERSION || "?") + " · aguardando dados do Foundry… (cena OBS: " + (scene || "?") + ")"
        : "v" + (window.T20OBS_VERSION || "?") + " · dados há " + Math.round((Date.now() - lastAt) / 1000) + "s · cena: " + (scene || "?") + " · tela: " + screen + " · animações disparadas: " + animCount;
    }
  }

  window.addEventListener(EVENT_NAME, function (e) {
    last = e.detail;
    lastAt = Date.now();
    draw();
  });

  // Se o OBS permitir, também acompanha a cena por conta própria (fallback)
  if (window.obsstudio) {
    if (window.obsstudio.getCurrentScene) window.obsstudio.getCurrentScene(function (s) { obsScene = s && s.name; draw(); });
    window.addEventListener("obsSceneChanged", function (e) { obsScene = e.detail && e.detail.name; draw(); });
  }

  /* Modo de teste (?teste=1): simula dano, cura, gasto de mana e mudança de Defesa, sem precisar do Foundry.
     Serve para conferir as animações direto no OBS. Use com ?tela=1 ou ?tela=2. */
  if (params.has("teste")) {
    forced = forced || "tela1";
    var names = ["Thanvaar", "Rurik", "Ssaarok", "Kael", "Lyra"];
    var mx = [[60, 30], [48, 12], [70, 20], [40, 40], [38, 34]];
    var st = [[42, 18, 28, 5, 0], [30, 6, 25, 0, 4], [70, 20, 30, 0, 0], [31, 22, 24, 0, 0], [20, 30, 23, 0, 0]];
    var steps = [[0, 0, 25], [0, 1, 26], [1, 0, 48], [0, 2, 29], [3, 1, 5], [0, 0, 8], [0, 0, 60], [2, 0, 40], [1, 1, 12], [4, 0, 5], [4, 0, 38], [0, 1, 2], [0, 3, 2], [0, 3, 0], [0, 3, 9], [0, 4, 6], [1, 4, 1], [1, 4, 0]];
    var n = 0;
    var tick = function () {
      if (n > 0) {
        var s = steps[(n - 1) % steps.length];
        st[s[0]][s[1]] = s[2];
      }
      n++;
      last = {
        v: 1, scene: null, scenes: {}, showNames: params.has("nomes"),
        slots: st.map(function (a, i) {
          return { name: names[i], pv: { value: a[0], max: mx[i][0], temp: a[3] }, pm: { value: a[1], max: mx[i][1], temp: a[4] }, defesa: a[2] };
        })
      };
      lastAt = Date.now();
      draw();
    };
    tick();
    setInterval(tick, 2500);
  }

  /* Fontes de arquivo enviadas pelo Foundry (guardadas no navegador para recarregar rápido) */
  var FONT_KEY = "t20obs-fonts";
  var fontStore = {};
  function saveFonts() {
    try { localStorage.setItem(FONT_KEY, JSON.stringify(fontStore)); } catch (err) { /* cota cheia: segue sem cache */ }
  }
  /* Só entra no cache o que realmente carregou como fonte */
  function applyFonts(fonts, persist) {
    Object.keys(fonts || {}).forEach(function (role) {
      var f = fonts[role];
      if (!f || !f.b64) return;
      registerFontData(role, f.key, f.b64).then(function (ok) {
        if (ok && persist) { fontStore[role] = f; saveFonts(); }
        if (ok && !persist) fontStore[role] = f;
      });
    });
  }
  try { applyFonts(JSON.parse(localStorage.getItem(FONT_KEY) || "{}"), false); } catch (e) { /* sem cache */ }
  window.addEventListener("t20obs-fonts", function (e) {
    var d = e.detail;
    if (d && d.fonts) applyFonts(d.fonts, true);
  });

  setInterval(draw, 2000);
})();
