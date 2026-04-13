---
name: wiki-recall
description: Load prior knowledge from the Obsidian wiki at the start of a task. Call wiki_recall to get the full card catalog, wiki_read handoff for session continuity, and wiki_read <slug> for relevant cards. Use at the beginning of any non-trivial task.
---

# wiki-recall skill

Use this skill at the start of every task to load prior knowledge from the Obsidian wiki.

## Protocol

1. **Call `wiki_recall`** (no args) → receive the full catalog (slug | title | category | modified).
2. **Read relevant cards**: For each slug that looks relevant to the current task, call `wiki_read <slug>`.
3. **Load session continuity**: Call `wiki_read handoff` to load what was completed, deferred, and planned in the previous session.
4. **First task in a new project?** Call `wiki_read conventions` to load the card schema and tag taxonomy.
5. **Follow wikilinks**: When a card body contains `[[slug]]` or `[[slug|text]]` links that are relevant, call `wiki_read <slug>` on the linked slug.

## Guardrails

- Max **3 link hops** from any starting card.
- Max **20 cards** total per session recall pass.
- Prefer reading cards whose modified date is recent or whose tags match the current task domain.

## Filtered recall (with query)

If the task has a specific theme (e.g. "quickshell", "AUR", "bluetooth"), call:

```
wiki_recall { query: "quickshell" }
```

This uses ripgrep to narrow results before loading full cards.

## What to look for

- Cards tagged `knowledge/<domain>` matching the current task.
- Cards whose title or slug mentions a tool, pattern, or system involved in the task.
- Cards marked `status/draft` may be incomplete — verify before relying on them.

## Example flow

```
1. wiki_recall             → see catalog of 20 cards
2. wiki_read handoff       → load session continuity (what was deferred last time)
3. wiki_read quickshell-state-stratification  → relevant architecture card
4. wiki_read quickshell-panel-under-bar-button → follow wikilink from step 3
```
