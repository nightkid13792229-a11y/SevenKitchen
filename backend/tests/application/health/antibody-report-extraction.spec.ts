/**
 * 抗体检测报告识别（AI）· 2026-10-19（第五类）
 *
 * 背景：疫苗板块的「抗体检测」此前**只有手填**。老板要"上传抗体检测报告 → AI 自动填表"，
 * 家长仍然可以手动纠正，所以这条路和另外四类一样，只产出**草稿**、绝不写库。
 *
 * 这组测试锁四件老板定过的事（都是"错了会害到狗"的口径）：
 *   ① **报告只有数值、没有结论 → result 必须是 UNKNOWN**
 *      —— 我们不设阈值，**绝不许系统按数值自己判合格**（判错的代价是家长以为狗有保护力）；
 *   ② 检的是哪一项**单选**：狂犬抗体报告 → targets: ['RABIES']；两项都有时取 CORE；
 *   ③ 日期读不出就留空字符串（testedAt: ''），不许编；
 *   ④ 明显不是抗体检测报告的那张纸 → documentType: 'NOT_MEDICAL'、drafts 空、说清原因。
 *
 * 另外锁住对外契约的形状（前端已按它写）：drafts 里**只有一条**，
 * 键正好是 testedAt / targets / result / value / unit / notes 这六个。
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  HEALTH_REPORT_OCR_PROVIDER,
  HEALTH_DOCUMENT_TYPES,
  HealthReportExtractionService,
  buildSystemPrompt,
  filterContradictoryWarnings,
  normalizeDocumentType,
  normalizeDrafts,
  resolveAntibodyResult,
  resolveAntibodyTargets,
  resolveAutoDocumentType,
} from 'src/application/health/health-report-extraction.service';
import { AgentProviderConfigService } from 'src/application/nutrition-governance/agent-provider-config.service';

const okJsonResponse = (payload: Record<string, unknown>) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  }),
});

/** 抗体草稿的对外契约字段（多一个少一个都算违约） */
const DRAFT_KEYS = ['notes', 'result', 'targets', 'testedAt', 'unit', 'value'];

describe('抗体检测报告识别（第五类）', () => {
  let service: HealthReportExtractionService;
  let ocrProvider: { recognizeImage: jest.Mock };
  let agentConfig: {
    getEnabledDeepSeekRuntimeConfig: jest.Mock;
    getConfiguredPurposeModel: jest.Mock;
  };

  // 这组走「OCR 认字 → 文本模型整理」那条路（与既有的四类用例一致）；
  // 视觉直读那条路只是开场白不同，字段结构共用同一份常量（下面单独锁）。
  const originalVision = process.env.HEALTH_REPORT_VISION;

  beforeEach(async () => {
    process.env.HEALTH_REPORT_VISION = 'off';
    ocrProvider = { recognizeImage: jest.fn() };
    agentConfig = {
      getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        reviewModel: 'deepseek-v4-pro',
        apiKey: 'test-key',
        maxConcurrency: 1,
        requestTimeoutMs: 5000,
        retryCount: 0,
      }),
      getConfiguredPurposeModel: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthReportExtractionService,
        { provide: HEALTH_REPORT_OCR_PROVIDER, useValue: ocrProvider },
        { provide: AgentProviderConfigService, useValue: agentConfig },
      ],
    }).compile();

    service = module.get(HealthReportExtractionService);
    jest.restoreAllMocks();
  });

  afterEach(() => {
    if (originalVision === undefined) delete process.env.HEALTH_REPORT_VISION;
    else process.env.HEALTH_REPORT_VISION = originalVision;
  });

  const setFetchResponse = (payload: Record<string, unknown>) => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(okJsonResponse(payload)) as unknown as typeof fetch;
  };

  /** 走一次"显式指定抗体报告"的完整识别（前端就是按这个契约调的） */
  const extractAntibody = async (payload: Record<string, unknown>) => {
    ocrProvider.recognizeImage.mockResolvedValue({ text: '犬抗体检测报告…' });
    setFetchResponse(payload);
    return service.extractFromReport({
      imageUrl: 'https://cdn/antibody.jpg',
      documentType: 'ANTIBODY_REPORT',
    });
  };

  describe('文档类型（白名单加第五类，兜底一个字没动）', () => {
    it('白名单认它，大小写与空格都容错', () => {
      expect(HEALTH_DOCUMENT_TYPES).toContain('ANTIBODY_REPORT');
      expect(normalizeDocumentType('ANTIBODY_REPORT')).toBe('ANTIBODY_REPORT');
      expect(normalizeDocumentType(' antibody_report ')).toBe('ANTIBODY_REPORT');
    });

    it('兜底默认值仍然是老行为（传不认识的值 / 不传 → 过敏报告；AUTO 兜底病历）', () => {
      // ⚠️ 加第五类时这两条**都不许动** —— 线上跑了很久的行为
      expect(normalizeDocumentType('随便传的')).toBe('ALLERGY_REPORT');
      expect(normalizeDocumentType(undefined)).toBe('ALLERGY_REPORT');
      expect(resolveAutoDocumentType('UNKNOWN')).toBe('MEDICAL_RECORD');
      expect(resolveAutoDocumentType(undefined)).toBe('MEDICAL_RECORD');
    });

    it('AUTO 也认得它（就诊/体检入口共用 AUTO）', () => {
      expect(resolveAutoDocumentType('antIBody_report')).toBe('ANTIBODY_REPORT');
    });
  });

  describe('提示词口径（写给模型看的那几条）', () => {
    it('说清这是什么纸、要抄哪四样', () => {
      const prompt = buildSystemPrompt('ANTIBODY_REPORT');

      expect(prompt).toContain('犬抗体检测报告');
      expect(prompt).toContain('抗体滴度');
      expect(prompt).toContain('检测日期、检的是哪一项、结果、原始数值与单位');
    });

    it('两项都有时取"与狂犬无关的那一项"，并让家长知道另一项要单独传', () => {
      const prompt = buildSystemPrompt('ANTIBODY_REPORT');

      expect(prompt).toContain('CORE');
      expect(prompt).toContain('RABIES');
      expect(prompt).toContain('取与狂犬无关的那一项');
      expect(prompt).toContain('狂犬那一项请单独再传一次');
    });

    it('⚠️ 明令禁止按数值判合格（我们不设阈值，老板定的）', () => {
      const prompt = buildSystemPrompt('ANTIBODY_REPORT');

      expect(prompt).toContain('不设阈值');
      expect(prompt).toContain('没有写结论时，一律填 UNKNOWN');
      expect(prompt).toContain('绝对不许自己按数值判');
      // 判定的两个方向都要照抄报告自己的字
      expect(prompt).toContain('有保护力');
      expect(prompt).toContain('无保护力');
    });

    it('日期读不出留空、不许编；不是这张纸就填 NOT_MEDICAL', () => {
      const prompt = buildSystemPrompt('ANTIBODY_REPORT');

      expect(prompt).toContain('不要编');
      expect(prompt).toContain('NOT_MEDICAL');
      expect(prompt).toContain('drafts 留空数组');
    });

    it('看图版只是开场白不同，字段结构与文本版共用同一份', () => {
      const imagePrompt = buildSystemPrompt('ANTIBODY_REPORT', 'image');
      const ocrPrompt = buildSystemPrompt('ANTIBODY_REPORT');

      expect(imagePrompt).toContain('自己看图');
      expect(ocrPrompt).toContain('识别文字');
      for (const prompt of [imagePrompt, ocrPrompt]) {
        expect(prompt).toContain('testedAt');
        expect(prompt).toContain('targets');
        expect(prompt).toContain('NOT_MEDICAL');
      }
    });

    it('AUTO 提示词里点名了它，并说清它≠疫苗本', () => {
      const auto = buildSystemPrompt('AUTO');
      const explicit = buildSystemPrompt('ANTIBODY_REPORT');

      expect(auto).toContain('ANTIBODY_REPORT');
      expect(auto).toContain('抗体滴度');
      expect(auto).toContain('它不是疫苗本');
      expect(auto).toContain('永远只输出一条');
      // AUTO 里嵌的字段结构必须是显式类型那一套（防止两边日后走样）
      expect(auto).toContain(explicit.slice(explicit.indexOf('本类型的额外规则：')));
    });
  });

  describe('草稿映射：只照抄，不判读', () => {
    it('报告只给数值没有结论 → UNKNOWN（绝不许被"合格"）', () => {
      const drafts = normalizeDrafts('ANTIBODY_REPORT', {
        drafts: [{ testedAt: '2026-03-12', targets: ['CORE'], value: '1:80', unit: '滴度' }],
      });

      expect(drafts).toHaveLength(1);
      expect(drafts[0].result).toBe('UNKNOWN');
      // 数值本身照抄，不做任何换算或分档
      expect(drafts[0].value).toBe('1:80');
      expect(drafts[0].unit).toBe('滴度');
    });

    it('模型把数值塞进 result 也不认（数值不认识"合格"这个词）', () => {
      const drafts = normalizeDrafts('ANTIBODY_REPORT', {
        drafts: [{ testedAt: '2026-03-12', targets: ['CORE'], result: '1:80', value: '1:80' }],
      });

      expect(drafts[0].result).toBe('UNKNOWN');
    });

    it('报告写了结论就照抄（中英文写法都认）', () => {
      expect(resolveAntibodyResult('PASS')).toBe('PASS');
      expect(resolveAntibodyResult('有保护力')).toBe('PASS');
      expect(resolveAntibodyResult('达到标准')).toBe('PASS');
      expect(resolveAntibodyResult('阳性')).toBe('PASS');
      expect(resolveAntibodyResult('FAIL')).toBe('FAIL');
      expect(resolveAntibodyResult('无保护力')).toBe('FAIL');
      expect(resolveAntibodyResult('未达标')).toBe('FAIL');
      expect(resolveAntibodyResult('阴性')).toBe('FAIL');
      // 长句里先判"不合格"——顺序反了会把不合格读成合格（最危险的一类错）
      expect(resolveAntibodyResult('抗体不合格')).toBe('FAIL');
      expect(resolveAntibodyResult('抗体合格')).toBe('PASS');
      // 报告没写 / 认不出来 → UNKNOWN
      expect(resolveAntibodyResult('')).toBe('UNKNOWN');
      expect(resolveAntibodyResult(undefined)).toBe('UNKNOWN');
      expect(resolveAntibodyResult('S3')).toBe('UNKNOWN');
    });

    it('检的是哪一项：只留一项，两项都有时取 CORE 并标记', () => {
      expect(resolveAntibodyTargets(['CORE']).targets).toEqual(['CORE']);
      expect(resolveAntibodyTargets('RABIES').targets).toEqual(['RABIES']);
      // 报告上写的是中文项目名
      expect(resolveAntibodyTargets('犬瘟、细小、腺病毒').targets).toEqual(['CORE']);
      expect(resolveAntibodyTargets('狂犬抗体滴度').targets).toEqual(['RABIES']);
      // 一张纸上两项都有 → 取与狂犬无关的那一项
      const both = resolveAntibodyTargets(['CORE', 'RABIES']);
      expect(both.targets).toEqual(['CORE']);
      expect(both.ambiguous).toBe(true);
      // 都认不出来 → 空数组（界面留空让家长自己选，不猜）
      expect(resolveAntibodyTargets('看不懂').targets).toEqual([]);
    });

    it('模型把 targets 写成单数 target 也接得住', () => {
      const drafts = normalizeDrafts('ANTIBODY_REPORT', {
        drafts: [{ testedAt: '2026-03-12', target: 'RABIES', result: '合格' }],
      });

      expect(drafts[0].targets).toEqual(['RABIES']);
      expect(drafts[0].result).toBe('PASS');
    });

    it('日期读不出就留空字符串（不编、不拿别的日期顶上）', () => {
      // ⚠️ 一份报告只有一条，所以这里逐张纸各试一次
      const testedAtOf = (value: unknown) =>
        normalizeDrafts('ANTIBODY_REPORT', {
          drafts: [{ testedAt: value, targets: ['CORE'], value: '1:80' }],
        })[0]?.testedAt;

      expect(testedAtOf('看不清')).toBe('');
      expect(testedAtOf(undefined)).toBe('');
      expect(testedAtOf('2026-13-45')).toBe('');
      // 读得出来的照旧认
      expect(testedAtOf('2026-03-12')).toBe('2026-03-12');
    });

    it('一份报告只出一条；白名单外的字段一律丢掉', () => {
      const drafts = normalizeDrafts('ANTIBODY_REPORT', {
        drafts: [
          {
            testedAt: '2026-03-12',
            targets: ['CORE'],
            result: 'UNKNOWN',
            value: '1:80',
            unit: '滴度',
            notes: '',
            // 模型串进来的字段不该出现在抗体草稿里
            allergen: '鸡肉',
            diagnosis: '急性胃炎',
          },
          { testedAt: '2026-04-01', targets: ['RABIES'] },
        ],
      });

      expect(drafts).toHaveLength(1);
      expect(Object.keys(drafts[0]).sort()).toEqual(DRAFT_KEYS);
    });

    it('三个关键字段全空的那一条丢掉（交给"未识别到可用内容"那句）', () => {
      expect(normalizeDrafts('ANTIBODY_REPORT', { drafts: [{}] })).toEqual([]);
      // 只读到日期也算有内容（其余让家长补）
      expect(
        normalizeDrafts('ANTIBODY_REPORT', { drafts: [{ testedAt: '2026-03-12' }] }),
      ).toHaveLength(1);
    });
  });

  describe('extractFromReport：对外契约（前端已按它写）', () => {
    it('一份只给数值的报告 → result: UNKNOWN，形状与契约一致', async () => {
      const result = await extractAntibody({
        drafts: [
          {
            testedAt: '2026-03-12',
            targets: ['CORE'],
            // 报告上只有这一行数值，没有写任何结论
            value: '1:80',
            unit: '滴度',
          },
        ],
        warnings: [],
      });

      expect(result.documentType).toBe('ANTIBODY_REPORT');
      expect(result.drafts).toHaveLength(1);
      expect(result.drafts[0]).toEqual({
        testedAt: '2026-03-12',
        targets: ['CORE'],
        result: 'UNKNOWN',
        value: '1:80',
        unit: '滴度',
        notes: '',
      });
      expect(Object.keys(result.drafts[0]).sort()).toEqual(DRAFT_KEYS);
      // 抗体报告没有这两栏，契约里就是空数组
      expect(result.allergies).toEqual([]);
      expect(result.medicalConditions).toEqual([]);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('狂犬抗体报告 → targets: [\'RABIES\']', async () => {
      const result = await extractAntibody({
        drafts: [
          {
            testedAt: '2026-05-08',
            targets: ['RABIES'],
            result: '合格',
            value: '0.5 IU/ml',
          },
        ],
        warnings: [],
      });

      expect(result.documentType).toBe('ANTIBODY_REPORT');
      expect(result.drafts[0].targets).toEqual(['RABIES']);
      expect(result.drafts[0].result).toBe('PASS');
      expect(result.drafts[0].value).toBe('0.5 IU/ml');
    });

    it('一张纸上两项都有 → 只录核心那一项，并提醒狂犬要单独再传', async () => {
      const result = await extractAntibody({
        drafts: [{ testedAt: '2026-05-08', targets: ['CORE', 'RABIES'], result: '合格' }],
        warnings: [],
      });

      expect(result.drafts).toHaveLength(1);
      expect(result.drafts[0].targets).toEqual(['CORE']);
      expect(result.warnings.join('')).toContain('狂犬那一项请单独再传一次');
    });

    it('模型自己已经说过这件事时不重复提醒（同一句话不说两遍）', async () => {
      const said =
        '这张报告上核心抗体与狂犬抗体都有，先按核心那一项录入，狂犬那一项请单独再传一次';
      const result = await extractAntibody({
        drafts: [{ testedAt: '2026-05-08', targets: ['CORE', 'RABIES'] }],
        warnings: [said],
      });

      expect(result.warnings.filter((warning) => warning === said)).toHaveLength(1);
      expect(
        result.warnings.filter((warning) => warning.includes('单独再传')),
      ).toHaveLength(1);
    });

    it('只是"狂犬那一行看不清"这种提示，不算说过 —— 该补的两项提示照样补', async () => {
      const result = await extractAntibody({
        drafts: [{ testedAt: '2026-05-08', targets: ['CORE', 'RABIES'] }],
        warnings: ['狂犬抗体那一行的数值被印章压住，未能确认'],
      });

      expect(result.warnings.join('')).toContain('狂犬那一项请单独再传一次');
    });

    it('日期读不出 → testedAt: \'\'（不编日期）', async () => {
      const result = await extractAntibody({
        drafts: [
          { testedAt: '被印章压住看不清', targets: ['CORE'], result: 'UNKNOWN', value: '1:80' },
        ],
        warnings: ['检测日期那一行被印章压住，未能确认'],
      });

      expect(result.drafts[0].testedAt).toBe('');
      expect(result.drafts[0].value).toBe('1:80');
    });

    it('明显不是抗体检测报告的那张纸 → NOT_MEDICAL，drafts 空，说清"不是什么"', async () => {
      const result = await extractAntibody({
        documentType: 'NOT_MEDICAL',
        drafts: [],
        warnings: [],
      });

      expect(result.documentType).toBe('NOT_MEDICAL');
      expect(result.drafts).toEqual([]);
      expect(result.allergies).toEqual([]);
      expect(result.medicalConditions).toEqual([]);
      // 关键：不能只说"照片不清楚"——照片很清楚，只是不是这类资料
      expect(result.warnings[0]).toContain('不是抗体检测报告');
      expect(result.warnings[0]).not.toContain('未识别到可用内容');
    });

    it('AUTO 判断为抗体检测报告时，按抗体字段归一化（不串成病历）', async () => {
      ocrProvider.recognizeImage.mockResolvedValue({ text: '犬抗体检测报告…' });
      setFetchResponse({
        documentType: 'ANTIBODY_REPORT',
        drafts: [
          {
            testedAt: '2026-03-12',
            targets: ['狂犬'],
            result: '无保护力',
            value: '1:4',
            // 模型串字段时不得混进抗体草稿
            chiefComplaint: '呕吐两次',
            allergen: '鸡肉',
          },
        ],
        warnings: [],
      });

      const result = await service.extractFromReport({
        imageUrl: 'https://cdn/antibody.jpg',
        documentType: 'AUTO',
      });

      expect(result.documentType).toBe('ANTIBODY_REPORT');
      expect(result.drafts[0]).toMatchObject({
        testedAt: '2026-03-12',
        targets: ['RABIES'],
        result: 'FAIL',
        value: '1:4',
      });
      expect(Object.keys(result.drafts[0]).sort()).toEqual(DRAFT_KEYS);
      expect(result.allergies).toEqual([]);
      expect(result.medicalConditions).toEqual([]);
    });
  });

  describe('提示不许和已抄到的内容打架（出口再拦一道）', () => {
    it('抄到了检测日期，就不再显示"日期未显示"', () => {
      expect(
        filterContradictoryWarnings(['检测日期未在图中显示'], {
          testedAt: '2026-03-12',
        }),
      ).toEqual([]);
    });

    it('抄到了抗体数值，就不再显示"数值未读到"', () => {
      expect(
        filterContradictoryWarnings(['抗体数值未在图中显示'], { value: '1:80' }),
      ).toEqual([]);
    });

    it('字段真的是空的时，提示照旧保留', () => {
      const warnings = ['检测日期被印章压住，未能确认'];
      expect(filterContradictoryWarnings(warnings, { testedAt: '' })).toEqual(warnings);
    });
  });
});
