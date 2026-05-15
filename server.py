"""Minimal static-file server for Heroku (serves the Vite build from dist)."""

import http.server
import os
from pathlib import Path

PORT = int(os.environ.get("PORT", 8000))
DIST = str(Path(__file__).resolve().parent / "dist")


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """Serves static files; falls back to index.html for client-side routing."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST, **kwargs)

    def do_GET(self):
        path = Path(self.translate_path(self.path))
        if not path.exists() and not path.suffix:
            self.path = "/index.html"
        return super().do_GET()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    with http.server.HTTPServer(("0.0.0.0", PORT), SPAHandler) as httpd:
        print(f"Serving {DIST} on :{PORT}", flush=True)
        httpd.serve_forever()
