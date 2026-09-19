#!/usr/bin/env python3
"""Nicoeats server. Standard library only, no installs needed.

Env vars:
  NICOEATS_PASSWORD  admin password (required in production)
  NICOEATS_SECRET    cookie signing secret (auto-generated into DATA_DIR if unset)
  DATA_DIR           where the database and uploaded photos live (default ./data)
  PORT               default 8000
"""
import base64, hashlib, hmac, json, mimetypes, os, re, secrets, sqlite3, sys, threading, time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent.resolve()
PUBLIC = ROOT / "public"
DATA = Path(os.environ.get("DATA_DIR", ROOT / "data")).resolve()
UPLOADS = DATA / "uploads"
DATA.mkdir(parents=True, exist_ok=True)
UPLOADS.mkdir(parents=True, exist_ok=True)

PASSWORD = os.environ.get("NICOEATS_PASSWORD")
if not PASSWORD:
    PASSWORD = "changeme"
    print("!! NICOEATS_PASSWORD not set. Using 'changeme'. Do NOT deploy like this.", file=sys.stderr)

_secret_file = DATA / ".secret"
if os.environ.get("NICOEATS_SECRET"):
    SECRET = os.environ["NICOEATS_SECRET"].encode()
else:
    if not _secret_file.exists():
        _secret_file.write_text(secrets.token_hex(32))
    SECRET = _secret_file.read_text().strip().encode()

# Scoring criteria live here so the server can compute the overall score itself.
CRITERIA = {
    "natas": ["custard", "blister", "pastry", "value", "vibes"],
    "carrot-cake": ["crumb", "spice", "frosting", "value", "vibes"],
    "poutine": ["fries", "curds", "gravy", "value", "vibes"],
}
MAX_BODY = 12 * 1024 * 1024

_local = threading.local()


def _conn():
    # One SQLite connection per thread; sharing one across threads can crash.
    if not hasattr(_local, "c"):
        c = sqlite3.connect(DATA / "nicoeats.db", isolation_level=None, timeout=15)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        _local.c = c
    return _local.c


class _DB:
    def __getattr__(self, name):
        return getattr(_conn(), name)


db = _DB()
db.executescript("""
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  neighborhood TEXT DEFAULT '',
  address TEXT DEFAULT '',
  lat REAL, lng REAL,
  price TEXT DEFAULT '',
  visited TEXT DEFAULT '',
  scores TEXT NOT NULL DEFAULT '{}',
  overall REAL NOT NULL DEFAULT 0,
  headline TEXT DEFAULT '',
  body TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  companion TEXT DEFAULT '',
  companion_note TEXT DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
""")
DEFAULT_SETTINGS = {
    "instagram": "", "tiktok": "", "youtube": "",
    "tagline": "Small, greasy, beautiful things. Reviewed properly.",
    "about": "Nicoeats is a Montréal food project. I live in Little Portugal, surrounded by pastéis de nata, so I decided to be rigorous about it. Then carrot cake, because I love it. Then poutine, with a friend who suffers alongside me.\n\nEvery spot is scored on the same criteria, every time. No sponsors, no freebies.",
}
for k, v in DEFAULT_SETTINGS.items():
    db.execute("INSERT OR IGNORE INTO settings VALUES (?,?)", (k, v))


def sign(payload: str) -> str:
    return hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()


def make_token() -> str:
    exp = str(int(time.time()) + 60 * 60 * 24 * 30)
    return f"{exp}.{sign(exp)}"


def valid_token(tok: str) -> bool:
    try:
        exp, sig = tok.split(".", 1)
        return hmac.compare_digest(sig, sign(exp)) and int(exp) > time.time()
    except Exception:
        return False


def row_to_dict(r, full=True):
    d = dict(r)
    d["scores"] = json.loads(d["scores"] or "{}")
    d["published"] = bool(d["published"])
    return d


def clean_review(data):
    cat = data.get("category")
    if cat not in CRITERIA:
        raise ValueError("Unknown category")
    name = str(data.get("name", "")).strip()
    if not name:
        raise ValueError("Name is required")
    scores = {}
    for c in CRITERIA[cat]:
        try:
            v = float(data.get("scores", {}).get(c, 0))
        except (TypeError, ValueError):
            v = 0
        scores[c] = max(0.0, min(10.0, round(v * 2) / 2))
    overall = round(sum(scores.values()) / len(scores), 1)

    def num(x):
        try:
            return float(x) if x not in (None, "") else None
        except (TypeError, ValueError):
            return None

    photo = str(data.get("photo", ""))
    if photo and not re.fullmatch(r"/uploads/[a-f0-9]{32}\.(jpg|png|webp)", photo):
        photo = ""
    s = lambda k, n=400: str(data.get(k, ""))[:n].strip()
    return dict(
        category=cat, name=name[:120], neighborhood=s("neighborhood", 80), address=s("address", 200),
        lat=num(data.get("lat")), lng=num(data.get("lng")), price=s("price", 40), visited=s("visited", 20),
        scores=json.dumps(scores), overall=overall, headline=s("headline", 160), body=s("body", 8000),
        photo=photo, companion=s("companion", 80), companion_note=s("companion_note", 2000),
        published=1 if data.get("published", True) else 0,
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "Nicoeats"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.command, self.path))

    # -- helpers
    def send_json(self, obj, status=200, headers=None):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError("Body too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def authed(self):
        c = SimpleCookie(self.headers.get("Cookie", ""))
        return "nico_session" in c and valid_token(c["nico_session"].value)

    def secure_flag(self):
        return "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""

    def require_auth(self):
        if not self.authed():
            self.send_json({"error": "Not logged in"}, 401)
            return False
        # CSRF guard: state-changing requests must come from our own origin
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).netloc != self.headers.get("Host"):
            self.send_json({"error": "Bad origin"}, 403)
            return False
        return True

    # -- static
    def serve_file(self, base: Path, rel: str, cache="public, max-age=300"):
        path = (base / rel.lstrip("/")).resolve()
        if base not in path.parents and path != base:
            return self.send_error(404)
        if path.is_dir():
            path = path / "index.html"
        if not path.is_file():
            return self.send_error(404)
        data = path.read_bytes()
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") or ctype.endswith("javascript") else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(data)

    # -- routes
    def do_GET(self):
        p = urlparse(self.path).path
        if p == "/api/reviews":
            rows = db.execute("SELECT * FROM reviews ORDER BY created DESC").fetchall()
            out = [row_to_dict(r) for r in rows]
            if not self.authed():
                out = [r for r in out if r["published"]]
            return self.send_json(out)
        m = re.fullmatch(r"/api/reviews/(\d+)", p)
        if m:
            r = db.execute("SELECT * FROM reviews WHERE id=?", (m[1],)).fetchone()
            if not r or (not r["published"] and not self.authed()):
                return self.send_json({"error": "Not found"}, 404)
            return self.send_json(row_to_dict(r))
        if p == "/api/settings":
            return self.send_json({r["key"]: r["value"] for r in db.execute("SELECT * FROM settings")})
        if p == "/api/me":
            return self.send_json({"admin": self.authed()})
        if p == "/api/criteria":
            return self.send_json(CRITERIA)
        if p.startswith("/uploads/"):
            return self.serve_file(UPLOADS, p[len("/uploads/"):], cache="public, max-age=31536000, immutable")
        if p == "/":
            p = "/index.html"
        return self.serve_file(PUBLIC, p)

    def do_POST(self):
        p = urlparse(self.path).path
        try:
            if p == "/api/login":
                pw = str(self.read_json().get("password", ""))
                if hmac.compare_digest(pw.encode(), PASSWORD.encode()):
                    cookie = f"nico_session={make_token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000{self.secure_flag()}"
                    return self.send_json({"ok": True}, headers={"Set-Cookie": cookie})
                time.sleep(1.2)  # slow down guessing
                return self.send_json({"error": "Wrong password"}, 401)
            if p == "/api/logout":
                return self.send_json({"ok": True}, headers={"Set-Cookie": "nico_session=; Path=/; Max-Age=0"})
            if not self.require_auth():
                return
            if p == "/api/reviews":
                c = clean_review(self.read_json())
                now = int(time.time())
                cols = list(c)
                cur = db.execute(
                    f"INSERT INTO reviews ({','.join(cols)},created,updated) VALUES ({','.join('?'*len(cols))},?,?)",
                    [*c.values(), now, now])
                r = db.execute("SELECT * FROM reviews WHERE id=?", (cur.lastrowid,)).fetchone()
                return self.send_json(row_to_dict(r), 201)
            if p == "/api/upload":
                d = self.read_json()
                raw = base64.b64decode(str(d.get("data", "")).split(",")[-1], validate=False)
                if raw[:3] == b"\xff\xd8\xff":
                    ext = "jpg"
                elif raw[:8] == b"\x89PNG\r\n\x1a\n":
                    ext = "png"
                elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
                    ext = "webp"
                else:
                    return self.send_json({"error": "Unsupported image"}, 400)
                name = f"{secrets.token_hex(16)}.{ext}"
                (UPLOADS / name).write_bytes(raw)
                return self.send_json({"url": f"/uploads/{name}"})
            self.send_json({"error": "Not found"}, 404)
        except ValueError as e:
            self.send_json({"error": str(e)}, 400)
        except Exception as e:
            sys.stderr.write(f"error: {e!r}\n")
            self.send_json({"error": "Server error"}, 500)

    def do_PUT(self):
        p = urlparse(self.path).path
        if not self.require_auth():
            return
        try:
            m = re.fullmatch(r"/api/reviews/(\d+)", p)
            if m:
                c = clean_review(self.read_json())
                sets = ",".join(f"{k}=?" for k in c)
                db.execute(f"UPDATE reviews SET {sets}, updated=? WHERE id=?", [*c.values(), int(time.time()), m[1]])
                r = db.execute("SELECT * FROM reviews WHERE id=?", (m[1],)).fetchone()
                return self.send_json(row_to_dict(r)) if r else self.send_json({"error": "Not found"}, 404)
            if p == "/api/settings":
                d = self.read_json()
                for k in DEFAULT_SETTINGS:
                    if k in d:
                        db.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (k, str(d[k])[:5000]))
                return self.send_json({"ok": True})
            self.send_json({"error": "Not found"}, 404)
        except ValueError as e:
            self.send_json({"error": str(e)}, 400)

    def do_DELETE(self):
        if not self.require_auth():
            return
        m = re.fullmatch(r"/api/reviews/(\d+)", urlparse(self.path).path)
        if not m:
            return self.send_json({"error": "Not found"}, 404)
        db.execute("DELETE FROM reviews WHERE id=?", (m[1],))
        self.send_json({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Nicoeats running on http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
