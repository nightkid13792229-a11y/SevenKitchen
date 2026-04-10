/**
 * Dog Breed Seed Script
 * Seeds common dog breeds for Phase 4.1
 * Based on docs/07_Core_Architecture.md Section 2.2
 */

import { PrismaClient } from '@prisma/client';
import { mergeBreedAliases } from './breed-alias-catalog';

const prisma = new PrismaClient();

type SeedBreed = {
  name: string
  aliases?: string[]
  sizeCategory: 'SMALL' | 'MEDIUM' | 'LARGE' | 'GIANT'
  growthCurveType: 'STANDARD' | 'SLOW'
  adultAgeMonths: number
  seniorAgeYears: number
  averageAdultWeightKg: number
}

/**
 * Common dog breeds with realistic data
 * Size categories and age thresholds based on breed characteristics
 */
const dogBreeds: SeedBreed[] = [
  {
    name: '拉布拉多',
    aliases: ['拉拉', '拉布拉多犬'],
    sizeCategory: 'LARGE',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 18,
    seniorAgeYears: 8,
    averageAdultWeightKg: 30.0,
  },
  {
    name: '泰迪',
    aliases: ['泰迪犬', '玩具贵宾犬', '贵宾犬'],
    sizeCategory: 'SMALL',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 5.0,
  },
  {
    name: '金毛',
    aliases: ['金毛犬', '金毛巡回猎犬'],
    sizeCategory: 'LARGE',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 18,
    seniorAgeYears: 8,
    averageAdultWeightKg: 32.0,
  },
  {
    name: '比熊',
    aliases: ['比熊犬', '比熊弗里兹犬'],
    sizeCategory: 'SMALL',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 4.5,
  },
  {
    name: '哈士奇',
    aliases: ['西伯利亚哈士奇'],
    sizeCategory: 'MEDIUM',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 22.0,
  },
  {
    name: '德牧',
    aliases: ['德国牧羊犬', '德国黑背'],
    sizeCategory: 'LARGE',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 18,
    seniorAgeYears: 8,
    averageAdultWeightKg: 35.0,
  },
  {
    name: '边牧',
    aliases: ['边境牧羊犬', '边境牧羊'],
    sizeCategory: 'MEDIUM',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 20.0,
  },
  {
    name: '柯基',
    aliases: ['威尔士柯基', '柯基犬'],
    sizeCategory: 'SMALL',
    growthCurveType: 'STANDARD',
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 12.0,
  },
  {
    name: '萨摩耶',
    aliases: ['萨摩耶犬'],
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
        aliases: mergeBreedAliases(breed.name, breed.aliases ?? []),
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
