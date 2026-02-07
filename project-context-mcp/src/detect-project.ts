import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from './types.js';
import { validatePath } from './find-context-file.js';

/** Max size for project config files (package.json, Cargo.toml, etc.) — CISO finding */
const MAX_CONFIG_FILE_SIZE = 65_536; // 64KB

export interface DetectionResult {
  name: string;
  source: 'package.json' | 'Cargo.toml' | 'pyproject.toml' | 'go.mod' | 'directory' | 'unknown';
}

/**
 * Read a config file with path validation and size limits.
 * Addresses CISO finding: detect-project.ts reads without validatePath() or size limits.
 */
async function safeReadConfigFile(filePath: string, projectRoot: string): Promise<string | null> {
  const validation = validatePath(filePath, projectRoot);
  if (!validation.valid) return null;

  try {
    const fileStat = await stat(filePath);
    if (fileStat.size > MAX_CONFIG_FILE_SIZE) return null;
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Auto-detect the project name using cascading strategies per PRD §4.2.
 * Priority: package.json → Cargo.toml → pyproject.toml → go.mod → context filename → directory name
 * Returns both the name and the detection source so callers can apply priority logic.
 */
export async function detectProjectName(config: Config): Promise<DetectionResult> {
  const root = config.projectRoot;

  // 1. package.json
  try {
    const pkgPath = path.join(root, 'package.json');
    const raw = await safeReadConfigFile(pkgPath, root);
    if (raw) {
      const pkg = JSON.parse(raw) as { name?: string };
      if (pkg.name && typeof pkg.name === 'string' && pkg.name.trim().length > 0) {
        return { name: pkg.name.trim(), source: 'package.json' };
      }
    }
  } catch {
    // Silent fallback per §4.7 (invalid JSON)
  }

  // 2. Cargo.toml
  {
    const cargoPath = path.join(root, 'Cargo.toml');
    const raw = await safeReadConfigFile(cargoPath, root);
    if (raw) {
      const match = raw.match(/^\[package\]\s*\n(?:.*\n)*?name\s*=\s*"([^"]+)"/m);
      if (match?.[1]) {
        return { name: match[1].trim(), source: 'Cargo.toml' };
      }
    }
  }

  // 3. pyproject.toml
  {
    const pyPath = path.join(root, 'pyproject.toml');
    const raw = await safeReadConfigFile(pyPath, root);
    if (raw) {
      const projectMatch = raw.match(/\[project\]\s*\n(?:.*\n)*?name\s*=\s*"([^"]+)"/m);
      if (projectMatch?.[1]) {
        return { name: projectMatch[1].trim(), source: 'pyproject.toml' };
      }
      const poetryMatch = raw.match(/\[tool\.poetry\]\s*\n(?:.*\n)*?name\s*=\s*"([^"]+)"/m);
      if (poetryMatch?.[1]) {
        return { name: poetryMatch[1].trim(), source: 'pyproject.toml' };
      }
    }
  }

  // 4. go.mod
  {
    const goPath = path.join(root, 'go.mod');
    const raw = await safeReadConfigFile(goPath, root);
    if (raw) {
      const match = raw.match(/^module\s+(\S+)/m);
      if (match?.[1]) {
        const parts = match[1].split('/');
        const name = parts[parts.length - 1]!.trim();
        if (name) {
          return { name, source: 'go.mod' };
        }
      }
    }
  }

  // 5. Context file name extraction is handled after file discovery (caller responsibility)

  // 6. Directory name fallback
  const dirName = path.basename(path.resolve(root));
  if (dirName && dirName !== '/' && dirName !== '.') {
    return { name: dirName, source: 'directory' };
  }

  return { name: 'unknown', source: 'unknown' };
}

/**
 * Extract project name from a context filename like "BeanAgent_Project_Context.md"
 */
export function extractNameFromContextFile(filename: string): string | null {
  const match = filename.match(/^(.+?)_Project_Context/i);
  if (match?.[1]) {
    return match[1].trim();
  }
  return null;
}
