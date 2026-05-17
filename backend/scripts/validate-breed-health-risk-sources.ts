import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const publishedWithoutSources = await prisma.breedHealthRisk.findMany({
    where: {
      isPublished: true,
      sources: { none: {} },
    },
    select: {
      id: true,
      breedId: true,
      conditionId: true,
    },
  });

  if (publishedWithoutSources.length > 0) {
    console.error('[breed-health-risk] Published risks without sources:', publishedWithoutSources);
    process.exitCode = 1;
    return;
  }

  console.log('[breed-health-risk] Published risk source validation passed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
