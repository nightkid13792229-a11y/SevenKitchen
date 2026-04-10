import * as dotenv from 'dotenv';
import * as path from 'path';
import { existsSync } from 'fs';

const ENV_FILENAMES = (env: string) => [
  `.env.${env}.local`,
  `.env.${env}`,
  '.env.local',
  '.env',
];

let envLoaded = false;

function resolveWorktreeMainBackendDir(cwd: string) {
  const normalizedCwd = path.resolve(cwd);
  const marker = `${path.sep}.worktrees${path.sep}`;
  const markerIndex = normalizedCwd.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const worktreeSuffix = normalizedCwd.slice(markerIndex + marker.length);
  const segments = worktreeSuffix.split(path.sep).filter(Boolean);
  const backendIndex = segments.indexOf('backend');

  if (backendIndex === -1) {
    return null;
  }

  return path.join(normalizedCwd.slice(0, markerIndex), 'backend');
}

export function resolveEnvSearchDirs(cwd: string) {
  const normalizedCwd = path.resolve(cwd);
  const dirs = [normalizedCwd];
  const fallbackDir = resolveWorktreeMainBackendDir(normalizedCwd);

  if (fallbackDir && fallbackDir !== normalizedCwd) {
    dirs.push(fallbackDir);
  }

  return dirs;
}

export function resolveEnvConfigPath(
  cwd: string,
  env: string = process.env.NODE_ENV || 'development',
  exists: (filePath: string) => boolean = existsSync,
) {
  for (const dir of resolveEnvSearchDirs(cwd)) {
    for (const filename of ENV_FILENAMES(env)) {
      const candidate = path.join(dir, filename);
      if (exists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export function loadEnvConfig(
  cwd: string = process.cwd(),
  env: string = process.env.NODE_ENV || 'development',
) {
  const resolvedPath = resolveEnvConfigPath(cwd, env);

  if (!resolvedPath) {
    console.log(`[ENV] No env file found for ${env} under ${cwd}`);
    console.log(`[ENV] Environment: ${env}`);
    envLoaded = true;
    return null;
  }

  if (!envLoaded) {
    const result = dotenv.config({ path: resolvedPath });
    if (result.error) {
      console.warn(`[ENV] Failed to load ${resolvedPath}: ${result.error.message}`);
    } else {
      console.log(`[ENV] Loaded environment from: ${resolvedPath}`);
    }
    console.log(`[ENV] Environment: ${env}`);
    envLoaded = true;
  }

  return resolvedPath;
}
