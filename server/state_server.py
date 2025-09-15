"""Simple HTTP server to persist button states.

Run this on the Linux host (e.g. 192.168.1.40) with:

    python3 server/state_server.py

It exposes two endpoints:

* ``GET /states`` – return all button states as JSON.
* ``POST /state`` – update a single button state. The request body must be
  JSON containing ``chip``, ``pin`` and ``state`` fields.

States are persisted to ``button_states.json`` in the current working
directory so they survive restarts.
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os

STATE_FILE = "button_states.json"
NUM_CHIPS = 3
NUM_PINS = 6


def load_states():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return [[0 for _ in range(NUM_PINS)] for _ in range(NUM_CHIPS)]


def save_states(states):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(states, f)


STATES = load_states()


class Handler(BaseHTTPRequestHandler):
    def _set_json_headers(self, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()

    def do_GET(self):
        if self.path == "/states":
            self._set_json_headers()
            self.wfile.write(json.dumps({"states": STATES}).encode())
        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        if self.path == "/state":
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length).decode())
            try:
                chip = int(data["chip"])
                pin = int(data["pin"])
                state = 1 if data["state"] else 0
                if 0 <= chip < NUM_CHIPS and 0 <= pin < NUM_PINS:
                    STATES[chip][pin] = state
                    save_states(STATES)
                    self._set_json_headers()
                    self.wfile.write(b"{}")
                    return
            except (KeyError, ValueError, TypeError):
                pass
            self.send_error(400, "Bad Request")
        else:
            self.send_error(404, "Not Found")


def run():
    server_address = ("", 5000)
    httpd = HTTPServer(server_address, Handler)
    print("Starting button state server on port 5000")
    httpd.serve_forever()


if __name__ == "__main__":
    run()

