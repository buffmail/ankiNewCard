import argparse
import json
import os
import subprocess
import sys
import termios
import tty
import urllib.error
import urllib.request

COLLECTION_PATH = os.environ.get("ANKI_COLLECTION_PATH")
GEMINI_API_KEY = os.environ.get("ANKI_GEMINI_API_KEY")
API_URL = "https://anki-new-card.vercel.app/api/gemini"

BOLD = "\033[1m"
DIM = "\033[2m"
ITALIC = "\033[3m"
RESET = "\033[0m"
CYAN = "\033[36m"
YELLOW = "\033[33m"


def clear():
    os.system("cls" if os.name == "nt" else "clear")


def get_key():
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
        if ch == "\x1b":
            ch += sys.stdin.read(2)
        return ch
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


def strip_html(text):
    import re

    clean = re.sub(r"<[^>]+>", "", text)
    clean = re.sub(r"&nbsp;", " ", clean)
    clean = re.sub(r"&lt;", "<", clean)
    clean = re.sub(r"&gt;", ">", clean)
    clean = re.sub(r"&amp;", "&", clean)
    return clean.strip()


def html_to_ansi(text):
    import re

    replacements = [
        (r"<br\s*/?>", "\n"),
        (r"<b>|<strong>", "\033[1m"),
        (r"</b>|</strong>", "\033[22m"),
        (r"<i>|<em>", "\033[3m"),
        (r"</i>|</em>", "\033[23m"),
        (r"<u>", "\033[4m"),
        (r"</u>", "\033[24m"),
        (r"<div[^>]*>", ""),
        (r"</div>", "\n"),
        (r"<p[^>]*>", ""),
        (r"</p>", "\n"),
        (r"<span[^>]*>", ""),
        (r"</span>", ""),
        (r"&nbsp;", " "),
        (r"&lt;", "<"),
        (r"&gt;", ">"),
        (r"&amp;", "&"),
        (r"<[^>]+>", ""),
    ]
    result = text
    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result + "\033[0m"


def require_collection_path():
    if not COLLECTION_PATH:
        print("Error: ANKI_COLLECTION_PATH environment variable not set.")
        print("Set it to your collection path, e.g.:")
        print(
            '  export ANKI_COLLECTION_PATH="$HOME/Library/Application Support/Anki2/YourProfile/collection.anki2"'
        )
        sys.exit(1)
    if not os.path.exists(COLLECTION_PATH):
        print(f"Error: Database not found at {COLLECTION_PATH}")
        sys.exit(1)


def sync_after_study():
    """Sync collection after any study session exit."""
    try:
        subprocess.run(["apy", "sync"], check=True)
    except FileNotFoundError:
        print("Error: 'apy' command not found. Install it or add to PATH.")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error: 'apy sync' failed (exit {e.returncode}).")
        sys.exit(1)


def study():
    require_collection_path()
    try:
        from anki.collection import Collection
    except ImportError:
        print(
            "Error: Anki module not found. Run with: uv run --with anki python anki.py --study"
        )
        sys.exit(1)

    try:
        col = Collection(COLLECTION_PATH)
    except Exception as e:  # pylint: disable=broad-except
        print("Error: Could not open database. Is Anki Desktop open?")
        print(f"Details: {e}")
        return

    quit_requested = False
    try:
        while True:
            card = col.sched.getCard()
            if not card:
                print("\033[?25h", end="")  # show cursor
                print("\n🎉 No more cards due! Great job.")
                break

            counts = col.sched.counts()
            total_due = counts[0] + counts[1] + counts[2]

            clear()
            front = strip_html(card.note()["Front"]).replace("\n", " ")
            max_len = 38 - len(str(total_due)) - 3
            front_display = front[:max_len] if len(front) > max_len else front
            print("╔══════════════════════════════════════╗")
            print(f"║{front_display:^{38-len(str(total_due))-2}}({total_due})║")
            print("╚══════════════════════════════════════╝")
            print("\n(Press Enter to show answer, q to quit)")

            try:
                user_input = input()
            except KeyboardInterrupt:
                print("\033[?25h", end="")  # show cursor
                print("\nExiting...")
                quit_requested = True
                break

            if user_input.lower() == "q":
                quit_requested = True
                break

            clear()
            print("╔══════════════════════════════════════╗")
            print(f"║{front_display:^{38-len(str(total_due))-2}}({total_due})║")
            print("╚══════════════════════════════════════╝")
            print()
            print(html_to_ansi(card.note()["Back"]))

            print()
            selected = 1  # 0=Again, 1=Good, 2=Add
            again_ivl = col.sched.nextIvlStr(card, 1).replace("<", "")
            good_ivl = col.sched.nextIvlStr(card, 3).replace("<", "")
            options = [(f"Again ({again_ivl})", 1), (f"Good ({good_ivl})", 3), ("Add", None)]
            print("\033[?25l", end="")  # hide cursor
            add_requested = False
            while True:
                display = "  ".join(
                    f"\033[44;97m {opt[0]} \033[0m" if i == selected else f" {opt[0]} "
                    for i, opt in enumerate(options)
                )
                print(f"\r{display}", end="", flush=True)
                key = get_key()
                if key == "q":
                    print("\033[?25h")  # show cursor
                    quit_requested = True
                    break
                if key == "\x1b[D":  # left arrow
                    selected = max(0, selected - 1)
                elif key == "\x1b[C":  # right arrow
                    selected = min(len(options) - 1, selected + 1)
                elif key in ("\r", "\n"):
                    print("\033[?25h", end="")  # show cursor
                    print()
                    if options[selected][1] is None:
                        add_requested = True
                    else:
                        col.sched.answerCard(card, options[selected][1])
                    break
            if quit_requested:
                break
            if add_requested:
                col.close()
                try:
                    new_word = input("Word to add: ").strip()
                except (KeyboardInterrupt, EOFError):
                    new_word = ""
                if new_word:
                    add(new_word, sync=False)
                col = Collection(COLLECTION_PATH)
                continue
    finally:
        col.close()
        sync_after_study()


def _normalize_meanings(raw_meanings):
    meanings = raw_meanings or []
    if isinstance(meanings, dict):
        def key_order(key):
            try:
                return int(key)
            except (TypeError, ValueError):
                return key

        meanings = [meanings[k] for k in sorted(meanings, key=key_order)]
    return meanings


def fetch_suggestion(word):
    if not GEMINI_API_KEY:
        print("Error: ANKI_GEMINI_API_KEY environment variable is not set")
        sys.exit(1)

    payload = json.dumps({"word": word, "apiKey": GEMINI_API_KEY}).encode("utf-8")
    request = urllib.request.Request(
        API_URL, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        print(f"Error: API request failed ({e.code}). {detail}")
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Error: Could not reach API: {e.reason}")
        sys.exit(1)

    if not data or data.get("error"):
        print(f"Error: {data.get('error', 'Failed to get response')}")
        sys.exit(1)

    return data


def display_suggestion(word, data):
    pronunciation = data.get("pronunciation") or ""
    meanings = _normalize_meanings(data.get("meanings"))

    print()
    print(f"{BOLD}{CYAN}{word}{RESET}")
    if pronunciation:
        print(f"{DIM}{pronunciation}{RESET}")
    print(f"{DIM}────────────────────────────────{RESET}")
    for idx, meaning in enumerate(meanings):
        meaning_text = meaning.get("meaning", "")
        example = meaning.get("example") or ""
        print(f"{BOLD}{idx + 1}.{RESET} {meaning_text}")
        if example:
            print(f"   {DIM}{ITALIC}\"{example}\"{RESET}")
        print()


def build_meaning_html(meanings, pronunciation):
    parts = []
    for idx, meaning in enumerate(meanings):
        text = meaning.get("meaning", "")
        example = meaning.get("example")
        part = text
        if example:
            part += '<br><span style="font-size: small;"><i> - ' + example + "</i></span>"
        if idx != len(meanings) - 1:
            part += "<br><br>"
        parts.append(part)
    if pronunciation:
        parts.append(
            f'<br><br><span style="color: #666; font-size: small;">{pronunciation}</span>'
        )
    return "".join(parts)


def add(word, sync=True):
    data = fetch_suggestion(word)
    meanings = _normalize_meanings(data.get("meanings"))
    pronunciation = data.get("pronunciation") or ""

    display_suggestion(word, data)
    try:
        reply = input("Add to Anki? [Y/n] ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        print("\nSkipped.")
        return
    if reply.startswith("n"):
        print("Skipped.")
        return

    meaning_html = build_meaning_html(meanings, pronunciation)
    try:
        subprocess.run(["apy", "add-single", word, meaning_html], check=True)
        if sync:
            subprocess.run(["apy", "sync"], check=True)
    except FileNotFoundError:
        print("Error: 'apy' command not found. Install it or add to PATH.")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error: failed to add card (exit {e.returncode}).")
        sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Anki study helper.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--study", action="store_true", help="Review due cards (default).")
    group.add_argument("--add", metavar="WORD", help="Generate and add a new card for WORD.")
    return parser.parse_args()


def main():
    args = parse_args()
    if args.add:
        word = args.add.strip()
        if not word:
            print("Error: Please provide a non-empty word for --add")
            sys.exit(1)
        add(word)
    else:
        study()


if __name__ == "__main__":
    main()
