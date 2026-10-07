// Ambiance sonore d'Osiris (accueil et casting).
// Les navigateurs interdisent de lancer du son tout seul : la musique démarre au premier clic ou à la première
// touche du visiteur, à volume bas, avec un fondu. Le bouton « Ambiance » en bas à gauche la coupe ou la relance,
// et ce choix est retenu d'une page à l'autre.
// Pour changer de musique : remplacer audio/ambiance.mp3 (et mettre sa durée dans BOUCLE).
(function () {
  var FICHIER = "audio/ambiance.mp3";
  var VOLUME = 0.22;   // 0 = muet, 1 = plein volume
  var BOUCLE = 96;     // durée de la boucle, en secondes
  var CLE = "osiris-son";

  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || !window.fetch) return;
  function pref() { try { return localStorage.getItem(CLE); } catch (e) { return null; } }
  function garder(v) { try { localStorage.setItem(CLE, v); } catch (e) {} }

  var css = document.createElement("style");
  css.textContent =
    ".son{position:fixed;left:18px;bottom:18px;z-index:6;display:flex;align-items:center;gap:10px;padding:9px 13px;background:rgba(10,11,13,.88);border:1px solid #8E7747;color:#C4A265;font:500 10.5px/1 'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:border-color .3s,color .3s,opacity .6s}" +
    ".son:hover{border-color:#C4A265;color:#E9CF78}.son:focus-visible{outline:1px solid #E6E0D3;outline-offset:3px}" +
    ".son .eq{display:flex;align-items:flex-end;gap:2px;height:12px}" +
    ".son .eq i{width:2px;height:3px;background:currentColor;transition:height .3s}" +
    ".son.on .eq i{animation:sonEq 1.6s ease-in-out infinite}" +
    ".son.on .eq i:nth-child(2){animation-delay:-.4s}.son.on .eq i:nth-child(3){animation-delay:-.9s}.son.on .eq i:nth-child(4){animation-delay:-1.2s}" +
    ".son:not(.on){color:#55534D;border-color:#23262C}" +
    "@keyframes sonEq{0%,100%{height:3px}50%{height:12px}}" +
    "html.intro .son{opacity:0}" +
    "@media (prefers-reduced-motion:reduce){.son.on .eq i{animation:none;height:8px}}";
  document.head.appendChild(css);

  var btn = document.createElement("button");
  btn.type = "button"; btn.className = "son";
  btn.innerHTML = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Ambiance</span>';
  document.body.appendChild(btn);

  var ctx = null, gain = null, src = null, chargement = null, joue = false, arret = 0;

  function afficher() {
    btn.classList.toggle("on", joue);
    btn.setAttribute("aria-pressed", joue ? "true" : "false");
    btn.title = joue ? "Couper l'ambiance" : "Activer l'ambiance";
    btn.setAttribute("aria-label", btn.title);
  }
  function fondu(v, sec) {
    var t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(v, t + sec);
  }
  function charger() {
    if (!chargement) {
      chargement = fetch(FICHIER).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (b) { return new Promise(function (ok, ko) { ctx.decodeAudioData(b, ok, ko); }); });
    }
    return chargement;
  }
  function lancer(premiere) {
    if (!ctx) { ctx = new AC(); gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination); }
    clearTimeout(arret);
    joue = true; afficher();
    if (ctx.state === "suspended") ctx.resume();
    if (src) { fondu(VOLUME, 2.5); return; }
    charger().then(function (buf) {
      if (src) return;
      // Certains navigateurs laissent quelques millisecondes de silence d'encodage au début : on les saute.
      var d = buf.getChannelData(0), i = 0;
      while (i < 4096 && Math.abs(d[i]) < 0.002) i++;
      var debut = i / buf.sampleRate;
      src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      src.loopStart = debut; src.loopEnd = Math.min(buf.duration, debut + BOUCLE);
      src.connect(gain); src.start(0, debut);
      if (joue) fondu(VOLUME, premiere ? 5 : 2.5);
    }).catch(function () { joue = false; afficher(); btn.hidden = true; });
  }
  function couper() {
    joue = false; afficher();
    if (!ctx) return;
    fondu(0, 1);
    arret = setTimeout(function () { if (!joue) ctx.suspend(); }, 1100);
  }

  btn.addEventListener("click", function () {
    if (joue) { couper(); garder("off"); } else { lancer(false); garder("on"); }
  });

  // Premier clic, toucher ou touche du visiteur : l'ambiance démarre (sauf s'il l'a coupée avant).
  var EV = ["pointerup", "touchend", "keydown"];
  function premierGeste(e) {
    if (btn.contains(e.target)) return;
    EV.forEach(function (n) { window.removeEventListener(n, premierGeste, true); });
    if (pref() !== "off" && !joue) lancer(true);
  }
  EV.forEach(function (n) { window.addEventListener(n, premierGeste, true); });

  // Onglet en arrière-plan : on met en pause, et on reprend au retour.
  document.addEventListener("visibilitychange", function () {
    if (!ctx || !joue) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  afficher();
})();
