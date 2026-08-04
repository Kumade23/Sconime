"""
Sconime — backend Flask (solo metadati; il video va diretto da VixCloud al browser).

API interne:
  GET /api/search?q=...                      -> livesearch
  GET /api/anime/<id>/<slug>                 -> dettaglio anime + episodi
  GET /api/stream/<anime_id>/<slug>/<ep_id>  -> master m3u8 + rendition per il player
  GET /api/health
"""
import sys
import os
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from curl_cffi import requests as _req
from flask import Flask, jsonify, request, send_from_directory, Response

from providers.animeunity import client, AnimeUnityError, BASE_HEADERS

app = Flask(__name__, static_folder="static", static_url_path="/static")


@app.after_request
def _no_cache(resp):
    # Evita che Safari/iOS tenga in cache vecchie versioni di JS/CSS/HTML
    if request.path.startswith("/static") or request.path == "/":
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp


# ---------------------------------------------------------------------------
# helper
# ---------------------------------------------------------------------------

def _err(msg, code=502):
    return jsonify({"ok": False, "error": msg}), code


def _slim_anime(a):
    """Versione compatta di un record anime per le card."""
    if not a:
        return None
    return {
        "id": a.get("id"),
        "slug": a.get("slug"),
        "title": a.get("title_eng") or a.get("title") or a.get("title_it"),
        "title_eng": a.get("title_eng"),
        "imageurl": a.get("imageurl"),
        "imageurl_cover": a.get("imageurl_cover"),
        "cover": a.get("imageurl"),
        "plot": a.get("plot"),
        "type": a.get("type"),
        "status": a.get("status"),
        "date": a.get("date"),
        "score": a.get("score"),
        "studio": a.get("studio"),
        "dub": a.get("dub"),
        "episodes_count": a.get("real_episodes_count") or a.get("episodes_count"),
        "season": a.get("season"),
        "genres": [g.get("name") for g in (a.get("genres") or []) if isinstance(g, dict)],
    }


def _slim_episode(e):
    if not e:
        return None
    return {
        "id": e.get("id"),
        "anime_id": e.get("anime_id"),
        "number": e.get("number"),
        "file_name": e.get("file_name") or e.get("link"),
        "visite": e.get("visite"),
        "scws_id": e.get("scws_id"),
    }


# ---------------------------------------------------------------------------
# pagine statiche (SPA)
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

@app.route("/api/health")
def health():
    return jsonify({"ok": True, "service": "sconime"})


# ---------------------------------------------------------------------------
# Proxy immagini (solo cover): recupera server-side con gli header giusti,
# cosi' i domini con hotlink-protection / cert deboli non bloccano il browser.
# ---------------------------------------------------------------------------

_IMG_CACHE = {}
_IMG_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
           "(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36")
# domini immagine consentiti (sicurezza: solo host noti di cover)
_IMG_HOSTS = (
    "anilist.co", "myanimelist.net", "animeworld.tv", "animeworld.ac",
    "forbiddenlol.cloud", "animeunity.so", "animeunity.tv", "imgur.com",
)


def _img_allowed(url):
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    return any(host == h or host.endswith("." + h) for h in _IMG_HOSTS)


@app.route("/api/img")
def img_proxy():
    url = request.args.get("u", "")
    if not url.startswith("http") or not _img_allowed(url):
        return _err("URL immagine non consentita", 400)
    if url in _IMG_CACHE:
        body, ctype = _IMG_CACHE[url]
        return _img_response(body, ctype)
    headers = {"User-Agent": _IMG_UA, "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"}
    # alcuni CDN vogliono un Referer plausibile
    host = urlparse(url).netloc
    if "animeworld" in host:
        headers["Referer"] = "https://www.animeworld.ac/"
    elif "anilist" in host or "myanimelist" in host:
        headers["Referer"] = "https://anilist.co/"
    try:
        r = _req.get(url, headers=headers, timeout=15, verify=False, stream=False, impersonate="chrome")
        if r.status_code != 200 or "image" not in r.headers.get("Content-Type", ""):
            return _err(f"Upstream {r.status_code}", 404)
        ctype = r.headers.get("Content-Type", "image/jpeg").split(";")[0]
        body = r.content
        if len(_IMG_CACHE) < 1000:  # cache semplice in memoria
            _IMG_CACHE[url] = (body, ctype)
        return _img_response(body, ctype)
    except Exception as e:
        return _err(f"Errore immagine: {e}", 502)


def _img_response(body, ctype):
    resp = Response(body, mimetype=ctype)
    resp.headers["Cache-Control"] = "public, max-age=86400"  # cacheabile 1 giorno
    return resp


@app.route("/api/search")
def search():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"ok": True, "records": []})
    try:
        records = client.livesearch(q)
    except AnimeUnityError as e:
        return _err(str(e))
    except Exception as e:  # rete / upstream
        return _err(f"Errore ricerca: {e}")
    return jsonify({"ok": True, "records": [_slim_anime(r) for r in records]})


@app.route("/api/anime/<int:anime_id>/<slug>")
def anime_detail(anime_id, slug):
    try:
        page = client.anime_page(anime_id, slug)
    except AnimeUnityError as e:
        return _err(str(e))
    except Exception as e:
        return _err(f"Errore caricamento anime: {e}")

    anime = page["anime"] or {}
    related = [_slim_anime(r) for r in (anime.get("related") or []) if isinstance(r, dict)]
    out = _slim_anime(anime)
    out["genres"] = [g.get("name") for g in (anime.get("genres") or []) if isinstance(g, dict)]
    out["related"] = related
    return jsonify({
        "ok": True,
        "anime": out,
        "episodes": [_slim_episode(e) for e in page["episodes"]],
        "episodes_count": page.get("episodes_count"),
    })


@app.route("/api/stream/<int:anime_id>/<slug>/<int:episode_id>")
def stream(anime_id, slug, episode_id):
    try:
        info = client.stream_info(anime_id, slug, episode_id)
    except AnimeUnityError as e:
        return _err(str(e))
    except Exception as e:
        return _err(f"Errore risoluzione stream: {e}")

    anime = _slim_anime(info["anime"])
    return jsonify({
        "ok": True,
        "anime": anime,
        "episode": _slim_episode(info["episode"]),
        "episodes": [_slim_episode(e) for e in info["episodes"]],
        "master_url": info["master_url"],      # riprodotto DIRETTAMENTE dal player
        "variants": info["variants"],          # rendition m3u8 (URL diretti VixCloud)
        "embed_url": info["embed_url"],
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
