# pi-obsidian-wiki

A Pi extension that uses an Obsidian folder as a lightweight long-term memory wiki.

This project was inspired by memex, but takes a more Obsidian-native approach: cards are plain Markdown files in your vault, linked with wikilinks, tagged for filtering, and browsable directly in Obsidian.

## What it does

- injects a compact wiki index into the first turn of each session
- lets the agent read, write, search, archive, and audit wiki cards
- stores active cards under `wiki/`
- keeps supporting files (`index.md`, `conventions.md`, `archive/`, `views/`) at the wiki root
- can optionally auto-commit and push wiki changes if the configured wiki path lives inside a git repo

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
3. Optional: enable or disable automatic git sync with `/wiki git-push on` or `/wiki git-push off`

Examples:

```text
/wiki path ~/Obsidian/agent-wiki
/wiki git-push on
```

The extension stores its config in `~/.pi/agent/pi-wiki.json`.

### Development / local install

From inside the cloned repo:

```bash
pi install .
```

Or from anywhere else:

```bash
pi install /absolute/path/to/your-clone-dir
```

## Wiki layout

The configured wiki path should point at the folder that will contain your agent knowledge base.

```text
/path/to/your-agent-wiki/
├── index.md          # Obsidian home/dashboard for the wiki
├── conventions.md    # Card schema and tag rules
├── views/
│   └── card-table.js # Reusable DataviewJS helper
├── archive/          # Archived cards
└── wiki/             # Active cards
    ├── some-card.md
    ├── another-card.md
    └── ...
```

When you run `/wiki path ...`, pi-obsidian-wiki scaffolds these files and folders if they do not already exist.

## Commands

| Command | Description |
|---------|-------------|
| `/wiki` | Show current wiki path, auto-push status, card count, tag distribution, and recent cards |
| `/wiki path <path>` | Set or change the wiki folder and scaffold it if needed |
| `/wiki git-push on\|off` | Enable or disable automatic git commit/push after wiki mutations |
| `/wiki-search <query>` | Quick ripgrep search, prints results |

## Tools

### `wiki_recall`
Load the full card catalog, or a filtered subset with a query.

```text
wiki_recall {}
wiki_recall { query: "quickshell" }
```

### `wiki_read`
Read a specific card by slug, or `conventions`.

```text
wiki_read { slug: "quickshell-state-stratification" }
wiki_read { slug: "conventions" }
```

### `wiki_write`
Write or update a card with frontmatter, tags, and related links.

```text
wiki_write {
  slug: "jwt-refresh-pattern",
  title: "JWT refresh token rotation pattern",
  body: "> [!summary] Always rotate the refresh token on use...\n\nFull context...",
  category: "architecture",
  related: ["auth-middleware"]
}
```

### `wiki_search`
Full-text ripgrep search across cards.

```text
wiki_search { query: "bluetooth" }
```

### `wiki_archive`
Archive a superseded card into `archive/` and mark it `status/archived`.

```text
wiki_archive { slug: "old-approach" }
```

### `wiki_audit`
Find unresolved wikilinks, isolated cards, and stale drafts.

```text
wiki_audit {}
```

## Skills

| Skill | Description |
|-------|-------------|
| `/skill:wiki-recall` | Workflow for pulling relevant memory from the wiki |
| `/skill:wiki-retro` | Workflow for writing reusable insight cards |

## Card format

```yaml
---
title: "Card Title (≤60 chars, noun phrase)"
slug: kebab-case-slug
aliases:
  - alternate name
tags:
  - knowledge/architecture
  - status/active
created: 2026-04-13
modified: 2026-04-13
source: pi
related:
  - "[[other-slug]]"
---

> [!summary] One-sentence TL;DR of the core insight.

Full explanation with [[wikilinks]] to related cards.

> [!tip] Optional usage note.

> [!warning] Optional caveat.
```

## Tag taxonomy

**Domain tags**
- `knowledge/architecture`
- `knowledge/backend`
- `knowledge/bugfix`
- `knowledge/desktop`
- `knowledge/devops`
- `knowledge/frontend`
- `knowledge/networking`
- `knowledge/tooling`

**Status tags**
- `status/active`
- `status/draft`
- `status/archived`

## Context loading

On the first turn of a session, the extension injects a compact wiki index into the system prompt.

Each injected card includes:
- slug
- category
- title
- the `> [!summary]` line

It does **not** inject full card bodies. Full content stays available on demand through `wiki_read`.

## Project layout

```text
<package-root>/
├── package.json
├── README.md
├── extension.ts
├── skills/
│   ├── wiki-recall/SKILL.md
│   └── wiki-retro/SKILL.md
└── .gitignore
```
