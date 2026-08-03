/* Sconime — ui: helper DOM, card, skeleton, toast */
window.UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const clone = (tplId) => document.getElementById(tplId).content.cloneNode(true);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmtTime = (sec) => {
    if (!isFinite(sec)) return "0:00";
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
             : `${m}:${String(s).padStart(2, "0")}`;
  };

  const title = (a) => a.title_it || a.title_eng || a.title || "Senza titolo";
  // Cover via proxy backend: evita blocchi hotlink-protection / cert deboli.
  const prox = (u) => (u && /^https?:/i.test(u)) ? `/api/img?u=${encodeURIComponent(u)}` : "";
  const poster = (a) => {
    const raw = a.cover || a.imageurl || a.imageurl_cover || "";
    return raw ? prox(raw) : "";
  };
  // cover grezza (per banner sfocato usiamo diretta se possibile, ma proxiamo comunque)
  const posterRaw = (a) => a.cover || a.imageurl || a.imageurl_cover || "";
  const dubBadge = (a) => a.dub ? `<span class="badge dub">ITA</span>` : "";
  const scoreBadge = (a) => a.score ? `<span class="badge score">★ ${esc(a.score)}</span>` : "";

  /* ---------- card anime ---------- */
  function animeCard(a, opts = {}) {
    const node = clone("tpl-card");
    const card = $("a", node);
    card.href = `#/anime/${a.id}/${a.slug}`;
    card.dataset.animeId = a.id;
    const img = $("img", node);
    img.referrerPolicy = "no-referrer";
    img.src = poster(a); img.alt = title(a);
    img.onerror = () => { img.style.opacity = 0; };
    $(".card-badges", node).innerHTML = dubBadge(a) + scoreBadge(a);
    $(".card-title", node).textContent = title(a);
    const meta = [a.date, `-`, a.episodes_count ? `${a.episodes_count} ep` : null]
      .filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("");
    $(".card-meta", node).innerHTML = meta;
    if (opts.progress != null && opts.progress > 0) {
      const bar = el("div", "card-progress", `<i style="width:${Math.min(100, opts.progress)}%"></i>`);
      card.appendChild(bar);
    }
    return node;
  }

  /* ---------- skeleton ---------- */
  function skeletonGrid(n = 10) {
    const g = el("div", "grid");
    for (let i = 0; i < n; i++) {
      const w = el("div");
      w.appendChild(el("div", "skel skel-card"));
      w.appendChild(el("div", "skel skel-line"));
      w.appendChild(el("div", "skel skel-line short"));
      g.appendChild(w);
    }
    return g;
  }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = el("div", "toast"); document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  /* ---------- error block ---------- */
  function errorBlock(msg, retryFn) {
    const d = el("div", "empty");
    d.innerHTML = `<div class="empty-art">⚠️</div><h2>Qualcosa è andato storto</h2><p>${esc(msg)}</p>`;
    if (retryFn) {
      const b = el("button", "btn primary", "Riprova");
      b.setAttribute("data-focusable", "");
      b.onclick = retryFn;
      d.appendChild(b);
    }
    return d;
  }

  return { $, $$, el, clone, esc, fmtTime, title, poster, animeCard, skeletonGrid, toast, errorBlock };
})();
