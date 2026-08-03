/* Sconime — store: persistenza locale (preferiti, cronologia, impostazioni) */
window.SconimeStore = (() => {
  const K = { fav: "sc_favs", hist: "sc_history", set: "sc_settings" };

  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------- impostazioni ---------- */
  const defaults = { autoplayNext: true, resume: true, rate: 1, quality: "auto", theme: "dark", epPerPage: 20 };
  const getSettings = () => ({ ...defaults, ...read(K.set, {}) });
  const setSetting = (key, val) => { const s = getSettings(); s[key] = val; write(K.set, s); return s; };

  /* ---------- preferiti ---------- */
  const getFavs = () => read(K.fav, []);
  const isFav = (id) => getFavs().some(a => a.id === id);
  const toggleFav = (anime) => {
    let f = getFavs();
    if (f.some(a => a.id === anime.id)) { f = f.filter(a => a.id !== anime.id); }
    else {
      f.unshift({
        id: anime.id, slug: anime.slug, title: anime.title || anime.title,
        imageurl: anime.imageurl, type: anime.type, date: anime.date,
        score: anime.score, dub: anime.dub, episodes_count: anime.episodes_count,
      });
    }
    write(K.fav, f); return f;
  };

  /* ---------- cronologia / progresso ---------- */
  const getHistory = () => read(K.hist, []);
  // entry: {anime_id, slug, title, imageurl, ep_id, ep_number, position, duration, updated}
  const saveProgress = (entry) => {
    let h = getHistory().filter(x => !(x.anime_id === entry.anime_id && x.ep_id === entry.ep_id));
    h.unshift({ ...entry, updated: Date.now() });
    h = h.slice(0, 200);
    write(K.hist, h);
  };
  const getProgress = (animeId, epId) =>
    getHistory().find(x => x.anime_id === animeId && x.ep_id === epId) || null;
  const clearHistory = () => write(K.hist, []);
  const clearFavs = () => write(K.fav, []);

  // ultima posizione per anime (per "continua a guardare")
  const continueList = () => {
    const seen = new Map();
    for (const h of getHistory()) {
      if (!seen.has(h.anime_id) && h.position > 20) seen.set(h.anime_id, h);
    }
    return [...seen.values()];
  };

  return { getSettings, setSetting, getFavs, isFav, toggleFav,
           getHistory, saveProgress, getProgress, clearHistory, clearFavs, continueList };
})();
