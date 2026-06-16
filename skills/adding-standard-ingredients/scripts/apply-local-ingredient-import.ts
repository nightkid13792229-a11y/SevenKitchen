import type {
  DatabaseAlignmentResult,
  IngredientImportManifest,
} from '../../../backend/src/application/standard-ingredient-import/index';

const {
  applyLocalIngredientImport,
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
  node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/apply-local-ingredient-import.ts --manifest ../.standard-ingredient-import/ingredient.manifest.json --alignment ../.standard-ingredient-import/alignment.json --audit-out ../.standard-ingredient-import/ingredient.local-apply.json
`;

async function main(): Promise<void> {
  const args = parseArgs();
  printHelpIfRequested(args, usage);

  const manifest = await readJsonFile<IngredientImportManifest>(
    requireStringArg(args, 'manifest'),
  );
  const alignmentFile = await readJsonFile<{
    result?: DatabaseAlignmentResult;
  }>(requireStringArg(args, 'alignment'));
  const alignment = alignmentFile.result ?? (alignmentFile as DatabaseAlignmentResult);
  const auditOutputPath = requireStringArg(args, 'audit-out');
  const prisma = createPrismaClient();
  try {
    const result = await applyLocalIngredientImport({
      prisma,
      manifest,
      alignment,
      auditOutputPath,
    });
    console.log(`Local import applied. Audit: ${result.auditPath}`);
    console.log(`Ingredient ids: ${result.audit.ingredientIds.join(', ')}`);
  } finally {
    await disconnectPrisma(prisma);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
