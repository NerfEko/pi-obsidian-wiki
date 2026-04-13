---
name: wiki-retro
description: Save non-obvious, reusable insights to the Obsidian wiki after completing a task. Call wiki_write to create or update knowledge cards, then wiki_handoff with action write to record session continuity. Use at the end of any session that produced a new finding worth remembering.
---

# wiki-retro skill

Use this skill at the end of every task to save non-obvious insights to the Obsidian wiki and record session continuity.

## When to save a card

Save a card when the session produced a **non-obvious, reusable insight** — something a future session would benefit from knowing. Do NOT save:
- Trivial facts (e.g. "git status shows untracked files")
- Ephemeral task outputs (file paths, raw command outputs)
- One-off decisions that won't recur

## Card writing protocol

Call `wiki_write` with:

| Field | Guidance |
|-------|---------|
| `slug` | Kebab-case, descriptive, 3–6 words (e.g. `quickshell-popup-focus-pattern`) |
| `title` | ≤60 chars, noun phrase, not a sentence (e.g. "Quickshell popup focus grab pattern") |
| `body` | Start with `> [!summary] <one-line TL;DR>`. Then explain with full context. Use `[[wikilinks]]` to link related cards. Add `> [!tip]` or `> [!warning]` callouts as needed. |
| `category` | One of: `architecture`, `devops`, `bugfix`, `frontend`, `tooling`, `desktop`, `networking`, `backend` |
| `related` | Slugs of directly related cards (not just anything mentioned) |
| `aliases` | Common abbreviations or alternate names (only if there are real alternatives) |

## Body template

```markdown
> [!summary] One-sentence atomic insight describing the core finding.

Full context: what problem was encountered, what was learned, what the correct approach is.

Use `[[other-slug]]` to link to related cards. Be specific — explain *why* the insight matters.

> [!tip] Optional: how to apply this in practice.

> [!warning] Optional: edge cases, gotchas, or conditions where this doesn't apply.
```

## Session handoff protocol

After writing cards, call `wiki_handoff` with `action: "write"` and content following this template:

```markdown
## Completed This Session
- Brief description of what was finished

## In Progress / Deferred
- Tasks that were started but not finished, with enough context to resume

## Next Session
- Concrete next actions, in priority order

## Active Projects (for context)
- Project: ~/projects/foo  — what it is and where things stand
```

## Example

```
wiki_write {
  slug: "makepkg-no-tty-pkexec-workaround",
  title: "makepkg install fails without TTY — pkexec workaround",
  body: "> [!summary] When makepkg fails at the install step due to missing TTY, pkexec pacman -U can complete the install from the pre-built .pkg.tar.zst.\n\nFull context...",
  category: "devops",
  related: ["aur-build-fallback-to-user-local-service"]
}
```
