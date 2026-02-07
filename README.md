# Context Reminder

A lightweight MCP server that acts as a **behavioral nudge** for Claude. Its presence in Claude's tool list reminds the AI to check its own internal project files (CLAUDE.md, memory, project context) at the start of every conversation — instead of starting blind.

## The Problem

Claude starts every conversation with zero memory of your project. It skips its own context files, gives advice based on stale assumptions, and wastes the first several messages on orientation. This tool fixes that by simply existing in the tool list — a gentle reminder to check its own memory first.

## How It Works

1. The `check_project_context` tool shows up in Claude's available tools
2. Claude sees it and is reminded to check project state before doing anything else
3. When called, it reads any project context files and returns structured metadata as a bonus

That's it. The nudge is the feature.

## Installation

```bash
cd project-context-mcp
npm install
npm run build
```

## Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "project-context": {
      "command": "node",
      "args": ["/absolute/path/to/project-context-mcp/dist/index.js"]
    }
  }
}
```

No environment variables needed. Restart Claude Desktop after saving.

## What It Reads

If project context files exist, the tool extracts structured metadata from them. It only looks for specific markdown files — it never reads source code.

### Supported File Names (priority order)

1. `*_Project_Context*.md` (e.g., `BeanAgent_Project_Context.md`)
2. `PROJECT_CONTEXT.md`
3. `*Context*.md` (case-insensitive)
4. `CLAUDE_CONTEXT.md`
5. `STATUS.md`
6. `CHANGELOG.md` (version extraction only)

### Search Locations

1. Project root
2. `docs/` subdirectory
3. `.claude/` subdirectory

## Tool Response

When called, `check_project_context` returns:

```json
{
  "projectName": "my-project",
  "contextFileFound": true,
  "contextFilePath": "PROJECT_CONTEXT.md",
  "timestamp": "2026-02-07T14:30:00Z",
  "currentVersion": "1.2.3",
  "status": "Active development",
  "keyFacts": ["Built with TypeScript + Node.js", "..."],
  "recentChanges": ["Added user profile editing", "..."],
  "activeWorkstreams": ["Building notification system", "..."],
  "warnings": []
}
```

## Security

- **Read-only** — never writes, creates, or deletes files
- **No network access** — all operations are local filesystem reads
- **No credentials** — no authentication, no tokens, no secrets
- **No telemetry** — no data leaves your machine

## Requirements

- Node.js >= 18

## License

MIT
