// Applies the saved day/night choice and language before first paint (spec 4.3, 4.7). Kept as a
// same-origin file, not an inline script, so the Content Security Policy can forbid inline
// scripts. Mirrors src/lib/mode.ts and src/lib/lang.ts.
(function () {
  var pref = "auto";
  var lang = "en";
  try {
    var v = localStorage.getItem("gridwatch-mode");
    if (v === "day" || v === "night" || v === "auto") pref = v;
    var l = localStorage.getItem("gridwatch-lang");
    if (l === "en" || l === "pap") lang = l;
  } catch {
    // storage blocked: Auto and English
  }
  var h = new Date().getHours();
  var mode = pref === "auto" ? (h >= 6 && h < 18 ? "day" : "night") : pref;
  document.documentElement.setAttribute("data-mode", mode);
  document.documentElement.setAttribute("lang", lang);
})();
