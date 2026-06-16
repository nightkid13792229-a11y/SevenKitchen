import type {
  IngredientImportManifest,
  LocalIngredientImportAudit,
} from '../../../backend/src/application/standard-ingredient-import/index';

const {
  buildProductionMigrationPackage,
} = require('../../../backend/src/application/standard-ingredient-import');
const shared: typeof import('./_shared') = require('./_shared');
const {
  createPrismaClient,
  disconnectPrisma,
  parseArgs,
  printHelpIfRequested,
  readJsonFile,
  requireStringArg,
} = shared;

const usage = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/build-production-migration-package.ts --manifest ../.standard-ingredient-import/ingredient.manifest.json --local-audit ../.standard-ingredient-import/ingredient.local-apply.json --out-dir ../.standard-ingredient-import/ingredient-production-package
`;

async function main(): Promise<void> {
  const args = parseArgs();
  printHelpIfRequested(args, usage);

  const manifest = await readJsonFile<IngredientImportManifest>(
    requireStringArg(args, 'manifest'),
  );
  const localAudit = await readJsonFile<LocalIngredientImportAudit>(
    requireStringArg(args, 'local-audit'),
  );
  const outputDir = requireStringArg(args, 'out-dir');
  const prisma = createPrismaClient();
  try {
    const result = await buildProductionMigrationPackage({
      prisma,
      manifest,
      localImportAudit: localAudit,
      outputDir,
    });
    console.log(`Production package written: ${result.outputDir}`);
    console.log(
      [
        'manifest.json',
        'review-summary.md',
        'up.sql',
        'down.sql',
        'source-audit.json',
        'unit-audit.json',
      ].join('\n'),
    );
  } finally {
    await disconnectPrisma(prisma);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
