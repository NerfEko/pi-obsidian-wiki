const SUMMARY_RE = /^>\s*\[!summary\]\s*(.+)$/im;
const VALID_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanString(value) {
  return String(value ?? "").trim();
}

function isoDate(value) {
  const text = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "0000-00-00";
}

function compareByModifiedDesc(a, b) {
  return isoDate(b.modified).localeCompare(isoDate(a.modified)) || a.slug.localeCompare(b.slug);
}

function compareByInboundThenModified(inboundCounts) {
  return (a, b) =>
    (inboundCounts[b.slug] ?? 0) - (inboundCounts[a.slug] ?? 0) || compareByModifiedDesc(a, b);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanLinkTarget(raw) {
  const text = cleanString(raw)
    .replace(/^"|"$/g, "")
    .replace(/^\[\[/, "")
    .replace(/\]\]$/, "");
  return text.split("|")[0].split("#")[0].trim();
}

export function extractSummary(body = "") {
  const match = body.match(SUMMARY_RE);
  return match ? match[1].trim() : "";
}

export function createCardRecord(slug, meta = {}, body = "") {
  const tags = Array.isArray(meta.tags) ? meta.tags.map(cleanString).filter(Boolean) : [];
  const category =
    tags.find((tag) => tag.startsWith("knowledge/"))?.split("/")[1] ??
    cleanString(meta.category) ??
    "—";
  const title = cleanString(meta.title) || slug;
  const modified = cleanString(meta.modified) || cleanString(meta.created) || "—";
  const status = tags.find((tag) => tag.startsWith("status/"))?.split("/")[1] ?? "active";
  const related = Array.isArray(meta.related)
    ? meta.related.map(cleanLinkTarget).filter((target) => VALID_SLUG_RE.test(target))
    : [];
  const bodyLinks = [...body.matchAll(/\[\[([^\]#|]+)/g)]
    .map((match) => cleanLinkTarget(match[1]))
    .filter((target) => VALID_SLUG_RE.test(target));

  return {
    slug,
    title,
    category,
    modified,
    created: cleanString(meta.created) || modified,
    status,
    tags,
    summary: extractSummary(body),
    links: unique([...related, ...bodyLinks]),
  };
}

export function buildLinkStats(cards) {
  const inboundCounts = Object.fromEntries(cards.map((card) => [card.slug, 0]));
  const allSlugs = new Set(cards.map((card) => card.slug));

  for (const card of cards) {
    for (const target of card.links ?? []) {
      if (!allSlugs.has(target)) continue;
      inboundCounts[target] = (inboundCounts[target] ?? 0) + 1;
    }
  }

  return { inboundCounts };
}

export function buildCatalog(cards) {
  const header = `${"SLUG".padEnd(52)} | ${"TITLE".padEnd(52)} | ${"CATEGORY".padEnd(16)} | MODIFIED`;
  const divider = "-".repeat(header.length);
  const rows = cards
    .slice()
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map(
      (card) =>
        `${card.slug.padEnd(52)} | ${card.title.slice(0, 52).padEnd(52)} | ${card.category.padEnd(16)} | ${card.modified}`
    );
  return [header, divider, ...rows].join("\n");
}

export function buildConceptMap(cards, options = {}) {
  const {
    heading = "## Concept Map",
    maxCategories = Infinity,
    maxCardsPerCategory = 3,
    emptyMessage = "(no cards yet)",
  } = options;

  if (cards.length === 0) return [heading, "", emptyMessage].join("\n");

  const { inboundCounts } = buildLinkStats(cards);
  const groups = new Map();
  for (const card of cards) {
    const key = card.category || "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }

  const sortedGroups = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, maxCategories);

  const lines = [heading, ""];
  for (const [category, groupCards] of sortedGroups) {
    lines.push(`### ${category} (${groupCards.length} card${groupCards.length === 1 ? "" : "s"})`);
    const featured = groupCards
      .slice()
      .sort(compareByInboundThenModified(inboundCounts))
      .slice(0, maxCardsPerCategory);
    for (const card of featured) {
      const summary = card.summary ? ` — ${card.summary}` : "";
      lines.push(`- [[${card.slug}]] (${card.modified})${summary}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function buildRecentCards(cards, options = {}) {
  const { heading = "## Recently Updated", limit = 6 } = options;
  const recent = cards.slice().sort(compareByModifiedDesc).slice(0, limit);
  const lines = [heading, ""];
  if (recent.length === 0) {
    lines.push("(no cards yet)");
    return lines.join("\n");
  }
  for (const card of recent) {
    const summary = card.summary ? ` — ${card.summary}` : "";
    lines.push(`- [[${card.slug}]] (${card.category}, ${card.modified})${summary}`);
  }
  return lines.join("\n");
}

export function buildLinkHubs(cards, options = {}) {
  const { heading = "## Link Hubs", limit = 5 } = options;
  const { inboundCounts } = buildLinkStats(cards);
  const ranked = cards
    .filter((card) => (inboundCounts[card.slug] ?? 0) > 0)
    .slice()
    .sort(compareByInboundThenModified(inboundCounts))
    .slice(0, limit);

  const lines = [heading, ""];
  if (ranked.length === 0) {
    lines.push("- No inbound links yet — the graph is still sparse.");
    return lines.join("\n");
  }

  for (const card of ranked) {
    lines.push(`- [[${card.slug}]] — ${(inboundCounts[card.slug] ?? 0)} inbound link(s)`);
  }
  return lines.join("\n");
}

export function buildMemoryMapMarkdown(cards) {
  const lines = [
    "# Wiki Memory Map",
    "",
    "> [!summary] Conceptual map of the active wiki cards, grouped by domain and surfaced for fast agent/human navigation.",
    "",
    "This file is maintained by the extension as a compact conceptual entry point. Use it when you want a higher-level view before opening individual cards.",
    "",
    `- Active cards: **${cards.length}**`,
    `- Categories: **${unique(cards.map((card) => card.category)).length}**`,
    "",
    buildConceptMap(cards, { heading: "## Concept Map", maxCategories: Infinity, maxCardsPerCategory: 4 }),
    "",
    buildRecentCards(cards, { heading: "## Recently Updated", limit: 8 }),
    "",
    buildLinkHubs(cards, { heading: "## Link Hubs", limit: 8 }),
  ];
  return lines.join("\n").trimEnd() + "\n";
}

export function buildInjectionBlock(cards) {
  const lines = [
    `## Wiki Memory (${cards.length} cards)`,
    "",
    "Use the injected summaries below as the default memory source for this session.",
    "- Open relevant cards in full with `wiki_read`.",
    "- Open `memory-map` with `wiki_read` if you want a higher-level concept map before drilling into individual cards.",
    "- Use `wiki_recall` only if wiki memory seems missing after compaction/reset or you need a filtered subset.",
    "- If this task produces a reusable insight, consider `wiki_write` or `/skill:wiki-retro` before finishing.",
    "",
    buildConceptMap(cards, {
      heading: "## Concept Map Highlights",
      maxCategories: 4,
      maxCardsPerCategory: 2,
      emptyMessage: "(no cards yet)",
    }),
    "",
    "## Card Summaries",
    "",
  ];

  const summaries = cards
    .slice()
    .sort(compareByModifiedDesc)
    .map((card) => {
      const summary = card.summary ? `\n  > ${card.summary}` : "";
      return `- **${card.slug}** (${card.category}) — ${card.title}${summary}`;
    });

  lines.push(summaries.length > 0 ? summaries.join("\n") : "(no cards yet)");
  return lines.join("\n");
}

function buildQueryResults(matches, query, options = {}) {
  const { view = "refresh" } = options;
  if (view === "catalog") {
    return `Wiki catalog (${matches.length} matching cards for \"${query}\"):\n\n${buildCatalog(matches)}`;
  }

  const lines = [
    `# Wiki Recall — \"${query}\"`,
    "",
    `Found **${matches.length}** matching card${matches.length === 1 ? "" : "s"}.`,
    "",
    "## Best Matches",
    "",
  ];

  const topMatches = matches.slice().sort(compareByModifiedDesc).slice(0, 12);
  for (const card of topMatches) {
    lines.push(`- [[${card.slug}]] (${card.category}, ${card.modified}) — ${card.title}`);
    if (card.summary) lines.push(`  > ${card.summary}`);
  }

  lines.push(
    "",
    "Use `wiki_read` on the best matching slug(s) above for full context.",
    'Pass `view: "catalog"` if you want the raw matching inventory table.'
  );

  return lines.join("\n");
}

export function buildRefreshPacket(cards, options = {}) {
  const { query, view = "refresh" } = options;

  if (query) return buildQueryResults(cards, query, { view });
  if (view === "catalog") {
    return `Wiki catalog (${cards.length} cards):\n\n${buildCatalog(cards)}`;
  }

  const categories = unique(cards.map((card) => card.category));
  const lines = [
    "# Wiki Refresh Packet",
    "",
    "Use this when the injected wiki context is missing, stale, or you need a fresh high-level map.",
    "",
    "## Stats",
    "",
    `- Active cards: ${cards.length}`,
    `- Categories: ${categories.length}`,
    `- Most recent update: ${cards.length > 0 ? cards.slice().sort(compareByModifiedDesc)[0].modified : "—"}`,
    "",
    buildConceptMap(cards, { heading: "## Concept Map", maxCategories: 6, maxCardsPerCategory: 3 }),
    "",
    buildRecentCards(cards, { heading: "## Recently Updated", limit: 6 }),
    "",
    buildLinkHubs(cards, { heading: "## Link Hubs", limit: 6 }),
    "",
    "## Suggested Next Reads",
    "",
    "- `wiki_read { slug: \"memory-map\" }` for the full conceptual overview.",
  ];

  for (const card of cards.slice().sort(compareByModifiedDesc).slice(0, 3)) {
    lines.push(`- ` + '`wiki_read { slug: "' + card.slug + '" }`' + ` — ${card.title}`);
  }

  lines.push(
    "",
    'Pass `view: "catalog"` if you want the raw full inventory table.'
  );

  return lines.join("\n");
}
