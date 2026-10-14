/* Les boutons des testeurs, jusqu'à l'ouverture de la page Saison 2 au public (mercredi 1er septembre 2027, 20 h).
   Ils n'apparaissent que pour les comptes de CASTING_TESTEURS connectés avec Discord.
   « Filtre : testeur » → un appui : le site comme le voit le public, « Filtre : public » (avant le 26 décembre 2026,
   c'est le décompte ; ensuite, la page Saison 2 redevient invisible). Un autre appui : retour au mode testeur.
   Le choix est gardé dans le cookie osiris_vue, lu par middleware.js. Pour un visiteur qui n'est pas testeur, ce cookie ne change rien.
   « Saison 2 » : le lien vers l'aperçu de la page du Programme 02 (sur cette page, il devient « Le site »).
   Le 1er septembre 2027 à 20 h, la page Saison 2 devient publique et les boutons disparaissent. */
(function(){
  var SAISON2 = new Date("2027-09-01T20:00:00+02:00").getTime();
  if (Date.now() >= SAISON2) return;
  var publique = /(?:^|;\s*)osiris_vue=public(?:;|$)/.test(document.cookie);
  var surSaison2 = /^\/saison2(?:\.html)?\/?$/.test(location.pathname);

  fetch("/api/casting", { credentials: "same-origin", cache: "no-store" })
    .then(function(r){ return r.ok ? r.json() : null })
    .then(function(j){
      if (!j || !j.testeur) return;
      var css = document.createElement("style");
      css.textContent =
        ".filtre-boite{position:fixed;right:18px;bottom:18px;z-index:40;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}" +
        ".filtre-testeur{display:flex;align-items:center;gap:9px;padding:9px 13px;text-decoration:none;" +
        "background:rgba(10,11,13,.9);border:1px solid #8E7747;color:#E6E0D3;font:500 10.5px/1 'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;" +
        "letter-spacing:.16em;text-transform:uppercase;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}" +
        ".filtre-testeur:hover{border-color:#E9CF78}" +
        ".filtre-testeur:focus-visible{outline:1px solid #E6E0D3;outline-offset:3px}" +
        ".filtre-testeur i{width:8px;height:8px;border-radius:50%;background:#E9CF78;flex:none}" +
        ".filtre-testeur.public i{background:#B5564A;box-shadow:0 0 8px #B5564A}" +
        ".filtre-testeur b{font-weight:500;color:#E9CF78}" +
        ".filtre-testeur.public b{color:#D27A6D}" +
        ".filtre-testeur.s2 i{border-radius:0;transform:rotate(45deg);width:7px;height:7px}";
      document.head.appendChild(css);
      var boite = document.createElement("div");
      boite.className = "filtre-boite";

      if (!publique) {
        var a = document.createElement("a");
        a.className = "filtre-testeur s2";
        a.href = surSaison2 ? "/" : "/saison2";
        a.innerHTML = "<i aria-hidden=\"true\"></i>" + (surSaison2 ? "Le site" : "Saison 2 · <b>aperçu</b>");
        a.title = surSaison2 ? "Retour au site." : "La page du Programme 02, telle que le public la verra le 1er septembre 2027. Visible seulement par les testeurs.";
        boite.appendChild(a);
      }

      var b = document.createElement("button");
      b.type = "button";
      b.className = "filtre-testeur" + (publique ? " public" : "");
      b.innerHTML = "<i aria-hidden=\"true\"></i>Filtre : <b>" + (publique ? "public" : "testeur") + "</b>";
      b.title = publique ? "Tu vois le site comme le public. Appuie pour revenir en mode testeur." : "Tu vois tout le site. Appuie pour le voir comme le public.";
      b.addEventListener("click", function(){
        document.cookie = publique ? "osiris_vue=; Path=/; Max-Age=0; SameSite=Lax" : "osiris_vue=public; Path=/; Max-Age=604800; SameSite=Lax";
        location.reload();
      });
      boite.appendChild(b);

      document.body.appendChild(boite);
      document.body.classList.add("a-filtre");
    })
    .catch(function(){});
})();
