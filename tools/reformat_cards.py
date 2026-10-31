"""Rewrite existing cards into the layout `anki --add` now saves: example first, meaning second.

Old cards put each meaning first with a small italic example under it. This
rebuilds their Back field with the same builder `anki --add` uses, so every
card ends up looking like a freshly added one. Front, deck and scheduling are
left alone.

    uv run --with anki python tools/reformat_cards.py            # preview only
    uv run --with anki python tools/reformat_cards.py --apply    # rewrite and sync

By default the text already on each card is reused, so nothing is looked up
and your meanings stay word for word. --refetch looks every word up again the
way `anki --add` does and saves that new text instead.
"""

import argparse
import html
import os
import re
import sys

import ank

OLD_EXAMPLE = '<br><span style="font-size: small;"><i> - {}</i></span>'


def old_meaning_html(meanings, pronunciation):
    """The Back field the CLI used to save, for checking a card parsed cleanly."""
    parts = []
    for idx, meaning in enumerate(meanings):
        part = meaning["meaning"]
        if meaning.get("example"):
            part += OLD_EXAMPLE.format(meaning["example"])
        if idx != len(meanings) - 1:
            part += "<br><br>"
        parts.append(part)
    if pronunciation:
        parts.append(
            f'<br><br><span style="color: #666; font-size: small;">{pronunciation}</span>'
        )
    return "".join(parts)


def squash_breaks(text):
    return re.sub(r"(?:<br\s*/?>\s*)+", "<br>", text, flags=re.IGNORECASE)


def read_old_card(back):
    """Return (meanings, pronunciation) for an old-layout card, or None to leave it alone."""
    # One card was saved with its HTML escaped, so it shows the raw tags.
    if "&lt;br" in back or "&lt;span" in back:
        back = html.unescape(back)
    meanings, pronunciation = ank.parse_meaning_html(back)
    if not meanings:
        return None  # hand-written card, not one of ours
    # Only convert when the parsed parts rebuild the original card, so no text
    # is dropped. Some older cards differ only in how many <br> come before the
    # pronunciation; that is fine to normalise.
    if squash_breaks(old_meaning_html(meanings, pronunciation)) != squash_breaks(back):
        return None
    return meanings, pronunciation


def look_up(word):
    """Fetch fresh meanings the way `anki --add` does; None if the lookup failed."""
    try:
        data = ank.fetch_suggestion(word)
    except SystemExit:  # fetch_suggestion exits on API errors; keep going instead
        return None
    meanings = ank._normalize_meanings(data.get("meanings"))  # pylint: disable=protected-access
    if not meanings:
        return None
    return meanings, data.get("pronunciation") or ""


def back_up(col):
    folder = os.path.join(os.path.dirname(ank.COLLECTION_PATH), "backups")
    os.makedirs(folder, exist_ok=True)
    col.create_backup(backup_folder=folder, force=True, wait_for_completion=True)
    print(f"Backup saved in {folder}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--apply", action="store_true", help="Rewrite the cards (default: preview only).")
    parser.add_argument("--refetch", action="store_true", help="Look every word up again like `anki --add`.")
    parser.add_argument("--limit", type=int, help="Only convert the first N cards.")
    parser.add_argument("--no-sync", action="store_true", help="Skip syncing with AnkiWeb before and after.")
    args = parser.parse_args()

    if args.refetch and not ank.GEMINI_API_KEY:
        print("Error: --refetch needs ANKI_GEMINI_API_KEY.")
        sys.exit(1)

    sync = args.apply and not args.no_sync
    if sync:
        ank.sync_collection()  # pick up cards added on other devices first

    changed = []
    col = ank.open_collection()
    try:
        from anki.collection import SearchNode

        note_ids = sorted(col.find_notes(col.build_search_string(SearchNode(note=ank.NOTE_MODEL))))
        todo, skipped, already = [], [], 0
        for note_id in note_ids:
            note = col.get_note(note_id)
            if "anki-example" in note["Back"]:
                already += 1
                continue
            parsed = read_old_card(note["Back"])
            if parsed is None:
                skipped.append(note)
                continue
            todo.append((note, parsed))
        if args.limit is not None:
            todo = todo[: args.limit]

        print(f"{len(note_ids)} cards: {len(todo)} to convert, {already} already example-first, "
              f"{len(skipped)} left as they are.")
        for note in skipped:
            print(f"  left alone: {ank.strip_html(note['Front'])!r}")

        if not args.apply:
            if todo:
                note, (meanings, pronunciation) = todo[0]
                print(f"\nExample, {ank.strip_html(note['Front'])!r}\n  before: {note['Back']}")
                print(f"  after:  {ank.build_meaning_html(meanings, pronunciation)}")
            how = "look up and rewrite" if args.refetch else "rewrite"
            print(f"\nPreview only. Run again with --apply to {how} {len(todo)} cards.")
            return

        if not todo:
            return
        back_up(col)

        failed = []
        for count, (note, parsed) in enumerate(todo, 1):
            if args.refetch:
                word = ank.strip_html(note["Front"]).strip().lower()
                parsed = look_up(word)
                if parsed is None:
                    failed.append(word)
                    continue
                print(f"  [{count}/{len(todo)}] {word}")
            note["Back"] = ank.build_meaning_html(*parsed)
            changed.append(note)
            if args.refetch:
                col.update_note(note)  # save as we go, so an interrupted run keeps its work
        if not args.refetch:
            col.update_notes(changed)

        print(f"Converted {len(changed)} cards.")
        if failed:
            print(f"Lookup failed, left unchanged: {', '.join(failed)}")
    finally:
        col.close()

    if sync and changed:
        ank.sync_collection()


if __name__ == "__main__":
    main()
