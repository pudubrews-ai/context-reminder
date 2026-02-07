import { readFile, readdir, stat, lstat, readlink } from 'node:fs/promises';
import path from 'node:path';
import type { Config, ContextFileResult } from './types.js';

/**
 * Search patterns ordered by priority per PRD §4.3.
 * Priority 3 excludes exact matches handled by Priority 1, 2, and 4.
 */
const SEARCH_PATTERNS: Array<{ priority: number; test: (name: string) => boolean; description: string }> = [
  {
    priority: 1,
    test: (name) => /^.+_Project_Context.*\.md$/i.test(name),
    description: '*_Project_Context*.md',
  },
  {
    priority: 2,
    test: (name) => name === 'PROJECT_CONTEXT.md',
    description: 'PROJECT_CONTEXT.md',
  },
  {
    priority: 3,
    test: (name) =>
      /context/i.test(name) &&
      name.endsWith('.md') &&
      name !== 'PROJECT_CONTEXT.md' &&
      name !== 'CLAUDE_CONTEXT.md' &&
      !/^.+_Project_Context/i.test(name),
    description: '*Context*.md (case-insensitive, excluding exact matches)',
  },
  {
    priority: 4,
    test: (name) => name === 'CLAUDE_CONTEXT.md',
    description: 'CLAUDE_CONTEXT.md',
  },
  {
    priority: 5,
    test: (name) => name === 'STATUS.md',
    description: 'STATUS.md',
  },
  {
    priority: 6,
    test: (name) => name === 'CHANGELOG.md',
    description: 'CHANGELOG.md',
  },
];

/**
 * Search subdirectories in order per PRD §4.3
 */
const SEARCH_SUBDIRS = ['', 'docs', '.claude'];

/**
 * Validate that a resolved path is within the project root boundary.
 * Implements all 4 checks from PRD §5.2.
 * Exported so detect-project.ts can also use it.
 */
export function validatePath(filePath: string, projectRoot: string): { valid: boolean; warning?: string } {
  // 1. Resolve to absolute path
  const resolved = path.resolve(filePath);

  // 2. Normalize to collapse . and .. segments
  const normalized = path.normalize(resolved);

  // 3. Check that normalized path starts with project root
  const normalizedRoot = path.normalize(path.resolve(projectRoot));
  if (!normalized.startsWith(normalizedRoot + path.sep) && normalized !== normalizedRoot) {
    return { valid: false, warning: 'Invalid file path - access denied' };
  }

  // 4. Defense-in-depth: reject if normalized relative path contains ..
  const relative = path.relative(normalizedRoot, normalized);
  if (relative.includes('..')) {
    return { valid: false, warning: 'Invalid file path - access denied' };
  }

  return { valid: true };
}

/**
 * Resolve symlinks with true per-level depth enforcement per PRD §4.3.
 * Uses lstat()+readlink() to manually resolve one level at a time,
 * counting each level against the max depth.
 */
async function resolveSymlink(
  filePath: string,
  projectRoot: string,
  maxDepth: number
): Promise<{ resolvedPath: string | null; warning?: string }> {
  let current = path.resolve(filePath);

  for (let depth = 0; depth < maxDepth; depth++) {
    try {
      const stats = await lstat(current);
      if (!stats.isSymbolicLink()) {
        // Not a symlink - validate final path against project root
        const validation = validatePath(current, projectRoot);
        if (!validation.valid) {
          return { resolvedPath: null, warning: 'Symlink points outside project root - access denied' };
        }
        return { resolvedPath: current };
      }

      // Resolve one level of symlink
      const target = await readlink(current);
      // Resolve relative symlink targets against the symlink's directory
      current = path.resolve(path.dirname(current), target);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ELOOP') {
        return {
          resolvedPath: null,
          warning: 'Symlink resolution exceeded maximum depth (5) - possible recursive symlink',
        };
      }
      // File doesn't exist or permission denied
      return { resolvedPath: null };
    }
  }

  // Exceeded max depth
  return {
    resolvedPath: null,
    warning: `Symlink resolution exceeded maximum depth (${maxDepth}) - possible recursive symlink`,
  };
}

/**
 * List files in a directory, returning empty array on error.
 */
async function safeReaddir(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

/**
 * Find and read the project context file per PRD §4.3.
 * Searches location-first (root → docs/ → .claude/), pattern-priority second.
 * Stops at the first match found per PRD: "The tool stops at the first match found."
 */
export async function findContextFile(config: Config): Promise<ContextFileResult> {
  const warnings: string[] = [];

  // Search each subdirectory in order (location-first with early termination)
  for (const subdir of SEARCH_SUBDIRS) {
    const searchDir = subdir
      ? path.join(config.projectRoot, subdir)
      : config.projectRoot;

    // Validate search directory is within project root
    const dirValidation = validatePath(searchDir, config.projectRoot);
    if (!dirValidation.valid) {
      continue;
    }

    const files = await safeReaddir(searchDir);

    // Check patterns in priority order — return first match (early termination)
    for (const pattern of SEARCH_PATTERNS) {
      for (const file of files) {
        if (pattern.test(file)) {
          const filePath = path.join(searchDir, file);
          // Found a match — attempt to read it
          const result = await readContextFile(filePath, config, warnings);
          if (result) {
            return result;
          }
          // If read failed (symlink escape, permission denied, etc.), continue searching
        }
      }
    }
  }

  return {
    found: false,
    filePath: null,
    relativePath: null,
    content: null,
    fileSize: 0,
    mtime: null,
    warnings: [
      ...warnings,
      `No project context file found in project root. Consider creating a PROJECT_CONTEXT.md file.`,
    ],
  };
}

/**
 * Attempt to read a context file with symlink resolution and validation.
 * Returns null if the file cannot be read (symlink escape, permission denied, etc.).
 */
async function readContextFile(
  filePath: string,
  config: Config,
  warnings: string[]
): Promise<ContextFileResult | null> {
  // Resolve symlinks with true depth enforcement
  const symResult = await resolveSymlink(filePath, config.projectRoot, config.maxSymlinkDepth);

  if (symResult.warning) {
    warnings.push(symResult.warning);
  }

  // CRITICAL FIX: If symlink resolution failed, do NOT fall back to original path.
  // The original path may be a symlink pointing outside the project root.
  if (!symResult.resolvedPath) {
    return null;
  }

  const targetPath = symResult.resolvedPath;

  // Final path validation
  const pathValidation = validatePath(targetPath, config.projectRoot);
  if (!pathValidation.valid) {
    if (pathValidation.warning) {
      warnings.push(pathValidation.warning);
    }
    return null;
  }

  // Read the file
  try {
    const fileStat = await stat(targetPath);
    const fileSize = fileStat.size;

    if (fileSize === 0) {
      warnings.push('Context file is empty');
      return {
        found: true,
        filePath: targetPath,
        relativePath: path.relative(config.projectRoot, targetPath),
        content: '',
        fileSize: 0,
        mtime: fileStat.mtime,
        warnings,
      };
    }

    let content: string;
    if (fileSize > config.maxFileSizeBytes) {
      warnings.push('Context file exceeds 1MB, truncated to first 1MB');
      const buffer = Buffer.alloc(config.maxFileSizeBytes);
      const { open } = await import('node:fs/promises');
      const handle = await open(targetPath, 'r');
      try {
        await handle.read(buffer, 0, config.maxFileSizeBytes, 0);
        content = buffer.toString('utf-8');
      } finally {
        await handle.close();
      }
    } else {
      content = await readFile(targetPath, 'utf-8');
    }

    // Validate UTF-8 content (check for replacement characters indicating binary)
    if (content.includes('\uFFFD') || /[\x00-\x08\x0E-\x1F]/.test(content)) {
      warnings.push('File contains non-text content, partial extraction only');
      // Strip non-text characters and replacement characters
      content = content.replace(/[\x00-\x08\x0E-\x1F\uFFFD]/g, '');
    }

    return {
      found: true,
      filePath: targetPath,
      relativePath: path.relative(config.projectRoot, targetPath),
      content,
      fileSize,
      mtime: fileStat.mtime,
      warnings,
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EACCES') {
      warnings.push(`Permission denied reading ${path.relative(config.projectRoot, targetPath)}`);
    } else if (error.code === 'ENOENT') {
      warnings.push(`File not found: ${path.relative(config.projectRoot, targetPath)}`);
    } else {
      warnings.push('File could not be parsed as valid UTF-8 text');
    }
    return null;
  }
}
