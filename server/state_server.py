"""Simple HTTP server to persist button states and schedules.

Run this on the Linux host (e.g. 192.168.1.40) with::

    python3 server/state_server.py

This starts the button state API on port 5000 and serves the web UI
from ``server/web`` on port 8000.

Endpoints::

* ``GET /states`` – return all button states as JSON.
* ``POST /state`` – update a single button state. The request body must contain
  ``chip``, ``pin`` and ``state`` fields.
* ``GET /schedules`` – return configured schedules.
* ``POST /schedule`` – create or replace a schedule.

States are persisted to ``button_states.json`` and schedules to
``schedules.json`` in the current working directory so they survive restarts.
"""

from http.server import BaseHTTPRequestHandler, HTTPServer, SimpleHTTPRequestHandler
import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import partial

STATE_FILE = "button_states.json"
SCHEDULE_FILE = "schedules.json"
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


def parse_timedelta(data):
    if not data:
        return timedelta(0)
    return timedelta(
        weeks=int(data.get("weeks", 0)),
        days=int(data.get("days", 0)),
        hours=int(data.get("hours", 0)),
        minutes=int(data.get("minutes", 0)),
        seconds=int(data.get("seconds", 0)),
    )


def add_interval(dt, repeat):
    """Return dt advanced by the repeat interval.

    Supports ``years`` and ``months`` as well as timedelta fields.
    """

    years = int(repeat.get("years", 0))
    months = int(repeat.get("months", 0)) + years * 12
    if months:
        month = dt.month - 1 + months
        year = dt.year + month // 12
        month = month % 12 + 1
        # clamp day to end of month
        days_in_month = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                         31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
        day = min(dt.day, days_in_month)
        dt = dt.replace(year=year, month=month, day=day)
    td = timedelta(
        weeks=int(repeat.get("weeks", 0)),
        days=int(repeat.get("days", 0)),
        hours=int(repeat.get("hours", 0)),
        minutes=int(repeat.get("minutes", 0)),
        seconds=int(repeat.get("seconds", 0)),
    )
    return dt + td


def load_schedules():
    data = []
    if os.path.exists(SCHEDULE_FILE):
        with open(SCHEDULE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    schedules = []
    for s in data:
        sched = {
            "chip": int(s["chip"]),
            "pin": int(s["pin"]),
            "name": s.get("name", ""),
            "due_dt": datetime.fromisoformat(s["due"]),
            "repeat": s.get("repeat", {}),
            "overdue": s.get("overdue", {}),
            "active": False,
            "flashing": False,
        }
        schedules.append(sched)
    return schedules


def save_schedules():
    data = []
    for s in SCHEDULES:
        data.append(
            {
                "chip": s["chip"],
                "pin": s["pin"],
                "name": s.get("name", ""),
                "due": s["due_dt"].isoformat(),
                "repeat": s.get("repeat", {}),
                "overdue": s.get("overdue", {}),
            }
        )
    with open(SCHEDULE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f)


def set_state(chip, pin, state):
    STATES[chip][pin] = state
    save_states(STATES)


STATES = load_states()
SCHEDULES = load_schedules()


class Handler(BaseHTTPRequestHandler):
    def _set_json_headers(self, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_json_headers(204)

    def do_GET(self):
        if self.path == "/states":
            self._set_json_headers()
            self.wfile.write(json.dumps({"states": STATES}).encode())
        elif self.path == "/schedules":
            self._set_json_headers()
            out = []
            for s in SCHEDULES:
                out.append(
                    {
                        "chip": s["chip"],
                        "pin": s["pin"],
                        "name": s.get("name", ""),
                        "due": s["due_dt"].isoformat(),
                        "repeat": s.get("repeat", {}),
                        "overdue": s.get("overdue", {}),
                        "active": s.get("active", False),
                        "flashing": s.get("flashing", False),
                    }
                )
            self.wfile.write(json.dumps({"schedules": out}).encode())
        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        data = json.loads(self.rfile.read(length).decode())
        if self.path == "/state":
            try:
                chip = int(data["chip"])
                pin = int(data["pin"])
                state = 1 if data["state"] else 0
                if 0 <= chip < NUM_CHIPS and 0 <= pin < NUM_PINS:
                    set_state(chip, pin, state)
                    if state == 0:
                        handle_reset(chip, pin)
                    self._set_json_headers()
                    self.wfile.write(b"{}")
                    return
            except (KeyError, ValueError, TypeError):
                pass
            self.send_error(400, "Bad Request")
        elif self.path == "/schedule":
            try:
                chip = int(data["chip"])
                pin = int(data["pin"])
                name = data.get("name", "")
                due = datetime.fromisoformat(data["due"])
                repeat = data.get("repeat", {})
                overdue = data.get("overdue", {})
                # remove existing schedule for this light
                for s in list(SCHEDULES):
                    if s["chip"] == chip and s["pin"] == pin:
                        SCHEDULES.remove(s)
                SCHEDULES.append(
                    {
                        "chip": chip,
                        "pin": pin,
                        "name": name,
                        "due_dt": due,
                        "repeat": repeat,
                        "overdue": overdue,
                        "active": False,
                        "flashing": False,
                    }
                )
                save_schedules()
                self._set_json_headers()
                self.wfile.write(b"{}")
                return
            except (KeyError, ValueError, TypeError):
                pass
            self.send_error(400, "Bad Request")
        elif self.path == "/schedule/delete":
            try:
                chip = int(data["chip"])
                pin = int(data["pin"])
                for s in list(SCHEDULES):
                    if s["chip"] == chip and s["pin"] == pin:
                        SCHEDULES.remove(s)
                save_schedules()
                self._set_json_headers()
                self.wfile.write(b"{}")
                return
            except (KeyError, ValueError, TypeError):
                pass
            self.send_error(400, "Bad Request")
        else:
            self.send_error(404, "Not Found")

    def send_error(self, code, message=None):
        self._set_json_headers(code)
        if message:
            self.wfile.write(json.dumps({"error": message}).encode())
        else:
            self.wfile.write(b"{}")


def handle_reset(chip, pin):
    now = datetime.now(timezone.utc)
    for s in list(SCHEDULES):
        if s["chip"] == chip and s["pin"] == pin:
            if s.get("repeat"):
                s["active"] = False
                s["flashing"] = False
                s["due_dt"] = add_interval(s["due_dt"], s["repeat"])
                while s["due_dt"] <= now:
                    s["due_dt"] = add_interval(s["due_dt"], s["repeat"])
            else:
                SCHEDULES.remove(s)
            save_schedules()
            break


def schedule_loop():
    while True:
        now = datetime.now(timezone.utc)
        for s in SCHEDULES:
            if not s["active"] and now >= s["due_dt"]:
                s["active"] = True
                set_state(s["chip"], s["pin"], 1)
                s["overdue_start"] = now + parse_timedelta(s.get("overdue"))
            if s["active"]:
                if not s.get("flashing") and STATES[s["chip"]][s["pin"]] == 0:
                    set_state(s["chip"], s["pin"], 1)
                overdue_start = s.get("overdue_start")
                if overdue_start and now >= overdue_start and not s.get("flashing"):
                    s["flashing"] = True
                    s["last_flash"] = int(time.time())
                if s.get("flashing"):
                    current_sec = int(time.time())
                    if current_sec != s.get("last_flash"):
                        s["last_flash"] = current_sec
                        new_state = 0 if STATES[s["chip"]][s["pin"]] else 1
                        set_state(s["chip"], s["pin"], new_state)
        time.sleep(1)


def run_web_server():
    web_dir = os.path.join(os.path.dirname(__file__), "web")
    handler = partial(SimpleHTTPRequestHandler, directory=web_dir)
    server = HTTPServer(("", 8000), handler)
    print("Serving web interface on port 8000")
    server.serve_forever()


def run():
    server_address = ("", 5000)
    httpd = HTTPServer(server_address, Handler)
    print("Starting button state server on port 5000")
    threading.Thread(target=schedule_loop, daemon=True).start()
    threading.Thread(target=run_web_server, daemon=True).start()
    httpd.serve_forever()


if __name__ == "__main__":
    run()

