export interface Config {
  projectRoot: string;
  maxFileSizeBytes: number;
  maxKeyFacts: number;
  maxRecentChanges: number;
  maxActiveWorkstreams: number;
  maxSymlinkDepth: number;
}

export interface ProjectContextResponse {
  projectName: string;
  contextFileFound: boolean;
  contextFilePath: string | null;
  timestamp: string;
  currentVersion: string | null;
  lastUpdated: string | null;
  dateInFile: string | null;
  status: string | null;
  nextVersion: string | null;
  keyFacts: string[];
  recentChanges: string[];
  activeWorkstreams: string[];
  fileSize: number;
  versionsFound: string[];
  warnings: string[];
}

export interface ContextFileResult {
  found: boolean;
  filePath: string | null;
  relativePath: string | null;
  content: string | null;
  fileSize: number;
  mtime: Date | null;
  warnings: string[];
}

export interface ParsedContext {
  currentVersion: string | null;
  lastUpdated: string | null;
  dateInFile: string | null;
  status: string | null;
  nextVersion: string | null;
  keyFacts: string[];
  recentChanges: string[];
  activeWorkstreams: string[];
  versionsFound: string[];
  warnings: string[];
}

export const DEFAULT_CONFIG: Config = {
  projectRoot: '',  // Resolved at startup in buildConfig()
  maxFileSizeBytes: 1_048_576, // 1MB
  maxKeyFacts: 10,
  maxRecentChanges: 5,
  maxActiveWorkstreams: 10,
  maxSymlinkDepth: 5,
};
