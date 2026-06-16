const {
  collectDatabaseAlignmentSnapshot,
  compareDatabaseAlignmentSnapshots,
} = require('../../../backend/src/application/standard-ingredient-import');
const shared: typeof import('./_shared') = require('./_shared');
const {
  createPrismaClient,
  disconnectPrisma,
  loadDatabaseUrlFromEnvFile,
  parseArgs,
  printHelpIfRequested,
  requireStringArg,
  writeJsonFile,
} = shared;

const usage = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/check-db-alignment.ts --local-env .env --production-env .env.production.readonly --out ../.standard-ingredient-import/alignment.json
`;

async function main(): Promise<void> {
  const args = parseArgs();
  printHelpIfRequested(args, usage);

  const localEnv = requireStringArg(args, 'local-env');
  const productionEnv = requireStringArg(args, 'production-env');
  const out = requireStringArg(args, 'out');
  if (!productionEnv.toLowerCase().includes('readonly')) {
    throw new Error(
      'Refusing production alignment check unless --production-env path includes readonly.',
    );
  }

  const local = createPrismaClient(await loadDatabaseUrlFromEnvFile(localEnv));
  const production = createPrismaClient(
    await loadDatabaseUrlFromEnvFile(productionEnv),
  );
  try {
    const [localSnapshot, productionSnapshot] = await Promise.all([
      collectDatabaseAlignmentSnapshot(local, {
        databaseLabel: 'local',
      }),
      collectDatabaseAlignmentSnapshot(production, {
        databaseLabel: 'production',
      }),
    ]);
    const result = compareDatabaseAlignmentSnapshots({
      local: localSnapshot,
      production: productionSnapshot,
    });

    await writeJsonFile(out, {
      result,
      localSnapshot,
      productionSnapshot,
    });
    console.log(
      result.ok
        ? `DB alignment passed: ${result.id}`
        : `DB alignment failed: ${result.blockingIssues.length} blocking issue(s)`,
    );
    if (!result.ok) {
      process.exit(1);
    }
  } finally {
    await Promise.all([disconnectPrisma(local), disconnectPrisma(production)]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
