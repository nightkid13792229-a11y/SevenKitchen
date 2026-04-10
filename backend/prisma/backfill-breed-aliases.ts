import { PrismaClient } from '@prisma/client';
import { BREED_ALIAS_CATALOG, mergeBreedAliases } from './breed-alias-catalog';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

async function main() {
  const breedNames = Object.keys(BREED_ALIAS_CATALOG);
  console.log(
    shouldApply
      ? 'Applying dog breed alias backfill...'
      : 'Dry run: dog breed alias backfill...',
  );

  let updatedCount = 0;

  for (const breedName of breedNames) {
    const breed = await prisma.dogBreed.findFirst({
      where: { name: breedName },
    });

    if (!breed) {
      console.log(`- Missing breed in database, skipped: ${breedName}`);
      continue;
    }

    const nextAliases = mergeBreedAliases(breed.name, breed.aliases || []);
    const currentAliases = breed.aliases || [];
    const hasChanged =
      nextAliases.length !== currentAliases.length ||
      nextAliases.some((alias, index) => alias !== currentAliases[index]);

    if (!hasChanged) {
      console.log(`- No changes: ${breed.name}`);
      continue;
    }

    console.log(`- ${breed.name}`);
    console.log(`  current: ${JSON.stringify(currentAliases)}`);
    console.log(`  next:    ${JSON.stringify(nextAliases)}`);

    if (shouldApply) {
      await prisma.dogBreed.update({
        where: { id: breed.id },
        data: { aliases: nextAliases },
      });
      updatedCount += 1;
    }
  }

  console.log(
    shouldApply
      ? `Alias backfill applied. Updated ${updatedCount} breed records.`
      : 'Dry run complete. Re-run with --apply to persist changes.',
  );
}

main()
  .catch((error) => {
    console.error('Failed to backfill dog breed aliases:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
