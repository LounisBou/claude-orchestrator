"""stop_gate.py - the stop gate's checks, run by stop-gate.sh on the host's Stop event.

Reads the host's payload on stdin (`session_id`, `cwd`, `last_assistant_message`,
`stop_hook_active`). Refuses a stop by printing `{"decision": "block", "reason": …}`;
lets it pass by printing nothing. Acts only in an orchestrator's session, one whose name in
the launcher's listing starts with `Orch :`.

Check 1, what will wake you. The stop passes when an agent of this orchestrator is busy
(its idle notice will wake the orchestrator), when the message ends on the machine line
`waiting: operator — blocks: <what it blocks>`, or when it ends on `waiting: done` and the
facts agree: no checkout of the project in `workspace.sh list`, no agent of this
orchestrator still there. The agents of this orchestrator are the entries of the chain the
launcher keeps for its tty, those its own session wrote (`chain_owned`, the session read
from ITERM_SESSION_ID, the same id the launcher stores as the owner). An agent's state is
the activity glyph its tab title carries in the listing: `✳` idle, a spinner glyph busy, no
glyph at all no agent running there.

Check 2, the real CI state, runs only when Check 1 let the stop pass. Each open pull
request of the session's repository whose head differs from the head this hook last
reported for this session is read with `gh pr checks`; any check pending or failing refuses
the stop once with the real state, and the head is recorded so the same head never refuses
twice. It reads facts, never the words of the message: a list of claim words fails open on
any rewording and in any language.

Its own failures never block: a missing tool, an unreadable listing or a network error lets
the stop pass and appends one line to `<state>/stop-gate.log`, beside one line per refusal
and per `blocks:` stop. The figures that say whether the gate earns its cost are read there.

WHY A HOOK. « Never end a turn on announced work » and « a fact you did not read is a fact
you do not state » existed as rules and did not hold: an orchestrator announced an agent and
ended its turn with none running, and twice stated a pull request's checks before they had
finished. Both happen at one moment, the stop, and the harness holds that moment.
"""

import datetime
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LAUNCHER_DIR = os.path.join(ROOT, "skills", "iterm-agents", "scripts")
LAUNCHER = os.path.join(LAUNCHER_DIR, "iterm-agent.sh")
WORKSPACE = os.path.join(ROOT, "skills", "orchestrator", "scripts", "workspace.sh")
# The launcher's own resolution: the chains it keeps live there.
STATE_DIR = os.environ.get("ORCHESTRATOR_STATE_DIR") or os.path.join(
    os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude"),
    "claude-orchestrator",
)
LOG = os.path.join(STATE_DIR, "stop-gate.log")
HEADS_DIR = os.path.join(STATE_DIR, "stop-gate")

ORCH_ROLE = "Orch :"
IDLE_GLYPH = "✳"
MACHINE_LINE = re.compile(r"^waiting: (operator — blocks: (.+)|done)$")
# Every external call is bounded: a stop the hook holds on its own wait is a failure too.
CALL_TIMEOUT = 30

NOTHING = ("Nothing will wake you: no agent of yours is running. Launch what you announced, "
           "or end with `waiting: operator — blocks: …` if a question truly blocks, "
           "or `waiting: done`.")
IDLE_ONE = "%s is idle: its notice was spent. Read its report or relaunch it."
IDLE_MANY = "%s are idle: their notices were spent. Read their reports or relaunch them."
QUESTION = ("Your question blocks nothing declared: advance everything that can advance; "
            "its answer will come in a later turn.")
NOT_DONE_ONE = "Not done: %s is still there. Finish it, or say what blocks it."
NOT_DONE_MANY = "Not done: %s are still there. Finish them, or say what blocks them."
CI_STATE = ("#%s at %s: %d checks pending (%s), %d failing (%s). Report this state as it is, "
            "or wait for the end in one call: `timeout 590 gh pr checks %s --watch`.")


class Unread(Exception):
    """A source the hook could not read. The stop passes and the log says which."""


def log(who, *fields):
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    line = " | ".join([stamp, who or "-"] + [" ".join(str(f).split()) for f in fields])
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(LOG, "a") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def run(argv, cwd=None, what=None):
    """stdout, stderr and the exit code of a bounded call; Unread when it cannot run."""
    what = what or os.path.basename(argv[0])
    try:
        done = subprocess.run(argv, cwd=cwd, capture_output=True, text=True,
                              timeout=CALL_TIMEOUT)
    except FileNotFoundError:
        raise Unread("%s is not installed" % what)
    except subprocess.TimeoutExpired:
        raise Unread("%s did not answer within %ds" % (what, CALL_TIMEOUT))
    except OSError as exc:
        raise Unread("%s cannot run: %s" % (what, exc))
    return done.stdout, done.stderr, done.returncode


def first_line(text):
    return (text.strip().splitlines() or [""])[0]


# --- the listing ------------------------------------------------------------------------

def parse_row(line):
    """`w1/t2 | <tty> | <title> | <name>[ | self][ | hidden]`, the launcher's `row_for`."""
    parts = line.split(" | ")
    if len(parts) < 4:
        return None
    marks = set()
    while len(parts) > 4 and parts[-1] in ("self", "hidden"):
        marks.add(parts.pop())
    return {"tty": parts[1], "title": " | ".join(parts[2:-1]), "name": parts[-1],
            "self": "self" in marks}


def listing():
    out, err, code = run(["bash", LAUNCHER, "list"], what="the launcher's listing")
    if code != 0:
        raise Unread("the launcher's listing failed: %s" % first_line(err))
    return [r for r in (parse_row(l) for l in out.splitlines()) if r]


def activity(title):
    """`idle`, `busy`, or None when the title carries no host activity glyph: a shell
    left behind by an agent that exited, or a stranger's tab on a recycled tty."""
    glyph = (title.split(" ", 1) or [""])[0]
    if glyph == IDLE_GLYPH:
        return "idle"
    if len(glyph) == 1 and ord(glyph) > 127 and not glyph.isalnum():
        return "busy"
    return None


def label(row):
    name = row["name"]
    if name and not name.startswith("("):
        return name
    return row["title"] or row["tty"]


# --- check 1 ----------------------------------------------------------------------------

def launcher():
    """The launcher's own module: the chain and the session's tty are read by its code."""
    sys.path.insert(0, LAUNCHER_DIR)
    try:
        import iterm_agent
    except Exception as exc:
        raise Unread("the launcher's module cannot be loaded: %s" % exc)
    return iterm_agent


def own_row(rows):
    """The session's own row: the one the listing marks `self`, else the one on the tty the
    launcher resolves for this process. Its AppleScript rung marks no row, and a gate that
    read that as « not an orchestrator » would fall silent without a word."""
    marked = next((r for r in rows if r["self"]), None)
    if marked:
        return marked
    own = launcher().self_tty()
    return next((r for r in rows if own and r["tty"] == own), None)


def own_agents(rows, own_tty):
    """(label, idle|busy) for each agent of this orchestrator whose tab runs one."""
    iterm_agent = launcher()
    owner = os.environ.get("ITERM_SESSION_ID", "").rpartition(":")[2]
    entries = iterm_agent.chain_owned(iterm_agent.chain_read(own_tty), owner)
    by_tty = {r["tty"]: r for r in rows}
    agents = []
    for entry in entries:
        row = by_tty.get(entry["tty"])
        state = activity(row["title"]) if row else None
        if state:
            agents.append((label(row), state))
    return agents


def machine_line(message):
    lines = [l.rstrip() for l in message.splitlines() if l.strip()]
    return lines[-1] if lines else ""


def project_checkouts(cwd):
    """The checkouts `workspace.sh` made of the session's project: <root>/<project>/<name>."""
    out, _, code = run(["git", "-C", cwd, "rev-parse", "--show-toplevel"], what="git")
    top = out.strip() if code == 0 else os.path.realpath(cwd)
    project = os.path.basename(top)
    out, err, code = run(["bash", WORKSPACE, "list"], what="workspace.sh list")
    if code != 0:
        raise Unread("workspace.sh list failed: %s" % first_line(err))
    found = []
    for line in out.splitlines():
        path = line.split(" | ", 1)[0].strip()
        if path and path != top and os.path.basename(os.path.dirname(path)) == project:
            found.append(path)
    return found


def check_wake(rows, own_tty, message, cwd, who):
    """None when something will wake the orchestrator, else (case, reason)."""
    agents = own_agents(rows, own_tty)
    if any(state == "busy" for _, state in agents):
        return None
    last = machine_line(message)
    matched = MACHINE_LINE.match(last)
    if matched and matched.group(2):
        log(who, "check1", "blocks", matched.group(2))
        return None
    if matched:
        left = project_checkouts(cwd) + [name for name, _ in agents]
        if not left:
            return None
        form = NOT_DONE_ONE if len(left) == 1 else NOT_DONE_MANY
        return "not-done", form % ", ".join(left)
    if agents:
        form = IDLE_ONE if len(agents) == 1 else IDLE_MANY
        return "idle-agents", form % ", ".join(name for name, _ in agents)
    if last.startswith("waiting:") or last.endswith("?"):
        return "question-without-blocks", QUESTION
    return "nothing-will-wake", NOTHING


# --- check 2 ----------------------------------------------------------------------------

def heads_path(session_id):
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", session_id)
    return os.path.join(HEADS_DIR, safe + ".heads")


def read_heads(path):
    heads = {}
    try:
        with open(path) as fh:
            for line in fh:
                parts = line.split()
                if len(parts) == 2:
                    heads[parts[0]] = parts[1]
    except OSError:
        pass
    return heads


def write_heads(path, heads):
    try:
        os.makedirs(HEADS_DIR, exist_ok=True)
        with open(path + ".tmp", "w") as fh:
            for number in sorted(heads, key=int):
                fh.write("%s %s\n" % (number, heads[number]))
        os.replace(path + ".tmp", path)
    except OSError as exc:
        raise Unread("the reported heads cannot be written: %s" % exc)


def gh_json(argv, cwd, tolerated=()):
    """The JSON `gh` printed. `gh pr checks` exits 8 on pending and 1 on failing checks,
    so the exit code alone is no error: the output is."""
    out, err, code = run(["gh"] + argv, cwd=cwd)
    if any(t in err for t in tolerated):
        return []
    try:
        return json.loads(out)
    except ValueError:
        raise Unread("gh %s failed (exit %d): %s" % (" ".join(argv[:2]), code, first_line(err)))


def check_ci(cwd, session_id):
    """The refusal lines, one per pull request whose new head has checks pending or failing."""
    if not session_id:
        raise Unread("no session id: the reported heads cannot be kept")
    prs = gh_json(["pr", "list", "--state", "open", "--json", "number,headRefOid"], cwd)
    path = heads_path(session_id)
    reported = read_heads(path)
    heads, lines = {}, []
    for pr in prs:
        number, head = str(pr["number"]), pr["headRefOid"]
        heads[number] = head
        if reported.get(number) == head:
            continue
        checks = gh_json(["pr", "checks", number, "--json", "name,bucket"], cwd,
                         tolerated=("no checks reported",))
        pending = [c["name"] for c in checks if c.get("bucket") == "pending"]
        failing = [c["name"] for c in checks if c.get("bucket") in ("fail", "cancel")]
        if pending or failing:
            lines.append(CI_STATE % (number, head[:7], len(pending), ", ".join(pending),
                                     len(failing), ", ".join(failing), number))
    write_heads(path, heads)
    return lines


# --- the stop ---------------------------------------------------------------------------

def refuse(reason):
    print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=False))


def gate(payload):
    if payload.get("stop_hook_active"):
        return
    session_id = payload.get("session_id") or ""
    cwd = payload.get("cwd") or os.getcwd()
    message = payload.get("last_assistant_message") or ""
    who = session_id
    try:
        rows = listing()
        me = own_row(rows)
        if me is None or not me["name"].startswith(ORCH_ROLE):
            return
        who = me["name"]
        held = check_wake(rows, me["tty"], message, cwd, who)
        if held:
            log(who, "check1", held[0])
            refuse(held[1])
            return
        lines = check_ci(cwd, session_id)
        if lines:
            log(who, "check2", "ci-not-finished", " ; ".join(l.split(". Report")[0] for l in lines))
            refuse("\n".join(lines))
    except Unread as exc:
        log(who, "error", str(exc))


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except ValueError as exc:
        log("", "error", "the payload is not JSON: %s" % exc)
        return
    if not isinstance(payload, dict):
        log("", "error", "the payload is not an object")
        return
    try:
        gate(payload)
    except Exception as exc:
        log(payload.get("session_id") or "", "error", "%s: %s" % (type(exc).__name__, exc))


if __name__ == "__main__":
    main()
