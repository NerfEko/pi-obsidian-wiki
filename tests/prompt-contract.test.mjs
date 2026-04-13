import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = '/home/eko/projects/obsidian-wiki';
const extension = readFileSync(resolve(root, 'extension.ts'), 'utf8');
const wikiMemoryLib = readFileSync(resolve(root, 'lib/wiki-memory.mjs'), 'utf8');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
const recallSkill = readFileSync(resolve(root, 'skills/wiki-recall/SKILL.md'), 'utf8');
const retroSkill = readFileSync(resolve(root, 'skills/wiki-retro/SKILL.md'), 'utf8');

test('injected wiki memory preamble keeps injected summaries as the default path', () => {
  assert.match(wikiMemoryLib, /Use the injected summaries below as the default memory source for this session\./);
  assert.match(wikiMemoryLib, /Open relevant cards in full with `wiki_read`\./);
  assert.match(wikiMemoryLib, /Open `memory-map` with `wiki_read` if you want a higher-level concept map/);
  assert.match(wikiMemoryLib, /Use `wiki_recall` only if wiki memory seems missing after compaction\/reset or you need a filtered subset\./);
});

test('extension queues a selective retro reminder and clears it on wiki_write', () => {
  assert.match(extension, /pi\.on\("agent_end", async \(\) => \{/);
  assert.match(extension, /customType: "wiki-retro-reminder"/);
  assert.match(extension, /architecture decisions, prompt\/retrieval workflow improvements, non-obvious tool behavior, debugging root causes, and reusable implementation patterns/);
  assert.match(extension, /retroReminderQueued = true;/);
  assert.match(extension, /retroDone = true;/);
  assert.match(extension, /retroReminderQueued = false;/);
});

test('docs and skills tell the same injected-memory-first story', () => {
  assert.match(readme, /use the injected wiki summaries as the default memory source for the session/i);
  assert.match(readme, /use `wiki_read \{ slug: "memory-map" \}` if a higher-level concept map is needed/i);
  assert.match(readme, /use `wiki_recall` only when wiki context seems missing after compaction\/reset or when a filtered subset is needed/i);
  assert.match(recallSkill, /Use the injected wiki memory first/i);
  assert.match(recallSkill, /`wiki_read memory-map`.*higher-level concept map/i);
  assert.match(recallSkill, /Call `wiki_recall` only as a refresh\/drill-down tool/i);
  assert.match(retroSkill, /only reusable, non-obvious learnings should be written back/i);
  assert.match(retroSkill, /architecture or workflow decisions/i);
  assert.match(retroSkill, /prompt\/retrieval behavior improvements/i);
});
