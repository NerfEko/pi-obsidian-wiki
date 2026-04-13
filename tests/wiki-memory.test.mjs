import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConceptMap,
  buildInjectionBlock,
  buildMemoryMapMarkdown,
  buildRefreshPacket,
  createCardRecord,
} from '../lib/wiki-memory.mjs';

const cards = [
  createCardRecord(
    'quickshell-state-stratification',
    {
      title: 'Quickshell state stratification',
      tags: ['knowledge/desktop', 'status/active'],
      modified: '2026-04-13',
      related: ['quickshell-panel-under-bar-button'],
    },
    '> [!summary] Split persistent config, persistent UI memory, and transient runtime state.\n\nSee [[quickshell-panel-under-bar-button]] and [[quickshell-service-singletons]].'
  ),
  createCardRecord(
    'quickshell-panel-under-bar-button',
    {
      title: 'Quickshell panel under-bar button',
      tags: ['knowledge/desktop', 'status/active'],
      modified: '2026-04-10',
    },
    '> [!summary] The under-bar button pattern keeps the panel edge clickable without covering content.'
  ),
  createCardRecord(
    'jwt-refresh-pattern',
    {
      title: 'JWT refresh token rotation pattern',
      tags: ['knowledge/backend', 'status/active'],
      modified: '2026-04-11',
      related: ['auth-middleware'],
    },
    '> [!summary] Rotate refresh tokens on every use and invalidate the previous token.\n\nRelated to [[auth-middleware]].'
  ),
  createCardRecord(
    'auth-middleware',
    {
      title: 'Auth middleware',
      tags: ['knowledge/backend', 'status/active'],
      modified: '2026-04-09',
    },
    '> [!summary] Authentication middleware should surface auth context early in the request pipeline.'
  ),
];

test('buildConceptMap groups cards by category and surfaces strongest cards first', () => {
  const map = buildConceptMap(cards, { maxCategories: 2, maxCardsPerCategory: 2 });

  assert.match(map, /## Concept Map/);
  assert.match(map, /### desktop \(2 cards\)/);
  assert.match(map, /### backend \(2 cards\)/);
  assert.ok(
    map.indexOf('[[quickshell-panel-under-bar-button]]') < map.indexOf('[[quickshell-state-stratification]]'),
    'inbound-linked desktop card should rank ahead of the less-linked peer'
  );
});

test('buildMemoryMapMarkdown produces a readable concept-map card', () => {
  const markdown = buildMemoryMapMarkdown(cards);

  assert.match(markdown, /^# Wiki Memory Map/m);
  assert.match(markdown, /> \[!summary\] Conceptual map of the active wiki cards/m);
  assert.match(markdown, /## Concept Map/);
  assert.match(markdown, /## Recently Updated/);
  assert.match(markdown, /## Link Hubs/);
});

test('buildRefreshPacket returns refresh and query views with next-read guidance', () => {
  const refresh = buildRefreshPacket(cards);
  const query = buildRefreshPacket(cards.filter((card) => card.category === 'desktop'), {
    query: 'quickshell',
  });
  const catalog = buildRefreshPacket(cards, { view: 'catalog' });

  assert.match(refresh, /# Wiki Refresh Packet/);
  assert.match(refresh, /wiki_read \{ slug: "memory-map" \}/);
  assert.match(query, /# Wiki Recall — "quickshell"/);
  assert.match(query, /## Best Matches/);
  assert.match(catalog, /Wiki catalog \(4 cards\)/);
});

test('buildInjectionBlock includes concept-map highlights before card summaries', () => {
  const injection = buildInjectionBlock(cards);

  assert.match(injection, /## Concept Map Highlights/);
  assert.match(injection, /Open `memory-map` with `wiki_read` if you want a higher-level concept map/);
  assert.ok(injection.indexOf('## Concept Map Highlights') < injection.indexOf('## Card Summaries'));
});
