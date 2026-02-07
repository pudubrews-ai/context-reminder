#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { detectProjectName, extractNameFromContextFile } from './detect-project.js';
import { findContextFile } from './find-context-file.js';
import { parseContextFile } from './parse-context.js';
import type { Config, ProjectContextResponse } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * Parse an integer from env var with NaN protection and bounds clamping.
 * Addresses CISO finding: parseInt() can return NaN, disabling safety limits.
 */
function parseIntSafe(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/**
 * Validate and resolve the PROJECT_ROOT path.
 * Addresses CISO finding: PROJECT_ROOT not validated as absolute path or existing directory.
 */
async function resolveProjectRoot(envRoot: string | undefined): Promise<string> {
  const raw = envRoot || process.cwd();
  const resolved = path.resolve(raw);

  try {
    const stats = await stat(resolved);
    if (!stats.isDirectory()) {
      console.error(`[project-context-mcp] Warning: PROJECT_ROOT is not a directory: ${resolved}, using cwd`);
      return path.resolve(process.cwd());
    }
  } catch {
    console.error(`[project-context-mcp] Warning: PROJECT_ROOT does not exist: ${resolved}, using cwd`);
    return path.resolve(process.cwd());
  }

  return resolved;
}

async function buildConfig(): Promise<Config> {
  const projectRoot = await resolveProjectRoot(process.env['PROJECT_ROOT']);

  return {
    ...DEFAULT_CONFIG,
    projectRoot,
    maxFileSizeBytes: parseIntSafe(process.env['MAX_FILE_SIZE'], DEFAULT_CONFIG.maxFileSizeBytes, 1024, 10_485_760),
    maxKeyFacts: parseIntSafe(process.env['MAX_KEY_FACTS'], DEFAULT_CONFIG.maxKeyFacts, 1, 50),
    maxRecentChanges: parseIntSafe(process.env['MAX_RECENT_CHANGES'], DEFAULT_CONFIG.maxRecentChanges, 1, 50),
    maxActiveWorkstreams: parseIntSafe(process.env['MAX_ACTIVE_WORKSTREAMS'], DEFAULT_CONFIG.maxActiveWorkstreams, 1, 50),
    maxSymlinkDepth: parseIntSafe(process.env['MAX_SYMLINK_DEPTH'], DEFAULT_CONFIG.maxSymlinkDepth, 1, 10),
  };
}

async function checkProjectContext(config: Config): Promise<ProjectContextResponse> {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const warnings: string[] = [];

  // Step 1: Detect project name (returns name + source for priority logic)
  let projectName: string;
  let detectionSource: string;
  try {
    const detection = await detectProjectName(config);
    projectName = detection.name;
    detectionSource = detection.source;
  } catch (err) {
    console.error('[project-context-mcp] Error detecting project name:', (err as Error).message);
    projectName = 'unknown';
    detectionSource = 'unknown';
  }

  // Step 2: Find and read context file
  let contextResult;
  try {
    contextResult = await findContextFile(config);
  } catch (err) {
    console.error('[project-context-mcp] Error finding context file:', (err as Error).message);
    return {
      projectName,
      contextFileFound: false,
      contextFilePath: null,
      timestamp,
      currentVersion: null,
      lastUpdated: null,
      dateInFile: null,
      status: null,
      nextVersion: null,
      keyFacts: [],
      recentChanges: [],
      activeWorkstreams: [],
      fileSize: 0,
      versionsFound: [],
      warnings: ['Error searching for context file'],
    };
  }

  warnings.push(...contextResult.warnings);

  // Priority 5: Context filename overrides directory name (priority 6) and unknown
  // But does NOT override higher-priority sources (package.json, Cargo.toml, etc.)
  if (contextResult.found && contextResult.relativePath) {
    const basename = path.basename(contextResult.relativePath);
    const filenameExtracted = extractNameFromContextFile(basename);
    if (filenameExtracted && (detectionSource === 'directory' || detectionSource === 'unknown')) {
      projectName = filenameExtracted;
    }
  }

  // Fix for DA I10: Empty file should return contextFileFound: true with empty extraction.
  // Check for null explicitly, not falsy (empty string '' is valid content for an empty file).
  if (!contextResult.found || contextResult.content === null) {
    return {
      projectName,
      contextFileFound: contextResult.found,
      contextFilePath: contextResult.relativePath,
      timestamp,
      currentVersion: null,
      lastUpdated: null,
      dateInFile: null,
      status: null,
      nextVersion: null,
      keyFacts: [],
      recentChanges: [],
      activeWorkstreams: [],
      fileSize: contextResult.fileSize,
      versionsFound: [],
      warnings,
    };
  }

  // Step 3: Parse the context file
  let parsed;
  try {
    parsed = parseContextFile(contextResult.content, contextResult.mtime, config);
  } catch (err) {
    console.error('[project-context-mcp] Error parsing context file:', (err as Error).message);
    return {
      projectName,
      contextFileFound: true,
      contextFilePath: contextResult.relativePath,
      timestamp,
      currentVersion: null,
      lastUpdated: null,
      dateInFile: null,
      status: null,
      nextVersion: null,
      keyFacts: [],
      recentChanges: [],
      activeWorkstreams: [],
      fileSize: contextResult.fileSize,
      versionsFound: [],
      warnings: [...warnings, 'Error parsing context file'],
    };
  }

  warnings.push(...parsed.warnings);

  return {
    projectName,
    contextFileFound: true,
    contextFilePath: contextResult.relativePath,
    timestamp,
    currentVersion: parsed.currentVersion,
    lastUpdated: parsed.lastUpdated,
    dateInFile: parsed.dateInFile,
    status: parsed.status,
    nextVersion: parsed.nextVersion,
    keyFacts: parsed.keyFacts,
    recentChanges: parsed.recentChanges,
    activeWorkstreams: parsed.activeWorkstreams,
    fileSize: contextResult.fileSize,
    versionsFound: parsed.versionsFound,
    warnings,
  };
}

async function main(): Promise<void> {
  const config = await buildConfig();

  const server = new Server(
    {
      name: 'project-context-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'check_project_context',
        description:
          'Reads the current project directory, locates a project context file, and returns a structured summary of the project\'s current state including version, status, and key metadata. Use this at the start of every project-related conversation to orient yourself.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
    ],
  }));

  // Register tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'check_project_context') {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'Unknown tool' }),
          },
        ],
      };
    }

    try {
      const result = await checkProjectContext(config);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      console.error('[project-context-mcp] Unexpected error:', (err as Error).message);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              projectName: 'unknown',
              contextFileFound: false,
              contextFilePath: null,
              timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
              currentVersion: null,
              lastUpdated: null,
              dateInFile: null,
              status: null,
              nextVersion: null,
              keyFacts: [],
              recentChanges: [],
              activeWorkstreams: [],
              fileSize: 0,
              versionsFound: [],
              warnings: ['Internal server error - check server logs'],
            }),
          },
        ],
      };
    }
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[project-context-mcp] Server started successfully');
  console.error(`[project-context-mcp] Project root: ${config.projectRoot}`);
}

main().catch((err) => {
  console.error('[project-context-mcp] Fatal error:', (err as Error).message);
  process.exit(1);
});
