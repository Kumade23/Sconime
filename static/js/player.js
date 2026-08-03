/* ============================================================
   Sconime — Player (HLS diretto da VixCloud, nessun proxy)
   ============================================================ */
window.SconimePlayer = (() => {
  const { $, $$, el, fmtTime, esc, toast } = UI;
  const Store = window.SconimeStore;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" fill="currentColor"/></svg>',
    volHi: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" fill="currentColor"/></svg>',
    volMute: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm18.4 2 2.1-2.1-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4z" fill="currentColor" transform="translate(-4 0) scale(0.9)"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" fill="currentColor"/></svg>',
    fullExit: '<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" fill="currentColor"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L14.9 3h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.4 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" fill="currentColor"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" fill="currentColor"/></svg>',
    speed: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6zm1 4v5l4 2-.8 1.6L11 14V8z" fill="currentColor"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" fill="currentColor"/></svg>',
    f10: '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" fill="currentColor"/></svg>',
    r10: '<svg viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z" fill="currentColor"/></svg>',
  };

  class Player {
    /**
     * @param {HTMLElement} container  elemento .player-wrap
     * @param {object} opts { anime, episode, episodes, master_url, onNavigate }
     */
    constructor(container, opts) {
      this.c = container;
      this.opts = opts;
      this.anime = opts.anime;
      this.episode = opts.episode;
      this.episodes = opts.episodes || [];
      this.hls = null;
      this.destroyed = false;
      this.retryCount = 0;
      this.maxRetry = 3;
      this.settings = Store.getSettings();
      this._uiTimer = null;
      this._saveTimer = null;
      this._build();
      this._load(opts.master_url);
      this._bind();
      this._applyRate();
    }

    /* ---------------- DOM ---------------- */
    _build() {
      const c = this.c;
      const ios = this._isIOS();
      c.classList.add("player-wrap", "paused", "show-ui");
      if (ios) c.classList.add("on-ios");
      c.tabIndex = 0;
      // Su iOS attiviamo i controlli nativi del <video>: garantiscono fullscreen
      // e tutti i comandi anche in verticale. La UI custom resta come overlay.
      const nativeControls = ios ? " controls" : "";
      c.innerHTML = `
        <video id="video" playsinline webkit-playsinline preload="auto"${nativeControls}></video>
        <div class="pc">
          <div class="pc-top">
            <button class="pc-btn" data-act="back" title="Indietro">${ICONS.back}</button>
            <div class="pc-ep-title">${esc(this.anime.title)} · Ep. ${esc(this.episode.number)}</div>
          </div>
          <div class="pc-bottom">
            <div class="seek">
              <div class="tip">0:00</div>
              <div class="track">
                <div class="buf"></div>
                <div class="played"></div>
                <div class="knob"></div>
              </div>
            </div>
            <div class="pc-row">
              <button class="pc-btn big" data-act="toggle" title="Play/Pausa (Spazio)">${ICONS.play}</button>
              <button class="pc-btn" data-act="prev" title="Episodio precedente">${ICONS.prev}</button>
              <button class="pc-btn" data-act="next" title="Episodio successivo">${ICONS.next}</button>
              <button class="pc-btn" data-act="rw" title="-10s (←)">${ICONS.f10}</button>
              <button class="pc-btn" data-act="ff" title="+10s (→)">${ICONS.r10}</button>
              <div class="vol">
                <button class="pc-btn" data-act="mute" title="Mute (M)">${ICONS.volHi}</button>
                <input type="range" class="vol-range" min="0" max="1" step="0.02" value="1">
              </div>
              <div class="pc-time"><span class="t-cur">0:00</span> / <span class="t-dur">0:00</span></div>
              <div class="pc-spacer"></div>
              <button class="pc-btn" data-act="speed" title="Velocità">${ICONS.speed}</button>
              <button class="pc-btn" data-act="quality" title="Qualità">${ICONS.gear}</button>
              <button class="pc-btn" data-act="fs" title="Fullscreen (F)">${ICONS.full}</button>
            </div>
          </div>
        </div>
        <div class="pc-center"></div>
        <div class="seek-hint left">−10s</div>
        <div class="seek-hint right">+10s</div>
      `;
      this.video = $("video", c);
      this.ui = {
        center: $(".pc-center", c),
        playBtn: $('[data-act="toggle"]', c),
        played: $(".played", c), buf: $(".buf", c), knob: $(".knob", c),
        seek: $(".seek", c), tip: $(".tip", c),
        cur: $(".t-cur", c), dur: $(".t-dur", c),
        volRange: $(".vol-range", c), muteBtn: $('[data-act="mute"]', c),
        fsBtn: $('[data-act="fs"]', c),
        hintL: $(".seek-hint.left", c), hintR: $(".seek-hint.right", c),
        nextBtn: $('[data-act="next"]', c), prevBtn: $('[data-act="prev"]', c),
      };
      this._updateNavButtons();
      this._centerSpinner();
    }

    _updateNavButtons() {
      const n = parseFloat(this.episode.number);
      const hasPrev = this.episodes.some(e => parseFloat(e.number) === n - 1);
      const hasNext = this.episodes.some(e => parseFloat(e.number) === n + 1);
      this.ui.prevBtn.style.display = hasPrev ? "" : "none";
      this.ui.nextBtn.style.display = hasNext ? "" : "none";
    }

    /* ---------------- caricamento HLS ---------------- */
    _load(url) {
      const v = this.video;
      this._destroyHls();
      if (window.Hls && Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30, maxMaxBufferLength: 120,
          startLevel: this._startLevel(),
          capLevelToPlayerSize: false,
        });
        this.hls = hls;
        hls.loadSource(url);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => this._onReady());
        hls.on(Hls.Events.LEVEL_SWITCHED, () => this._markQualityMenu());
        hls.on(Hls.Events.ERROR, (_, data) => this._onHlsError(data));
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari / iOS
        v.src = url;
        v.addEventListener("loadedmetadata", () => this._onReady(), { once: true });
        v.addEventListener("error", () => this._onFatal(), { once: true });
      } else {
        this._centerError("Il tuo browser non supporta HLS.");
      }
    }

    _startLevel() {
      const q = this.settings.quality;
      return q === "auto" ? -1 : -1; // partiamo auto, poi forziamo in _onReady
    }

    _onReady() {
      if (this.destroyed) return;
      this.retryCount = 0;
      this._centerClear();
      // forza qualità preferita se impostata
      if (this.hls && this.settings.quality !== "auto") {
        const h = parseInt(this.settings.quality, 10);
        const levels = this.hls.levels || [];
        let best = -1;
        levels.forEach((l, i) => { if (Math.abs(l.height - h) < 40) best = i; });
        if (best === -1) levels.forEach((l, i) => { if (l.height <= h) best = i; });
        if (best >= 0) { this.hls.currentLevel = best; this._manualLevel = best; }
      }
      // resume
      const prog = Store.getProgress(this.anime.id, this.episode.id);
      if (this.settings.resume && prog && prog.position > 8 &&
          prog.position < (this.video.duration || Infinity) - 30) {
        this.video.currentTime = prog.position;
        toast(`Ripreso da ${fmtTime(prog.position)}`);
      }
      this._play();
      this._startAutosave();
    }

    _play() {
      const p = this.video.play();
      if (p && p.catch) p.catch(() => { this._centerBigPlay(); });
    }

    /* ---------------- errori & retry ---------------- */
    _onHlsError(data) {
      if (this.destroyed || !data.fatal) return;
      const { type } = data;
      if (type === Hls.ErrorTypes.NETWORK_ERROR) {
        this._attemptRecover("Errore di rete, riconnessione…");
        this.hls.startLoad();
      } else if (type === Hls.ErrorTypes.MEDIA_ERROR) {
        this._attemptRecover("Errore media, recupero…");
        this.hls.recoverMediaError();
      } else {
        this._onFatal();
      }
    }

    _attemptRecover(msg) {
      this.retryCount++;
      if (this.retryCount <= this.maxRetry) {
        toast(`${msg} (${this.retryCount}/${this.maxRetry})`);
        this._centerSpinner();
      } else {
        this._onFatal();
      }
    }

    _onFatal() {
      if (this.destroyed) return;
      this._centerError("Lo stream non è disponibile o è scaduto.", () => {
        // retry: ricarica la sorgente (il token potrebbe essere scaduto → ricarica pagina stream)
        if (this.opts.onRetrySource) this.opts.onRetrySource();
      });
    }

    _centerSpinner() { this.ui.center.innerHTML = '<div class="spinner"></div>'; }
    _centerBigPlay() {
      this.ui.center.innerHTML = `<button class="bigplay" data-focusable>${ICONS.play}</button>`;
      $(".bigplay", this.ui.center).onclick = () => { this._play(); };
    }
    _centerError(msg, retryFn) {
      this.ui.center.innerHTML = `
        <div class="stream-err">
          <h3>⚠️ Errore stream</h3><p>${esc(msg)}</p>
          <button class="btn primary" data-focusable>Riprova</button>
        </div>`;
      $(".btn", this.ui.center).onclick = retryFn || (() => location.reload());
    }
    _centerClear() { this.ui.center.innerHTML = ""; }

    /* ---------------- binding eventi ---------------- */
    _bind() {
      const c = this.c, v = this.video, ui = this.ui;

      // play/pause UI state
      v.addEventListener("play", () => { c.classList.remove("paused"); ui.playBtn.innerHTML = ICONS.pause; this._scheduleHide(); });
      v.addEventListener("pause", () => { c.classList.add("paused"); ui.playBtn.innerHTML = ICONS.play; this._showUI(); });
      v.addEventListener("waiting", () => this._centerSpinner());
      v.addEventListener("playing", () => this._centerClear());
      v.addEventListener("timeupdate", () => this._onTime());
      v.addEventListener("progress", () => this._onBuf());
      v.addEventListener("durationchange", () => { ui.dur.textContent = fmtTime(v.duration); });
      v.addEventListener("ended", () => this._onEnded());
      v.addEventListener("volumechange", () => this._onVol());

      // click su video = toggle SOLO se non si è cliccato su un controllo
      v.addEventListener("click", (e) => { this.toggle(); });

      // controlli (delegation sul container)
      c.addEventListener("click", (e) => {
        const b = e.target.closest("[data-act]");
        if (!b) return;
        e.stopPropagation();
        this._action(b.dataset.act, b);
      });

      // seek: click + drag
      this._seekBind();

      // volume slider
      ui.volRange.addEventListener("input", () => { v.volume = +ui.volRange.value; v.muted = +ui.volRange.value === 0; });

      // mostra/nascondi UI
      c.addEventListener("mousemove", () => this._wake());
      c.addEventListener("touchstart", () => this._wake(), { passive: true });
      c.addEventListener("mouseleave", () => this._scheduleHide());

      // doppio tap / doppio click per seek ±10 su mobile
      this._doubleTapBind();

      // tastiera
      this._keyHandler = (e) => this._onKey(e);
      document.addEventListener("keydown", this._keyHandler);

      // fullscreen change
      this._fsHandler = () => this._onFsChange();
      document.addEventListener("fullscreenchange", this._fsHandler);
      document.addEventListener("webkitfullscreenchange", this._fsHandler);
      // iOS native fullscreen sul <video>
      this._iosFsIn = () => this._onIosFs(true);
      this._iosFsOut = () => this._onIosFs(false);
      v.addEventListener("webkitbeginfullscreen", this._iosFsIn);
      v.addEventListener("webkitendfullscreen", this._iosFsOut);
    }

    _action(act, btn) {
      switch (act) {
        case "toggle": this.toggle(); break;
        case "prev": this._goEpisode(-1); break;
        case "next": this._goEpisode(1); break;
        case "rw": this.seekBy(-10); this._flashHint("left"); break;
        case "ff": this.seekBy(10); this._flashHint("right"); break;
        case "mute": this.video.muted = !this.video.muted; break;
        case "fs": this.toggleFullscreen(); break;
        case "back": history.back(); break;
        case "quality": this._toggleMenu("quality", btn); break;
        case "speed": this._toggleMenu("speed", btn); break;
      }
    }

    toggle() { this.video.paused ? this._play() : this.video.pause(); }
    seekBy(s) { this.video.currentTime = Math.max(0, Math.min((this.video.duration || 0), this.video.currentTime + s)); }

    /* ---------------- seekbar ---------------- */
    _seekBind() {
      const seek = this.ui.seek, v = this.video;
      let dragging = false;
      const posToTime = (clientX) => {
        const r = $(".track", seek).getBoundingClientRect();
        const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
        return p * (v.duration || 0);
      };
      const render = (t) => {
        const d = v.duration || 0;
        const p = d ? (t / d) * 100 : 0;
        this.ui.played.style.width = p + "%";
        this.ui.knob.style.left = p + "%";
        this.ui.cur.textContent = fmtTime(t);
      };
      const down = (e) => { dragging = true; this.c.classList.add("seeking"); move(e); };
      const move = (e) => {
        if (!dragging) return;
        const x = e.touches ? e.touches[0].clientX : e.clientX;
        render(posToTime(x));
      };
      const up = (e) => {
        if (!dragging) return;
        dragging = false; this.c.classList.remove("seeking");
        const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
        v.currentTime = posToTime(x);
      };
      seek.addEventListener("mousedown", down);
      seek.addEventListener("touchstart", down, { passive: true });
      window.addEventListener("mousemove", move);
      window.addEventListener("touchmove", move, { passive: true });
      window.addEventListener("mouseup", up);
      window.addEventListener("touchend", up);
      // tooltip hover
      seek.addEventListener("mousemove", (e) => {
        const t = posToTime(e.clientX);
        this.ui.tip.textContent = fmtTime(t);
        const r = seek.getBoundingClientRect();
        this.ui.tip.style.left = Math.max(20, Math.min(r.width - 20, e.clientX - r.left)) + "px";
      });
    }

    /* ---------------- doppio tap seek (mobile) ---------------- */
    _doubleTapBind() {
      const v = this.video;
      let lastTap = 0, lastX = 0;
      v.addEventListener("touchend", (e) => {
        const now = Date.now();
        const x = e.changedTouches[0].clientX;
        if (now - lastTap < 320 && Math.abs(x - lastX) < 60) {
          const half = this.c.getBoundingClientRect().width / 2;
          const rect = this.c.getBoundingClientRect();
          if (x - rect.left < half) { this.seekBy(-10); this._flashHint("left"); }
          else { this.seekBy(10); this._flashHint("right"); }
          lastTap = 0;
          e.preventDefault();
        } else {
          lastTap = now; lastX = x;
        }
      });
      // doppio click desktop
      v.addEventListener("dblclick", (e) => {
        const rect = this.c.getBoundingClientRect();
        if (e.clientX - rect.left < rect.width / 2) { this.seekBy(-10); this._flashHint("left"); }
        else { this.seekBy(10); this._flashHint("right"); }
      });
    }

    _flashHint(side) {
      const h = side === "left" ? this.ui.hintL : this.ui.hintR;
      h.classList.add("show");
      clearTimeout(h._t);
      h._t = setTimeout(() => h.classList.remove("show"), 500);
    }

    /* ---------------- UI show/hide ---------------- */
    _wake() { this._showUI(); this._scheduleHide(); }
    _showUI() { this.c.classList.add("show-ui"); }
    _scheduleHide() {
      clearTimeout(this._uiTimer);
      if (this.video.paused) return;
      this._uiTimer = setTimeout(() => this.c.classList.remove("show-ui"), 2800);
    }

    /* ---------------- progresso / buffer ---------------- */
    _onTime() {
      const v = this.video, d = v.duration || 0;
      const p = d ? (v.currentTime / d) * 100 : 0;
      if (!this.c.classList.contains("seeking")) {
        this.ui.played.style.width = p + "%";
        this.ui.knob.style.left = p + "%";
      }
      this.ui.cur.textContent = fmtTime(v.currentTime);
    }
    _onBuf() {
      const v = this.video;
      try {
        if (v.buffered.length && v.duration) {
          const end = v.buffered.end(v.buffered.length - 1);
          this.ui.buf.style.width = (end / v.duration) * 100 + "%";
        }
      } catch {}
    }

    _onVol() {
      const v = this.video;
      this.ui.muteBtn.innerHTML = (v.muted || v.volume === 0) ? ICONS.volMute : ICONS.volHi;
      this.ui.volRange.value = v.muted ? 0 : v.volume;
    }

    _onEnded() {
      if (this.settings.autoplayNext && this.ui.nextBtn.style.display !== "none") {
        toast("Episodio successivo…");
        this._goEpisode(1);
      }
    }

    /* ---------------- autosave progresso ---------------- */
    _startAutosave() {
      clearInterval(this._saveTimer);
      this._saveTimer = setInterval(() => this._save(), 4000);
    }
    _save() {
      const v = this.video;
      if (!v.duration) return;
      Store.saveProgress({
        anime_id: this.anime.id, slug: this.anime.slug, title: this.anime.title,
        imageurl: this.anime.imageurl || this.anime.cover,
        ep_id: this.episode.id, ep_number: this.episode.number,
        position: Math.floor(v.currentTime), duration: Math.floor(v.duration),
      });
    }

    /* ---------------- menu qualità / velocità / episodi ---------------- */
    _closeMenus() {
      $$(".pc-menu", this.c).forEach(m => m.remove());
      if (this._menuCloser) {
        document.removeEventListener("click", this._menuCloser, true);
        this._menuCloser = null;
      }
    }

    _toggleMenu(kind, btn) {
      const wasOpen = !!$(`.pc-menu[data-kind="${kind}"]`, this.c);
      this._closeMenus();
      if (wasOpen) return;                  // era aperto -> chiudi (toggle)
      const menu = el("div", "pc-menu");
      menu.dataset.kind = kind;
      if (kind === "quality") this._fillQuality(menu);
      if (kind === "speed") this._fillSpeed(menu);
      this.c.appendChild(menu);
      // Chiudi sul click FUORI dal menu/bottone. Uso capture + flag per ignorare
      // il click di apertura (che arriva dopo, stesso evento): lo marco subito.
      const self = this;
      this._menuCloser = function (e) {
        if (e.target.closest(".pc-menu") || e.target.closest('[data-act="' + kind + '"]')) return;
        self._closeMenus();
      };
      // registro DOPO che il click corrente e' stato gestito (macrotask)
      setTimeout(() => {
        if (self._menuCloser) document.addEventListener("click", self._menuCloser, true);
      }, 0);
    }

    _fillQuality(menu) {
      menu.innerHTML = "<h4>Qualità</h4>";
      const levels = this.hls ? this.hls.levels : null;
      if (!levels || !levels.length) {
        menu.appendChild(el("div", "mi", "Auto (nativa)"));
        return;
      }
      const mk = (label, idx, sel) => {
        const b = el("button", "mi" + (sel ? " sel" : ""), `${label}<span class="dot">${sel ? "●" : ""}</span>`);
        b.onclick = () => {
          this.hls.currentLevel = idx;         // -1 = auto
          this._manualLevel = idx;
          Store.setSetting("quality", idx === -1 ? "auto" : String(this.hls.levels[idx].height));
          this._closeMenus();
          toast(idx === -1 ? "Qualità: Auto" : `Qualità: ${label}`);
        };
        menu.appendChild(b);
      };
      const curAuto = this.hls.currentLevel === -1 || this.hls.autoLevelEnabled;
      mk("Auto", -1, curAuto);
      [...levels].map((l, i) => ({ l, i }))
        .sort((a, b) => b.l.height - a.l.height)
        .forEach(({ l, i }) => mk(`${l.height}p`, i, !curAuto && this.hls.currentLevel === i));
    }

    _markQualityMenu() { /* la selezione viene ricalcolata ad ogni apertura */ }

    _fillSpeed(menu) {
      menu.innerHTML = "<h4>Velocità</h4>";
      [0.5, 0.75, 1, 1.25, 1.5, 2].forEach(r => {
        const sel = this.video.playbackRate === r;
        const b = el("button", "mi" + (sel ? " sel" : ""), `${r}×<span class="dot">${sel ? "●" : ""}</span>`);
        b.onclick = () => {
          this.video.playbackRate = r;
          Store.setSetting("rate", r);
          this._closeMenus(); toast(`Velocità ${r}×`);
        };
        menu.appendChild(b);
      });
    }

    /* ---------------- navigazione episodi ---------------- */
    _goEpisode(dir) {
      const n = parseFloat(this.episode.number) + dir;
      const target = this.episodes.find(e => parseFloat(e.number) === n) ||
                     this.episodes.find(e => parseFloat(e.number) > this.episode.number && dir > 0) ||
                     this.episodes.find(e => parseFloat(e.number) < this.episode.number && dir < 0);
      if (target) this._goToEpisode(target);
      else toast(dir > 0 ? "Nessun episodio successivo" : "Nessun episodio precedente");
    }
    _goToEpisode(ep) {
      this._save();
      if (this.opts.onNavigate) this.opts.onNavigate(this.anime, ep);
    }

    /* ---------------- fullscreen ---------------- */
    _isIOS() {
      return /iP(hone|ad|od)/.test(navigator.platform) ||
             (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    }
    _fsActive() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement ||
                this.video.webkitDisplayingFullscreen);
    }
    toggleFullscreen() {
      const v = this.video, c = this.c;
      // iOS Safari: fullscreen SOLO nativo sul <video>.
      // Deve essere chiamato da un gesto utente (lo è: click sul bottone).
      if (this._isIOS()) {
        try {
          if (v.webkitDisplayingFullscreen) {
            v.webkitExitFullscreen && v.webkitExitFullscreen();
          } else if (v.webkitSupportsFullscreen !== false && v.webkitEnterFullscreen) {
            v.webkitEnterFullscreen();
          } else if (v.requestFullscreen) {
            v.requestFullscreen();
          }
        } catch (e) { toast("Fullscreen non disponibile"); }
        return;
      }
      if (this._fsActive()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const req = c.requestFullscreen || c.webkitRequestFullscreen || v.requestFullscreen || v.webkitRequestFullscreen;
        if (req) req.call(req === v.requestFullscreen || req === v.webkitRequestFullscreen ? v : c);
      }
    }
    _onFsChange() {
      const fs = this._fsActive();
      this.c.classList.toggle("fs", fs);
      this.ui.fsBtn.innerHTML = fs ? ICONS.fullExit : ICONS.full;
    }
    _onIosFs(enter) {
      // in fullscreen nativo iOS uso i controlli di sistema: nascondo la mia UI
      this.c.classList.toggle("ios-native-fs", enter);
      this.c.classList.toggle("fs", enter);
      this.ui.fsBtn.innerHTML = enter ? ICONS.fullExit : ICONS.full;
    }

    /* ---------------- tastiera ---------------- */
    _onKey(e) {
      if (this.destroyed) return;
      // ignora se focus su input
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      const v = this.video;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); this.toggle(); break;
        case "ArrowLeft": this.seekBy(-10); this._flashHint("left"); this._wake(); break;
        case "ArrowRight": this.seekBy(10); this._flashHint("right"); this._wake(); break;
        case "ArrowUp": e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); this._wake(); break;
        case "ArrowDown": e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); this._wake(); break;
        case "f": this.toggleFullscreen(); break;
        case "m": v.muted = !v.muted; break;
        case "n": this._goEpisode(1); break;
        case "p": this._goEpisode(-1); break;
        case "j": this.seekBy(-10); break;
        case "l": this.seekBy(10); break;
        case "0": case "Home": v.currentTime = 0; break;
      }
    }

    _applyRate() {
      if (this.settings.rate && this.settings.rate !== 1) this.video.playbackRate = this.settings.rate;
    }

    _destroyHls() { if (this.hls) { try { this.hls.destroy(); } catch {} this.hls = null; } }

    destroy() {
      this.destroyed = true;
      this._save();
      clearInterval(this._saveTimer);
      clearTimeout(this._uiTimer);
      this._destroyHls();
      document.removeEventListener("keydown", this._keyHandler);
      document.removeEventListener("fullscreenchange", this._fsHandler);
      document.removeEventListener("webkitfullscreenchange", this._fsHandler);
      this.video.removeEventListener("webkitbeginfullscreen", this._iosFsIn);
      this.video.removeEventListener("webkitendfullscreen", this._iosFsOut);
      if (this._fsActive()) { try { (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document); } catch {} }
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
    }
  }

  return { Player };
})();
