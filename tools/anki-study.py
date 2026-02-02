import sys
import os
import tty
import termios

COLLECTION_PATH = os.environ.get('ANKI_COLLECTION_PATH')
if not COLLECTION_PATH:
    print("Error: ANKI_COLLECTION_PATH environment variable not set.")
    print("Set it to your collection path, e.g.:")
    print("  export ANKI_COLLECTION_PATH=\"$HOME/Library/Application Support/Anki2/YourProfile/collection.anki2\"")
    sys.exit(1)

try:
    from anki.collection import Collection
except ImportError:
    print("Error: Anki module not found. Run with: uv run --with anki python study.py")
    sys.exit(1)

def clear():
    os.system('cls' if os.name == 'nt' else 'clear')

def get_key():
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
        if ch == '\x1b':
            ch += sys.stdin.read(2)
        return ch
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)

def strip_html(text):
    import re
    clean = re.sub(r'<[^>]+>', '', text)
    clean = re.sub(r'&nbsp;', ' ', clean)
    clean = re.sub(r'&lt;', '<', clean)
    clean = re.sub(r'&gt;', '>', clean)
    clean = re.sub(r'&amp;', '&', clean)
    return clean.strip()

def html_to_ansi(text):
    import re
    # Convert HTML tags to ANSI codes
    replacements = [
        (r'<br\s*/?>', '\n'),
        (r'<b>|<strong>', '\033[1m'),
        (r'</b>|</strong>', '\033[22m'),
        (r'<i>|<em>', '\033[3m'),
        (r'</i>|</em>', '\033[23m'),
        (r'<u>', '\033[4m'),
        (r'</u>', '\033[24m'),
        (r'<div[^>]*>', ''),
        (r'</div>', '\n'),
        (r'<p[^>]*>', ''),
        (r'</p>', '\n'),
        (r'<span[^>]*>', ''),
        (r'</span>', ''),
        (r'&nbsp;', ' '),
        (r'&lt;', '<'),
        (r'&gt;', '>'),
        (r'&amp;', '&'),
        (r'<[^>]+>', ''),  # Remove remaining tags
    ]
    result = text
    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result + '\033[0m'  # Reset at end

def study():
    if not os.path.exists(COLLECTION_PATH):
        print(f"Error: Database not found at {COLLECTION_PATH}")
        return

    # 1. Load Collection
    try:
        col = Collection(COLLECTION_PATH)
    except Exception as e:
        print("Error: Could not open database. Is Anki Desktop open?")
        print(f"Details: {e}")
        return

    while True:
        # 2. Get Next Card
        card = col.sched.getCard()
        if not card:
            print('\033[?25h', end='')  # Show cursor
            print("\n🎉 No more cards due! Great job.")
            break

        # Get due card count
        counts = col.sched.counts()
        total_due = counts[0] + counts[1] + counts[2]  # new + learn + review

        # 3. Show Front
        clear()
        front = strip_html(card.note()['Front']).replace('\n', ' ')
        max_len = 38 - len(str(total_due)) - 3
        front_display = front[:max_len] if len(front) > max_len else front
        print("╔══════════════════════════════════════╗")
        print(f"║{front_display:^{38-len(str(total_due))-2}}({total_due})║")
        print("╚══════════════════════════════════════╝")
        print("\n(Press Enter to show answer, q to quit)")

        try:
            if input().lower() == 'q':
                col.close()
                return
        except KeyboardInterrupt:
            print('\033[?25h', end='')  # Show cursor
            print("\nExiting...")
            break

        # 4. Show Back
        clear()
        print("╔══════════════════════════════════════╗")
        print(f"║{front_display:^{38-len(str(total_due))-2}}({total_due})║")
        print("╚══════════════════════════════════════╝")
        print()
        print(html_to_ansi(card.note()['Back']))

        # 5. Rate
        print()
        selected = 1  # 0=Again, 1=Good
        again_ivl = col.sched.nextIvlStr(card, 1).replace('<', '')
        good_ivl = col.sched.nextIvlStr(card, 3).replace('<', '')
        options = [(f'Again ({again_ivl})', 1), (f'Good ({good_ivl})', 3)]
        print('\033[?25l', end='')  # Hide cursor
        while True:
            display = '  '.join(f"\033[44;97m {opt[0]} \033[0m" if i == selected else f" {opt[0]} " for i, opt in enumerate(options))
            print(f"\r{display}", end='', flush=True)
            key = get_key()
            if key == 'q':
                print('\033[?25h')  # Show cursor
                col.close()
                return
            elif key == '\x1b[D':  # left arrow
                selected = max(0, selected - 1)
            elif key == '\x1b[C':  # right arrow
                selected = min(len(options) - 1, selected + 1)
            elif key in ('\r', '\n'):
                print('\033[?25h', end='')  # Show cursor
                print()
                col.sched.answerCard(card, options[selected][1])
                break

    col.close()

if __name__ == "__main__":
    study()
