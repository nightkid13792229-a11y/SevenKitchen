import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
} from '../src/domain/dog/breed-health-risk.entity';

export type BreedHealthConditionFixture = {
  key: string;
  id: string;
  nameCn: string;
  nameEn: string | null;
  aliases: string[];
  category: string;
  summary: string;
  commonSigns: string[];
  screeningAdvice: string | null;
  careAdvice: string | null;
  isActive: boolean;
};

export type BreedHealthRiskSourceFixture = {
  sourceType: BreedHealthRiskSourceType;
  sourceName: string;
  publisher: string | null;
  title: string;
  url: string;
  accessedAt: string;
  note: string | null;
};

export type BreedHealthRiskFixture = {
  breedKey: string;
  breedNames: string[];
  conditionKey: string;
  attentionPriority: BreedHealthAttentionPriority;
  oneLineSummary: string;
  breedSpecificReason: string | null;
  displayOrder: number;
  isPublished: boolean;
  sources: BreedHealthRiskSourceFixture[];
};

export type BreedHealthRiskFixtureSet = {
  generatedAt: string;
  reviewStatus: 'LOCAL_REVIEW_SAMPLE';
  conditions: BreedHealthConditionFixture[];
  risks: BreedHealthRiskFixture[];
};

export type AvailableBreed = {
  id: string;
  name: string;
  aliases: string[] | null;
};

export type PlannedBreedHealthRisk = BreedHealthRiskFixture & {
  id: string;
  breedId: string;
  conditionId: string;
};

export type BreedHealthRiskImportPlan = {
  conditions: BreedHealthConditionFixture[];
  risks: PlannedBreedHealthRisk[];
  sources: number;
  missingBreeds: Array<{
    breedKey: string;
    breedNames: string[];
  }>;
};

const SOURCE_ACCESSED_AT = '2026-05-17T00:00:00.000Z';
const DEFAULT_LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';

const source = (
  input: Omit<BreedHealthRiskSourceFixture, 'accessedAt'>,
): BreedHealthRiskSourceFixture => ({
  ...input,
  accessedAt: SOURCE_ACCESSED_AT,
});

const ofaChicSource = source({
  sourceType: BreedHealthRiskSourceType.OFA_CHIC,
  sourceName: 'OFA CHIC Program',
  publisher: 'Orthopedic Foundation for Animals',
  title: 'CHIC Program',
  url: 'https://ofa.org/chic-programs/',
  note: '说明 CHIC 与犬种俱乐部共同维护犬种特异健康筛查建议。',
});

const ofaDiseaseOverviewSource = source({
  sourceType: BreedHealthRiskSourceType.OFA_CHIC,
  sourceName: 'OFA Diseases',
  publisher: 'Orthopedic Foundation for Animals',
  title: 'Diseases in Dogs',
  url: 'https://ofa.org/diseases/',
  note: '说明 CHIC 推荐筛查代表各犬种俱乐部认为重要的健康筛查项目。',
});

const grcaHealthScreeningSource = source({
  sourceType: BreedHealthRiskSourceType.BREED_CLUB,
  sourceName: 'GRCA Health Screenings',
  publisher: 'Golden Retriever Club of America',
  title: 'Health Screenings for the Parents of a Litter',
  url: 'https://grca.org/about-the-breed/health-research/health-screenings-for-the-parents-of-a-litter/',
  note: '金毛犬种俱乐部资料，列出髋、肘、眼、心脏等繁育前筛查重点。',
});

const labradorHealthStatementSource = source({
  sourceType: BreedHealthRiskSourceType.BREED_CLUB,
  sourceName: 'LRC Health Statement',
  publisher: 'Labrador Retriever Club, Inc.',
  title: 'Labrador Retriever Club Health Testing Requirements',
  url: 'https://cdn.akc.org/Marketplace/Health-Statement/Labrador-Retriever.pdf',
  note: '拉布拉多 AKC 父俱乐部健康声明，列出 CHIC 相关筛查项目。',
});

const miniatureSchnauzerHealthStatementSource = source({
  sourceType: BreedHealthRiskSourceType.BREED_CLUB,
  sourceName: 'AMSC Health Statement',
  publisher: 'American Miniature Schnauzer Club, Inc.',
  title: 'Health Statement for the American Miniature Schnauzer Club, Inc.',
  url: 'https://s3.amazonaws.com/cdn-origin-etr.akc.org/wp-content/uploads/2024/07/18134123/American-Miniature-Schnauzer-Club-Inc.-Health-Statement-7-24-Final.pdf',
  note: '迷你雪纳瑞犬种俱乐部健康声明，列出 OFA 眼科、心脏与 DNA 检测建议。',
});

const miniatureSchnauzerGeneralHealthSource = source({
  sourceType: BreedHealthRiskSourceType.BREED_CLUB,
  sourceName: 'AMSC General Health',
  publisher: 'American Miniature Schnauzer Club',
  title: 'General Health',
  url: 'https://amsc.us/general-health/',
  note: '迷你雪纳瑞犬种俱乐部面向养犬人的健康资料，强调眼科与兽医检查。',
});

const umnMiniatureSchnauzerHealthPanelSource = source({
  sourceType: BreedHealthRiskSourceType.VETERINARY_LITERATURE,
  sourceName: 'UMN Canine Genetics Lab',
  publisher: 'University of Minnesota College of Veterinary Medicine',
  title: 'Miniature Schnauzer Health Panel',
  url: 'https://vetmed.umn.edu/research/research-labs/canine-genetics-lab/canine-genetics-testing/miniature-schnauzer-health-panel',
  note: '说明迷你雪纳瑞 HIVEP3/PPT1-PRA 检测背景。',
});

const kennelClubMacSource = source({
  sourceType: BreedHealthRiskSourceType.BREED_CLUB,
  sourceName: 'The Kennel Club',
  publisher: 'The Kennel Club',
  title: 'New DNA Testing Scheme for the Miniature Schnauzer',
  url: 'https://www.royalkennelclub.com/about-us/resources/media-centre/2017/january/new-dna-testing-scheme-for-the-miniature-schnauzer/',
  note: '说明迷你雪纳瑞 MAC DNA 检测计划。',
});

const ofaHipDysplasiaSource = source({
  sourceType: BreedHealthRiskSourceType.OFA_CHIC,
  sourceName: 'OFA Hip Dysplasia',
  publisher: 'Orthopedic Foundation for Animals',
  title: 'Hip Dysplasia',
  url: 'https://ofa.org/diseases/hip-dysplasia/',
  note: 'OFA 髋关节发育不良说明与筛查流程资料。',
});

const ofaElbowDysplasiaSource = source({
  sourceType: BreedHealthRiskSourceType.OFA_CHIC,
  sourceName: 'OFA Elbow Dysplasia',
  publisher: 'Orthopedic Foundation for Animals',
  title: 'Elbow Dysplasia',
  url: 'https://ofa.org/diseases/elbow-dysplasia/',
  note: 'OFA 肘关节发育不良说明与筛查流程资料。',
});

const ofaEyeDiseaseSource = source({
  sourceType: BreedHealthRiskSourceType.OFA_CHIC,
  sourceName: 'OFA Eye Disease',
  publisher: 'Orthopedic Foundation for Animals',
  title: 'Eye Disease',
  url: 'https://ofa.org/diseases/eye-disease/',
  note: 'OFA CAER 眼科登记与遗传性眼病资料。',
});

const ofaCardiacDiseaseSource = source({
  sourceType: BreedHealthRiskSourceType.OFA_CHIC,
  sourceName: 'OFA Cardiac Disease',
  publisher: 'Orthopedic Foundation for Animals',
  title: 'Cardiac Disease',
  url: 'https://ofa.org/diseases/cardiac-disease/',
  note: 'OFA 心脏筛查数据库与检查类型资料。',
});

const ofaEicSource = source({
  sourceType: BreedHealthRiskSourceType.OFA_CHIC,
  sourceName: 'OFA Exercise Induced Collapse',
  publisher: 'Orthopedic Foundation for Animals',
  title: 'Exercise Induced Collapse (EIC)',
  url: 'https://ofa.org/exercise-induced-collapse/',
  note: 'OFA EIC DNA 检测与疾病说明资料。',
});

export const BREED_HEALTH_RISK_FIXTURE_SET: BreedHealthRiskFixtureSet = {
  generatedAt: SOURCE_ACCESSED_AT,
  reviewStatus: 'LOCAL_REVIEW_SAMPLE',
  conditions: [
    {
      key: 'hip-dysplasia',
      id: 'breed-health-condition-hip-dysplasia',
      nameCn: '髋关节发育不良',
      nameEn: 'Hip Dysplasia',
      aliases: ['HD', '髋关节问题'],
      category: '骨骼关节',
      summary:
        '髋关节发育不良是髋关节结构发育异常，可能导致疼痛、跛行或继发关节炎。',
      commonSigns: ['后肢僵硬或跛行', '起身困难', '不愿跳跃或爬楼'],
      screeningAdvice:
        '相关品种可与兽医讨论成年后的髋关节影像评估，以及体重和运动管理。',
      careAdvice:
        '保持理想体况，避免幼犬快速增重；如出现疼痛或跛行，应及时就医。',
      isActive: true,
    },
    {
      key: 'elbow-dysplasia',
      id: 'breed-health-condition-elbow-dysplasia',
      nameCn: '肘关节发育不良',
      nameEn: 'Elbow Dysplasia',
      aliases: ['ED', '肘关节问题'],
      category: '骨骼关节',
      summary: '肘关节发育不良是一组与肘关节结构和继发退行性变化相关的问题。',
      commonSigns: ['前肢跛行', '运动后不适', '肘部活动受限'],
      screeningAdvice:
        '相关品种可与兽医讨论肘关节影像筛查，尤其是繁育前健康评估。',
      careAdvice: '控制体重和运动强度；出现持续跛行时，尽早由兽医评估。',
      isActive: true,
    },
    {
      key: 'hereditary-eye-disease',
      id: 'breed-health-condition-hereditary-eye-disease',
      nameCn: '遗传性眼部疾病',
      nameEn: 'Hereditary Eye Disease',
      aliases: ['眼科筛查', 'CAER', 'PRA', '进行性视网膜萎缩'],
      category: '眼科',
      summary:
        '遗传性眼部疾病包含多种可能影响视力或眼部舒适度的问题，部分疾病可通过眼科检查或 DNA 检测关注。',
      commonSigns: ['夜间视力下降', '眼睛发红或浑浊', '撞到物体或行动迟疑'],
      screeningAdvice:
        '如属于推荐筛查品种，可咨询兽医眼科检查或相关 DNA 检测。',
      careAdvice: '发现视力变化、眼痛或分泌物增加时，应尽快就医。',
      isActive: true,
    },
    {
      key: 'cardiac-disease',
      id: 'breed-health-condition-cardiac-disease',
      nameCn: '心脏疾病筛查关注',
      nameEn: 'Cardiac Disease Screening',
      aliases: ['心脏筛查', 'Cardiac Evaluation'],
      category: '心血管',
      summary:
        '部分品种的繁育建议中包含心脏评估，用于关注先天性或成年发病的心脏问题。',
      commonSigns: ['运动耐受下降', '咳嗽或呼吸急促', '晕厥或虚弱'],
      screeningAdvice: '可与兽医讨论听诊、心超或专科心脏评估是否适合当前犬只。',
      careAdvice: '若出现晕厥、呼吸困难或明显运动不耐受，应及时就医。',
      isActive: true,
    },
    {
      key: 'exercise-induced-collapse',
      id: 'breed-health-condition-exercise-induced-collapse',
      nameCn: '运动诱发性虚脱',
      nameEn: 'Exercise-Induced Collapse',
      aliases: ['EIC', '运动后虚脱'],
      category: '神经肌肉',
      summary:
        '运动诱发性虚脱是一种遗传相关的神经肌肉问题，常在高强度运动后出现协调性下降或虚弱。',
      commonSigns: ['剧烈运动后后肢无力', '步态摇晃', '短时间虚脱后恢复'],
      screeningAdvice:
        '拉布拉多等相关品种可咨询 EIC DNA 检测，尤其是繁育或高强度运动场景。',
      careAdvice:
        '如曾出现运动后虚脱，应停止高强度运动并请兽医排查心脏、代谢和神经肌肉问题。',
      isActive: true,
    },
    {
      key: 'myotonia-congenita',
      id: 'breed-health-condition-myotonia-congenita',
      nameCn: '先天性肌强直',
      nameEn: 'Myotonia Congenita',
      aliases: ['Myotonia Congenita Schnauzer Type', '肌强直'],
      category: '神经肌肉',
      summary:
        '先天性肌强直可表现为肌肉放松困难或僵硬，迷你雪纳瑞健康声明中列有相关 DNA 检测建议。',
      commonSigns: ['肌肉僵硬', '行动不协调', '运动后放松困难'],
      screeningAdvice:
        '迷你雪纳瑞可与兽医或繁育者讨论 Schnauzer Type DNA 检测。',
      careAdvice: '如出现持续肌肉僵硬或行动异常，应由兽医进一步检查。',
      isActive: true,
    },
    {
      key: 'mycobacterium-avian-complex',
      id: 'breed-health-condition-mycobacterium-avian-complex',
      nameCn: '鸟分枝杆菌复合体易感',
      nameEn: 'Mycobacterium Avian Complex Susceptibility',
      aliases: ['MAC', 'Mycobacterium Avium Complex'],
      category: '免疫与感染易感',
      summary:
        '迷你雪纳瑞犬种健康资料中包含 MAC DNA 检测建议，用于关注特定遗传易感问题。',
      commonSigns: ['持续发热', '淋巴结肿大', '长期消化道或全身症状'],
      screeningAdvice: '迷你雪纳瑞可与兽医或繁育者讨论 MAC DNA 检测是否适合。',
      careAdvice:
        '如出现长期发热、消瘦或淋巴结异常，应及时就医排查感染和免疫相关问题。',
      isActive: true,
    },
  ],
  risks: [
    {
      breedKey: 'labrador-retriever',
      breedNames: ['拉布拉多', '拉拉', '拉布拉多犬', 'Labrador Retriever'],
      conditionKey: 'hip-dysplasia',
      attentionPriority: BreedHealthAttentionPriority.KEY_ATTENTION,
      oneLineSummary: '拉布拉多健康声明将髋关节评估列为 CHIC 相关筛查项目。',
      breedSpecificReason:
        '大型运动犬体型和活动特点使关节健康管理值得提前关注。',
      displayOrder: 10,
      isPublished: true,
      sources: [
        labradorHealthStatementSource,
        ofaHipDysplasiaSource,
        ofaDiseaseOverviewSource,
      ],
    },
    {
      breedKey: 'labrador-retriever',
      breedNames: ['拉布拉多', '拉拉', '拉布拉多犬', 'Labrador Retriever'],
      conditionKey: 'elbow-dysplasia',
      attentionPriority: BreedHealthAttentionPriority.KEY_ATTENTION,
      oneLineSummary: '拉布拉多健康声明将肘关节评估列为 CHIC 相关筛查项目。',
      breedSpecificReason:
        '肘关节问题可能影响前肢负重和运动舒适度，适合与髋关节一起关注。',
      displayOrder: 20,
      isPublished: true,
      sources: [
        labradorHealthStatementSource,
        ofaElbowDysplasiaSource,
        ofaDiseaseOverviewSource,
      ],
    },
    {
      breedKey: 'labrador-retriever',
      breedNames: ['拉布拉多', '拉拉', '拉布拉多犬', 'Labrador Retriever'],
      conditionKey: 'exercise-induced-collapse',
      attentionPriority: BreedHealthAttentionPriority.KEY_ATTENTION,
      oneLineSummary:
        '拉布拉多健康声明列出 EIC 检测，OFA 资料也说明该问题常见于拉布拉多等犬种。',
      breedSpecificReason:
        '高兴奋或高强度运动场景下，EIC 相关信息对运动管理和繁育沟通有帮助。',
      displayOrder: 30,
      isPublished: true,
      sources: [labradorHealthStatementSource, ofaEicSource],
    },
    {
      breedKey: 'labrador-retriever',
      breedNames: ['拉布拉多', '拉拉', '拉布拉多犬', 'Labrador Retriever'],
      conditionKey: 'hereditary-eye-disease',
      attentionPriority: BreedHealthAttentionPriority.RECOMMENDED_AWARENESS,
      oneLineSummary: '拉布拉多健康声明将年度眼科检查列为 CHIC 相关筛查项目。',
      breedSpecificReason:
        '眼科筛查有助于及早发现可能影响视力的遗传或发育性眼部问题。',
      displayOrder: 40,
      isPublished: true,
      sources: [labradorHealthStatementSource, ofaEyeDiseaseSource],
    },
    {
      breedKey: 'golden-retriever',
      breedNames: ['金毛', '金毛犬', '金毛巡回猎犬', 'Golden Retriever'],
      conditionKey: 'hip-dysplasia',
      attentionPriority: BreedHealthAttentionPriority.KEY_ATTENTION,
      oneLineSummary: '金毛犬种俱乐部将髋关节筛查列为繁育前重点健康检查之一。',
      breedSpecificReason:
        '髋关节问题可能在年轻或中老年阶段影响运动舒适度，适合从体况和筛查两方面管理。',
      displayOrder: 10,
      isPublished: true,
      sources: [
        grcaHealthScreeningSource,
        ofaHipDysplasiaSource,
        ofaChicSource,
      ],
    },
    {
      breedKey: 'golden-retriever',
      breedNames: ['金毛', '金毛犬', '金毛巡回猎犬', 'Golden Retriever'],
      conditionKey: 'elbow-dysplasia',
      attentionPriority: BreedHealthAttentionPriority.KEY_ATTENTION,
      oneLineSummary: '金毛犬种俱乐部将肘关节筛查列为繁育前重点健康检查之一。',
      breedSpecificReason: '肘关节发育问题可能导致前肢跛行或运动后不适。',
      displayOrder: 20,
      isPublished: true,
      sources: [
        grcaHealthScreeningSource,
        ofaElbowDysplasiaSource,
        ofaChicSource,
      ],
    },
    {
      breedKey: 'golden-retriever',
      breedNames: ['金毛', '金毛犬', '金毛巡回猎犬', 'Golden Retriever'],
      conditionKey: 'hereditary-eye-disease',
      attentionPriority: BreedHealthAttentionPriority.RECOMMENDED_AWARENESS,
      oneLineSummary:
        '金毛犬种俱乐部建议关注眼科筛查，资料中特别提到部分眼病可能较晚出现。',
      breedSpecificReason:
        '眼科检查适合长期关注，尤其是繁育犬或已有视力变化的犬只。',
      displayOrder: 30,
      isPublished: true,
      sources: [grcaHealthScreeningSource, ofaEyeDiseaseSource],
    },
    {
      breedKey: 'golden-retriever',
      breedNames: ['金毛', '金毛犬', '金毛巡回猎犬', 'Golden Retriever'],
      conditionKey: 'cardiac-disease',
      attentionPriority: BreedHealthAttentionPriority.RECOMMENDED_AWARENESS,
      oneLineSummary: '金毛犬种俱乐部将心脏检查列为繁育前健康筛查重点之一。',
      breedSpecificReason: '心脏筛查能帮助关注先天性或成年发病的心脏问题线索。',
      displayOrder: 40,
      isPublished: true,
      sources: [grcaHealthScreeningSource, ofaCardiacDiseaseSource],
    },
    {
      breedKey: 'miniature-schnauzer',
      breedNames: [
        '雪纳瑞(小型)',
        '雪纳瑞（迷你）',
        '迷你雪纳瑞',
        '小型雪纳瑞',
        'Miniature Schnauzer',
      ],
      conditionKey: 'hereditary-eye-disease',
      attentionPriority: BreedHealthAttentionPriority.KEY_ATTENTION,
      oneLineSummary:
        '迷你雪纳瑞健康声明建议年度 ACVO 眼科检查，并列出 PRA Type B DNA 检测。',
      breedSpecificReason:
        '眼科资料与 PRA 检测是迷你雪纳瑞犬种健康声明中的核心关注点。',
      displayOrder: 10,
      isPublished: true,
      sources: [
        miniatureSchnauzerHealthStatementSource,
        miniatureSchnauzerGeneralHealthSource,
        umnMiniatureSchnauzerHealthPanelSource,
        ofaEyeDiseaseSource,
      ],
    },
    {
      breedKey: 'miniature-schnauzer',
      breedNames: [
        '雪纳瑞(小型)',
        '雪纳瑞（迷你）',
        '迷你雪纳瑞',
        '小型雪纳瑞',
        'Miniature Schnauzer',
      ],
      conditionKey: 'cardiac-disease',
      attentionPriority: BreedHealthAttentionPriority.RECOMMENDED_AWARENESS,
      oneLineSummary: '迷你雪纳瑞健康声明列出心脏评估作为推荐健康测试。',
      breedSpecificReason: '心脏评估可帮助发现需要进一步兽医判断的异常线索。',
      displayOrder: 20,
      isPublished: true,
      sources: [
        miniatureSchnauzerHealthStatementSource,
        ofaCardiacDiseaseSource,
      ],
    },
    {
      breedKey: 'miniature-schnauzer',
      breedNames: [
        '雪纳瑞(小型)',
        '雪纳瑞（迷你）',
        '迷你雪纳瑞',
        '小型雪纳瑞',
        'Miniature Schnauzer',
      ],
      conditionKey: 'myotonia-congenita',
      attentionPriority: BreedHealthAttentionPriority.SUPPLEMENTAL_AWARENESS,
      oneLineSummary:
        '迷你雪纳瑞健康声明将先天性肌强直 DNA 检测列为可选但推荐项目。',
      breedSpecificReason:
        '该信息适合作为繁育沟通和异常肌肉僵硬症状排查时的补充资料。',
      displayOrder: 30,
      isPublished: true,
      sources: [miniatureSchnauzerHealthStatementSource],
    },
    {
      breedKey: 'miniature-schnauzer',
      breedNames: [
        '雪纳瑞(小型)',
        '雪纳瑞（迷你）',
        '迷你雪纳瑞',
        '小型雪纳瑞',
        'Miniature Schnauzer',
      ],
      conditionKey: 'mycobacterium-avian-complex',
      attentionPriority: BreedHealthAttentionPriority.SUPPLEMENTAL_AWARENESS,
      oneLineSummary: '迷你雪纳瑞健康声明将 MAC DNA 检测列为可选但推荐项目。',
      breedSpecificReason:
        '该信息适合作为犬种遗传易感资料，需结合兽医判断理解。',
      displayOrder: 40,
      isPublished: true,
      sources: [miniatureSchnauzerHealthStatementSource, kennelClubMacSource],
    },
  ],
};

const sourceTypes = new Set(Object.values(BreedHealthRiskSourceType));
const attentionPriorities = new Set(
  Object.values(BreedHealthAttentionPriority),
);

export function normalizeBreedLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '');
}

export function validateBreedHealthRiskFixtureSet(
  fixtureSet: BreedHealthRiskFixtureSet,
): string[] {
  const errors: string[] = [];
  const conditionKeys = new Set<string>();
  const conditionIds = new Set<string>();

  fixtureSet.conditions.forEach((condition) => {
    if (!condition.key.trim()) {
      errors.push('Condition key is required');
    }
    if (conditionKeys.has(condition.key)) {
      errors.push(`Duplicate condition key: ${condition.key}`);
    }
    conditionKeys.add(condition.key);

    if (!condition.id.trim()) {
      errors.push(`Condition ${condition.key} is missing an id`);
    }
    if (conditionIds.has(condition.id)) {
      errors.push(`Duplicate condition id: ${condition.id}`);
    }
    conditionIds.add(condition.id);

    if (
      !condition.nameCn.trim() ||
      !condition.category.trim() ||
      !condition.summary.trim()
    ) {
      errors.push(
        `Condition ${condition.key} is missing required display fields`,
      );
    }
  });

  fixtureSet.risks.forEach((risk, riskIndex) => {
    if (!risk.breedKey.trim()) {
      errors.push(`Risk ${riskIndex + 1} is missing breedKey`);
    }
    if (
      risk.breedNames.length === 0 ||
      risk.breedNames.some((name) => !name.trim())
    ) {
      errors.push(`Risk ${risk.breedKey} is missing breed names`);
    }
    if (!conditionKeys.has(risk.conditionKey)) {
      errors.push(
        `Risk ${risk.breedKey}/${risk.conditionKey} references an unknown condition`,
      );
    }
    if (!attentionPriorities.has(risk.attentionPriority)) {
      errors.push(
        `Risk ${risk.breedKey}/${risk.conditionKey} uses an unknown priority`,
      );
    }
    if (risk.isPublished && risk.sources.length === 0) {
      errors.push(
        `Published risk ${risk.breedKey}/${risk.conditionKey} has no sources`,
      );
    }

    risk.sources.forEach((riskSource, sourceIndex) => {
      const pointer = `${risk.breedKey}/${risk.conditionKey}/source-${sourceIndex + 1}`;
      if (!sourceTypes.has(riskSource.sourceType)) {
        errors.push(`${pointer} uses an unknown source type`);
      }
      if (!riskSource.sourceName.trim() || riskSource.sourceName.length > 120) {
        errors.push(
          `${pointer} sourceName is required and must fit database limits`,
        );
      }
      if (!riskSource.title.trim() || riskSource.title.length > 240) {
        errors.push(
          `${pointer} title is required and must fit database limits`,
        );
      }
      if (riskSource.publisher && riskSource.publisher.length > 160) {
        errors.push(`${pointer} publisher must fit database limits`);
      }
      if (Number.isNaN(new Date(riskSource.accessedAt).getTime())) {
        errors.push(`${pointer} accessedAt must be an ISO date`);
      }

      try {
        const parsedUrl = new URL(riskSource.url);
        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
          errors.push(`${pointer} URL must use HTTP or HTTPS`);
        }
      } catch {
        errors.push(`${pointer} URL is not valid`);
      }
    });
  });

  return errors;
}

export function buildBreedHealthRiskImportPlan(
  fixtureSet: BreedHealthRiskFixtureSet,
  availableBreeds: AvailableBreed[],
): BreedHealthRiskImportPlan {
  const breedByLookup = new Map<string, AvailableBreed>();

  availableBreeds.forEach((breed) => {
    [breed.name, ...(breed.aliases ?? [])].forEach((name) => {
      const normalized = normalizeBreedLookup(name);
      if (normalized && !breedByLookup.has(normalized)) {
        breedByLookup.set(normalized, breed);
      }
    });
  });

  const conditionsByKey = new Map(
    fixtureSet.conditions.map((condition) => [condition.key, condition]),
  );
  const risks: PlannedBreedHealthRisk[] = [];
  const missingBreeds: BreedHealthRiskImportPlan['missingBreeds'] = [];

  fixtureSet.risks.forEach((risk) => {
    const breed = risk.breedNames
      .map((name) => breedByLookup.get(normalizeBreedLookup(name)))
      .find((candidate): candidate is AvailableBreed => Boolean(candidate));
    const condition = conditionsByKey.get(risk.conditionKey);

    if (!breed) {
      missingBreeds.push({
        breedKey: risk.breedKey,
        breedNames: risk.breedNames,
      });
      return;
    }

    if (!condition) {
      return;
    }

    risks.push({
      ...risk,
      id: buildBreedHealthRiskId(risk.breedKey, risk.conditionKey),
      breedId: breed.id,
      conditionId: condition.id,
    });
  });

  return {
    conditions: fixtureSet.conditions,
    risks,
    sources: risks.reduce((total, risk) => total + risk.sources.length, 0),
    missingBreeds,
  };
}

export function buildBreedHealthRiskId(
  breedKey: string,
  conditionKey: string,
): string {
  return `breed-health-risk-${breedKey}-${conditionKey}`;
}

export function isLocalDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) {
    return true;
  }

  try {
    const parsed = new URL(databaseUrl);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolveBreedHealthRiskDatabaseUrl(
  databaseUrl: string | undefined,
): string {
  return databaseUrl || DEFAULT_LOCAL_DATABASE_URL;
}

export function assertBreedHealthRiskImportTarget(input: {
  shouldApply: boolean;
  allowRemote: boolean;
  databaseUrl: string | undefined;
}) {
  if (
    !input.shouldApply ||
    input.allowRemote ||
    isLocalDatabaseUrl(input.databaseUrl)
  ) {
    return;
  }

  throw new Error(
    'Refusing to apply breed health risk data to a non-local database. Re-run with --allow-remote only after reviewed data is approved for production migration.',
  );
}
