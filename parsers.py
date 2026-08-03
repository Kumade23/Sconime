"""
Parser per Sconime.

Estrae le informazioni dal markup delle pagine AnimeUnity (tag <video-player>),
dalla pagina embed di VixCloud (window.masterPlaylist) e dalle playlist m3u8.

Nessun proxy video: gli URL delle rendition vengono restituiti cosi' come sono
e riprodotti direttamente dal player nel browser.
"""
import html
import json
import re
from urllib.parse import urljoin

# ---------------------------------------------------------------------------
# AnimeUnity: tag <video-player ...> con attributi JSON HTML-escapati
# ---------------------------------------------------------------------------


def _extract_tag(html_text, tag="video-player"):
    """Restituisce il markup del tag richiesto (fino alla chiusura)."""
    m = re.search(r"<" + tag + r"\b.*?</" + tag + r">", html_text, re.S)
    if m:
        return m.group(0)
    m = re.search(r"<" + tag + r"\b.*?>", html_text, re.S)
    return m.group(0) if m else ""


def _attr(tag_html, name):
    m = re.search(re.escape(name) + r'\s*=\s*"(?P<value>.*?)"', tag_html, re.S)
    return html.unescape(m.group("value")) if m else None


def _parse_json_attr(tag_html, name):
    raw = _attr(tag_html, name)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None


def parse_video_player(html_text):
    """
    Dalla pagina /anime/{id}-{slug} (o .../{episode_id}) di AnimeUnity estrae:
    dati anime (con generi e correlati), episodio corrente, lista episodi
    completa ed embed_url di VixCloud.
    """
    tag = _extract_tag(html_text)
    if not tag:
        return None
    return {
        "anime": _parse_json_attr(tag, "anime"),
        "episode": _parse_json_attr(tag, "episode"),
        "episodes": _parse_json_attr(tag, "episodes") or [],
        "episodes_count": _attr(tag, "episodes_count"),
        "embed_url": _attr(tag, "embed_url"),
    }


# ---------------------------------------------------------------------------
# VixCloud: pagina embed con window.masterPlaylist
# ---------------------------------------------------------------------------

# window.masterPlaylist = { params: {...}, url: '...', }
_PLAYLIST_RE = re.compile(r"window\.masterPlaylist\s*=\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})", re.S)


def parse_master_playlist(html_text):
    """
    Dalla pagina https://vixcloud.co/embed/{id}?... estrae l'url base della
    playlist e i parametri firmati (token / expires / asn).
    """
    m = _PLAYLIST_RE.search(html_text)
    if not m:
        return None
    block = m.group(1)
    url_m = re.search(r"url\s*:\s*'([^']+)'", block)
    if not url_m:
        return None
    params = dict(re.findall(r"'(\w+)'\s*:\s*'([^']*)'", block))
    return {"url": url_m.group(1), "params": params}


def build_playlist_url(master):
    """
    Ricostruisce la URL della master playlist:
        {url}?token=...&expires=...&h=1
    'h=1' e' il parametro usato dal player originale VixCloud.
    NOTA: 'b=1' va aggiunto SOLO se gia' presente nella base url fornita da
    VixCloud (aggiungerlo manualmente fa rispondere 403).
    """
    url = master["url"]
    params = dict(master.get("params") or {})
    params.pop("asn", None)  # asn risulta vuoto e non va propagato
    sep = "&" if "?" in url else "?"
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    if qs:
        url = f"{url}{sep}{qs}"
    return f"{url}&h=1"


# ---------------------------------------------------------------------------
# m3u8 master -> rendition
# ---------------------------------------------------------------------------

_STREAM_INF_RE = re.compile(r"#EXT-X-STREAM-INF:([^\n]*)\n([^\n]+)")


def parse_master_m3u8(text, base_url):
    """Master playlist -> lista rendition [{resolution, height, bandwidth, url}]."""
    variants = []
    for attrs, uri in _STREAM_INF_RE.findall(text):
        res_m = re.search(r"RESOLUTION=(\d+)x(\d+)", attrs)
        bw_m = re.search(r"BANDWIDTH=(\d+)", attrs)
        variants.append({
            "resolution": f"{res_m.group(1)}x{res_m.group(2)}" if res_m else "auto",
            "height": int(res_m.group(2)) if res_m else 0,
            "bandwidth": int(bw_m.group(1)) if bw_m else 0,
            "url": urljoin(base_url, uri.strip()),
        })
    variants.sort(key=lambda v: v["height"])
    return variants
