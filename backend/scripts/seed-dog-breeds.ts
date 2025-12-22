/**
 * Seed Dog Breeds
 * Phase 4.1: Populate database with common dog breeds
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const breeds = [
  {
    name: '拉布拉多',
    sizeCategory: 'LARGE',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 18,
    seniorAgeYears: 8,
    averageAdultWeightKg: 30.0,
  },
  {
    name: '泰迪',
    sizeCategory: 'SMALL',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 5.0,
  },
  {
    name: '金毛',
    sizeCategory: 'LARGE',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 18,
    seniorAgeYears: 8,
    averageAdultWeightKg: 32.0,
  },
  {
    name: '哈士奇',
    sizeCategory: 'MEDIUM',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 25.0,
  },
  {
    name: '德牧',
    sizeCategory: 'LARGE',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 18,
    seniorAgeYears: 8,
    averageAdultWeightKg: 35.0,
  },
  {
    name: '比熊',
    sizeCategory: 'SMALL',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 4.5,
  },
  {
    name: '萨摩耶',
    sizeCategory: 'MEDIUM',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 23.0,
  },
  {
    name: '大丹犬',
    sizeCategory: 'GIANT',
    growthCurveType: 'SLOW',
    adultAgeMonths: 24,
    seniorAgeYears: 7,
    averageAdultWeightKg: 60.0,
  },
];

async function main() {
  console.log('🌱 Seeding dog breeds...');

  for (const breed of breeds) {
    // Check if breed already exists
    const existing = await prisma.dogBreed.findFirst({
      where: { name: breed.name },
    });

    if (existing) {
      console.log(`⏭️  Skipping ${breed.name} (already exists)`);
      continue;
    }

    const created = await prisma.dogBreed.create({
      data: breed,
    });

    console.log(`✅ Created breed: ${created.name} (${created.id})`);
  }

  console.log('✨ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
