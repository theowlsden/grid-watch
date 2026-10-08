// Applies the saved day/night choice before first paint (spec 4.3). Kept as a same-origin
// file, not an inline script, so the Content Security Policy can forbid inline scripts.
// Mirrors src/lib/mode.ts.
(function () {
  var pref = "auto";
  try {
    var v = localStorage.getItem("gridwatch-mode");
    if (v === "day" || v === "night" || v === "auto") pref = v;
  } catch {
    // storage blocked: Auto
  }
  var h = new Date().getHours();
  var mode = pref === "auto" ? (h >= 6 && h < 18 ? "day" : "night") : pref;
  document.documentElement.setAttribute("data-mode", mode);
})();
