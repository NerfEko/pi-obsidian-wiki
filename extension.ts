/**
 * pi-wiki — Obsidian-native long-term memory extension for Pi coding agent.
 *
 * Stores knowledge cards directly in an Obsidian folder, injects compact memory
 * into the first turn of each session, and exposes tools for recall/write/search.
 */

import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const DEFAULT_WIKI_DIR = resolve(homedir(), "Documents/obsidian/EKoCodes/agent-wiki");
const CONFIG_PATH = resolve(homedir(), ".pi/agent/pi-wiki.json");
const SKILLS_DIR = resolve(__dirname, "skills");
const TODAY = () => new Date().toISOString().slice(0, 10);
const SPECIAL_FILES = new Set(["index.md", "handoff.md", "conventions.md"]);
const NON_CARD_DIRS = new Set(["archive", "views"]);
const CATEGORY_DIRS = [
  "architecture",
  "backend",
  "bugfix",
  "desktop",
  "devops",
  "frontend",
  "networking",
  "tooling",
] as const;
const CATEGORY_SET = new Set<string>(CATEGORY_DIRS);

type WikiConfig = {
  wikiDir: string;
  autoGitPush: boolean;
};

const DEFAULT_CONFIG: WikiConfig = {
  wikiDir: DEFAULT_WIKI_DIR,
  autoGitPush: true,
};

function expandPath(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return resolve(homedir(), input.slice(2));
  return resolve(input);
}

async function loadConfig(): Promise<WikiConfig> {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
    return {
      wikiDir: raw.wikiDir ? expandPath(String(raw.wikiDir)) : DEFAULT_CONFIG.wikiDir,
      autoGitPush:
        typeof raw.autoGitPush === "boolean" ? raw.autoGitPush : DEFAULT_CONFIG.autoGitPush,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(config: WikiConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function archiveDir(wikiDir: string): string {
  return join(wikiDir, "archive");
}

function viewsDir(wikiDir: string): string {
  return join(wikiDir, "views");
}

function cardMutationKey(wikiDir: string, slug: string): string {
  return join(wikiDir, ".pi-wiki-locks", slug);
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function isValidCategory(category: string): boolean {
  return CATEGORY_SET.has(category);
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function rgNoResults(err: any): boolean {
  const text = [err?.message, err?.stderr, err?.stdout].filter(Boolean).join("\n");
  return /exit code 1|code 1|returned non-zero exit status 1/i.test(text);
}

function indexContent(): string {
  return `# Agent Wiki

> [!info] This file is the agent's entry point. Cards auto-appear below via Dataview queries. Do not edit manually.

## Recent Cards (last 30 days)

~~~dataviewjs
const base = dv.current().file.folder;
dv.table(["title", "tags", "Modified"],
  dv.pages('"' + base + '"')
    .where(p => !p.file.path.includes("/archive/") && p.file.name !== "index" && p.file.name !== "handoff" && p.file.name !== "conventions")
    .where(p => p.file.mtime >= dv.date("today") - dv.duration("30 days"))
    .sort(p => p.file.mtime, 'desc')
    .map(p => [p.title, p.tags, p.file.mtime])
);
~~~

## By Category

~~~dataviewjs
const base = dv.current().file.folder;
for (let group of dv.pages('"' + base + '"')
    .where(p => !p.file.path.includes("/archive/") && p.file.name !== "index" && p.file.name !== "handoff" && p.file.name !== "conventions")
    .groupBy(p => p.tags?.find(t => t.startsWith("knowledge/"))?.split("/")[1] ?? "uncategorized")) {
    dv.header(3, group.key);
    dv.table(["Card", "Status", "Modified"],
        group.rows.sort(p => p.file.mtime, 'desc')
            .map(p => [p.file.link,
                       p.file.tags?.find(t => t.startsWith("status/"))?.split("/")[1],
                       p.file.mday])
    );
}
~~~

## Orphan Links (unresolved wikilinks)

~~~dataviewjs
const base = dv.current().file.folder;
const allPaths = new Set(dv.pages('"' + base + '"').map(p => p.file.name).array());
const broken = dv.pages('"' + base + '"')
    .where(p => !p.file.path.includes("/archive/"))
    .flatMap(p => p.file.outlinks.array())
    .filter(link => !allPaths.has(link.path.split("/").pop()?.replace(".md","")));
if (broken.length === 0) dv.paragraph("✅ No broken links.");
else dv.list([...new Set(broken.map(l => l.display ?? l.path))]);
~~~
`;
}

function handoffContent(): string {
  return `# Session Handoff
_Last updated: (never) by pi_

## Completed This Session
(no previous session)

## In Progress / Deferred
(nothing deferred)

## Next Session
(no next session planned)

## Active Projects (for context)
(no active projects recorded)
`;
}

function conventionsContent(): string {
  return [
    "# Agent Wiki Conventions",
    "",
    "This file defines the canonical card schema and tag taxonomy. Read it at the start of any task involving the wiki.",
    "",
    "## Card Schema",
    "",
    "| Field      | Type | Required | Notes |",
    "|------------|------|----------|-------|",
    "| `title`    | text | ✅ | ≤60 chars, noun phrase |",
    "| `slug`     | text | ✅ | kebab-case, matches filename |",
    "| `aliases`  | list | —  | alternate names |",
    "| `tags`     | list | ✅ | knowledge/* + status/* |",
    "| `created`  | date | ✅ | ISO 8601 YYYY-MM-DD |",
    "| `modified` | date | ✅ | ISO 8601 YYYY-MM-DD |",
    "| `source`   | text | ✅ | pi \\| human \\| URL |",
    "| `related`  | list | —  | quoted wikilinks like [\"[[slug-a]]\"] |",
    "",
    "## Tag Taxonomy",
    "",
    "### Domain tags",
    "- `knowledge/architecture`",
    "- `knowledge/backend`",
    "- `knowledge/bugfix`",
    "- `knowledge/desktop`",
    "- `knowledge/devops`",
    "- `knowledge/frontend`",
    "- `knowledge/networking`",
    "- `knowledge/tooling`",
    "",
    "### Status tags",
    "- `status/active`",
    "- `status/draft`",
    "- `status/archived`",
    "",
    "## Callout Types",
    "",
    "| Callout | Required? | Purpose |",
    "|---------|-----------|---------|",
    "| `> [!summary]` | ✅ | One-sentence TL;DR |",
    "| `> [!tip]` | Optional | Usage guidance |",
    "| `> [!warning]` | Optional | Caveats |",
    "",
    "## Wikilink Formats",
    "",
    "| Format | Use case |",
    "|--------|---------|",
    "| `[[slug]]` | Standard link |",
    "| `[[slug#heading]]` | Section link |",
    "| `[[slug|display text]]` | Aliased link |",
    "| `![[slug]]` | Embedded transclusion |",
    "",
  ].join("\n");
}

function byCategoryView(): string {
  return `// DataviewJS view: grouped by knowledge/* category
// Usage: await dv.view(dv.current().file.folder + "/views/by-category")
const base = dv.current().file.folder;
for (let group of dv.pages('"' + base + '"')
    .where(p => !p.file.path.includes("/archive/") && p.file.name !== "index" && p.file.name !== "handoff" && p.file.name !== "conventions")
    .groupBy(p => p.tags?.find(t => t.startsWith("knowledge/"))?.split("/")[1] ?? "uncategorized")) {
    dv.header(3, group.key);
    dv.table(["Card", "Status", "Modified"],
        group.rows.sort(p => p.file.mtime, 'desc')
            .map(p => [p.file.link,
                       p.file.tags?.find(t => t.startsWith("status/"))?.split("/")[1],
                       p.file.mday])
    );
}
`;
}

async function ensureFile(path: string, content: string): Promise<void> {
  if (!existsSync(path)) {
    await writeFile(path, content, "utf-8");
  }
}

async function scaffoldWiki(wikiDir: string): Promise<void> {
  await mkdir(wikiDir, { recursive: true });
  await mkdir(archiveDir(wikiDir), { recursive: true });
  await mkdir(viewsDir(wikiDir), { recursive: true });
  for (const dir of CATEGORY_DIRS) {
    await mkdir(join(wikiDir, dir), { recursive: true });
  }
  await ensureFile(join(wikiDir, "index.md"), indexContent());
  await ensureFile(join(wikiDir, "handoff.md"), handoffContent());
  await ensureFile(join(wikiDir, "conventions.md"), conventionsContent());
  await ensureFile(join(viewsDir(wikiDir), "by-category.js"), byCategoryView());
}

function parseFrontmatter(text: string): {
  meta: Record<string, string | string[]>;
  body: string;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  const meta: Record<string, string | string[]> = {};
  const raw = match[1];
  const body = match[2];
  let currentKey = "";
  let inList = false;
  const listItems: string[] = [];

  for (const line of raw.split("\n")) {
    const listMatch = line.match(/^  - (.*)$/);
    const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);

    if (listMatch && inList) {
      listItems.push(listMatch[1].replace(/^"|"$/g, ""));
    } else if (keyMatch) {
      if (inList && currentKey) {
        meta[currentKey] = listItems.slice();
        listItems.length = 0;
        inList = false;
      }
      currentKey = keyMatch[1];
      const val = keyMatch[2].trim();
      if (val === "" || val === "[]") {
        inList = true;
      } else if (val.startsWith("[")) {
        meta[currentKey] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
      } else {
        meta[currentKey] = val.replace(/^"|"$/g, "");
        inList = false;
      }
    } else if (inList && line.trim() === "") {
      if (currentKey) {
        meta[currentKey] = listItems.slice();
        listItems.length = 0;
        inList = false;
        currentKey = "";
      }
    }
  }

  if (inList && currentKey) {
    meta[currentKey] = listItems.slice();
  }

  return { meta, body };
}

function buildFrontmatter(fields: {
  title: string;
  slug: string;
  aliases?: string[];
  tags: string[];
  created: string;
  modified: string;
  source: string;
  related?: string[];
}): string {
  const lines = ["---"];
  lines.push(`title: ${yamlString(fields.title)}`);
  lines.push(`slug: ${fields.slug}`);
  if (fields.aliases && fields.aliases.length > 0) {
    lines.push("aliases:");
    for (const a of fields.aliases) lines.push(`  - ${yamlString(a)}`);
  } else {
    lines.push("aliases: []");
  }
  lines.push("tags:");
  for (const t of fields.tags) lines.push(`  - ${yamlString(t)}`);
  lines.push(`created: ${fields.created}`);
  lines.push(`modified: ${fields.modified}`);
  lines.push(`source: ${yamlString(fields.source)}`);
  if (fields.related && fields.related.length > 0) {
    lines.push("related:");
    for (const r of fields.related) {
      const clean = r.replace(/^"?\[?\[?/, "").replace(/\]?\]?"?$/, "");
      lines.push(`  - ${yamlString(`[[${clean}]]`)}`);
    }
  } else {
    lines.push("related: []");
  }
  lines.push("---");
  return lines.join("\n");
}

async function listCardFiles(wikiDir: string): Promise<Array<{ slug: string; filePath: string }>> {
  await mkdir(wikiDir, { recursive: true });
  const results: Array<{ slug: string; filePath: string }> = [];
  const entries = await readdir(wikiDir, { withFileTypes: true });

  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".md") && !SPECIAL_FILES.has(e.name)) {
      results.push({ slug: e.name.replace(/\.md$/, ""), filePath: join(wikiDir, e.name) });
    } else if (e.isDirectory() && !NON_CARD_DIRS.has(e.name)) {
      const subEntries = await readdir(join(wikiDir, e.name), { withFileTypes: true });
      for (const se of subEntries) {
        if (se.isFile() && se.name.endsWith(".md")) {
          results.push({
            slug: se.name.replace(/\.md$/, ""),
            filePath: join(wikiDir, e.name, se.name),
          });
        }
      }
    }
  }

  return results;
}

async function findCardFile(wikiDir: string, slug: string): Promise<string | null> {
  if (!isValidSlug(slug)) return null;
  const rootPath = join(wikiDir, `${slug}.md`);
  if (existsSync(rootPath)) return rootPath;

  const entries = await readdir(wikiDir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && !NON_CARD_DIRS.has(e.name)) {
      const subPath = join(wikiDir, e.name, `${slug}.md`);
      if (existsSync(subPath)) return subPath;
    }
  }
  return null;
}

function summarizeCard(slug: string, meta: Record<string, string | string[]>): string {
  const title = (meta["title"] as string) ?? slug;
  const tags = (meta["tags"] as string[]) ?? [];
  const category =
    tags.find((t) => t.startsWith("knowledge/"))?.split("/")[1] ??
    (meta["category"] as string) ??
    "—";
  const modified = (meta["modified"] as string) ?? (meta["created"] as string) ?? "—";
  return `${slug.padEnd(52)} | ${title.slice(0, 52).padEnd(52)} | ${category.padEnd(16)} | ${modified}`;
}

let recallDone = false;
let retroDone = false;

export default function (pi: ExtensionAPI) {
  async function maybeGitPush(
    config: WikiConfig,
    filePath: string,
    message: string
  ): Promise<string | null> {
    if (!config.autoGitPush) return null;
    try {
      const result = await pi.exec("git", ["-C", config.wikiDir, "rev-parse", "--show-toplevel"]);
      const gitRoot = result.stdout.trim();
      if (!gitRoot) return "git push skipped: wiki path is not inside a git repo.";
      await pi.exec("git", ["-C", gitRoot, "add", filePath]);
      await pi.exec("git", ["-C", gitRoot, "commit", "-m", message]);
      await pi.exec("git", ["-C", gitRoot, "push"]);
      return null;
    } catch (err: any) {
      return `git push failed: ${err?.message ?? "unknown error"}`;
    }
  }

  pi.on("resources_discover", async () => ({ skillPaths: [SKILLS_DIR] }));

  pi.on("session_start", async () => {
    recallDone = false;
    retroDone = false;
  });

  pi.on("session_compact", async () => {
    recallDone = false;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (recallDone) return;

    try {
      const config = await loadConfig();
      await mkdir(config.wikiDir, { recursive: true });
      const files = await listCardFiles(config.wikiDir);
      const rows: string[] = [];

      for (const { slug, filePath } of files) {
        try {
          const text = await readFile(filePath, "utf-8");
          const { meta, body } = parseFrontmatter(text);
          const tags = (meta["tags"] as string[]) ?? [];
          const category =
            tags.find((t) => t.startsWith("knowledge/"))?.split("/")[1] ??
            (meta["category"] as string) ??
            "—";
          const title = (meta["title"] as string) ?? slug;
          const summaryMatch = body.match(/^>\s*\[!summary\]\s*(.+)$/im);
          const summary = summaryMatch ? summaryMatch[1].trim() : "";
          rows.push(`- **${slug}** (${category}) — ${title}${summary ? `\n  > ${summary}` : ""}`);
        } catch {
          // skip unreadable card
        }
      }

      const handoffPath = join(config.wikiDir, "handoff.md");
      const handoff = existsSync(handoffPath)
        ? await readFile(handoffPath, "utf-8")
        : "No previous session handoff.";

      const content = [
        `## Wiki Memory (${files.length} cards)`,
        "",
        rows.length ? rows.join("\n") : "(no cards yet)",
        "",
        "## Previous Session",
        "",
        handoff.trim(),
      ].join("\n");

      recallDone = true;
      ctx.ui.notify(`📚 Wiki loaded — ${files.length} cards`, "info");
      return { systemPrompt: event.systemPrompt + "\n\n" + content };
    } catch (err: any) {
      recallDone = false;
      ctx.ui.notify(`Wiki failed to load: ${err.message}`, "error");
    }
  });

  pi.registerCommand("wiki", {
    description: "Show wiki stats, set path, or toggle automatic git push",
    handler: async (args, ctx) => {
      const input = args?.trim() ?? "";
      const config = await loadConfig();

      if (input.startsWith("path ")) {
        const rawPath = input.slice("path ".length).trim();
        if (!rawPath) {
          ctx.ui.notify("Usage: /wiki path /path/to/agent-wiki", "warning");
          return;
        }
        const wikiDir = expandPath(rawPath);
        try {
          await scaffoldWiki(wikiDir);
          await saveConfig({ ...config, wikiDir });
          ctx.ui.notify(`📚 Wiki path set to ${wikiDir}`, "success");
        } catch (err: any) {
          ctx.ui.notify(`Failed to set wiki path: ${err?.message ?? "unknown error"}`, "error");
        }
        return;
      }

      if (input.startsWith("git-push ")) {
        const value = input.slice("git-push ".length).trim().toLowerCase();
        if (value !== "on" && value !== "off") {
          ctx.ui.notify("Usage: /wiki git-push on|off", "warning");
          return;
        }
        const autoGitPush = value === "on";
        await saveConfig({ ...config, autoGitPush });
        ctx.ui.notify(
          `📦 Automatic wiki git push ${autoGitPush ? "enabled" : "disabled"}`,
          "success"
        );
        return;
      }

      if (input && input !== "status") {
        ctx.ui.notify(
          "Usage:\n  /wiki\n  /wiki path /path/to/agent-wiki\n  /wiki git-push on|off",
          "info"
        );
        return;
      }

      try {
        await mkdir(config.wikiDir, { recursive: true });
        const cards = await listCardFiles(config.wikiDir);
        const tagCount: Record<string, number> = {};
        let lastFive: Array<{ slug: string; modified: string; title: string }> = [];

        for (const { slug, filePath } of cards) {
          const text = await readFile(filePath, "utf-8");
          const { meta } = parseFrontmatter(text);
          const tags = (meta["tags"] as string[]) ?? [];
          for (const t of tags) {
            if (t.startsWith("knowledge/")) tagCount[t] = (tagCount[t] ?? 0) + 1;
          }
          lastFive.push({
            slug,
            modified: (meta["modified"] as string) ?? (meta["created"] as string) ?? "—",
            title: (meta["title"] as string) ?? slug,
          });
        }

        lastFive = lastFive.sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 5);
        const tagLines = Object.entries(tagCount)
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => `  ${t}: ${n}`)
          .join("\n");
        const recentLines = lastFive
          .map((c) => `  ${c.modified}  ${c.slug}  (${c.title.slice(0, 40)})`)
          .join("\n");

        ctx.ui.notify(
          `📚 Wiki\nPath: ${config.wikiDir}\nAuto git push: ${config.autoGitPush ? "on" : "off"}\nCards: ${cards.length}\n\nTags:\n${tagLines || "  (none)"}\n\nRecently modified:\n${recentLines || "  (none)"}`,
          "info"
        );
      } catch (err: any) {
        ctx.ui.notify(`Wiki error: ${err.message}`, "error");
      }
    },
  });

  pi.registerCommand("wiki-search", {
    description: "Quick ripgrep search of wiki cards",
    handler: async (args, ctx) => {
      if (!args?.trim()) {
        ctx.ui.notify("Usage: /wiki-search <query>", "warning");
        return;
      }
      try {
        const config = await loadConfig();
        const result = await pi.exec("rg", ["-i", "--max-count", "3", "-l", args.trim(), config.wikiDir]);
        const files = result.stdout.trim().split("\n").filter(Boolean);
        if (files.length === 0) {
          ctx.ui.notify(`No results for "${args}"`, "info");
          return;
        }
        const lines: string[] = [`🔍 Found ${files.length} card(s) for "${args}":\n`];
        for (const f of files.slice(0, 10)) {
          const slug = basename(f, ".md");
          const text = await readFile(f, "utf-8");
          const { meta } = parseFrontmatter(text);
          lines.push(`  • ${slug}: ${(meta["title"] as string) ?? slug}`);
        }
        ctx.ui.notify(lines.join("\n"), "info");
      } catch (err: any) {
        if (rgNoResults(err)) {
          ctx.ui.notify(`No results for "${args}"`, "info");
        } else {
          ctx.ui.notify(`Wiki search failed: ${err?.message ?? "unknown error"}`, "error");
        }
      }
    },
  });

  pi.registerTool({
    name: "wiki_recall",
    label: "Wiki Recall",
    description:
      "Load prior knowledge from the Obsidian wiki. No args: returns full catalog (slug | title | category | modified). With query: returns matching cards only. Call at the start of every task.",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "Optional search query to filter cards" })),
    }),
    async execute(_id, params, signal) {
      recallDone = true;
      const config = await loadConfig();
      await mkdir(config.wikiDir, { recursive: true });

      let files: Array<{ slug: string; filePath: string }>;
      if (params.query?.trim()) {
        try {
          const result = await pi.exec(
            "rg",
            ["-i", "--max-count", "3", "-l", params.query.trim(), config.wikiDir],
            { signal }
          );
          files = result.stdout
            .trim()
            .split("\n")
            .filter(Boolean)
            .filter((p) => p.endsWith(".md") && !p.includes("/archive/"))
            .map((p) => ({ slug: basename(p, ".md"), filePath: p }));
        } catch {
          files = [];
        }
      } else {
        files = await listCardFiles(config.wikiDir);
      }

      if (files.length === 0) {
        return {
          content: [{ type: "text", text: params.query ? `No wiki cards matching "${params.query}".` : "Wiki is empty. No cards found." }],
        };
      }

      const header = `${"SLUG".padEnd(52)} | ${"TITLE".padEnd(52)} | ${"CATEGORY".padEnd(16)} | MODIFIED`;
      const divider = "-".repeat(header.length);
      const rows: string[] = [header, divider];
      for (const { slug, filePath } of files) {
        try {
          const text = await readFile(filePath, "utf-8");
          const { meta } = parseFrontmatter(text);
          rows.push(summarizeCard(slug, meta));
        } catch {
          rows.push(`${slug.padEnd(52)} | (unreadable)`);
        }
      }

      return {
        content: [{ type: "text", text: `Wiki catalog (${files.length} cards):\n\n${rows.join("\n")}` }],
      };
    },
  });

  pi.registerTool({
    name: "wiki_read",
    label: "Wiki Read",
    description:
      'Read a single wiki card by slug. Use slug "handoff" to read session continuity. Use slug "conventions" to read the card schema reference.',
    parameters: Type.Object({
      slug: Type.String({ description: 'Kebab-case slug, or "handoff" / "conventions"' }),
    }),
    async execute(_id, params) {
      if (!isValidSlug(params.slug) && !["handoff", "conventions", "index"].includes(params.slug)) {
        return {
          content: [{ type: "text", text: `Invalid slug: ${params.slug}` }],
          isError: true,
        };
      }
      const config = await loadConfig();
      await mkdir(config.wikiDir, { recursive: true });
      const specialFiles: Record<string, string> = {
        handoff: join(config.wikiDir, "handoff.md"),
        conventions: join(config.wikiDir, "conventions.md"),
        index: join(config.wikiDir, "index.md"),
      };
      const filePath = specialFiles[params.slug] ?? (await findCardFile(config.wikiDir, params.slug));
      if (!filePath) {
        const archivedPath = join(archiveDir(config.wikiDir), `${params.slug}.md`);
        if (existsSync(archivedPath)) {
          const text = await readFile(archivedPath, "utf-8");
          return { content: [{ type: "text", text: `[ARCHIVED]\n\n${text}` }] };
        }
        return {
          content: [{ type: "text", text: `Card "${params.slug}" not found. Use wiki_recall to see available cards.` }],
        };
      }
      const text = await readFile(filePath, "utf-8");
      return { content: [{ type: "text", text }] };
    },
  });

  pi.registerTool({
    name: "wiki_write",
    label: "Wiki Write",
    description:
      "Write or update a wiki card. Auto-injects frontmatter. Body should use callouts: `> [!summary]` (required), `> [!tip]`, `> [!warning]`. Include [[wikilinks]] in body.",
    parameters: Type.Object({
      slug: Type.String({ description: "Kebab-case slug (matches filename, e.g. jwt-refresh-pattern)" }),
      title: Type.String({ description: "≤60 chars, noun phrase" }),
      body: Type.String({ description: 'Card body in markdown. Must start with `> [!summary] <one-line TL;DR>`. Use [[wikilinks]] for related cards.' }),
      category: Type.String({ description: "Category for hierarchical tag: architecture | devops | bugfix | frontend | tooling | desktop | networking | backend" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Additional tags beyond the auto-generated knowledge/<category> + status/active" })),
      aliases: Type.Optional(Type.Array(Type.String(), { description: "Alternate names for this card" })),
      related: Type.Optional(Type.Array(Type.String(), { description: 'Related card slugs (e.g. ["jwt-refresh-pattern", "auth-middleware"])' })),
      source: Type.Optional(Type.String({ description: 'Source: "pi" (default) | "human" | URL' })),
    }),
    async execute(_id, params) {
      retroDone = true;
      const config = await loadConfig();
      await scaffoldWiki(config.wikiDir);

      if (!isValidSlug(params.slug)) {
        return {
          content: [{ type: "text", text: `Error: slug "${params.slug}" is not valid kebab-case. Use only lowercase letters, digits, and hyphens.` }],
          isError: true,
        };
      }
      if (!isValidCategory(params.category)) {
        return {
          content: [{ type: "text", text: `Error: category "${params.category}" is invalid.` }],
          isError: true,
        };
      }

      const cardDir = join(config.wikiDir, params.category);
      await mkdir(cardDir, { recursive: true });
      const defaultPath = join(cardDir, `${params.slug}.md`);
      const existingPath = await findCardFile(config.wikiDir, params.slug);
      const filePath = existingPath ?? defaultPath;
      const today = TODAY();

      let createdDate = today;
      if (existsSync(filePath)) {
        try {
          const existing = await readFile(filePath, "utf-8");
          const { meta } = parseFrontmatter(existing);
          createdDate = (meta["created"] as string) ?? today;
        } catch {}
      }

      const domainTag = `knowledge/${params.category}`;
      const allTags = Array.from(new Set([domainTag, "status/active", ...(params.tags ?? [])]));
      const frontmatter = buildFrontmatter({
        title: params.title,
        slug: params.slug,
        aliases: params.aliases,
        tags: allTags,
        created: createdDate,
        modified: today,
        source: params.source ?? "pi",
        related: params.related,
      });
      const content = `${frontmatter}\n\n${params.body.trim()}\n`;

      await withFileMutationQueue(cardMutationKey(config.wikiDir, params.slug), async () => {
        await writeFile(filePath, content, "utf-8");
      });
      const gitWarning = await maybeGitPush(config, filePath, `wiki: ${existingPath ? "update" : "add"} ${params.slug}`);

      return {
        content: [{ type: "text", text: `✅ Card written: ${params.slug}\n  Title: ${params.title}\n  Tags: ${allTags.join(", ")}\n  Path: ${filePath}${gitWarning ? `\n  Warning: ${gitWarning}` : ""}` }],
      };
    },
  });

  pi.registerTool({
    name: "wiki_search",
    label: "Wiki Search",
    description: "Full-text ripgrep search of wiki cards. Returns matching slugs with excerpts.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query (case-insensitive)" }),
    }),
    async execute(_id, params, signal) {
      const config = await loadConfig();
      try {
        const result = await pi.exec(
          "rg",
          ["-i", "--max-count", "3", "-n", params.query, config.wikiDir, "--glob", "*.md", "--glob", "!archive/**"],
          { signal }
        );
        const lines = result.stdout.trim().split("\n").filter(Boolean);
        if (lines.length === 0) {
          return { content: [{ type: "text", text: `No results for "${params.query}".` }] };
        }

        const byFile: Record<string, string[]> = {};
        const titles: Record<string, string> = {};
        for (const line of lines) {
          const m = line.match(/^(.+?):(\d+):(.*)$/);
          if (!m) continue;
          const path = m[1];
          const slug = basename(path, ".md");
          if (!byFile[slug]) byFile[slug] = [];
          byFile[slug].push(`  L${m[2]}: ${m[3].trim()}`);
          if (!titles[slug]) {
            try {
              const text = await readFile(path, "utf-8");
              const { meta } = parseFrontmatter(text);
              titles[slug] = (meta["title"] as string) ?? slug;
            } catch {
              titles[slug] = slug;
            }
          }
        }

        const out: string[] = [`🔍 Search results for "${params.query}":\n`];
        for (const [slug, excerpts] of Object.entries(byFile)) {
          out.push(`• **${slug}** — ${titles[slug] ?? slug}`);
          out.push(...excerpts.slice(0, 3));
          out.push("");
        }
        return { content: [{ type: "text", text: out.join("\n") }] };
      } catch (err: any) {
        if (rgNoResults(err)) {
          return { content: [{ type: "text", text: `No results for "${params.query}".` }] };
        }
        return {
          content: [{ type: "text", text: `Wiki search failed: ${err?.message ?? "unknown error"}` }],
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "wiki_archive",
    label: "Wiki Archive",
    description: "Archive a card (moves to archive/ subdirectory, marks status/archived).",
    parameters: Type.Object({
      slug: Type.String({ description: "Slug of the card to archive" }),
    }),
    async execute(_id, params) {
      if (!isValidSlug(params.slug)) {
        return { content: [{ type: "text", text: `Invalid slug: ${params.slug}` }], isError: true };
      }
      const config = await loadConfig();
      const src = await findCardFile(config.wikiDir, params.slug);
      const dst = join(archiveDir(config.wikiDir), `${params.slug}.md`);
      await mkdir(archiveDir(config.wikiDir), { recursive: true });

      if (!src) {
        return { content: [{ type: "text", text: `Card "${params.slug}" not found.` }], isError: true };
      }

      const text = await readFile(src, "utf-8");
      const { meta, body } = parseFrontmatter(text);
      const tags = ((meta["tags"] as string[]) ?? []).map((t) =>
        t === "status/active" ? "status/archived" : t
      );
      if (!tags.includes("status/archived")) tags.push("status/archived");

      const updated = buildFrontmatter({
        title: (meta["title"] as string) ?? params.slug,
        slug: params.slug,
        aliases: meta["aliases"] as string[],
        tags,
        created: (meta["created"] as string) ?? TODAY(),
        modified: TODAY(),
        source: (meta["source"] as string) ?? "pi",
        related: meta["related"] as string[],
      });

      await withFileMutationQueue(cardMutationKey(config.wikiDir, params.slug), async () => {
        if (src !== dst) {
          await rename(src, dst);
        }
        await writeFile(dst, `${updated}\n\n${body.trim()}\n`, "utf-8");
      });
      const gitWarning = await maybeGitPush(config, dst, `wiki: archive ${params.slug}`);

      return { content: [{ type: "text", text: `📦 Archived: ${params.slug} → archive/${params.slug}.md${gitWarning ? `\nWarning: ${gitWarning}` : ""}` }] };
    },
  });

  pi.registerTool({
    name: "wiki_handoff",
    label: "Wiki Handoff",
    description:
      'Read or write the session handoff file (handoff.md). Use action "read" to load continuity context, "write" to record what was completed, deferred, and planned next.',
    parameters: Type.Object({
      action: Type.Union([Type.Literal("read"), Type.Literal("write")], { description: '"read" or "write"' }),
      content: Type.Optional(Type.String({ description: 'For action "write": the full handoff markdown content. Use the template: ## Completed This Session / ## In Progress / ## Next Session / ## Active Projects' })),
    }),
    async execute(_id, params) {
      const config = await loadConfig();
      await mkdir(config.wikiDir, { recursive: true });
      const filePath = join(config.wikiDir, "handoff.md");

      if (params.action === "read") {
        if (!existsSync(filePath)) {
          return { content: [{ type: "text", text: "No handoff.md found — this appears to be a fresh session." }] };
        }
        return { content: [{ type: "text", text: await readFile(filePath, "utf-8") }] };
      }

      if (!params.content?.trim()) {
        return { content: [{ type: "text", text: 'Error: content is required for action "write".' }], isError: true };
      }

      const header = `# Session Handoff\n_Last updated: ${TODAY()} by pi_\n\n`;
      const body = params.content.trim().startsWith("#") ? params.content.trim() : header + params.content.trim();
      await withFileMutationQueue(filePath, async () => {
        await writeFile(filePath, body + "\n", "utf-8");
      });
      const gitWarning = await maybeGitPush(config, filePath, "wiki: update handoff");
      return { content: [{ type: "text", text: `✅ handoff.md updated (${TODAY()})${gitWarning ? `\nWarning: ${gitWarning}` : ""}` }] };
    },
  });

  pi.registerTool({
    name: "wiki_audit",
    label: "Wiki Audit",
    description:
      "Audit the wiki: find orphan wikilinks, isolated cards (no inbound links), and stale drafts (>180 days old with status/draft).",
    parameters: Type.Object({}),
    async execute() {
      const config = await loadConfig();
      await mkdir(config.wikiDir, { recursive: true });
      const cards = await listCardFiles(config.wikiDir);
      const allSlugs = new Set(cards.map((c) => c.slug));
      const inboundLinks: Record<string, Set<string>> = {};
      const brokenLinks: Array<{ from: string; target: string }> = [];
      const brokenSeen = new Set<string>();
      const staleDrafts: string[] = [];

      for (const { slug, filePath } of cards) {
        inboundLinks[slug] = inboundLinks[slug] ?? new Set();
        const text = await readFile(filePath, "utf-8");
        const { meta, body } = parseFrontmatter(text);
        const tags = (meta["tags"] as string[]) ?? [];
        if (tags.includes("status/draft")) {
          const created = (meta["created"] as string) ?? "";
          if (created) {
            const ageDays = (Date.now() - new Date(created).getTime()) / 86400000;
            if (ageDays > 180) staleDrafts.push(slug);
          }
        }

        const bodyLinks = [...body.matchAll(/\[\[([^\]#|]+)/g)].map((m) => m[1].trim());
        const relatedLinks = ((meta["related"] as string[]) ?? []).map((r) =>
          r.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim()
        );

        for (const target of [...bodyLinks, ...relatedLinks]) {
          if (!/^[a-z][a-z0-9-]*$/.test(target)) continue;
          const key = `${slug}→${target}`;
          if (brokenSeen.has(key)) continue;
          brokenSeen.add(key);
          if (!allSlugs.has(target)) {
            brokenLinks.push({ from: slug, target });
          } else {
            inboundLinks[target] = inboundLinks[target] ?? new Set();
            inboundLinks[target].add(slug);
          }
        }
      }

      const isolated = cards.map((c) => c.slug).filter((s) => !inboundLinks[s] || inboundLinks[s].size === 0);
      const lines: string[] = ["# Wiki Audit Report\n"];
      lines.push(`## Stats\n- Total cards: ${cards.length}\n`);
      lines.push(`## Broken Wikilinks (${brokenLinks.length})`);
      if (brokenLinks.length === 0) lines.push("✅ No broken links.");
      else for (const { from, target } of brokenLinks) lines.push(`  - [[${target}]] referenced in \`${from}\``);
      lines.push(`\n## Isolated Cards (${isolated.length}) — no inbound links`);
      if (isolated.length === 0) lines.push("✅ All cards have inbound links.");
      else for (const s of isolated) lines.push(`  - ${s}`);
      lines.push(`\n## Stale Drafts (${staleDrafts.length}) — status/draft, >180 days`);
      if (staleDrafts.length === 0) lines.push("✅ No stale drafts.");
      else for (const s of staleDrafts) lines.push(`  - ${s}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  });
}
