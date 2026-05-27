import {
  KnowledgeAuthorityLevel,
  KnowledgeSourceStatus,
  NutritionEvidenceLevel,
  NutritionRulePackageStatus,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

const knowledgeSources = [
  {
    code: 'FEDIAF_2025',
    name: 'FEDIAF Nutritional Guidelines',
    versionLabel: '2025',
    sourceUrl:
      'https://europeanpetfood.org/self-regulation/nutritional-guidelines/',
    scope: ['COMPLETE_BALANCED_BASELINE', 'DOG'],
    authorityLevel: KnowledgeAuthorityLevel.FOUNDATIONAL,
    copyrightNote: 'Store source metadata and structured derived rules only.',
  },
  {
    code: 'WSAVA_NUTRITION',
    name: 'WSAVA Global Nutrition Guidelines and Toolkit',
    versionLabel: 'current',
    sourceUrl:
      'https://wsava.org/global-guidelines/global-nutrition-guidelines/',
    scope: ['NUTRITION_ASSESSMENT', 'BCS_MCS', 'DIET_HISTORY'],
    authorityLevel: KnowledgeAuthorityLevel.HIGH,
    copyrightNote: 'Store source metadata and reviewed summaries only.',
  },
  {
    code: 'AAHA_2021_NUTRITION_WEIGHT',
    name: 'AAHA 2021 Nutrition and Weight Management Guidelines',
    versionLabel: '2021',
    sourceUrl:
      'https://www.aaha.org/aaha-guidelines/2021-aaha-nutrition-and-weight-management-guidelines/home/',
    scope: ['WEIGHT_MANAGEMENT', 'NUTRITION_ASSESSMENT'],
    authorityLevel: KnowledgeAuthorityLevel.HIGH,
    copyrightNote: 'Store source metadata and structured derived rules only.',
  },
  {
    code: 'SACN5',
    name: 'Small Animal Clinical Nutrition 5',
    versionLabel: '5th edition',
    sourceUrl: 'https://www.markmorrisinstitute.org/sacn5',
    scope: ['CLINICAL_NUTRITION_BASELINE'],
    authorityLevel: KnowledgeAuthorityLevel.HIGH,
    copyrightNote:
      'Do not store full text or long excerpts; store citation metadata and reviewed structured summaries.',
  },
  {
    code: 'ACVIM_ENDORSED',
    name: 'ACVIM Endorsed Statements',
    versionLabel: 'current',
    sourceUrl:
      'https://www.acvim.org/journals-research/research/acvim-endorsed-statements',
    scope: ['DISEASE_SPECIFIC_HIGH_WEIGHT_EVIDENCE'],
    authorityLevel: KnowledgeAuthorityLevel.HIGH,
    copyrightNote:
      'Store source metadata and reviewed structured summaries only.',
  },
];

const rulePackages = [
  {
    code: 'PANCREAS_LOW_FAT',
    name: '胰腺呵护 / 低脂',
    requiredEvidence: NutritionEvidenceLevel.A_CONFIRMED_DIAGNOSIS,
    requiredFields: [
      'currentWeightKg',
      'bcsScore',
      'medicalRecords',
      'dietHistory',
    ],
  },
  {
    code: 'WEIGHT_MANAGEMENT',
    name: '减重 / 肥胖管理',
    requiredEvidence: NutritionEvidenceLevel.C_OWNER_REPORTED,
    requiredFields: [
      'currentWeightKg',
      'bcsScore',
      'targetWeightKg',
      'dietHistory',
      'treats',
    ],
  },
];

async function main() {
  for (const source of knowledgeSources) {
    await prisma.knowledgeSource.upsert({
      where: { code: source.code },
      create: {
        ...source,
        status: KnowledgeSourceStatus.ACTIVE,
      },
      update: {
        name: source.name,
        versionLabel: source.versionLabel,
        sourceUrl: source.sourceUrl,
        scope: source.scope,
        authorityLevel: source.authorityLevel,
        copyrightNote: source.copyrightNote,
        status: KnowledgeSourceStatus.ACTIVE,
      },
    });
  }

  for (const rulePackage of rulePackages) {
    const nutritionRulePackage =
      (await prisma.nutritionRulePackage.findUnique({
        where: { code: rulePackage.code },
      })) ??
      (await prisma.nutritionRulePackage.create({
        data: {
          code: rulePackage.code,
          name: rulePackage.name,
          status: NutritionRulePackageStatus.DRAFT,
        },
      }));

    const existingRuleVersion = await prisma.nutritionRuleVersion.findUnique({
      where: {
        packageId_version: {
          packageId: nutritionRulePackage.id,
          version: 1,
        },
      },
    });

    if (!existingRuleVersion) {
      await prisma.nutritionRuleVersion.create({
        data: {
          packageId: nutritionRulePackage.id,
          version: 1,
          requiredEvidence: rulePackage.requiredEvidence,
          activationCriteria: {},
          contraindications: {},
          requiredFields: rulePackage.requiredFields,
          nutrientTargets: {},
          ingredientPolicy: {},
          conflictPolicy: {},
          reviewPolicy: { forceManualReview: true },
          displayBoundaries: { noDiagnosis: true, noTreatmentClaim: true },
          isActive: false,
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error('Failed to seed AI recipe knowledge:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (process.exitCode) {
      process.exit(process.exitCode);
    }
  });
