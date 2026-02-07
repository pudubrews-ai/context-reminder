# Project Context MCP Server

A lightweight, read-only MCP (Model Context Protocol) server that gives AI models instant awareness of your project's current state. It exposes a single tool — `check_project_context` — that reads your project directory, finds a project context file, and returns structured metadata (version, status, recent changes, etc.).

## Why?

Claude starts every conversation with zero knowledge of your project's current state. This tool solves that by:

1. **Providing instant context** — version, status, recent changes, active workstreams
2. **Acting as a behavioral nudge** — its presence in the tool list reminds the AI to check project state at conversation start

## Installation

```bash
cd project-context-mcp
npm install
npm run build
```

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "project-context": {
      "command": "node",
      "args": ["/absolute/path/to/project-context-mcp/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

### Configuration Options

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PROJECT_ROOT` | Current working directory | Path to the project root directory |
| `MAX_FILE_SIZE` | `1048576` (1MB) | Maximum context file size before truncation |
| `MAX_KEY_FACTS` | `10` | Maximum number of key facts to extract |
| `MAX_RECENT_CHANGES` | `5` | Maximum number of recent changes to extract |
| `MAX_SYMLINK_DEPTH` | `5` | Maximum symlink resolution depth |

## Project Context File

For best results, maintain a `PROJECT_CONTEXT.md` (or `{ProjectName}_Project_Context.md`) in your project root:

```markdown
# MyProject – Project Context

## Current Version: 1.2.3
**Status:** Active development
**Last Updated:** 2026-02-07

## Key Facts
- Built with TypeScript + Node.js
- PostgreSQL database with Prisma ORM
- Deployed on AWS Lambda

## Recent Changes
- [1.2.3] Added user profile editing
- [1.2.2] Fixed authentication timeout bug

## Active Workstreams
- Building notification system
- Migrating to new payment provider

## Next Planned Version: 1.3.0
- Notification system launch
```

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

The `check_project_context` tool returns a JSON object:

```json
{
  "projectName": "my-project",
  "contextFileFound": true,
  "contextFilePath": "PROJECT_CONTEXT.md",
  "timestamp": "2026-02-07T14:30:00Z",
  "currentVersion": "1.2.3",
  "lastUpdated": "2026-02-07",
  "dateInFile": "2026-02-07",
  "status": "Active development",
  "nextVersion": "1.3.0",
  "keyFacts": ["Built with TypeScript + Node.js", "..."],
  "recentChanges": ["Added user profile editing", "..."],
  "activeWorkstreams": ["Building notification system", "..."],
  "fileSize": 1024,
  "versionsFound": ["1.2.3", "1.3.0"],
  "warnings": []
}
```

## Security

- **Read-only** — never writes, creates, or deletes files
- **No network access** — all operations are local filesystem reads
- **Path traversal protection** — validates all paths stay within project root
- **Symlink safety** — resolves symlinks with depth limits, rejects external targets
- **No credentials** — no authentication, no tokens, no secrets
- **No telemetry** — no data leaves your machine

## Requirements

- Node.js >= 18
- MCP SDK >= 1.0

## License

MIT
