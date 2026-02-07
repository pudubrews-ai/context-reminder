import type { Config, ParsedContext } from './types.js';

// Pre-compiled regex patterns for performance (PRD §5.1)
const VERSION_PATTERNS = [
  /##\s*Current\s+Version:\s*v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/i,
  /[Vv]ersion:\s*v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/,
  /"version"\s*:\s*"(\d+\.\d+\.\d+(?:-[\w.]+)?)"/,
  /version\s*=\s*"(\d+\.\d+\.\d+(?:-[\w.]+)?)"/,
  /\bv?(\d+\.\d+\.\d+(?:-[\w.]+)?)\b/,
];

const NEXT_VERSION_PATTERNS = [
  /(?:Next|Planned|Upcoming)\s*(?:Version)?:\s*v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/i,
  /##\s*(?:Next|Planned|Upcoming)\s+.*?v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/i,
];

const STATUS_PATTERN = /Status:\s*(.+)/i;

const DATE_PATTERNS = [
  /Last\s*Updated:\s*(\d{4}-\d{2}-\d{2})/i,
  /Date:\s*(\d{4}-\d{2}-\d{2})/i,
  /Updated:\s*(\d{4}-\d{2}-\d{2})/i,
];

const SECTION_HEADING_PATTERNS = {
  keyFacts: /^##\s*(?:Key\s*Facts|Overview|Summary|About|Key\s*Info)/im,
  recentChanges: /^##\s*(?:Recent\s*Changes|Changelog|What'?s\s*New|Changes|History)/im,
  activeWorkstreams: /^##\s*(?:In\s*Progress|Active|Current\s*Work|Active\s*Workstreams|TODO|Doing)/im,
};

/**
 * Extract all semantic versions found in the content.
 */
function extractAllVersions(content: string): string[] {
  const versionSet = new Set<string>();
  const globalPattern = /v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/g;
  let match: RegExpExecArray | null;

  while ((match = globalPattern.exec(content)) !== null) {
    if (match[1]) {
      versionSet.add(match[1]);
    }
  }

  return Array.from(versionSet);
}

/**
 * Extract the current version from content using ordered patterns per PRD §4.5.
 */
function extractCurrentVersion(content: string): string | null {
  for (const pattern of VERSION_PATTERNS) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract the next planned version.
 */
function extractNextVersion(content: string): string | null {
  for (const pattern of NEXT_VERSION_PATTERNS) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract the status field per PRD §4.4.
 * Primary: "Status:" line. Fallback: first sentence of file.
 */
function extractStatus(content: string): string | null {
  const statusMatch = content.match(STATUS_PATTERN);
  if (statusMatch?.[1]) {
    return statusMatch[1].trim().slice(0, 200);
  }

  // Fallback: first non-heading, non-empty line (first sentence)
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      const firstSentence = trimmed.split(/[.\n]/)[0];
      if (firstSentence) {
        return firstSentence.trim().slice(0, 200);
      }
    }
  }

  return null;
}

/**
 * Extract a date from the file content.
 */
function extractDateInFile(content: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract bullet items from a section identified by a heading pattern.
 */
function extractSectionItems(content: string, headingPattern: RegExp, maxItems: number): string[] {
  const match = headingPattern.exec(content);
  if (!match) return [];

  const afterHeading = content.slice(match.index + match[0].length);
  const items: string[] = [];
  const lines = afterHeading.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Stop at next heading (any level: #, ##, ###, etc.)
    if (/^#{1,6}\s/.test(trimmed)) {
      break;
    }

    // Capture bullet points and numbered items
    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)/) || trimmed.match(/^\d+[.)]\s+(.+)/);
    if (bulletMatch?.[1]) {
      items.push(bulletMatch[1].trim());
      if (items.length >= maxItems) break;
    }

    // Also capture key-value pairs like **Label:** value
    const kvMatch = trimmed.match(/^\*\*([^*]+)\*\*:?\s+(.+)/);
    if (kvMatch?.[2] && !bulletMatch) {
      items.push(`${kvMatch[1]}: ${kvMatch[2]}`.trim());
      if (items.length >= maxItems) break;
    }
  }

  return items;
}

/**
 * Extract key facts - bullet points from the file, prioritizing "Key Facts" section.
 */
function extractKeyFacts(content: string, maxItems: number): string[] {
  // Try dedicated section first
  const sectionItems = extractSectionItems(content, SECTION_HEADING_PATTERNS.keyFacts, maxItems);
  if (sectionItems.length > 0) {
    return sectionItems;
  }

  // Fallback: collect first N bullet points from anywhere in the file
  const items: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (bulletMatch?.[1]) {
      items.push(bulletMatch[1].trim());
      if (items.length >= maxItems) break;
    }
  }

  return items;
}

/**
 * Parse the project context file and extract structured data per PRD §4.4.
 */
export function parseContextFile(
  content: string,
  mtime: Date | null,
  config: Config
): ParsedContext {
  const warnings: string[] = [];

  if (!content || content.trim().length === 0) {
    return {
      currentVersion: null,
      lastUpdated: mtime ? formatDate(mtime) : null,
      dateInFile: null,
      status: null,
      nextVersion: null,
      keyFacts: [],
      recentChanges: [],
      activeWorkstreams: [],
      versionsFound: [],
      warnings: ['File format not recognized'],
    };
  }

  const currentVersion = extractCurrentVersion(content);
  const nextVersion = extractNextVersion(content);
  const status = extractStatus(content);
  const dateInFile = extractDateInFile(content);
  const versionsFound = extractAllVersions(content);
  const keyFacts = extractKeyFacts(content, config.maxKeyFacts);
  const recentChanges = extractSectionItems(
    content,
    SECTION_HEADING_PATTERNS.recentChanges,
    config.maxRecentChanges
  );
  const activeWorkstreams = extractSectionItems(
    content,
    SECTION_HEADING_PATTERNS.activeWorkstreams,
    config.maxActiveWorkstreams
  );

  // lastUpdated is always from file mtime (PRD §4.4)
  const lastUpdated = mtime ? formatDate(mtime) : null;

  // Check date discrepancy (PRD §4.4)
  if (dateInFile && lastUpdated) {
    const fileDate = new Date(dateInFile);
    const mtimeDate = new Date(lastUpdated);
    const diffDays = Math.abs(fileDate.getTime() - mtimeDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      warnings.push(
        `Date in file (${dateInFile}) differs significantly from file modification date`
      );
    }
  }

  // If zero fields extracted, warn
  if (!currentVersion && !status && keyFacts.length === 0 && recentChanges.length === 0) {
    warnings.push('File format not recognized');
  }

  return {
    currentVersion,
    lastUpdated,
    dateInFile,
    status,
    nextVersion,
    keyFacts,
    recentChanges,
    activeWorkstreams,
    versionsFound,
    warnings,
  };
}

/**
 * Format a Date as ISO 8601 date string (YYYY-MM-DD).
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}
