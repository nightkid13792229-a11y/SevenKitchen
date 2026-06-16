const { readFile } = require('node:fs/promises');
const { dirname, join } = require('node:path');

const shared: typeof import('./_shared') = require('./_shared');
const {
  parseArgs,
  printHelpIfRequested,
  requireStringArg,
  writeJsonFile,
} = shared;

const usage = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/prepare-ingredient-import.ts --type FOOD --name "duck egg" --state raw --out ../.standard-ingredient-import/duck-egg.manifest.json
  node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/prepare-ingredient-import.ts --type SUPPLEMENT --name "fish oil" --out ../.standard-ingredient-import/fish-oil.manifest.json
`;

async function main(): Promise<void> {
  const args = parseArgs();
  printHelpIfRequested(args, usage);

  const type = requireStringArg(args, 'type').toUpperCase();
  const name = requireStringArg(args, 'name');
  const out = requireStringArg(args, 'out');
  const state = typeof args.state === 'string' ? args.state : 'raw';

  if (type !== 'FOOD' && type !== 'SUPPLEMENT') {
    throw new Error('--type must be FOOD or SUPPLEMENT');
  }

  const templateName =
    type === 'FOOD'
      ? 'ingredient-import-template.food.json'
      : 'ingredient-import-template.supplement.json';
  const template = JSON.parse(
    await readFile(join(skillDir(), 'assets', templateName), 'utf8'),
  );
  template.ingredient.name = name;
  if (type === 'FOOD') {
    template.nutritionProfiles[0].preparationState = state;
  } else if (
    template.packageEvidence.packageImages.length === 0 &&
    template.packageEvidence.labelSources.length === 0
  ) {
    console.log(
      'SUPPLEMENT requires package photos or equivalent label evidence before local apply.',
    );
  }

  await writeJsonFile(out, template);
  console.log(`Manifest draft written: ${out}`);
}

function skillDir(): string {
  return dirname(__dirname);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
