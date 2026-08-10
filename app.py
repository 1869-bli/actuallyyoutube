"""actuallyYOUtube — an ad-free YouTube client.

Local web app: searches YouTube, plays videos via direct streams
(yet another yt-dlp powered frontend that skips all ads).
"""

import json
import os
import subprocess
import threading
import time
import urllib.parse
import urllib.request
import uuid

from flask import Flask, Response, jsonify, request, send_from_directory

YTDLP = "yt-dlp"
FFMPEG = "ffmpeg"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "5000"))
CACHE_TTL = 120
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")

app = Flask(__name__, static_folder="static", static_url_path="/static")
_info_cache = {}
_channel_cache = {}
_channel_videos = {}
_sponsor_cache = {}
_data_lock = threading.Lock()


class YtError(Exception):
    pass


def run_ytdlp(extra, timeout=90):
    cmd = [YTDLP, "--no-warnings"] + extra
    proc = subprocess.run(cmd, capture_output=True, timeout=timeout)
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", "replace")[-400:]
        raise YtError(err or f"yt-dlp exited with code {proc.returncode}")
    return proc.stdout


def ytdlp_json(extra, timeout=90):
    out = run_ytdlp(extra + ["--dump-single-json"], timeout=timeout)
    return json.loads(out.decode("utf-8", "replace"))


def thumb(vid, res="hqdefault"):
    return f"https://i.ytimg.com/vi/{vid}/{res}.jpg"


def get_info(vid):
    now = time.time()
    hit = _info_cache.get(vid)
    if hit and now - hit[0] < CACHE_TTL:
        return hit[1]
    try:
        info = ytdlp_json([
            f"https://www.youtube.com/watch?v={vid}",
            "--no-playlist", "--no-check-formats", "--skip-download",
        ])
    except YtError:
        info = ytdlp_json([
            f"https://www.youtube.com/watch?v={vid}",
            "--no-playlist", "--no-check-formats", "--skip-download",
            "--extractor-args", "youtube:player_client=android,ios",
        ])
    _info_cache[vid] = (now, info)
    return info


def _pick_avatar(thumbs):
    """Channel thumbnails may include the banner; keep only real avatars
    (avatars are square, banners use -fcrop/-ndf URL crop params)."""
    cands = [t for t in (thumbs or [])
             if t.get("url")
             and "-fcrop" not in t["url"]
             and "-ndf" not in t["url"]]
    if not cands:
        return ""
    best = max(cands, key=lambda t: (t.get("height") or 0))
    return best.get("url", "")


def get_channel(chid):
    now = time.time()
    hit = _channel_cache.get(chid)
    if hit and now - hit[0] < 3600:
        return hit[1]
    info = ytdlp_json([
        f"https://www.youtube.com/channel/{chid}",
        "--playlist-items", "0", "--no-check-formats", "--skip-download",
    ], timeout=60)
    meta = {
        "id": chid,
        "name": info.get("channel") or info.get("uploader") or info.get("title") or "Channel",
        "avatar": _pick_avatar(info.get("thumbnails") or []),
        "subscribers": info.get("channel_follower_count"),
        "description": (info.get("description") or "")[:220],
    }
    _channel_cache[chid] = (now, meta)
    return meta


def get_channel_videos(chid):
    now = time.time()
    hit = _channel_videos.get(chid)
    if hit and now - hit[0] < 300:
        return hit[1]
    out = ytdlp_json([
        f"https://www.youtube.com/channel/{chid}/videos",
        "--flat-playlist", "--playlist-end", "12",
    ], timeout=60)
    rows = []
    for e in out.get("entries") or []:
        if not e:
            continue
        vid = e.get("id")
        if not vid or len(vid) != 11:
            continue
        rows.append({
            "id": vid,
            "title": e.get("title"),
            "duration": e.get("duration"),
            "views": e.get("view_count"),
            "thumb": thumb(vid),
        })
    _channel_videos[chid] = (now, rows)
    return rows


def progressive(info):
    fmts = info.get("formats") or []
    both = [f for f in fmts
            if (f.get("vcodec") or "none") != "none"
            and (f.get("acodec") or "none") != "none" and f.get("url")]
    if not both:
        return None
    return max(both, key=lambda f: (f.get("height") or 0, 1 if f.get("ext") == "mp4" else 0))


def separate(info):
    fmts = info.get("formats") or []
    vids = [f for f in fmts
            if (f.get("vcodec") or "none") != "none"
            and (f.get("acodec") or "none") == "none" and f.get("url")]
    auds = [f for f in fmts
            if (f.get("acodec") or "none") != "none"
            and (f.get("vcodec") or "none") == "none" and f.get("url")]
    best_v = max(vids, key=lambda f: (f.get("height") or 0, 1 if f.get("ext") == "mp4" else 0)) if vids else None
    best_a = max(auds, key=lambda f: (f.get("abr") or 0, 1 if f.get("ext") in ("m4a", "mp4") else 0)) if auds else None
    return best_v, best_a


def mux_chunked(urls, maps, seek_t=None):
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error"]
    for u in urls:
        if seek_t:
            cmd += ["-ss", f"{seek_t:.3f}"]
        cmd += ["-reconnect", "1", "-reconnect_streamed", "1",
                "-reconnect_delay_max", "5", "-i", u]
    if maps:
        for m in maps:
            cmd += ["-map", m]
    cmd += ["-c", "copy",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "-f", "mp4", "pipe:1"]

    def gen():
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            while True:
                chunk = proc.stdout.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            proc.kill()
            proc.wait()

    return Response(gen(), mimetype="video/mp4", headers={"Cache-Control": "no-store"})


# ---------- local account / subscription data ----------

def _load_data():
    with _data_lock:
        if not os.path.exists(DATA_FILE):
            return {"accounts": []}
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"accounts": []}


def _save_data(data):
    with _data_lock:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


def _find_account(data, aid):
    for acc in data.get("accounts", []):
        if acc["id"] == aid:
            return acc
    return None


# ---------- pages / static ----------

@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/manifest.webmanifest")
def manifest():
    return send_from_directory(app.static_folder, "manifest.webmanifest",
                               mimetype="application/manifest+json")


@app.get("/sw.js")
def sw():
    return send_from_directory(app.static_folder, "sw.js",
                               mimetype="application/javascript")


# ---------- youtube api ----------

@app.get("/api/search")
def search():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify({"results": []})
    try:
        out = ytdlp_json(["ytsearch20:" + q, "--flat-playlist"], timeout=60)
    except YtError as e:
        return jsonify({"error": str(e)}), 502
    results = []
    for e in out.get("entries") or []:
        if not e:
            continue
        vid = e.get("id")
        if not vid or len(vid) != 11:
            continue
        results.append({
            "id": vid,
            "title": e.get("title"),
            "channel": e.get("channel") or e.get("uploader"),
            "channel_id": e.get("channel_id"),
            "duration": e.get("duration"),
            "views": e.get("view_count"),
            "thumb": thumb(vid),
        })
    return jsonify({"results": results})


@app.get("/api/avatars")
def avatars():
    out = {}
    for cid in request.args.get("ids", "").split(","):
        cid = cid.strip()
        if not cid:
            continue
        try:
            out[cid] = get_channel(cid).get("avatar") or ""
        except YtError:
            out[cid] = ""
    return jsonify(out)


@app.get("/api/video")
def video():
    vid = request.args.get("id", "")
    if not vid:
        return jsonify({"error": "missing id"}), 400
    try:
        info = get_info(vid)
    except YtError as e:
        return jsonify({"error": str(e)}), 502
    bv, ba = separate(info)
    prog = progressive(info)
    chid = (info.get("channel_id") or "").strip()
    if not chid:
        churl = info.get("channel_url") or ""
        chid = churl.rstrip("/").split("/")[-1] if "/channel/" in churl else ""
    return jsonify({
        "id": vid,
        "title": info.get("title") or "Untitled",
        "channel": info.get("channel") or info.get("uploader") or "Unknown",
        "channel_id": chid,
        "views": info.get("view_count"),
        "date": info.get("upload_date"),
        "duration": info.get("duration"),
        "description": info.get("description"),
        "isLive": bool(info.get("is_live")),
        "thumbnail": thumb(vid, "maxresdefault"),
        "thumb_alt": thumb(vid),
        "stream": {
            "video": (bv or {}).get("url"),
            "audio": (ba or {}).get("url"),
            "single": (prog or {}).get("url"),
        },
    })


@app.get("/api/stream")
def stream():
    vid = request.args.get("id", "")
    if not vid:
        return jsonify({"error": "missing id"}), 400
    try:
        t = max(0.0, min(float(request.args.get("t", "0") or "0"), 6 * 3600))
    except ValueError:
        t = 0.0
    try:
        info = get_info(vid)
        bv, ba = separate(info)
        prog = progressive(info)
    except YtError as e:
        return jsonify({"error": str(e)}), 502
    if bv and ba:
        return mux_chunked([bv["url"], ba["url"]], ["0:v:0", "1:a:0"], t or None)
    if prog:
        return mux_chunked([prog["url"]], None, t or None)
    return jsonify({"error": "No playable streams found for this video."}), 502


@app.get("/api/sponsor")
def sponsor():
    vid = request.args.get("id", "")
    if not vid:
        return jsonify({"segments": []})
    now = time.time()
    hit = _sponsor_cache.get(vid)
    if hit and now - hit[0] < 3600:
        return jsonify({"segments": hit[1]})
    cats = json.dumps(["sponsor", "intro", "outro", "selfpromo", "interaction"])
    url = ("https://sponsor.ajay.app/api/skipSegments?videoID=" + vid
           + "&categories=" + urllib.parse.quote(cats))
    segments = []
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "actuallyYOUtube/1.0 (local)"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            segments = json.loads(resp.read().decode("utf-8", "replace"))
    except Exception:
        segments = []
    _sponsor_cache[vid] = (now, segments)
    return jsonify({"segments": segments})


@app.get("/api/channel")
def channel():
    chid = request.args.get("id", "")
    if not chid:
        return jsonify({"error": "missing id"}), 400
    try:
        return jsonify(get_channel(chid))
    except YtError as e:
        return jsonify({"error": str(e)}), 502


@app.get("/api/channel/search")
def channel_search():
    q = request.args.get("q", "").strip().lstrip("@")
    if not q:
        return jsonify({"found": False})
    try:
        info = ytdlp_json([
            f"https://www.youtube.com/@{q}",
            "--playlist-items", "0", "--no-check-formats", "--skip-download",
        ], timeout=60)
    except YtError:
        return jsonify({"found": False})
    chid = (info.get("channel_id") or "").strip()
    if not chid:
        return jsonify({"found": False})
    meta = {
        "id": chid,
        "name": info.get("channel") or info.get("uploader") or info.get("title") or q,
        "avatar": _pick_avatar(info.get("thumbnails") or []),
        "subscribers": info.get("channel_follower_count"),
        "description": (info.get("description") or "")[:220],
    }
    _channel_cache[chid] = (time.time(), meta)
    videos = []
    try:
        videos = get_channel_videos(chid)
    except YtError:
        pass
    return jsonify({"found": True, "channel": meta, "videos": videos})


@app.get("/api/channel/videos")
def channel_videos():
    chid = request.args.get("id", "")
    if not chid:
        return jsonify({"error": "missing id"}), 400
    try:
        return jsonify({"results": get_channel_videos(chid)})
    except YtError as e:
        return jsonify({"error": str(e)}), 502


@app.get("/api/home")
def home():
    acc_id = request.args.get("acc", "")
    data = _load_data()
    acc = _find_account(data, acc_id)
    if not acc:
        return jsonify({"groups": []})
    groups = []
    for sub in acc.get("subs", [])[:5]:
        try:
            vids = get_channel_videos(sub["channel_id"])
        except YtError:
            continue
        groups.append({"channel": sub, "videos": vids[:8]})
    return jsonify({"groups": groups})


# ---------- local accounts ----------

@app.get("/api/accounts")
def accounts():
    return jsonify(_load_data().get("accounts", []))


@app.post("/api/accounts")
def create_account():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()[:30]
    if not name:
        return jsonify({"error": "name required"}), 400
    color = (body.get("color") or "#ff0033")[:9]
    acc = {"id": uuid.uuid4().hex[:8], "name": name, "color": color, "subs": []}
    data = _load_data()
    data.setdefault("accounts", []).append(acc)
    _save_data(data)
    return jsonify(acc)


@app.delete("/api/accounts/<aid>")
def delete_account(aid):
    data = _load_data()
    before = len(data.get("accounts", []))
    data["accounts"] = [a for a in data.get("accounts", []) if a["id"] != aid]
    if len(data["accounts"]) == before:
        return jsonify({"error": "not found"}), 404
    _save_data(data)
    return jsonify({"ok": True})


@app.get("/api/account/<aid>/subs")
def subs(aid):
    data = _load_data()
    acc = _find_account(data, aid)
    if not acc:
        return jsonify({"error": "account not found"}), 404
    return jsonify(acc.get("subs", []))


@app.put("/api/account/<aid>/subs")
def add_sub(aid):
    body = request.get_json(silent=True) or {}
    chid = (body.get("channel_id") or "").strip()[:40]
    if not chid:
        return jsonify({"error": "channel_id required"}), 400
    data = _load_data()
    acc = _find_account(data, aid)
    if not acc:
        return jsonify({"error": "account not found"}), 404
    subs = acc.setdefault("subs", [])
    if chid not in [s["channel_id"] for s in subs]:
        subs.append({
            "channel_id": chid,
            "name": (body.get("name") or "")[:80],
            "avatar": (body.get("avatar") or "")[:500],
            "ts": time.time(),
        })
    _save_data(data)
    return jsonify(subs)


@app.delete("/api/account/<aid>/subs/<chid>")
def remove_sub(aid, chid):
    data = _load_data()
    acc = _find_account(data, aid)
    if not acc:
        return jsonify({"error": "account not found"}), 404
    acc["subs"] = [s for s in acc.get("subs", []) if s["channel_id"] != chid]
    _save_data(data)
    return jsonify(acc.get("subs", []))


if __name__ == "__main__":
    print(f"actuallyYOUtube running at http://{HOST}:{PORT}  (Ctrl+C to quit)")
    app.run(host=HOST, port=PORT, threaded=True)