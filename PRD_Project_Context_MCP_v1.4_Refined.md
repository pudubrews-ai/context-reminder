# PRD: Project Context Awareness MCP Tool

**Document Version:** 1.4
**Date:** February 7, 2026
**Status:** Draft
**Author:** Claude (AI-assisted PRD)

---

## 0. Terminology

This section defines key technical terms and acronyms used throughout this document.

| Term | Definition | Source/Reference |
|------|------------|------------------|
| **MCP (Model Context Protocol)** | An open protocol developed by Anthropic that enables AI assistants to connect to external data sources and tools through a standardized interface. MCP servers expose tools, resources, and prompts that AI models can invoke. | [Anthropic MCP Specification](https://modelcontextprotocol.io/introduction) |
| **MCP Server** | A program that implements the Model Context Protocol, running locally or remotely, and exposing one or more tools/resources to MCP clients (like Claude Desktop). | [MCP Architecture](https://modelcontextprotocol.io/docs/concepts/architecture) |
| **MCP Tool** | A discrete function exposed by an MCP server that an AI model can invoke. Tools have names, descriptions, input schemas, and return structured data. | [MCP Tools](https://modelcontextprotocol.io/docs/concepts/tools) |
| **SDK (Software Development Kit)** | A collection of software tools, libraries, documentation, and code samples that developers use to create applications for a specific platform or framework. | [Wikipedia: SDK](https://en.wikipedia.org/wiki/Software_development_kit) |
| **MCP SDK** | Anthropic's official TypeScript/JavaScript library for building MCP servers and clients. Provides transport abstractions, schema validation, and protocol handling. | [@modelcontextprotocol/sdk on npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) |
| **Claude Desktop** | Anthropic's native desktop application (macOS, Windows) that provides a Claude interface with MCP server integration capabilities. Supports connecting to local MCP servers via stdio transport. | [Claude Desktop Download](https://claude.ai/download) |
| **Claude Mobile/Web** | Claude interfaces accessed through mobile apps (iOS/Android) or web browsers. These environments do not currently support MCP server connections (as of Feb 2026). Users must rely on alternative methods (conversation_search, recent_chats, manual file reading) to establish project context. | [Claude Web App](https://claude.ai) |
| **stdio (Standard I/O)** | A communication transport method where processes communicate by writing to stdout and reading from stdin. The standard transport for local MCP servers. | [MCP Transports](https://modelcontextprotocol.io/docs/concepts/transports) |
| **ISO 8601** | International standard for date and time representation (e.g., `2026-02-07T14:30:00Z`). Ensures unambiguous, machine-parsable timestamps. | [ISO 8601 Standard](https://www.iso.org/iso-8601-date-and-time-format.html) |
| **Project Context File** | A markdown file (following naming conventions defined in §7) that contains metadata about a project's current state: version, status, recent changes, and active work. Maintained by users as a living document. | Defined by this PRD |
| **Context Awareness** | In this PRD, refers to the AI model's access to a project's current version, architecture, status, and recent changes through structured metadata retrieval. Distinguished from general conversation context (chat history). | Defined by this PRD |
| **JSON Schema** | A vocabulary that allows you to annotate and validate JSON documents. While this PRD defines a custom response schema for the MCP tool, it does not strictly follow JSON Schema Draft specifications but uses standard JSON typing conventions. | [JSON Schema Specification](https://json-schema.org/) |
| **Built-in Claude Tools** | Functions available to Claude through its native capabilities, not provided via MCP. These include `view` (file reading), `conversation_search` (searching chat history), and `recent_chats` (accessing recent conversations). These are not MCP Tools but rather platform-level capabilities built into Claude's interface. | [Claude documentation](https://support.anthropic.com) |
| **Bun** | A fast JavaScript runtime, package manager, and bundler built from scratch for the JavaScript ecosystem. An alternative to Node.js or Deno. | [Bun Official Site](https://bun.sh/) |
| **TOML (Tom's Obvious Minimal Language)** | A configuration file format designed to be easy to read and write due to obvious semantics. Commonly used in Rust projects (Cargo.toml) and Python projects (pyproject.toml). | [TOML Specification](https://toml.io/en/) |
| **WSL (Windows Subsystem for Linux)** | A compatibility layer for running Linux binary executables natively on Windows. Allows developers to run a Linux environment directly on Windows without the overhead of a virtual machine. | [Microsoft WSL Documentation](https://learn.microsoft.com/en-us/windows/wsl/about) |

---

## 1. Problem Statement

Claude suffers from a persistent project state amnesia problem across conversations. When a user returns to a project after hours, days, or weeks, the AI model starts each conversation with zero awareness of the project's current state. This leads to concrete failures:

- **Version drift:** The model references v0.83.5 when the project is actually at v0.84.5, causing confusion and incorrect guidance.
- **Stale mental models:** The model gives advice based on architecture or features that have since been refactored or removed.
- **Redundant discovery:** Users repeatedly re-explain project state, wasting the first 2–5 messages of every conversation on orientation.
- **Silent confidence:** The model doesn't know what it doesn't know – it proceeds with outdated assumptions rather than checking.

The root cause isn't a lack of tools. The model already has access to `/mnt/project/` files and built-in Claude tools (see Terminology) including `view` (file reading), `conversation_search` (searching chat history), and `recent_chats` (accessing recent conversations). The problem is **behavioral** – there is no trigger or forcing function that prompts the model to proactively check project state at conversation start. These existing tools are reactive (the model must think to use them) rather than proactive (appearing in the tool list as a visible reminder).

---

## 2. Proposed Solution

Build a lightweight, local MCP server that exposes a single tool: `check_project_context`. This tool reads the user's project directory, locates a project context file (see Terminology), and returns a structured JSON summary of the project's current state.

The tool serves two purposes:

1. **Functional:** When available (Claude Desktop), it gives the AI model instant access to current project metadata – version, status, recent changes, and next milestones.
2. **Behavioral:** Its presence in the tool list acts as a visible reminder. Even on devices where the tool isn't installed (Claude Mobile, Claude Web), the user's habit of expecting the model to check project state creates a conversational norm where the model is prompted to use alternative methods (conversation_search, recent_chats, explicit file reading via `view` tool) to orient itself.

### Design Philosophy

- **Read-only.** The tool never modifies project files. It is a pure observer.
- **Universal.** It works for any project that follows a simple naming convention for project context files. No project-specific logic.
- **Graceful.** If no project context file is found, it returns a structured "no project detected" response rather than failing.
- **Simple.** A single tool, a single purpose, buildable in 1–2 hours.

### Cross-Platform Behavior

**Claude Desktop (macOS/Windows/Linux):**
- Tool is available and functional
- AI model has direct access to `check_project_context` tool
- Single invocation returns complete project state

**Claude Mobile/Web:**
- Tool is NOT available (MCP servers not supported)
- Users should explicitly prompt: "Check the project context file" or "What's the current project version?"
- AI model falls back to: reading PROJECT_CONTEXT.md via `view` tool, searching recent conversations, or asking user for current state
- The behavioral habit established on Desktop carries over as a user expectation

---

## 3. User Personas

### Primary: Solo Developer / Power User
Uses Claude as a daily development partner across one or more projects. Maintains a project context file as a living document. Switches between Claude Desktop (laptop) and Claude Mobile/Web (on the go). Frustrated by having to re-establish project state every conversation. **Expectation:** On Desktop, the model automatically checks project state. On Mobile/Web, they've learned to prompt for it explicitly.

### Secondary: Team Lead / Technical PM
Uses Claude to review project status, draft updates, or plan sprints. Relies on a shared project context file maintained by the team. Needs the model to quickly orient to the current state without reading the entire codebase. **Expectation:** Fast, structured access to "what changed since last week."

### Tertiary: Claude Itself (The AI Model)
The AI model is both the consumer of this tool's output and the entity whose behavior it is designed to change. The tool's structured output is optimized for the model's parsing, and its presence is designed to trigger context-checking behavior.

---

## 4. Functional Requirements

### 4.1 Tool Definition

**Tool Name:** `check_project_context`
**Description:** Reads the current project directory, locates a project context file, and returns a structured summary of the project's current state including version, status, and key metadata.
**Parameters:** None (auto-detects everything from the filesystem).
**Returns:** JSON object (schema defined in §4.4).

### 4.2 Project Auto-Detection

The tool must determine the project name and root without any user input.

**Detection Strategy (ordered by priority):**

1. **package.json** – Read the `name` field.
2. **Cargo.toml** – Parse `[package] name`.
3. **pyproject.toml** – Parse `[project] name` or `[tool.poetry] name`.
4. **go.mod** – Extract module name from `module` directive.
5. **Project context file name** – If the file matches `{ProjectName}_Project_Context.md`, extract the project name from the filename.
6. **Directory name** – Fall back to the name of the `/mnt/project/` root directory (or configured project root).

The tool should attempt detection methods in order and use the first successful match.

**Fallback Behavior:**
If all detection methods fail (e.g., no recognizable project files, no context file, root directory is `/` or empty), the tool must return `projectName: "unknown"` and continue processing (searching for context files, etc.). This ensures the tool always returns a valid response.

**Cross-platform path handling:**
- All file path operations MUST use Node.js `path.join()`, `path.resolve()`, and `path.normalize()`.
- Never concatenate paths with string literals (e.g., `/dir/ + file` or `dir\\file`).
- Use `path.sep` for platform-specific separators when needed for display only.

### 4.3 Context File Discovery

The tool must locate a project context file using flexible pattern matching.

**Search patterns (ordered by priority):**

| Priority | Pattern | Example |
|----------|---------|---------|
| 1 | `*_Project_Context*.md` | `BeanAgent_Project_Context.md` |
| 2 | `PROJECT_CONTEXT.md` | `PROJECT_CONTEXT.md` |
| 3 | `*Context*.md` (case-insensitive) | `project-context.md`, `AppContext.md` |
| 4 | `CLAUDE_CONTEXT.md` | `CLAUDE_CONTEXT.md` |
| 5 | `STATUS.md` | `STATUS.md` |
| 6 | `CHANGELOG.md` (version extraction only) | `CHANGELOG.md` |

**Search locations (ordered):**

1. Project root (`/mnt/project/` or configured root)
2. `docs/` subdirectory
3. `.claude/` subdirectory

The tool stops at the first match found.

**Symlink Handling:**
- The tool MUST resolve symbolic links using Node.js `fs.realpath()` before reading any file.
- **Maximum symlink resolution depth: 5 levels.** If symlink resolution exceeds this depth, the tool MUST reject the file read and add a warning: "Symlink resolution exceeded maximum depth (5) - possible recursive symlink"
- After resolution, the real path MUST be validated against the project root boundary (see §5.2).
- If a symlink points outside the project root, the tool MUST reject the file read and add a warning: "Symlink points outside project root - access denied"

### 4.4 Data Extraction

The tool must extract the following fields from the project context file using regex patterns and heuristic parsing.

**Required fields (always present in response):**

| Field | Type | Source | Extraction Method |
|-------|------|--------|-------------------|
| `projectName` | string | Auto-detection (§4.2) | See detection strategy; defaults to "unknown" if all methods fail |
| `contextFileFound` | boolean | File discovery (§4.3) | true/false |
| `contextFilePath` | string \| null | File discovery | Relative path from project root |
| `timestamp` | ISO 8601 string (UTC) | System clock | When the tool was invoked, MUST include "Z" suffix (e.g., `2026-02-07T14:30:00Z`) |

**Extracted fields (present when project context file is found):**

| Field | Type | Extraction Method |
|-------|------|-------------------|
| `currentVersion` | string \| null | Regex: `/v?\d+\.\d+\.\d+(-[\w.]+)?/`, `/[Vv]ersion:\s*(.+)/`, heading patterns like `## Current Version: X.Y.Z` |
| `lastUpdated` | string \| null | **File modification date** (primary, authoritative): Use file system mtime, formatted as ISO 8601 date (YYYY-MM-DD). This is always used as the `lastUpdated` value. |
| `dateInFile` | string \| null | **Content parsing** (informational only): Regex patterns for `Last Updated: YYYY-MM-DD`, `Date: YYYY-MM-DD`, `Updated: YYYY-MM-DD` (case-insensitive). If found and differs from `lastUpdated` by more than 7 days, add warning: "Date in file (YYYY-MM-DD) differs significantly from file modification date" |
| `status` | string \| null | **Primary:** Regex pattern `/Status:\s*(.+)/i` (case-insensitive, captures entire line after "Status:"). **Fallback:** First sentence of file (up to first period or newline), trimmed to 200 characters max. |
| `nextVersion` | string \| null | Regex on "Next:", "Planned:", "Upcoming:" sections |
| `keyFacts` | string[] | First 5–10 bullet points or key-value pairs found in the file |
| `recentChanges` | string[] | Items under "Recent Changes", "Changelog", "What's New" headings (last 5) |
| `activeWorkstreams` | string[] | Items under "In Progress", "Active", "Current Work" headings |
| `fileSize` | number | File size in bytes (to gauge context richness) |

### 4.5 Version Extraction

Version detection must handle common patterns found in real project files:

```
v0.84.5                          → "0.84.5"
Version: 1.2.3                   → "1.2.3"
## Current Version: 0.84.5       → "0.84.5"
"version": "2.1.0"               → "2.1.0"  (from package.json)
version = "0.3.1"                → "0.3.1"  (from Cargo.toml)
v1.0.0-beta.3                    → "1.0.0-beta.3"
```

When multiple versions are found, the tool should return the **first version mentioned** in the project context file (assumed to be the current version). The `versionsFound` array contains all versions detected in the file for debugging and validation purposes only. The AI model should use the `currentVersion` field as the authoritative current version, not the `versionsFound` array.

### 4.6 Response Schema

```json
{
  "projectName": "BeanAgent",
  "contextFileFound": true,
  "contextFilePath": "BeanAgent_Project_Context.md",
  "timestamp": "2026-02-07T14:30:00Z",
  "currentVersion": "0.84.5",
  "lastUpdated": "2026-02-06",
  "dateInFile": "2026-02-01",
  "status": "Active development – post-launch iteration phase",
  "nextVersion": "0.85.0",
  "keyFacts": [
    "MCP server for coffee bean inventory management",
    "Built with TypeScript + Bun runtime",
    "Supabase backend with Row Level Security",
    "15 tools across beans, brews, equipment, and labels"
  ],
  "recentChanges": [
    "Added label generation with 6 visual styles",
    "Implemented pagination across all list endpoints",
    "Fixed brew logging timezone handling"
  ],
  "activeWorkstreams": [
    "Brew analytics and recommendation engine",
    "Export/import functionality"
  ],
  "fileSize": 12480,
  "versionsFound": ["0.84.5", "0.85.0"],
  "warnings": ["Date in file (2026-02-01) differs significantly from file modification date"]
}
```

**Error/empty response:**

```json
{
  "projectName": "unknown",
  "contextFileFound": false,
  "contextFilePath": null,
  "timestamp": "2026-02-07T14:30:00Z",
  "currentVersion": null,
  "lastUpdated": null,
  "dateInFile": null,
  "status": null,
  "nextVersion": null,
  "keyFacts": [],
  "recentChanges": [],
  "activeWorkstreams": [],
  "fileSize": 0,
  "versionsFound": [],
  "warnings": ["No project context file found in /mnt/project/. Consider creating a PROJECT_CONTEXT.md file."]
}
```

### 4.7 Error Handling

The tool must handle error scenarios gracefully without crashing the MCP server:

| Error Scenario | Tool Behavior | Response Format |
|----------------|---------------|-----------------|
| **File not found** | Return empty response with `contextFileFound: false` | Include warning in `warnings` array suggesting creation of a project context file |
| **File too large (>1MB)** | Read first 1MB only, set truncation warning | Include in `warnings`: "Context file exceeds 1MB, truncated to first 1MB" |
| **Binary/corrupt file** | Attempt UTF-8 decode, fallback to empty extraction | Include in `warnings`: "File could not be parsed as valid UTF-8 text" |
| **Mixed binary/markdown content** | Attempt to extract valid UTF-8 sequences, skip binary sections | Include in `warnings`: "File contains non-text content, partial extraction only" |
| **Malformed markdown** | Best-effort extraction, ignore parse errors | No warning unless zero fields extracted, then: "File format not recognized" |
| **Permission denied** | Return empty response | Include in `warnings`: "Permission denied reading [filepath]" |
| **Multiple context files found** | Use first match by priority order | Include in `warnings`: "Multiple context files found, using [filepath]" |
| **Invalid JSON in package.json** | Skip to next detection method | No warning (silent fallback) |
| **Empty file (0 bytes)** | Return empty extraction | Include in `warnings`: "Context file is empty" |
| **Path traversal attempt** | Reject file read, return error | Include in `warnings`: "Invalid file path - access denied" |
| **Symlink outside project root** | Reject file read after resolution | Include in `warnings`: "Symlink points outside project root - access denied" |
| **Symlink recursion depth exceeded** | Reject file read after 5 resolution attempts | Include in `warnings`: "Symlink resolution exceeded maximum depth (5) - possible recursive symlink" |
| **Date in file differs from mtime** | Include both dates, add warning if difference >7 days | Include in `warnings`: "Date in file ([date]) differs significantly from file modification date" |

All errors must be logged to the MCP server's stderr but never throw exceptions that would terminate the server process.

**Concurrent Access:**
- The tool performs synchronous file reads with no locking mechanism.
- If multiple MCP server instances are inadvertently running (e.g., user misconfiguration), each instance operates independently.
- No coordination between instances is required since the tool is strictly read-only.
- Warning: Users should not run multiple instances of this MCP server simultaneously with the same project root, as this provides no benefit and may confuse tool invocation logs.

---

## 5. Non-Functional Requirements

### 5.1 Performance

- Tool execution must complete in under **500ms** for typical project context files.
  - **Baseline definition:** A "typical project context file" is:
    - 10–50KB in size
    - 200–1000 lines of markdown
    - Located in the project root (no subdirectory search needed)
    - Contains 3–5 structured sections (version, status, changes, workstreams)
  - **Benchmark scenarios:**
    - Best case: 10KB file in root, simple structure → Target: <100ms
    - Typical case: 30KB file in root, moderate structure → Target: <300ms
    - Worst case: 50KB file in `docs/`, complex structure → Target: <500ms
    - Pathological case: 1MB file (truncated) → Target: <1000ms (acceptable since rare)

**Performance optimization strategies:**

1. **Sequential search with early termination:** Stop at first match, don't enumerate all files.
2. **Lazy file reading:** Only read file content after discovery, not during search.
3. **Regex compilation:** Compile frequently-used patterns once at server startup.
4. **Incremental parsing:** Extract from top of file first (most recent info), stop when limits reached.

**Lower-spec machine considerations:**

- Tool must function on machines with ≥4GB RAM and single-core performance equivalent to Intel Core i5 (2015 or later).
- If file I/O takes >500ms on such hardware, the tool should emit a performance warning but still return results.
- No background workers, caching, or persistent processes to minimize resource footprint.

**Performance validation:**
- Phase 3 of the implementation plan (§12) must include realistic performance testing on reference hardware (Intel i5 or equivalent, 8GB RAM, SSD storage).
- If the 500ms target cannot be met consistently, the tool should provide a configuration option to disable computationally expensive extractions (`keyFacts`, `recentChanges`, `activeWorkstreams`) in favor of returning only core metadata (`currentVersion`, `status`, `lastUpdated`).

### 5.2 Security
- **Read-only filesystem access.** The tool never writes, creates, or deletes files.
- **No network access.** All operations are local filesystem reads.
- **No credential handling.** The tool has no authentication layer.
- **Path traversal protection.** The tool must not read files outside the configured project root directory. All file paths must be:
  1. Resolved using `path.resolve()` to convert relative paths to absolute paths
  2. Normalized using `path.normalize()` to collapse `.` and `..` segments
  3. Validated to ensure the normalized path starts with the project root path
  4. **Rejected if the normalized path contains `..` anywhere in the path string** (defense-in-depth against traversal attempts)
  5. Before any read operation, the tool must perform all four checks above

**Privacy and Data Handling:**

- No telemetry, logging to external services, or data transmission beyond the MCP protocol response.
- All file content remains local. Only extracted metadata (version, status, key facts) is returned to the AI model.
- Users with sensitive project information should review the project context file to ensure it does not contain credentials, API keys, or confidential data. The tool does not filter or redact content.

### 5.3 Reliability
- The tool must never crash the MCP server. All file read and parse operations must be wrapped in try/catch with meaningful error messages (see §4.7).
- Malformed project context files (broken markdown, binary content, extremely large files) must be handled gracefully per the error handling table.
- Files larger than **1MB** should be truncated with a warning in the response.

### 5.4 Compatibility
- **Node.js >= 18** (LTS)
- **MCP SDK >= 1.0** (Anthropic's official MCP TypeScript SDK)
- Must work on macOS, Linux, and Windows (WSL and native).
- File path handling must be cross-platform (use `path.join()`, not manual string concatenation).

---

## 6. Technical Architecture

### 6.1 Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 18+ |
| Language | TypeScript |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Transport | stdio (standard for local MCP servers) |
| File I/O | Node.js `fs/promises` |

### 6.2 Module Structure

```
project-context-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── detect-project.ts     # Project name auto-detection
│   ├── find-context-file.ts  # Context file discovery
│   ├── parse-context.ts      # Markdown parsing + extraction
│   └── types.ts              # TypeScript interfaces
├── package.json
├── tsconfig.json
└── README.md
```

### 6.3 Flow Diagram

```
AI model invokes check_project_context
        │
        ▼
┌─────────────────────┐
│  Read project root   │  ← /mnt/project/ or configured path
│  directory listing   │
└──────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Auto-detect project │  ← package.json → Cargo.toml → etc.
│  name                │     Falls back to "unknown" if all fail
└──────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Search for context  │  ← Pattern matching across root, docs/, .claude/
│  file                │     Resolve symlinks (max depth 5), validate paths
└──────────┬───────────┘
          │
     Found?
    ┌───┴───┐
   Yes    No
    │      │
    ▼      ▼
┌─────────┐ ┌────────────────┐
│ Parse  │ │ Return empty   │
│ file   │ │ response with  │
│        │ │ warning        │
└────┬────┘ └────────────────┘
    │
    ▼
┌─────────────────────┐
│  Extract version,    │
│  status, key facts,  │
│  recent changes,     │
│  mtime (lastUpdated),│
│  dateInFile          │
└──────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Return structured   │
│  JSON response       │
│  (timestamp in UTC)  │
└─────────────────────┘
```

### 6.4 Configuration

The MCP server accepts an optional configuration via environment variable or config file:

```json
{
  "projectRoot": "/mnt/project",
  "maxFileSizeBytes": 1048576,
  "maxKeyFacts": 10,
  "maxRecentChanges": 5,
  "maxSymlinkDepth": 5
}
```

Defaults are used when no configuration is provided. The `projectRoot` defaults to `/mnt/project/` for Claude Desktop but can be overridden for other environments.

### 6.5 Claude Desktop Integration

Users add the server to their Claude Desktop configuration file (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "project-context": {
      "command": "node",
      "args": ["/path/to/project-context-mcp/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/mnt/project"
      }
    }
  }
}
```

---

## 7. Context File Convention (Recommended)

For maximum effectiveness, users should maintain a project context file in their project root. The tool works best with the following conventions, but is designed to extract value from any reasonable markdown file.

### 7.1 Recommended Template

```markdown
# {Project Name} – Project Context

## Current Version: {X.Y.Z}
**Status:** {Active development | Maintenance | Pre-release | etc.}
**Last Updated:** {YYYY-MM-DD}

## Overview
{1–3 sentence project description}

## Key Facts
- {Fact 1: tech stack, architecture, etc.}
- {Fact 2}
- {Fact 3}

## Recent Changes
- [{version}] {Change description}
- [{version}] {Change description}

## Active Workstreams
- {What's currently being built}

## Next Planned Version: {X.Y.Z}
- {Planned feature or milestone}

## Important Conventions
- {Coding conventions, naming patterns, etc.}
```

### 7.2 Naming Convention

The recommended filename pattern is: `{ProjectName}_Project_Context.md`

Examples: `BeanAgent_Project_Context.md`, `MyApp_Project_Context.md`

This embeds the project name in the filename, providing a secondary detection mechanism.

---

## 8. Success Criteria

### 8.1 Functional Success

| Criterion | Measurement |
|-----------|-------------|
| Tool appears in Claude's available tools | Visible in Claude Desktop tool list after configuration |
| Returns correct version for any project | Matches version in project context file for 3+ different test projects |
| Handles missing project context file gracefully | Returns structured "not found" response, no crashes |
| Parses varied markdown formats | Successfully extracts data from at least 5 different project context file styles (defined below) |
| Executes in under 500ms | Benchmarked on typical project directories (see §5.1) on mid-spec hardware (Intel i5 or equivalent, 8GB RAM, SSD storage) |

**Definition of "5 different context file styles":**

The tool must successfully extract key fields from project context files exhibiting these variations:

1. **Minimal structure:** Single-paragraph file with inline version number and no headings
2. **Heading-based:** Uses `##` markdown headings for sections (Version, Status, Changes, etc.)
3. **List-heavy:** Majority of content is bulleted/numbered lists with minimal prose
4. **Key-value format:** Uses `**Label:** value` patterns for metadata
5. **CHANGELOG.md format:** Dated version entries with change lists under each version heading

Success = extracting `currentVersion`, `status`, and at least 3 `keyFacts` from each style.

### 8.2 Behavioral Success

| Criterion | Measurement | Data Collection Method |
|-----------|-------------|------------------------|
| AI model checks project state at conversation start | In 80%+ of project-related conversations when tool is available | User self-report via survey after 2-week trial period |
| Reduced version drift incidents | User reports fewer instances of model citing wrong version | Comparative user feedback: "How often did version errors occur before/after tool adoption?" (Likert scale: Daily/Weekly/Monthly/Rarely/Never) |
| Faster time-to-productive-conversation | First substantive exchange happens within 1–2 messages instead of 3–5 | User self-report: "How many messages before productive work begins?" |
| Cross-device awareness habit | User develops habit of prompting context check even on Claude Mobile/Web | User survey: "Do you now prompt for project state on devices without MCP?" (Yes/No) |

**Quantification approach:**

- Baseline metrics: Survey users before deployment about current experience.
- Post-deployment: Re-survey after 2 weeks of usage.
- Success threshold: ≥70% of users report improvement on at least 3 of 4 behavioral criteria.

### 8.3 Adoption Metrics (Qualitative)

- User reports the tool "just works" without fiddling.
- Project context file convention feels natural, not burdensome to maintain.
- Tool output is immediately useful to the AI model without post-processing.

---

## 9. Scope Boundaries

### In Scope

- Reading project files and project context documents
- Parsing markdown for structured metadata
- Returning JSON summaries via MCP tool interface
- Supporting multiple project types (Node, Rust, Python, Go, etc.)
- Graceful handling of missing or malformed files
- Single-tool MCP server with stdio transport

### Out of Scope

- **Writing or updating project context files.** The tool is strictly read-only. Users maintain their own project context files.
- **Multi-device sync.** The MCP server runs locally. There is no cloud component. Users on Claude Mobile/Web must manually prompt the AI model to read project context files via the `view` tool or other available methods.
- **Project-specific logic.** No special handling for specific frameworks, languages, or tools beyond basic project detection.
- **Authentication or permissions.** The tool reads files the user already has access to.
- **Git integration.** No reading of git log, branches, or commit history (potential future enhancement).
- **Conversation search integration.** The tool does not call the AI model's `conversation_search` or `recent_chats` tools. Those remain available to the model separately.
- **Real-time file watching.** The tool reads on demand when invoked, not continuously.
- **Multi-project support.** The tool reads one project root per invocation. Users with multiple projects would configure multiple server instances or change the root.

---

## 10. Future Enhancements (Post-V1)

These are explicitly out of scope for V1 but represent natural evolution paths:

1. **Git-aware context:** Read recent commits, current branch, and uncommitted changes to augment the project context file data.
2. **Conversation history correlation:** Cross-reference extracted version with versions mentioned in recent Claude conversations to detect drift.
3. **Context file generation:** A second tool (`init_project_context`) that scaffolds a project context file from existing project files.
4. **Multi-project routing:** Auto-detect which of several configured projects the user is discussing.
5. **Context freshness warnings:** Alert when the project context file hasn't been updated in > N days.
6. **Structured context format:** Support YAML/TOML frontmatter in project context files for more reliable parsing.

---

## 11. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Project context file doesn't exist for most users | Tool returns empty results, low adoption | High | Provide clear template and documentation. Return helpful "create a project context file" suggestion in empty response. |
| Project context file is stale/outdated | AI model gets confident but wrong information | Medium | Include `lastUpdated` and file modification date. Model should note staleness. Document in README that users must maintain file freshness. |
| Version regex matches wrong string | Incorrect version reported | Medium | Use ordered heuristics. Prioritize explicit "Version:" labels over bare version strings. Report all versions found. |
| Large project context files cause slow response | Poor UX | Low | Enforce 1MB cap with truncation. Extract from top of file first (most likely to have current info). |
| User expects tool on all devices | Frustration when tool unavailable on Claude Mobile/Web | High | Frame as desktop-first. Document clearly in README and Terminology section that the tool creates a behavioral habit that persists across devices through user prompting. Add explicit guidance: "On mobile/web, manually read PROJECT_CONTEXT.md using the view tool or prompt Claude to check recent conversations." |
| MCP SDK breaking changes | Server stops working after update | Low | Pin SDK version. Use minimal API surface. |
| Path traversal vulnerabilities | Unauthorized file access | Low | Validate all resolved paths start with project root before reading. Reject paths containing `..` after normalization. |

---

## 12. Implementation Plan

### Phase 1: Core Tool (Target: 1–2 hours)

1. Initialize Node.js/TypeScript project with MCP SDK.
2. Implement project auto-detection (`detect-project.ts`).
3. Implement project context file discovery (`find-context-file.ts`).
4. Implement markdown parsing and extraction (`parse-context.ts`).
5. Wire up MCP server with `check_project_context` tool.
6. Test against 2–3 real project directories.

### Phase 2: Polish (Target: 1 hour)

1. Add configuration support (project root override, limits).
2. Add meaningful warnings (stale file, multiple versions found, large file truncated).
3. Write README with installation and usage instructions.
4. Add Claude Desktop config example.
5. Add performance benchmarks on reference hardware.

### Phase 3: Validate (Ongoing)

1. Use the tool in real conversations for 1–2 weeks.
2. Track version drift incidents (before vs. after).
3. Refine regex patterns based on real project context file formats encountered.
4. Gather feedback on whether the behavioral forcing function works.
5. Conduct user survey for behavioral success criteria (§8.2).

---

## 13. Open Questions

1. **Should the tool support YAML/TOML frontmatter in V1?** This would make parsing more reliable but adds complexity. Current recommendation: No for V1, extract structured data from markdown patterns. Revisit in Phase 3 if users report frequent parse failures.

2. **Should the tool read `CHANGELOG.md` as a fallback?** Changelogs contain version history but are often very large. Current recommendation: Yes, but only for version extraction (not key facts), with size limits. Priority 6 in search patterns.

3. **What's the right default project root?** `/mnt/project/` works for Claude Desktop but not for all environments. Should the tool auto-detect based on current working directory? Current recommendation: Use `/mnt/project/` as default but allow override via environment variable. Document this clearly.

4. **Should the tool expose additional tools in V1?** For example, `list_project_files` for a directory overview. Current recommendation: No. One tool, one purpose. Keep it minimal.

---

*This PRD describes a tool designed to solve a behavioral problem with a technical nudge. The measure of success is not just whether the tool returns correct data, but whether its existence changes how Claude approaches the start of every project conversation.*
