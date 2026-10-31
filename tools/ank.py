import argparse
import json
import os
import select
import subprocess
import sys
import termios
import tty
import urllib.error
import urllib.request

COLLECTION_PATH = os.environ.get("ANKI_COLLECTION_PATH")
GEMINI_API_KEY = os.environ.get("ANKI_GEMINI_API_KEY")
API_URL = "https://anki-new-card.vercel.app/api/gemini"
NOTE_MODEL = "Basic"  # model apy adds with, and so the one dupes are checked against

BOLD = "\033[1m"
DIM = "\033[2m"
ITALIC = "\033[3m"
RESET = "\033[0m"
CYAN = "\033[36m"
YELLOW = "\033[33m"


def clear():
    os.system("cls" if os.name == "nt" else "clear")


def get_key():
    """Read one keypress or mouse event.

    Returns a raw key string (e.g. "q", "\r", "\x1b[C") or, for an SGR mouse
    event, a tuple ("mouse", button, col, row, is_press).
    """
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
        if ch != "\x1b":
            return ch
        if sys.stdin.read(1) != "[":
            return ch
        ch3 = sys.stdin.read(1)
        if ch3 != "<":  # arrow keys etc: "\x1b[C", "\x1b[D"
            return "\x1b[" + ch3
        # SGR mouse report: "\x1b[<button;col;row" terminated by 'M' (press) or 'm' (release)
        seq = ""
        while True:
            c = sys.stdin.read(1)
            if c in ("M", "m"):
                break
            seq += c
        try:
            button, col, row = (int(p) for p in seq.split(";"))
        except (ValueError, TypeError):
            return ""
        return ("mouse", button, col, row, c == "M")
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


def get_cursor_pos():
    """Return the terminal cursor position as (row, col), 1-based, or (None, None)."""
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        sys.stdout.write("\033[6n")
        sys.stdout.flush()
        buf = ""
        while True:
            if not select.select([fd], [], [], 0.2)[0]:
                return None, None
            ch = os.read(fd, 1).decode(errors="ignore")
            buf += ch
            if ch == "R":
                break
        body = buf[buf.rfind("\033[") + 2 : -1]  # strip leading ESC[ and trailing R
        row, col = (int(p) for p in body.split(";"))
        return row, col
    except (ValueError, OSError):
        return None, None
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


def button_spans(options):
    """Column ranges (start, end), 1-based inclusive, for each rendered button."""
    spans = []
    col = 1
    for label, _ in options:
        width = len(label) + 2  # one padding space on each side
        spans.append((col, col + width - 1))
        col += width + 2  # skip the two-space separator between buttons
    return spans


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


def sync_collection():
    """Synchronize the collection with AnkiWeb."""
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
            print_card_header(front_display, total_due)
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
            print_card_header(front_display, total_due)
            print()
            back = card.note()["Back"]
            meanings, pronunciation = parse_meaning_html(back)
            if meanings:
                render_entry(meanings, pronunciation)
            else:
                print(html_to_ansi(back))

            print()
            selected = 1  # 0=Again, 1=Good, 2=Add
            again_ivl = col.sched.nextIvlStr(card, 1).replace("<", "")
            good_ivl = col.sched.nextIvlStr(card, 3).replace("<", "")
            options = [(f"Again ({again_ivl})", 1), (f"Good ({good_ivl})", 3), ("Add", None)]
            spans = button_spans(options)
            button_row, _ = get_cursor_pos()  # row the buttons are drawn on
            print("\033[?25l", end="")  # hide cursor
            sys.stdout.write("\033[?1000h\033[?1006h")  # enable SGR mouse tracking
            sys.stdout.flush()
            add_requested = False
            while True:
                display = "  ".join(
                    f"\033[44;97m {opt[0]} \033[0m" if i == selected else f" {opt[0]} "
                    for i, opt in enumerate(options)
                )
                print(f"\r{display}", end="", flush=True)
                key = get_key()

                activate = False
                if isinstance(key, tuple) and key[0] == "mouse":
                    _, button, mx, my, press = key
                    if press and button == 0 and button_row and my == button_row:
                        for i, (start, end) in enumerate(spans):
                            if start <= mx <= end:
                                selected = i
                                activate = True
                                break
                elif key == "q":
                    quit_requested = True
                    break
                elif key == "\x1b[D":  # left arrow
                    selected = max(0, selected - 1)
                elif key == "\x1b[C":  # right arrow
                    selected = min(len(options) - 1, selected + 1)
                elif key in ("\r", "\n"):
                    activate = True

                if activate:
                    if options[selected][1] is None:
                        add_requested = True
                    else:
                        col.sched.answerCard(card, options[selected][1])
                    break

            sys.stdout.write("\033[?1000l\033[?1006l")  # disable mouse tracking
            print("\033[?25h")  # show cursor
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
        sys.stdout.write("\033[?1000l\033[?1006l\033[?25h")  # restore mouse + cursor
        sys.stdout.flush()
        col.close()
        sync_collection()


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
    print(f"Looking up {word}...", flush=True)
    try:
        with urllib.request.urlopen(request, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        print(f"Error: API request failed ({e.code}). {detail}")
        sys.exit(1)
    except TimeoutError:
        print("Error: Word lookup timed out after 15 seconds. Please try again.")
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Error: Could not reach API: {e.reason}")
        sys.exit(1)

    if not data or data.get("error"):
        print(f"Error: {data.get('error', 'Failed to get response')}")
        sys.exit(1)

    return data


def print_card_header(front, total_due):
    """Draw the boxed front, with the word coloured the way --add colours it."""
    width = 38 - len(str(total_due)) - 2
    pad = max(0, width - len(front))
    left, right = pad // 2, pad - pad // 2
    print("╔══════════════════════════════════════╗")
    print(f"║{' ' * left}{BOLD}{CYAN}{front}{RESET}{' ' * right}({total_due})║")
    print("╚══════════════════════════════════════╝")


def render_entry(meanings, pronunciation, word=None):
    """Print meanings the way --add does: a numbered list with highlighted examples."""
    if word:
        print(f"{BOLD}{CYAN}{word}{RESET}")
    if pronunciation:
        print(f"{DIM}{pronunciation}{RESET}")
    print(f"{DIM}────────────────────────────────{RESET}")
    for idx, meaning in enumerate(meanings):
        meaning_text = meaning.get("meaning", "")
        example = meaning.get("example") or ""
        if example:
            print(f"{BOLD}{idx + 1}.{RESET} {BOLD}{CYAN}\"{example}\"{RESET}")
            print(f"   {meaning_text}")
        else:
            print(f"{BOLD}{idx + 1}.{RESET} {meaning_text}")
        print()


def display_suggestion(word, data):
    print()
    render_entry(
        _normalize_meanings(data.get("meanings")),
        data.get("pronunciation") or "",
        word=word,
    )


def parse_meaning_html(html):
    """Recover (meanings, pronunciation) from a Back field built by build_meaning_html.

    Returns ([], "") for anything that does not look like one of our fields, so
    the caller can fall back to printing the raw HTML.
    """
    import re

    body = html or ""
    pronunciation = ""
    match = re.search(
        r"(?:<br\s*/?>\s*)*<span[^>]*color:[^>]*>([^<]*)</span>\s*$",
        body,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if match:
        pronunciation = strip_html(match.group(1))
        body = body[: match.start()]

    meanings = []
    saw_example = False
    for block in re.split(r"<br\s*/?>\s*<br\s*/?>", body, flags=re.IGNORECASE):
        if not strip_html(block):
            continue
        # New cards highlight the example first; accept older cards too.
        leading_example = re.match(
            r'^\s*<span[^>]*(?:small|anki-example)[^>]*>(.*?)</span>\s*<br\s*/?>(.*)$',
            block, flags=re.IGNORECASE | re.DOTALL,
        )
        if leading_example:
            saw_example = True
            example = re.sub(r"^[-\u2013\u2014]\s*", "", strip_html(leading_example.group(1)))
            meanings.append({"meaning": strip_html(leading_example.group(2)), "example": example})
            continue
        parts = re.split(
            r"<br\s*/?>\s*(?=<span[^>]*small|<i>)", block, maxsplit=1, flags=re.IGNORECASE
        )
        example = ""
        if len(parts) > 1:
            saw_example = True
            example = re.sub(r"^[-\u2013\u2014]\s*", "", strip_html(parts[1]))
        meanings.append({"meaning": strip_html(parts[0]), "example": example})

    # Without a pronunciation line or a single small-italic example, this is a
    # hand-written card rather than one of ours: let the raw renderer have it.
    if not meanings or not (saw_example or pronunciation):
        return [], ""
    return meanings, pronunciation


def build_meaning_html(meanings, pronunciation):
    parts = []
    for idx, meaning in enumerate(meanings):
        text = meaning.get("meaning", "")
        example = meaning.get("example")
        part = text
        if example:
            part = '<span class="anki-example" style="color: #268bd2; font-weight: bold;">' + example + "</span><br>" + text
        if idx != len(meanings) - 1:
            part += "<br><br>"
        parts.append(part)
    if pronunciation:
        parts.append(
            f'<br><br><span style="color: #666; font-size: small;">{pronunciation}</span>'
        )
    return "".join(parts)


def open_collection():
    """Open the collection for a direct edit, or exit with a message."""
    require_collection_path()
    try:
        from anki.collection import Collection
    except ImportError:
        print(
            "Error: Anki module not found. Run with: uv run --with anki python anki.py --add WORD"
        )
        sys.exit(1)

    try:
        return Collection(COLLECTION_PATH)
    except Exception as e:  # pylint: disable=broad-except
        print("Error: Could not open database. Is Anki Desktop open?")
        print(f"Details: {e}")
        sys.exit(1)


def find_duplicates(word):
    """Return ids of the notes whose Front already holds word, oldest first.

    Matches on the Front field itself rather than Anki's dupe: search: that one
    keys on a checksum of the raw field, so it treats "Artefact" and "artefact"
    as different words and would add a second note instead of updating.
    """
    col = open_collection()
    try:
        from anki.collection import SearchNode

        query = col.build_search_string(
            SearchNode(note=NOTE_MODEL),
            SearchNode(field=SearchNode.Field(field_name="Front", text=word)),
        )
        return sorted(col.find_notes(query))
    finally:
        col.close()


def update_notes(note_ids, word, meaning_html):
    """Overwrite Front and Back of existing notes, leaving their scheduling alone."""
    col = open_collection()
    try:
        for note_id in note_ids:
            note = col.get_note(note_id)
            note["Front"] = word
            note["Back"] = meaning_html
            col.update_note(note)
    finally:
        col.close()


def add(word, sync=True):
    # Cards are stored lowercase; find_duplicates already matches case-insensitively.
    word = word.lower()
    data = fetch_suggestion(word)
    meanings = _normalize_meanings(data.get("meanings"))
    pronunciation = data.get("pronunciation") or ""

    display_suggestion(word, data)
    note_ids = find_duplicates(word)
    if note_ids:
        copies = f" in {len(note_ids)} cards" if len(note_ids) > 1 else ""
        question = f"{YELLOW}Already in Anki{copies}.{RESET} Update? [Y/n] "
    else:
        question = "Add to Anki? [Y/n] "
    try:
        reply = input(question).strip().lower()
    except (KeyboardInterrupt, EOFError):
        print("\nSkipped.")
        return
    if reply.startswith("n"):
        print("Skipped.")
        return

    meaning_html = build_meaning_html(meanings, pronunciation)
    if note_ids:
        update_notes(note_ids, word, meaning_html)
        print(f"Updated: {word}")
        if sync:
            sync_collection()
        return

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


def set_limit(num):
    require_collection_path()
    try:
        from anki.collection import Collection
    except ImportError:
        print(
            "Error: Anki module not found. Run with: uv run --with anki python anki.py --limit N"
        )
        sys.exit(1)

    try:
        col = Collection(COLLECTION_PATH)
    except Exception as e:  # pylint: disable=broad-except
        print("Error: Could not open database. Is Anki Desktop open?")
        print(f"Details: {e}")
        return

    try:
        for conf in col.decks.all_config():
            old = conf["rev"]["perDay"]
            conf["rev"]["perDay"] = num
            col.decks.update_config(conf)
            print(f"{conf['name']}: reviews/day {old} -> {num}")
    finally:
        col.close()

    try:
        subprocess.run(["apy", "sync"], check=True)
    except FileNotFoundError:
        print("Error: 'apy' command not found. Install it or add to PATH.")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error: 'apy sync' failed (exit {e.returncode}).")
        sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Anki study helper.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--study", action="store_true", help="Review due cards (default).")
    group.add_argument(
        "--add",
        metavar="WORD",
        help="Add a card for WORD, updating the existing one if it is already there.",
    )
    group.add_argument(
        "--limit", metavar="NUM", type=int, help="Set the daily reviews/day limit."
    )
    group.add_argument(
        "--sync", action="store_true", help="Sync the collection with AnkiWeb only."
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if args.add:
        word = args.add.strip()
        if not word:
            print("Error: Please provide a non-empty word for --add")
            sys.exit(1)
        add(word)
    elif args.limit is not None:
        if args.limit < 0:
            print("Error: --limit must be a non-negative integer")
            sys.exit(1)
        set_limit(args.limit)
    elif args.sync:
        sync_collection()
    else:
        study()


if __name__ == "__main__":
    main()
