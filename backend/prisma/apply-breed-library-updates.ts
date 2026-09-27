/**
 * 品种库更新：改译名 + 补齐缺失品种（2026-09-27）
 *
 * 背景：生产里 333 只狗是「手填品种名」，逐一对照品种库后发现两类问题：
 *
 *  A. 库里缺了**犬业联盟确实认可**的品种
 *     例：大麦町（Dalmatian）、哈瓦那犬、图莱亚尔棉毛犬、捷克斯洛伐克狼犬、美国恶霸犬
 *     —— 顾客搜不到，只好手填。
 *
 *  B. 热门**杂交犬**（AKC / CKU 等主流犬业联盟**不承认为品种**）
 *     例：可卡布(Cockapoo)、马尔泰(Maltipoo)、卡瓦布(Cavapoo)、泰迪熊
 *     老板判断：这些"品种"的家长不愿意自己的狗被叫作混血或串串，
 *     因此**不走混血通道，而是为它们建立品种条目**。
 *     唯一的例外是澳洲拉布拉多贵宾（澳拉贵）—— 它已多代繁育、
 *     有自己的品种协会（WALA 等），是公认的"发展中品种"。
 *
 * 用法（与 repo 里其他数据脚本一致）：
 *   ts-node -r tsconfig-paths/register prisma/apply-breed-library-updates.ts          # 预演
 *   ts-node -r tsconfig-paths/register prisma/apply-breed-library-updates.ts --apply   # 写入
 */

import { PrismaClient, DogSizeCategory, GrowthCurveType } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

/** 改译名：迷你品 → 迷你宾莎犬（老板认为「迷你品」这个译名不好） */
const BREED_RENAMES: Array<{ from: string; to: string }> = [
  { from: '迷你品', to: '迷你宾莎犬' },
];

interface NewBreedInput {
  name: string;
  sizeCategory: DogSizeCategory;
  growthCurveType: GrowthCurveType;
  adultAgeMonths: number;
  seniorAgeYears: number;
  averageAdultWeightKg: number;
  aliases: string[];
  /** 为什么这么定：便于日后复核，也便于老板核对 */
  basis: string;
}

/**
 * 新建品种。
 *
 * 体型/月龄/老年岁数尽量对齐库里同类品种（见 basis），
 * 均重优先用生产实测值，实测明显失真时用品种标准值。
 */
const NEW_BREEDS: NewBreedInput[] = [
  // ============ A. 犬业联盟认可、库里缺失 ============
  {
    name: '大麦町犬',
    sizeCategory: DogSizeCategory.MEDIUM,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 24,
    aliases: ['大麦町', '斑点狗', '斑点'],
    basis:
      'Dalmatian，AKC/FCI 认可品种，库里缺失。生产实测均重 17.5kg（11–21.5），品种标准 20–32kg，取 24。',
  },
  {
    name: '哈瓦那犬',
    sizeCategory: DogSizeCategory.SMALL,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 6,
    aliases: ['哈瓦那'],
    basis:
      'Havanese，AKC/FCI 认可，库里缺失。品种标准 4–7kg；对标马尔济斯/比熊（10/11）。生产那 1 只填了 15kg，明显失真，不采用。',
  },
  {
    name: '图莱亚尔棉毛犬',
    sizeCategory: DogSizeCategory.SMALL,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 5,
    aliases: ['棉花面纱犬', '棉毛犬', 'Coton de Tulear'],
    basis: 'Coton de Tulear，AKC/FCI 认可，库里缺失。标准 4–7kg；生产实测 6kg。',
  },
  {
    name: '捷克斯洛伐克狼犬',
    sizeCategory: DogSizeCategory.LARGE,
    growthCurveType: GrowthCurveType.SLOW,
    adultAgeMonths: 18,
    seniorAgeYears: 8,
    averageAdultWeightKg: 30,
    aliases: ['捷克狼犬', 'CSV', 'Czechoslovakian Wolfdog'],
    basis:
      'FCI 认可，库里缺失。大型犬晚熟，成犬月龄取 18；生产实测 36.5kg（1 只），标准 20–40kg。',
  },
  // ⚠️ 美国恶霸犬 / 澳洲拉布拉多贵宾 / 可卡布都是**分多种体型**的品种。
  // 老板指出：不能用一个「折中」条目涵盖，否则体型判断与热量都会错。
  // 因此参照库里既有的「雪纳瑞（迷你/标准/巨型）」「贵宾犬（玩具/小型/标准/巨型）」
  // 的做法，一个体型档位一个品种名。
  // 各档的成年月龄/老年岁数按体型套用既有约定：
  //   SMALL 10月/11岁、MEDIUM 12月/10岁、LARGE 18月/8岁、GIANT 24月/7岁
  // 恶霸犬 ABKC 有 Pocket / Classic / Standard / XL 等多个品系，
  // 其中 Classic 与 Pocket 体重高度重叠，按体重分档意义不大，故只建三档。
  {
    name: '美国恶霸犬（口袋型）',
    sizeCategory: DogSizeCategory.MEDIUM,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 16,
    aliases: ['恶霸犬', '恶霸', 'American Bully', '恶霸犬口袋型', '口袋恶霸', 'Pocket Bully'],
    basis: 'ABKC 口袋型体型最小，体重约 13–18kg → MEDIUM（对标雪纳瑞标准 15.9kg）。',
  },
  {
    name: '美国恶霸犬（标准型）',
    sizeCategory: DogSizeCategory.LARGE,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 18,
    seniorAgeYears: 8,
    averageAdultWeightKg: 38,
    aliases: ['恶霸犬', '恶霸', 'American Bully', '恶霸犬标准型', '标准恶霸', 'Standard Bully', 'Classic Bully', '恶霸犬经典型'],
    basis:
      'ABKC 标准型体重约 30–45kg → LARGE（对标雪纳瑞巨型 34kg）。经典型与口袋型体重重叠，并入本档。',
  },
  {
    name: '美国恶霸犬（XL型）',
    sizeCategory: DogSizeCategory.GIANT,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 24,
    seniorAgeYears: 7,
    averageAdultWeightKg: 52,
    aliases: ['恶霸犬', '恶霸', 'American Bully', '恶霸犬XL型', 'XL恶霸', 'XL Bully', '美国恶霸犬XL'],
    basis: 'ABKC XL 型约 45–60kg → GIANT（≥24 月成年、7 岁进入老年）。',
  },

  // ============ B. 热门杂交犬（犬业联盟不认可；按老板意见单独建库）============
  // 可卡布同样是分体型的：用玩具贵宾配 → 玩具型，用迷你贵宾配 → 迷你型，用标准贵宾配 → 标准型。
  // 生产实测跨度 2.3–12.5kg（15 只，5 倍差距），单条折中会让两头的狗都算错。
  {
    name: '可卡布犬（玩具）',
    sizeCategory: DogSizeCategory.SMALL,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 4,
    aliases: ['可卡布', 'Cockapoo', '可卡布玩具型', '玩具可卡布'],
    basis: '玩具型（玩具贵宾配）约 5.4kg 以下 → SMALL。生产最小的那只 2.3kg 落在此档。',
  },
  {
    name: '可卡布犬（迷你）',
    sizeCategory: DogSizeCategory.SMALL,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 7,
    aliases: ['可卡布', 'Cockapoo', '可卡布迷你型', '迷你可卡布'],
    basis:
      '迷你型（迷你贵宾配）约 5.4–9kg → SMALL。生产均重 6.7kg 落在此档（最常见的档位）。',
  },
  {
    name: '可卡布犬（标准）',
    sizeCategory: DogSizeCategory.MEDIUM,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 11,
    aliases: ['可卡布', 'Cockapoo', '可卡布标准型', '标准可卡布'],
    basis: '标准型（标准贵宾配）约 9–13.6kg → MEDIUM。生产最大的那只 12.5kg 落在此档。',
  },
  {
    name: '马尔泰犬',
    sizeCategory: DogSizeCategory.SMALL,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 3,
    aliases: ['马尔泰', 'Maltipoo', '马尔泰迪'],
    basis:
      'Maltipoo（马尔济斯 × 贵宾犬）。生产实测均重 2.6kg（1–4，7 只）→ SMALL，对标马尔济斯 10/11、均重 3.2。',
  },
  {
    name: '卡瓦布犬',
    sizeCategory: DogSizeCategory.SMALL,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 8,
    aliases: ['卡瓦布', 'Cavapoo', '骑士贵宾', 'Cavapoodle'],
    basis:
      'Cavapoo（骑士查理王小猎犬 × 贵宾犬）。生产实测 9–11.3kg；对标骑士查理王小猎犬 6–8kg 体系 → SMALL。',
  },
  {
    name: '澳洲拉布拉多贵宾犬（迷你）',
    sizeCategory: DogSizeCategory.SMALL,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 10,
    aliases: ['澳拉贵', '澳拉贵迷你', '迷你澳拉贵', 'Mini Australian Labradoodle'],
    basis: 'WALA 标准迷你系约 7–13kg → SMALL。生产实测 8.5–10kg 落在此档。',
  },
  {
    name: '澳洲拉布拉多贵宾犬（中型）',
    sizeCategory: DogSizeCategory.MEDIUM,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 12,
    seniorAgeYears: 10,
    averageAdultWeightKg: 16,
    aliases: ['澳拉贵', '澳拉贵中型', '中型澳拉贵', 'Medium Australian Labradoodle'],
    basis: 'WALA 标准中型系约 13–20kg → MEDIUM。',
  },
  {
    name: '澳洲拉布拉多贵宾犬（标准）',
    sizeCategory: DogSizeCategory.LARGE,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 18,
    seniorAgeYears: 8,
    averageAdultWeightKg: 25,
    aliases: ['澳拉贵', '澳拉贵标准', '标准澳拉贵', 'Standard Australian Labradoodle'],
    basis: 'WALA 标准系约 20–30kg → LARGE（对标贵宾犬标准 22.7kg）。',
  },
  {
    name: '泰迪熊犬',
    sizeCategory: DogSizeCategory.SMALL,
    growthCurveType: GrowthCurveType.STANDARD,
    adultAgeMonths: 10,
    seniorAgeYears: 11,
    averageAdultWeightKg: 4,
    aliases: ['泰迪熊', 'Teddy Bear'],
    basis:
      '泰迪熊是独立的杂交犬，**不是贵宾犬**（老板明确更正）。生产实测均重 3.5kg（3.05–4，2 只）→ SMALL。',
  },
];

async function main() {
  console.log(
    shouldApply ? 'Applying breed library updates...' : 'Dry run: breed library updates...',
  );

  // ---------- 1. 改译名 ----------
  console.log('\n[1] 改译名');
  for (const rename of BREED_RENAMES) {
    const breed = await prisma.dogBreed.findFirst({ where: { name: rename.from } });
    if (!breed) {
      console.log(`- 跳过（库中不存在）：${rename.from}`);
      continue;
    }
    console.log(`- ${rename.from} → ${rename.to}（当前别名：${JSON.stringify(breed.aliases)}）`);
    if (shouldApply) {
      await prisma.dogBreed.update({
        where: { id: breed.id },
        data: { name: rename.to },
      });
    }
  }

  // ---------- 2. 新建品种 ----------
  console.log('\n[2] 新建品种');
  let created = 0;
  for (const input of NEW_BREEDS) {
    const existing = await prisma.dogBreed.findFirst({ where: { name: input.name } });
    if (existing) {
      console.log(`- 已存在，跳过：${input.name}`);
      continue;
    }

    console.log(
      `- 新增 ${input.name} | ${input.sizeCategory} | ${input.adultAgeMonths}月成年 / ${input.seniorAgeYears}岁老年 | 均重 ${input.averageAdultWeightKg}kg`,
    );
    console.log(`  别名：${JSON.stringify(input.aliases)}`);
    console.log(`  依据：${input.basis}`);

    if (shouldApply) {
      await prisma.dogBreed.create({
        data: {
          name: input.name,
          aliases: input.aliases,
          sizeCategory: input.sizeCategory,
          growthCurveType: input.growthCurveType,
          adultAgeMonths: input.adultAgeMonths,
          seniorAgeYears: input.seniorAgeYears,
          averageAdultWeightKg: input.averageAdultWeightKg,
          isCommon: false,
        },
      });
      created += 1;
    }
  }

  console.log(
    shouldApply
      ? `\n完成：改名 ${BREED_RENAMES.length} 项、新建 ${created} 个品种。`
      : '\n预演结束。确认无误后加 --apply 才会真正写入。',
  );
}

main()
  .catch((error) => {
    console.error('品种库更新失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
