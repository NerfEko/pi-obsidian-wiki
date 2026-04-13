---
name: wiki-recall
description: Refresh wiki memory after compaction or when the injected system-prompt catalog is missing or insufficient. Use wiki_recall for a fresh or filtered catalog, then wiki_read <slug> for relevant full cards.
---

# wiki-recall skill

Use this skill to load relevant prior knowledge from the Obsidian wiki.

## Protocol

1. **Use the injected wiki memory first** on normal session start. The system prompt already includes a workflow preamble plus compact card summaries, so treat that as the default memory source for the current session.
2. **Open full cards with `wiki_read`** for the summaries that look relevant to the current task.
3. **Use `wiki_read memory-map`** when you want the higher-level concept map before choosing individual cards.
4. **Call `wiki_recall` only as a refresh/drill-down tool** when compaction happened, when wiki context appears missing, or when you need a fresh/filtered tool result.
5. **Load conventions only when needed**: Call `wiki_read conventions` if the task is about wiki schema, card-writing rules, or vault structure.
6. **Follow wikilinks**: When a card body contains `[[slug]]` or `[[slug|text]]` links that are relevant, call `wiki_read <slug>` on the linked slug.

## Guardrails

- Max **3 link hops** from any starting card.
- Max **20 cards** total per recall pass.
- Prefer reading cards whose modified date is recent or whose tags match the current task domain.

## Filtered recall (with query)

If the task has a specific theme (e.g. "quickshell", "AUR", "bluetooth") and the injected catalog is not enough, call:

```
wiki_recall { query: "quickshell" }
```

This uses ripgrep to narrow results before loading full cards and returns a summary-first match list.

If you need the old raw table view instead of the refresh packet, call:

```
wiki_recall { view: "catalog" }
```

## What to look for

- Cards tagged `knowledge/<domain>` matching the current task.
- Cards whose title or slug mentions a tool, pattern, or system involved in the task.
- Cards marked `status/draft` may be incomplete — verify before relying on them.

## Example flows

### Normal session start

```
1. inspect the injected wiki summaries and concept map highlights already in context
2. wiki_read memory-map (optional, for the higher-level overview)
3. wiki_read quickshell-state-stratification
4. wiki_read quickshell-panel-under-bar-button
```

### After compaction / missing context

```
1. notice compaction happened / wiki context is missing
2. wiki_recall
3. wiki_read quickshell-state-stratification
4. wiki_read quickshell-panel-under-bar-button
```
