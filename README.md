# pi-obsidian-wiki

An Obsidian-native long-term memory extension for the [Pi coding agent](https://github.com/mariozechner/pi-coding-agent). Replaces `@touchskyer/memex` with a system that writes knowledge cards directly into your Obsidian vault — exploiting Obsidian's full feature set (Dataview, wikilinks, backlinks, graph view, callouts, hierarchical tags, aliases).

## Why Obsidian > memex

| Feature | memex | pi-wiki |
|---------|-------|---------|
| Card browsing / editing | Web UI only | Native Obsidian app |
| Search | CLI full-text | ripgrep + Obsidian search + Dataview queries |
| Link graph | CLI stats | Live interactive graph view |
| Backlinks | Manual | Auto-tracked from `related: ["[[slug]]"]` frontmatter |
| Index | Agent-written flat table | Live Dataview queries (auto-updating) |
| Categorization | `category:` field only | Hierarchical tags `#knowledge/architecture` in a flat note folder |
| Note structure | Raw markdown | Callouts (`> [!summary]`, `> [!tip]`, `> [!warning]`) |
| Session continuity | None | `handoff.md` written each session |

## Install

Install it like a normal Pi package:

```bash
pi install git:github.com/NerfEko/pi-obsidian-wiki
```

Or pin to a ref:

```bash
pi install git:github.com/NerfEko/pi-obsidian-wiki@main
```

Then:

1. Reload Pi with `/reload` if Pi is already running
2. Set your wiki folder with `/wiki path /path/to/your-agent-wiki`
   - Example: `/wiki path ~/Documents/ObsidianVault/agent-wiki`
   - Example: `/wiki path ~/Obsidian/agent-wiki`
3. Optional: enable or disable automatic git sync with `/wiki git-push on` or `/wiki git-push off`

The extension stores its config in `~/.pi/agent/pi-wiki.json`.

### Development / local install

If you are working on the package locally, Pi also supports local package paths.
From inside the cloned repo:

```bash
pi install .
```

Or from anywhere else:

```bash
pi install /absolute/path/to/your-clone-dir
```

## Wiki folder layout

The configured wiki path should point at the folder that will contain your agent knowledge base. The path is user-defined; these are only examples:

```text
/path/to/your-agent-wiki/
├── index.md          # Dataview-powered home
├── handoff.md        # Session continuity
├── conventions.md    # Card schema + tag taxonomy
├── views/
│   └── by-category.js
├── archive/          # Archived cards
└── wiki/
    ├── some-card.md
    ├── another-card.md
    └── ...
```

When you run `/wiki path ...`, pi-wiki scaffolds these files and folders if they do not already exist. Cards are stored flat in the `wiki/` subfolder; category is represented by tags, not folders.

## Tools

### `wiki_recall`

Load prior knowledge manually when you want a full catalog or a targeted refresh beyond the automatically injected session memory.

```
wiki_recall {}                        # full catalog
wiki_recall { query: "quickshell" }   # filtered by query
```

Returns: table of slug | title | category | modified

### `wiki_read`

Read a single card by slug.

```
wiki_read { slug: "quickshell-state-stratification" }
wiki_read { slug: "handoff" }       # session continuity
wiki_read { slug: "conventions" }   # card schema reference
```

### `wiki_write`

Write or update a card. Auto-injects YAML frontmatter.

```
wiki_write {
  slug: "jwt-refresh-pattern",
  title: "JWT refresh token rotation pattern",
  body: "> [!summary] Always rotate the refresh token on use...\n\nFull context...",
  category: "architecture",
  related: ["auth-middleware", "session-storage-tradeoffs"],
  aliases: ["JWT rotation"]
}
```

### `wiki_search`

Full-text ripgrep search across all cards.

```
wiki_search { query: "bluetooth" }
```

### `wiki_archive`

Archive a superseded card (moves to `archive/`, tags `status/archived`).

```
wiki_archive { slug: "old-approach" }
```

### `wiki_handoff`

Read or write session continuity. In normal use, the extension rebuilds `handoff.md` automatically from saved session history when a session starts, so this tool is mainly for inspection or manual overrides.

```
wiki_handoff { action: "read" }
wiki_handoff {
  action: "write",
  content: "## Completed This Session\n- ..."
}
```

### `wiki_audit`

Find broken wikilinks, isolated cards, and stale drafts.

```
wiki_audit {}
```

## Commands

| Command | Description |
|---------|-------------|
| `/wiki` | Show current wiki path, auto-push status, card count, tag distribution, recent cards |
| `/wiki path <path>` | Set or change the wiki folder and scaffold it if needed |
| `/wiki git-push on\|off` | Enable or disable automatic git commit/push after wiki mutations |
| `/wiki-search <query>` | Quick ripgrep search, prints results |

## Skills

| Skill | Description |
|-------|-------------|
| `/skill:wiki-recall` | Protocol for loading memory at task start |
| `/skill:wiki-retro` | Protocol for writing cards and handoff at task end |

## Card Format

```yaml
---
title: "Card Title (≤60 chars, noun phrase)"
slug: kebab-case-slug
aliases:
  - alternate name
tags:
  - knowledge/architecture    # domain tag
  - status/active             # status tag
created: 2026-04-13
modified: 2026-04-13
source: pi
related:
  - "[[other-slug]]"          # quoted wikilinks → real Obsidian backlinks
---

> [!summary] One-sentence TL;DR of the core insight.

Full explanation with [[wikilinks]] to related cards.

> [!tip] Optional usage note.

> [!warning] Optional caveat.
```

### Tag taxonomy

**Domain (pick one):**
- `knowledge/architecture` — design patterns, state management
- `knowledge/devops` — packaging, builds, systemd
- `knowledge/bugfix` — root causes and fixes
- `knowledge/frontend` — UI, QML, CSS
- `knowledge/tooling` — dev tools, CLI
- `knowledge/desktop` — Hyprland, Quickshell, Wayland
- `knowledge/networking` — drivers, VPN, DNS
- `knowledge/backend` — services, APIs, daemons

**Status (pick one):**
- `status/active` — verified, current
- `status/draft` — incomplete/unverified
- `status/archived` — superseded (auto-set by `wiki_archive`)

## Obsidian Features Used

- **`related: ["[[slug]]"]`** — Quoted wikilinks in frontmatter create real backlinks tracked in Obsidian's graph view and backlinks panel.
- **`aliases:`** — Other names for this concept; Obsidian's Quick Switcher resolves aliases as valid link targets.
- **Hierarchical tags** — `knowledge/architecture` appears under both `#knowledge` and `#knowledge/architecture` in tag filters.
- **Callouts** — `> [!summary]`, `> [!tip]`, `> [!warning]` render as styled callout blocks in Obsidian.
- **Dataview** — `index.md` uses Dataview queries that auto-update as cards are written.
- **Body wikilinks** — `[[slug]]` in body creates navigable links visible in the graph view.

## Session Lifecycle

| Event | Behavior |
|-------|----------|
| Session start | Rebuilds `handoff.md` from saved user prompts in the current Pi session history |
| First turn of session | Silently injects wiki card summaries + `handoff.md` into the system prompt |
| Session start / compact | Resets recall flag so wiki memory is injected again on the next first turn |
| Wiki writes / archives / handoff writes | Optionally auto-commit and push changes to the git repo containing the configured wiki path |

### Notes on context loading

- The extension keeps a **compact wiki index** in context, not full card bodies.
- Each injected card includes: **slug, category, title, and the `> [!summary]` line**.
- Full card content is still available on demand through `wiki_read <slug>`.
- `handoff.md` is no longer rewritten after every prompt.

## Project layout

```text
<package-root>/
├── package.json        # Pi package manifest
├── README.md
├── extension.ts        # All 7 tools + commands + config handling
├── skills/
│   ├── wiki-recall/SKILL.md
│   └── wiki-retro/SKILL.md
└── .gitignore
```
