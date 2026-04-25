type PackagingUnitPhotoRecord = {
  id: string;
  photosRaw?: string[] | null;
  updatedAt?: Date | string | null;
};

type PackagingUnitPhotoReader = {
  packagingUnit?: {
    findMany?: (args: {
      where: {
        sourceOrderItemIds: {
          hasSome: string[];
        };
      };
      select: {
        id: true;
        photosRaw: true;
        updatedAt: true;
      };
      orderBy: {
        updatedAt: 'asc';
      };
    }) => Promise<PackagingUnitPhotoRecord[]>;
  };
};

type OrderWithItemIds = {
  items?: Array<{
    id?: string | null;
  }>;
};

export type OrderProductionPhotos = {
  unitId: string;
  photos: string[];
  uploadedAt: string | null;
} | null;

export async function resolveOrderProductionPhotos(
  prisma: PackagingUnitPhotoReader,
  order: OrderWithItemIds,
): Promise<OrderProductionPhotos> {
  const orderItemIds = (order.items ?? [])
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id));

  if (orderItemIds.length === 0 || !prisma.packagingUnit?.findMany) {
    return null;
  }

  const packagingUnits = await prisma.packagingUnit.findMany({
    where: {
      sourceOrderItemIds: {
        hasSome: orderItemIds,
      },
    },
    select: {
      id: true,
      photosRaw: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: 'asc',
    },
  });

  const photos: string[] = [];
  const seenPhotos = new Set<string>();
  let unitId = '';
  let latestUpdatedAt: Date | null = null;

  for (const unit of packagingUnits) {
    const unitPhotos = Array.isArray(unit.photosRaw)
      ? unit.photosRaw.filter((photo): photo is string => Boolean(photo))
      : [];

    if (unitPhotos.length === 0) {
      continue;
    }

    if (!unitId) {
      unitId = unit.id;
    }

    for (const photo of unitPhotos) {
      if (!seenPhotos.has(photo)) {
        photos.push(photo);
        seenPhotos.add(photo);
      }
    }

    const updatedAt = unit.updatedAt ? new Date(unit.updatedAt) : null;
    if (
      updatedAt &&
      Number.isFinite(updatedAt.getTime()) &&
      (!latestUpdatedAt || updatedAt.getTime() > latestUpdatedAt.getTime())
    ) {
      latestUpdatedAt = updatedAt;
    }
  }

  if (photos.length === 0 || !unitId) {
    return null;
  }

  return {
    unitId,
    photos,
    uploadedAt: latestUpdatedAt ? latestUpdatedAt.toISOString() : null,
  };
}
