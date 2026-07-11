import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface ParsedArgs {
  [key: string]: string | boolean | undefined;
}

export function parseArgs(argv = process.argv.slice(2)): ParsedArgs {
  const args: ParsedArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

export function requireStringArg(args: ParsedArgs, key: string): string {
  const value = args[key];
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  throw new Error(`Missing required --${key}`);
}

export async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

export async function loadDatabaseUrlFromEnvFile(
  envFilePath: string,
): Promise<string> {
  const envText = await readTextFile(envFilePath);
  const env = parseEnv(envText);
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL was not found in ${envFilePath}`);
  }
  return databaseUrl;
}

export function createPrismaClient(databaseUrl?: string): any {
  const requireFromBackend = createRequire(join(process.cwd(), 'package.json'));
  const { PrismaClient } = requireFromBackend('@prisma/client');
  return new PrismaClient(
    databaseUrl
      ? {
          datasources: {
            db: {
              url: databaseUrl,
            },
          },
        }
      : undefined,
  );
}

export async function disconnectPrisma(prisma: any): Promise<void> {
  if (typeof prisma?.$disconnect === 'function') {
    await prisma.$disconnect();
  }
}

export function printHelpIfRequested(args: ParsedArgs, usage: string): void {
  if (args.help === true || args.h === true) {
    process.stdout.write(`${usage.trim()}\n`);
    process.exit(0);
  }
}

function parseEnv(envText: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    env[key] = unquote(value);
  }
  return env;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
