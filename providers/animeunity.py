"""
Provider AnimeUnity + VixCloud per Sconime.

Implementa ESATTAMENTE il flusso HTTP documentato:

  1. GET  https://www.animeunity.so/                    -> cookie animeunity_session + x-csrf-token
  2. POST /livesearch  {"title": "..."}                 -> risultati ricerca (JSON)
  3. GET  /anime/{id}-{slug}                            -> tag <video-player> (anime, episodi, embed_url)
  4. GET  /anime/{id}-{slug}/{episode_id}               -> embed_url dell'episodio scelto
  5. GET  embed_url (vixcloud.co/embed/{scws_id}?...)   -> window.masterPlaylist {url, params}
  6. GET  {url}&token=...&expires=...&h=1               -> master playlist m3u8 con rendition

Il video NON passa dal server: al client viene consegnata la master playlist
firmata e il player la riproduce direttamente da VixCloud.
"""
import re
import threading
import time

import requests

from parsers import (
    build_playlist_url,
    parse_master_m3u8,
    parse_master_playlist,
    parse_video_player,
)

AU_BASE = "https://www.animeunity.so"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
)

# Header comuni stile browser (come da cattura)
BASE_HEADERS = {
    "User-Agent": USER_AGENT,
    "sec-ch-ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Brave";v="150"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-gpc": "1",
    "Accept-Language": "it-IT,it;q=0.9",
}

_NAVIGATE_HEADERS = {
    **BASE_HEADERS,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,"
              "image/avif,image/webp,image/apng,*/*;q=0.8",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
}


class AnimeUnityError(Exception):
    pass


class AnimeUnityClient:
    """Client con sessione persistente e refresh automatico di cookie/token."""

    def __init__(self):
        self._session = requests.Session()
        self._csrf = None
        self._bootstrapped_at = 0.0
        self._lock = threading.Lock()
        self._ttl = 60 * 30  # ri-bootstrap dopo 30 minuti

    # -- bootstrap: GET animeunity.so -> cookie + csrf ---------------------
    def bootstrap(self, force=False):
        with self._lock:
            fresh = (time.time() - self._bootstrapped_at) < self._ttl
            if not force and fresh and self._csrf:
                return
            r = self._session.get(
                AU_BASE + "/",
                headers={**_NAVIGATE_HEADERS, "Sec-Fetch-Site": "none",
                         "Sec-Fetch-User": "?1"},
                timeout=20,
            )
            r.raise_for_status()
            m = re.search(
                r'<meta\s+name="csrf-token"\s+content="([^"]+)"', r.text
            )
            if not m:
                raise AnimeUnityError("csrf-token non trovato nella home")
            self._csrf = m.group(1)
            self._bootstrapped_at = time.time()

    @property
    def csrf(self):
        self.bootstrap()
        return self._csrf

    # -- 2. livesearch ------------------------------------------------------
    def livesearch(self, title):
        """POST /livesearch {"title": ...} -> lista record anime."""
        self.bootstrap()
        headers = {
            **BASE_HEADERS,
            "X-CSRF-TOKEN": self._csrf,
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
            "Origin": AU_BASE,
            "Referer": AU_BASE + "/",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
        }
        r = self._session.post(
            AU_BASE + "/livesearch", headers=headers,
            json={"title": title}, timeout=15,
        )
        if r.status_code in (419, 401, 403):
            # token scaduto: ri-bootstrap e un solo retry
            self.bootstrap(force=True)
            headers["X-CSRF-TOKEN"] = self._csrf
            r = self._session.post(
                AU_BASE + "/livesearch", headers=headers,
                json={"title": title}, timeout=15,
            )
        r.raise_for_status()
        data = r.json()
        return data.get("records", [])

    # -- 3/4. pagina anime / episodio ---------------------------------------
    def _fetch_player_page(self, path):
        self.bootstrap()
        r = self._session.get(
            AU_BASE + path,
            headers={**_NAVIGATE_HEADERS, "Sec-Fetch-User": "?1"},
            timeout=20,
        )
        r.raise_for_status()
        parsed = parse_video_player(r.text)
        if not parsed or not parsed.get("anime"):
            raise AnimeUnityError("video-player non trovato nella pagina")
        return parsed

    def anime_page(self, anime_id, slug):
        """GET /anime/{id}-{slug} -> anime + TUTTI gli episodi (tutte le schede)."""
        page = self._fetch_player_page(f"/anime/{anime_id}-{slug}")
        page["episodes"] = self._fetch_all_episodes(anime_id, page)
        return page

    def episode_page(self, anime_id, slug, episode_id):
        """GET /anime/{id}-{slug}/{episode_id} -> embed_url episodio scelto."""
        return self._fetch_player_page(f"/anime/{anime_id}-{slug}/{episode_id}")

    # -- raccolta completa episodi via /info_api ----------------------------
    def _fetch_all_episodes(self, anime_id, page):
        """
        AnimeUnity divide gli episodi in schede da 120. Recupero ogni range con
        GET /info_api/{anime_id}/1?start_range=X&end_range=Y e unisco i risultati.
        Fallback agli episodi del video-player se l'endpoint non risponde.
        """
        base_eps = page.get("episodes") or []
        try:
            total = int(page.get("episodes_count") or len(base_eps))
        except (TypeError, ValueError):
            total = len(base_eps)
        if total <= len(base_eps):
            return base_eps  # tutti gia' presenti

        headers = {
            **BASE_HEADERS,
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": self._csrf,
            "Referer": f"{AU_BASE}/anime/{anime_id}",
        }
        merged = {}
        for e in base_eps:
            if isinstance(e, dict) and e.get("id") is not None:
                merged[e["id"]] = e

        start, step = 1, 120
        while start <= total:
            end = min(start + step - 1, total)
            try:
                r = self._session.get(
                    f"{AU_BASE}/info_api/{anime_id}/1?start_range={start}&end_range={end}",
                    headers=headers, timeout=20,
                )
                if r.status_code == 200:
                    for e in (r.json().get("episodes") or []):
                        if isinstance(e, dict) and e.get("id") is not None:
                            merged[e["id"]] = e
                elif r.status_code in (401, 403, 419):
                    self.bootstrap(force=True)
                    headers["X-CSRF-TOKEN"] = self._csrf
            except Exception:
                pass
            start += step

        def _num(e):
            try:
                return float(str(e.get("number", "0")).split("-")[0])
            except (TypeError, ValueError):
                return 0.0
        out = sorted(merged.values(), key=_num)
        return out or base_eps

    # -- 5. embed VixCloud -> masterPlaylist --------------------------------
    def vixcloud_embed(self, embed_url):
        """
        GET embed_url (Referer: animeunity) -> window.masterPlaylist.
        Restituisce {"url": ..., "params": {...}} oppure None.
        """
        headers = {
            **BASE_HEADERS,
            "Accept": _NAVIGATE_HEADERS["Accept"],
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "iframe",
            "Referer": AU_BASE + "/",
        }
        r = self._session.get(embed_url, headers=headers, timeout=20)
        r.raise_for_status()
        return parse_master_playlist(r.text)

    # -- 6. master playlist m3u8 ---------------------------------------------
    def fetch_master_m3u8(self, embed_url):
        """
        Catena completa: embed -> window.masterPlaylist -> GET playlist firmata
        (Referer: embed_url) -> (master_url, [rendition]).
        """
        master = self.vixcloud_embed(embed_url)
        if not master:
            raise AnimeUnityError("masterPlaylist non trovata nell'embed")
        playlist_url = build_playlist_url(master)
        headers = {
            **BASE_HEADERS,
            "Accept": "*/*",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "Referer": embed_url,
        }
        r = self._session.get(playlist_url, headers=headers, timeout=20)
        r.raise_for_status()
        variants = parse_master_m3u8(r.text, playlist_url)
        return playlist_url, variants

    # -- API di alto livello usata dal backend -------------------------------
    def stream_info(self, anime_id, slug, episode_id):
        """
        Per un episodio restituisce tutto cio' che serve al player:
        dati anime, episodio, lista episodi, embed_url, master m3u8 e rendition.
        """
        page = self.episode_page(anime_id, slug, episode_id)
        embed_url = page.get("embed_url")
        if not embed_url:
            raise AnimeUnityError("embed_url assente per questo episodio")
        master_url, variants = self.fetch_master_m3u8(embed_url)
        return {
            "anime": page["anime"],
            "episode": page["episode"],
            "episodes": self._fetch_all_episodes(anime_id, page),  # tutte le schede
            "episodes_count": page.get("episodes_count"),
            "embed_url": embed_url,
            "master_url": master_url,
            "variants": variants,
        }


# Istanza condivisa
client = AnimeUnityClient()
