/* Sconime — api: client del backend interno */
window.SconimeAPI = (() => {
  const req = async (url) => {
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    const data = await r.json().catch(() => ({ ok: false, error: "Risposta non valida" }));
    if (!r.ok || data.ok === false) throw new Error(data.error || `Errore ${r.status}`);
    return data;
  };

  return {
    search: (q) => req(`/api/search?q=${encodeURIComponent(q)}`),
    anime: (id, slug) => req(`/api/anime/${id}/${encodeURIComponent(slug)}`),
    stream: (animeId, slug, epId) => req(`/api/stream/${animeId}/${encodeURIComponent(slug)}/${epId}`),
  };
})();
