import type { IngredientImportManifest } from '../../../backend/src/application/standard-ingredient-import/index';

const {
  auditNutritionProfileForImport,
  rankNutritionSourceCandidates,
  validateIngredientImportManifest,
} = require('../../../backend/src/application/standard-ingredient-import');
const shared: typeof import('./_shared') = require('./_shared');
const {
  parseArgs,
  printHelpIfRequested,
  readJsonFile,
  requireStringArg,
  writeJsonFile,
} = shared;

const usage = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/audit-ingredient-import.ts --manifest ../.standard-ingredient-import/ingredient.manifest.json --out ../.standard-ingredient-import/ingredient.audit.json
`;

async function main(): Promise<void> {
  const args = parseArgs();
  printHelpIfRequested(args, usage);

  const manifestPath = requireStringArg(args, 'manifest');
  const out = requireStringArg(args, 'out');
  const manifest = await readJsonFile<IngredientImportManifest>(manifestPath);
  const validation = validateIngredientImportManifest(manifest);
  const nutritionAudits =
    manifest.ingredient.type === 'FOOD'
      ? (manifest.nutritionProfiles ?? []).map((profile: any) => ({
          profileId: profile.id,
          audit: auditNutritionProfileForImport({
            profileName: profile.name ?? profile.id,
            nutrients: profile.nutrients,
          }),
        }))
      : [];
  const rankedSources =
    manifest.ingredient.type === 'FOOD'
      ? rankSourcesFromManifest(manifest)
      : [];
  const blockingIssues = [
    ...validation.errors,
    ...nutritionAudits.flatMap((entry: any) => entry.audit.blockingIssues),
  ];
  const audit = {
    manifestPath,
    ok: blockingIssues.length === 0,
    validation,
    rankedSources,
    nutritionAudits,
  };

  await writeJsonFile(out, audit);
  if (!audit.ok) {
    console.error(`Audit failed with ${blockingIssues.length} blocking issue(s).`);
    process.exit(1);
  }
  console.log(`Audit passed: ${out}`);
}

function rankSourcesFromManifest(manifest: IngredientImportManifest) {
  const candidates = (manifest.sourceCandidates ?? [])
    .map((candidate: any) => ({
      source: candidate.source ?? candidate.sourceId?.split(':')[0],
      matchedName: candidate.matchedName,
      stateTags: candidate.stateTags,
      essentialCoveragePercent: candidate.essentialCoveragePercent ?? 0,
    }))
    .filter((candidate) => candidate.source);
  if (candidates.length === 0) {
    return [];
  }

  const requestedState =
    (manifest.nutritionProfiles?.[0] as any)?.preparationState ?? 'raw';
  return rankNutritionSourceCandidates({
    requestedState,
    candidates,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
