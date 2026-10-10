/* Le bouton « Filtre » des testeurs, jusqu'à l'ouverture officielle du projet (samedi 31 octobre 2026, 21 h).
   Il n'apparaît que pour les comptes de CASTING_TESTEURS connectés avec Discord.
   « Filtre : testeur » → un appui : le site comme le voit le public (le décompte), « Filtre : public ».
   Un autre appui : retour au mode testeur. Le choix est gardé dans le cookie osiris_vue, lu par middleware.js.
   Pour un visiteur qui n'est pas testeur, ce cookie ne change rien. Après l'ouverture, le bouton disparaît. */
(function(){
  var OUVERTURE = new Date("2026-10-31T21:00:00+01:00").getTime();
  if (Date.now() >= OUVERTURE) return;
  var publique = /(?:^|;\s*)osiris_vue=public(?:;|$)/.test(document.cookie);

  fetch("/api/casting", { credentials: "same-origin", cache: "no-store" })
    .then(function(r){ return r.ok ? r.json() : null })
    .then(function(j){
      if (!j || !j.testeur) return;
      var css = document.createElement("style");
      css.textContent =
        ".filtre-testeur{position:fixed;right:18px;bottom:18px;z-index:40;display:flex;align-items:center;gap:9px;padding:9px 13px;" +
        "background:rgba(10,11,13,.9);border:1px solid #8E7747;color:#E6E0D3;font:500 10.5px/1 'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;" +
        "letter-spacing:.16em;text-transform:uppercase;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}" +
        ".filtre-testeur:hover{border-color:#E9CF78}" +
        ".filtre-testeur:focus-visible{outline:1px solid #E6E0D3;outline-offset:3px}" +
        ".filtre-testeur i{width:8px;height:8px;border-radius:50%;background:#E9CF78;flex:none}" +
        ".filtre-testeur.public i{background:#B5564A;box-shadow:0 0 8px #B5564A}" +
        ".filtre-testeur b{font-weight:500;color:#E9CF78}" +
        ".filtre-testeur.public b{color:#D27A6D}";
      document.head.appendChild(css);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "filtre-testeur" + (publique ? " public" : "");
      b.innerHTML = "<i aria-hidden=\"true\"></i>Filtre : <b>" + (publique ? "public" : "testeur") + "</b>";
      b.title = publique ? "Tu vois le site comme le public. Appuie pour revenir en mode testeur." : "Tu vois tout le site. Appuie pour le voir comme le public.";
      b.addEventListener("click", function(){
        document.cookie = publique ? "osiris_vue=; Path=/; Max-Age=0; SameSite=Lax" : "osiris_vue=public; Path=/; Max-Age=604800; SameSite=Lax";
        location.reload();
      });
      document.body.appendChild(b);
      document.body.classList.add("a-filtre");
    })
    .catch(function(){});
})();
