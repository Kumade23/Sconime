/* ============================================================
   Sconime — tv: navigazione con D-pad / telecomando (Fire TV)
   Rileva l'uso delle frecce e attiva una modalità focus chiara.
   ============================================================ */
window.TV = (() => {
  const { $$ } = UI;
  let active = false;
  let current = null;

  const isTVKey = (k) => ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(k);

  function enable() {
    if (active) return;
    active = true;
    document.body.classList.add("tv-mode");
    if (!current) focusFirst();
  }
  function disable() {
    active = false;
    document.body.classList.remove("tv-mode");
    clearFocus();
  }

  function focusables() {
    return $$("[data-focusable]").filter(el =>
      el.offsetParent !== null && !el.disabled && el.getClientRects().length > 0
    );
  }

  function focusFirst() {
    const f = focusables();
    if (f.length) setFocus(f[0]);
  }

  function setFocus(el) {
    clearFocus();
    current = el;
    el.classList.add("tv-focus");
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }
  function clearFocus() {
    if (current) current.classList.remove("tv-focus");
    current = null;
  }

  /* sposta il focus all'elemento più vicino nella direzione data */
  function move(dir) {
    const items = focusables();
    if (!items.length) return;
    if (!current || !items.includes(current)) { setFocus(items[0]); return; }

    const r = current.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestScore = Infinity;

    for (const el of items) {
      if (el === current) continue;
      const b = el.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const dx = x - cx, dy = y - cy;
      let valid = false, primary = 0, secondary = 0;
      if (dir === "up" && dy < -8) { valid = true; primary = -dy; secondary = Math.abs(dx); }
      if (dir === "down" && dy > 8) { valid = true; primary = dy; secondary = Math.abs(dx); }
      if (dir === "left" && dx < -8) { valid = true; primary = -dx; secondary = Math.abs(dy); }
      if (dir === "right" && dx > 8) { valid = true; primary = dx; secondary = Math.abs(dy); }
      if (!valid) continue;
      const score = primary * 2 + secondary;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) setFocus(best);
  }

  function onKey(e) {
    if (!isTVKey(e.key)) {
      // se l'utente usa il mouse, disattiva la tv-mode visiva
      return;
    }
    // dentro il player lasciamo le frecce al player (seek/volume),
    // tranne quando il focus NON è sul video/container player
    const inPlayer = document.activeElement?.closest?.(".player-wrap");
    enable();
    if (e.key === "Enter") {
      if (current) { e.preventDefault(); current.click(); }
      return;
    }
    if (inPlayer && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      return; // seek gestito dal player
    }
    e.preventDefault();
    move(e.key.replace("Arrow", "").toLowerCase());
  }

  function init() {
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousemove", () => { if (active && !document.body.classList.contains("tv-keep")) disable(); }, { passive: true });
  }

  /* dopo ogni render, riposiziona il focus sul primo elemento */
  function refocus() {
    if (!active) return;
    const items = focusables();
    if (!items.includes(current)) current = null;
    if (!current) focusFirst();
  }

  return { init, enable, refocus, move, setFocus, focusables, get active() { return active; } };
})();
