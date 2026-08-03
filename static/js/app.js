/* ============================================================
   Sconime — app: router SPA + viste
   ============================================================ */
(() => {
  const { $, $$, el, clone, esc, title, poster, animeCard, skeletonGrid, toast, errorBlock } = UI;
  const API = window.SconimeAPI;
  const Store = window.SconimeStore;

  const view = $("#view");
  let currentPlayer = null;

  /* ---------------- helpers ---------------- */
  const render = (tplId) => {
    destroyPlayer();
    view.innerHTML = "";
    view.appendChild(clone(tplId));
    window.scrollTo({ top: 0 });
  };

  const destroyPlayer = () => {
    if (currentPlayer) { currentPlayer.destroy(); currentPlayer = null; }
  };

  const setActiveNav = (route) => {
    $$(".nav-links a").forEach(a => a.classList.toggle("active", a.dataset.route === route));
  };

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ============================================================
     HOME
     ============================================================ */
  function renderHome() {
    setActiveNav("home");
    render("tpl-home");
    const input = $("#searchInput");
    const box = $(".search-box");
    const results = $("#searchResults");
    const clearBtn = $("#clearSearch");

    input.focus({ preventScroll: true });

    const doSearch = debounce(async (q) => {
      if (!q) { results.innerHTML = ""; return; }
      results.innerHTML = "";
      results.appendChild(skeletonGrid(8));
      try {
        const data = await API.search(q);
        if (input.value.trim() !== q) return; // query cambiata nel frattempo
        results.innerHTML = "";
        if (!data.records.length) {
          results.appendChild(empty(`Nessun risultato per “${q}”.`, "Prova con un altro titolo."));
          return;
        }
        const label = el("div", "section-label", `Risultati · ${data.records.length}`);
        const grid = el("div", "grid");
        data.records.forEach(a => grid.appendChild(animeCard(a)));
        results.appendChild(label);
        results.appendChild(grid);
        TV.refocus();
      } catch (e) {
        results.innerHTML = "";
        results.appendChild(errorBlock(e.message, () => doSearch(q)));
      }
    }, 280);

    input.addEventListener("input", () => {
      const q = input.value.trim();
      box.classList.toggle("has-text", !!q);
      doSearch(q);
    });
    clearBtn.addEventListener("click", () => { input.value = ""; box.classList.remove("has-text"); results.innerHTML = ""; input.focus(); });
  }

  const empty = (t, s) => {
    const d = el("div", "empty");
    d.innerHTML = `<div class="empty-art">🔍</div><h2>${esc(t)}</h2><p>${esc(s || "")}</p>`;
    return d;
  };

  /* ============================================================
     DETTAGLIO ANIME
     ============================================================ */
  async function renderAnime(id, slug) {
    setActiveNav("");
    render("tpl-anime");
    const root = $("#detailRoot");
    root.appendChild(skeletonGrid(1));
    try {
      const data = await API.anime(id, slug);
      root.innerHTML = "";
      root.appendChild(buildDetail(data.anime, data.episodes));
      TV.refocus();
    } catch (e) {
      root.innerHTML = "";
      root.appendChild(errorBlock(e.message, () => renderAnime(id, slug)));
    }
  }

  function buildDetail(anime, episodes) {
    const wrap = el("div");
    const banner = anime.imageurl_cover || anime.cover || anime.imageurl;
    const isFav = Store.isFav(anime.id);
    const score = anime.score ? `<span class="tag score-tag">★ ${esc(anime.score)}</span>` : "";

    const firstEp = episodes[0];

    wrap.innerHTML = `
      <div class="detail-hero">
        <div class="detail-banner" style="background-image:url('${esc(banner)}')"></div>
        <div class="detail-inner">
          <div class="detail-poster"><img referrerpolicy="no-referrer" src="${esc(poster(anime))}" alt="${esc(title(anime))}"></div>
          <div class="detail-info">
            <h1 class="detail-title">${esc(title(anime))}</h1>
            <div class="detail-tags">${score}</div>
            <p class="detail-plot">${esc(anime.plot || "")}</p>
            <div class="detail-actions">
              ${firstEp ? `<button class="btn primary" id="playBtn" data-focusable>▶ Guarda Ep. ${esc(firstEp.number)}</button>` : ""}
              <button class="btn ghost ${isFav ? "active-fav" : ""}" id="favBtn" data-focusable>
                ${isFav ? "♥ Nei preferiti" : "♡ Aggiungi ai preferiti"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <h2 class="section-title">Episodi · ${episodes.length}</h2>
      <div id="epSection"></div>
      ${anime.related && anime.related.length ? `<h2 class="section-title">Correlati</h2><div class="rel-row" id="relRow"></div>` : ""}
    `;

    // episodi paginati
    mountEpisodes($("#epSection", wrap), anime, episodes);

    // correlati
    const rel = $("#relRow", wrap);
    if (rel) anime.related.forEach(r => rel.appendChild(animeCard(r)));

    // azioni
    const playBtn = $("#playBtn", wrap);
    if (playBtn && firstEp) playBtn.onclick = () => { location.hash = `#/watch/${anime.id}/${anime.slug}/${firstEp.id}`; };
    $("#favBtn", wrap).onclick = (e) => {
      Store.toggleFav(anime);
      const nowFav = Store.isFav(anime.id);
      e.currentTarget.classList.toggle("active-fav", nowFav);
      e.currentTarget.innerHTML = nowFav ? "♥ Nei preferiti" : "♡ Aggiungi ai preferiti";
      toast(nowFav ? "Aggiunto ai preferiti" : "Rimosso dai preferiti");
    };

    return wrap;
  }

  /* ---- griglia episodi con paginazione configurabile ---- */
  function mountEpisodes(container, anime, episodes) {
    const perPage = Math.max(1, parseInt(Store.getSettings().epPerPage, 10) || 20);
    const hist = Store.getHistory();
    let page = 0;
    const pages = Math.max(1, Math.ceil(episodes.length / perPage));

    const render = () => {
      container.innerHTML = "";
      const grid = el("div", "ep-grid");
      const start = page * perPage;
      const slice = episodes.slice(start, start + perPage);
      slice.forEach(ep => {
        const h = hist.find(x => x.ep_id === ep.id);
        const pct = h && h.duration ? Math.min(100, (h.position / h.duration) * 100) : 0;
        const watched = pct > 92;
        const b = el("a", "ep" + (watched ? " watched" : ""));
        b.href = `#/watch/${anime.id}/${anime.slug}/${ep.id}`;
        b.setAttribute("data-focusable", "");
        b.innerHTML = `
          <div class="num">${esc(ep.number)}</div>
          ${pct > 0 && !watched ? `<div class="ep-bar" style="width:${pct}%"></div>` : ""}
        `;
        grid.appendChild(b);
      });
      container.appendChild(grid);

      if (pages > 1) {
        container.appendChild(buildPager(page, pages, perPage, episodes.length, (p) => {
          page = p; render();
          container.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }));
      }
      TV.refocus();
    };
    render();
  }

  function buildPager(page, pages, perPage, total, onGo) {
    const pager = el("div", "ep-pager");
    const from = page * perPage + 1;
    const to = Math.min(total, (page + 1) * perPage);

    const mkBtn = (label, p, disabled, cls) => {
      const b = el("button", "pg-btn" + (cls ? " " + cls : ""), label);
      b.disabled = !!disabled;
      b.setAttribute("data-focusable", "");
      b.onclick = () => onGo(p);
      return b;
    };

    // prima / prec
    pager.appendChild(mkBtn("«", 0, page === 0, "icon"));
    pager.appendChild(mkBtn("‹", page - 1, page === 0, "icon"));

    // indicatore centrale: pagina corrente + salto diretto
    const mid = el("div", "pg-jump");
    const label = el("span", "pg-info", `${from}–${to} di ${total}`);
    const jumpWrap = el("span", "pg-jump-ctrl");
    const input = el("input", "pg-input");
    input.type = "number"; input.min = 1; input.max = pages; input.value = page + 1;
    input.setAttribute("data-focusable", "");
    const ofTotal = el("span", "pg-of", `/ ${pages}`);
    const go = () => {
      let p = parseInt(input.value, 10);
      if (isNaN(p)) { input.value = page + 1; return; }
      p = Math.max(1, Math.min(pages, p)) - 1;
      if (p !== page) onGo(p); else input.value = page + 1;
    };
    input.addEventListener("change", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); input.blur(); } });
    jumpWrap.appendChild(input);
    jumpWrap.appendChild(ofTotal);
    mid.appendChild(label);
    mid.appendChild(jumpWrap);
    pager.appendChild(mid);

    // succ / ultima
    pager.appendChild(mkBtn("›", page + 1, page >= pages - 1, "icon"));
    pager.appendChild(mkBtn("»", pages - 1, page >= pages - 1, "icon"));
    return pager;
  }

  const cleanEpName = (fn) => {
    if (!fn) return "";
    let s = fn.replace(/\.(mkv|mp4|avi)$/i, "");
    s = s.replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
    return s.length > 46 ? s.slice(0, 46) + "…" : s;
  };

  /* ============================================================
     WATCH / PLAYER
     ============================================================ */
  async function renderWatch(animeId, slug, epId) {
    setActiveNav("");
    render("tpl-watch");
    const root = $("#watchRoot");
    root.appendChild(el("div", "skel", "")).style.height = "50vh";
    try {
      const data = await API.stream(animeId, slug, epId);
      root.innerHTML = "";
      mountWatch(root, data);
      TV.refocus();
    } catch (e) {
      root.innerHTML = "";
      root.appendChild(errorBlock(e.message, () => renderWatch(animeId, slug, epId)));
    }
  }

  function mountWatch(root, data) {
    const { anime, episode, episodes, master_url } = data;

    const head = el("div", "watch-head");
    head.innerHTML = `
      <a class="btn icon-only" href="#/anime/${anime.id}/${anime.slug}" data-focusable title="Torna all'anime">
        <svg viewBox="0 0 24 24" class="ic"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" fill="currentColor"/></svg>
      </a>
      <h1 class="watch-title">Episodio ${esc(episode.number)}</h1>
    `;
    root.appendChild(head);

    const shell = el("div", "player-shell");
    root.appendChild(shell);

    destroyPlayer();
    currentPlayer = new window.SconimePlayer.Player(shell, {
      anime, episode, episodes, master_url,
      onNavigate: (an, ep) => { location.hash = `#/watch/${an.id}/${an.slug}/${ep.id}`; },
      onRetrySource: () => { renderWatch(anime.id, anime.slug, episode.id); },
    });

    // elenco episodi sotto (paginato, centrato sull'episodio corrente)
    const sec = el("div", "watch-eps");
    sec.innerHTML = `<h2 class="section-title">Episodi</h2>`;
    const epHolder = el("div");
    sec.appendChild(epHolder);
    root.appendChild(sec);
    mountEpisodesWatch(epHolder, anime, episodes, episode);
  }

  /* episodi sotto il player: paginazione che si apre sulla pagina dell'ep corrente */
  function mountEpisodesWatch(container, anime, episodes, currentEp) {
    const perPage = Math.max(1, parseInt(Store.getSettings().epPerPage, 10) || 20);
    const hist = Store.getHistory();
    const curIdx = Math.max(0, episodes.findIndex(e => e.id === currentEp.id));
    let page = Math.floor(curIdx / perPage);
    const pages = Math.max(1, Math.ceil(episodes.length / perPage));

    const render = () => {
      container.innerHTML = "";
      const grid = el("div", "ep-grid");
      const start = page * perPage;
      episodes.slice(start, start + perPage).forEach(ep => {
        const h = hist.find(x => x.ep_id === ep.id);
        const pct = h && h.duration ? Math.min(100, (h.position / h.duration) * 100) : 0;
        const isCur = ep.id === currentEp.id;
        const b = el("a", "ep" + (isCur ? " watched" : ""));
        b.href = `#/watch/${anime.id}/${anime.slug}/${ep.id}`;
        b.setAttribute("data-focusable", "");
        b.innerHTML = `
          <div class="num">${esc(ep.number)}</div>
          ${pct > 0 && !isCur ? `<div class="ep-bar" style="width:${pct}%"></div>` : ""}
        `;
        grid.appendChild(b);
      });
      container.appendChild(grid);
      if (pages > 1) {
        container.appendChild(buildPager(page, pages, perPage, episodes.length, (p) => { page = p; render(); }));
      }
      TV.refocus();
    };
    render();
  }

  /* ============================================================
     PREFERITI
     ============================================================ */
  function renderFavorites() {
    setActiveNav("favorites");
    render("tpl-list");
    $("#listTitle").textContent = "Preferiti";
    const favs = Store.getFavs();
    const grid = $("#listGrid");
    if (!favs.length) {
      $("#listEmpty").hidden = false;
      $("#listEmptyTitle").textContent = "Nessun preferito";
      $("#listEmptyText").textContent = "Aggiungi anime ai preferiti dalla pagina di dettaglio.";
      return;
    }
    favs.forEach(a => grid.appendChild(animeCard(a)));
    TV.refocus();
  }

  /* ============================================================
     CONTINUA A GUARDARE
     ============================================================ */
function renderContinue() {
  setActiveNav("continue");
  render("tpl-list");
  $("#listTitle").textContent = "Continua a guardare";
  const list = Store.continueList();
  const grid = $("#listGrid");
  if (!list.length) {
    $("#listEmpty").hidden = false;
    $("#listEmptyTitle").textContent = "Niente da riprendere";
    $("#listEmptyText").textContent = "Quando guardi un episodio, lo ritrovi qui per riprendere da dove eri rimasto.";
    return;
  }
  list.forEach(h => {
    const pct = h.duration ? (h.position / h.duration) * 100 : 0;
    const card = animeCard(
      { id: h.anime_id, slug: h.slug, title: h.title, imageurl: h.imageurl },
      { progress: pct }
    );
    $("a", card).href = `#/watch/${h.anime_id}/${h.slug}/${h.ep_id}`;
    const badges = $(".card-badges", card);
    badges.innerHTML = `<span class="badge">Ep. ${esc(h.ep_number)} · ${Math.round(pct)}%</span>`;
    grid.appendChild(card);
  });
  TV.refocus();
}

  /* ============================================================
     IMPOSTAZIONI
     ============================================================ */
  function renderSettings() {
    setActiveNav("settings");
    render("tpl-settings");
    const s = Store.getSettings();

    const setSwitch = (id, val) => { $(id).setAttribute("aria-checked", String(!!val)); };
    setSwitch("#setAutoplay", s.autoplayNext);
    setSwitch("#setResume", s.resume);
    setSwitch("#setTheme", s.theme === "dark");
    $("#setRate").value = String(s.rate);
    $("#setQuality").value = String(s.quality);
    $("#setEpPerPage").value = String(s.epPerPage || 20);

    const flip = (id, key, map) => {
      $(id).onclick = () => {
        const cur = $(id).getAttribute("aria-checked") === "true";
        const next = !cur;
        $(id).setAttribute("aria-checked", String(next));
        Store.setSetting(key, map ? map(next) : next);
      };
    };
    flip("#setAutoplay", "autoplayNext");
    flip("#setResume", "resume");
    flip("#setTheme", "theme", (on) => { const t = on ? "dark" : "light"; applyTheme(t); return t; });

    $("#setRate").onchange = (e) => Store.setSetting("rate", parseFloat(e.target.value));
    $("#setQuality").onchange = (e) => Store.setSetting("quality", e.target.value);
    $("#setEpPerPage").onchange = (e) => { Store.setSetting("epPerPage", parseInt(e.target.value, 10)); toast("Impostazione salvata"); };

    // statistiche e pulizia
    $("#statHistory").textContent = `${Store.getHistory().length} elementi`;
    $("#statFav").textContent = `${Store.getFavs().length} elementi`;
    $("#clearHistory").onclick = () => { Store.clearHistory(); $("#statHistory").textContent = "0 elementi"; toast("Cronologia svuotata"); };
    $("#clearFav").onclick = () => { Store.clearFavs(); $("#statFav").textContent = "0 elementi"; toast("Preferiti svuotati"); };
    TV.refocus();
  }

  /* ============================================================
     TEMA
     ============================================================ */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $("#themeToggle").innerHTML = t === "dark"
      ? '<svg viewBox="0 0 24 24" class="ic"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5 2 3h-4zM2 12l3-2v4zm20 0-3 2v-4zM12 22l-2-3h4z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" class="ic"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" fill="currentColor"/></svg>';
  }

  /* ============================================================
     ROUTER
     ============================================================ */
  function route() {
    const h = location.hash || "#/";
    const parts = h.replace(/^#\//, "").split("/").filter(Boolean);

    if (parts[0] === "anime" && parts[1] && parts[2]) return renderAnime(parts[1], parts[2]);
    if (parts[0] === "watch" && parts[1] && parts[2] && parts[3]) return renderWatch(parts[1], parts[2], parts[3]);
    if (parts[0] === "favorites") return renderFavorites();
    if (parts[0] === "continue") return renderContinue();
    if (parts[0] === "settings") return renderSettings();
    return renderHome();
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    const s = Store.getSettings();
    applyTheme(s.theme);
    $("#themeToggle").onclick = () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next); Store.setSetting("theme", next);
    };
    TV.init();
    window.addEventListener("hashchange", route);
    route();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
