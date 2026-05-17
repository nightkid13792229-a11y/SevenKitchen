import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const publishedRisks = await prisma.breedHealthRisk.findMany({
    where: {
      isPublished: true,
    },
    select: {
      id: true,
      breedId: true,
      conditionId: true,
      sources: {
        select: {
          id: true,
          sourceName: true,
          title: true,
          url: true,
          accessedAt: true,
        },
      },
    },
  });

  const publishedWithoutUsableSources = publishedRisks.filter((risk) => {
    return !risk.sources.some((source) => {
      const sourceName = source.sourceName.trim();
      const title = source.title.trim();
      const url = source.url.trim();
      const accessedAt = source.accessedAt;

      if (!sourceName || !title || !url || Number.isNaN(accessedAt.getTime())) {
        return false;
      }

      try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
      } catch {
        return false;
      }
    });
  });

  if (publishedWithoutUsableSources.length > 0) {
    console.error('[breed-health-risk] Published risks without usable sources:', publishedWithoutUsableSources);
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
