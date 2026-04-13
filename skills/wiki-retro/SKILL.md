---
name: wiki-retro
description: Save non-obvious, reusable insights to the Obsidian wiki after completing a task. Call wiki_write to create or update knowledge cards when a session produced a finding worth remembering.
---

# wiki-retro skill

Use this skill at the end of a task to save non-obvious insights to the Obsidian wiki. The extension may queue a hidden reminder on the next turn after meaningful work, but only reusable, non-obvious learnings should be written back.

## When to save a card

Save a card when the session produced a **non-obvious, reusable insight** — something a future session would benefit from knowing. Treat any reminder as a prompt to evaluate whether the work generated lasting knowledge, not as a requirement to write a card every time. Do NOT save:
- Trivial facts (e.g. "git status shows untracked files")
- Ephemeral task outputs (file paths, raw command outputs)
- One-off decisions that won't recur

## Card writing protocol

Call `wiki_write` with:

| Field | Guidance |
|-------|---------|
| `slug` | Kebab-case, descriptive, 3–6 words |
| `title` | ≤60 chars, noun phrase, not a sentence |
| `body` | Start with `> [!summary] <one-line TL;DR>`. Then explain with full context. Use `[[wikilinks]]` to link related cards. Add `> [!tip]` or `> [!warning]` as needed. |
| `category` | One of: `architecture`, `devops`, `bugfix`, `frontend`, `tooling`, `desktop`, `networking`, `backend` |
| `related` | Slugs of directly related cards |
| `aliases` | Common abbreviations or alternate names, only if there are real alternatives |

## Body template

```markdown
> [!summary] One-sentence atomic insight describing the core finding.

Full context: what problem was encountered, what was learned, what the correct approach is.

Use `[[other-slug]]` to link to related cards. Be specific — explain *why* the insight matters.

> [!tip] Optional: how to apply this in practice.

> [!warning] Optional: edge cases, gotchas, or conditions where this doesn't apply.
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
