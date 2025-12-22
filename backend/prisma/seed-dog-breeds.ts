/**
 * Dog Breed Seed Script
 * Seeds common dog breeds for Phase 4.1
 * Based on docs/07_Core_Architecture.md Section 2.2
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Common dog breeds with realistic data
 * Size categories and age thresholds based on breed characteristics
 */
const dogBreeds = [
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
    name: '比熊',
    sizeCategory: 'SMALL',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 4.5,
  },
  {
    name: '哈士奇',
    sizeCategory: 'MEDIUM',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 22.0,
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
    name: '边牧',
    sizeCategory: 'MEDIUM',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 20.0,
  },
  {
    name: '柯基',
    sizeCategory: 'SMALL',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 12.0,
  },
  {
    name: '萨摩耶',
    sizeCategory: 'MEDIUM',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 25.0,
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

  for (const breed of dogBreeds) {
    // Check if breed already exists
    const existing = await prisma.dogBreed.findFirst({
      where: { name: breed.name },
    });

    if (existing) {
      console.log(`⏭️  Skipping ${breed.name} (already exists)`);
      continue;
    }

    const created = await prisma.dogBreed.create({
      data: {
        name: breed.name,
        sizeCategory: breed.sizeCategory as any,
        growthCurveType: breed.growthCurveType as any,
        adultAgeMonths: breed.adultAgeMonths,
        seniorAgeYears: breed.seniorAgeYears,
        averageAdultWeightKg: breed.averageAdultWeightKg,
      },
    });

    console.log(`✅ Created breed: ${created.name} (${created.id})`);
  }

  console.log('✨ Dog breed seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
