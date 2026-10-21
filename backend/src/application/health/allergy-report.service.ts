import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AllergyTestMethod } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { AllergenVocabularyService } from './allergen-vocabulary.service';

/**
 * 过敏检测报告（2026-10-04，过敏重构第二期）
 *
 * 老板第 1 条要求："可以记录自己狗狗的过敏检查报告，
 * 特别是报告中**有哪些需要注意的、可疑的**过敏原食物"。
 *
 * ── 改造前的问题 ────────────────────────────────────────────
 *
 *   系统里没有"报告"这个概念，只有 allergy_record 一行行散装的过敏原：
 *     · 一份写了 12 项结果的报告存进来 = 12 条互不相干的记录
 *     · 记录里没有检测日期，健康时间线只能拿"录入时间"冒充
 *     · 顾客上传的报告原件**传完就丢**（识别完附件填空数组）
 *
 * ── 这一期做什么 ────────────────────────────────────────────
 *
 *   · 报告成为实体：检测日期 / 方式 / 机构 / 原件 / 识别原文
 *   · 每条过敏原结论挂在报告下面（allergy_record.reportId）
 *   · 报告原件留住，顾客随时能翻出来给医生看
 *
 * ── 一条安全边界 ────────────────────────────────────────────
 *
 *   检测方式**照抄报告上写的**，系统不做"这个结果可不可信"的判断。
 *   知识库 skin-003 确实说了血清 IgE / 皮试对食物不良反应不能确诊，
 *   但那是**给顾客看的引导文案**该说的话，不是系统替顾客否定他的报告。
 */

/** 报告结论的等级，照抄报告原文的语义，不做医学判断 */
export type AllergyResultLevel =
  | 'STRONG_POSITIVE'
  | 'POSITIVE'
  | 'WEAK_POSITIVE'
  | 'SUSPECTED'
  | 'NEGATIVE'
  | 'UNKNOWN';

export interface AllergyReportInput {
  testDate?: string | null;
  testMethod?: string | null;
  institution?: string | null;
  summary?: string | null;
  ocrText?: string | null;
  attachments?: string[];
  /** 该报告得出的过敏原结论 */
  results?: Array<{
    allergen: string;
    level?: string | null;
    notes?: string | null;
  }>;
}

const TEST_METHODS = new Set([
  'SERUM',
  'INTRADERMAL',
  'ELIMINATION',
  'OTHER',
  'UNKNOWN',
]);

/**
 * 结论等级的**唯一来源**（2026-10-05）。
 *
 * DTO 的 @IsIn 与这里的归一化共用这一份 —— 曾经两处各写一份，
 * 识别侧加了 STRONG_POSITIVE 而 DTO 没跟上，带强阳性的报告保存时直接 400。
 */
export const ALLERGY_RESULT_LEVELS = [
  'STRONG_POSITIVE',
  'POSITIVE',
  'WEAK_POSITIVE',
  'SUSPECTED',
  'NEGATIVE',
  'UNKNOWN',
] as const;

const LEVELS = new Set<string>(ALLERGY_RESULT_LEVELS);

/**
 * 报告结论等级 → 过敏记录可信度。
 *
 * 这是本次改造里**唯一一处把报告结论翻译成系统判断**的地方，
 * 规则保守且可解释：
 *   · 明确阳性 / **强阳性** → 确诊（会被食谱彻底避开）
 *   · 弱阳性/疑似 → 可疑（保留但重罚并标注）
 *   · 阴性       → **不生成过敏记录**（阴性本来就不该记成"过敏"）
 *   · 没写等级   → 可疑（不知道就当可疑，宁可多避）
 *
 * 2026-10-05：强阳性与阳性在可信度上是同一档（都是确诊），
 * 分开只是为了给家长看清楚哪几条最要紧。
 */
export function mapLevelToCertainty(
  level: string | null | undefined,
): 'CONFIRMED' | 'SUSPECTED' {
  const key = String(level || '').toUpperCase();
  return key === 'POSITIVE' || key === 'STRONG_POSITIVE'
    ? 'CONFIRMED'
    : 'SUSPECTED';
}

/** 阴性结论不该被记成"过敏" —— 它恰恰说明不过敏 */
export function isNegativeLevel(level: string | null | undefined): boolean {
  return String(level || '').toUpperCase() === 'NEGATIVE';
}

export function normalizeTestMethod(value: unknown): AllergyTestMethod {
  const key = String(value || '').trim().toUpperCase();
  return (TEST_METHODS.has(key) ? key : 'UNKNOWN') as AllergyTestMethod;
}

export function normalizeLevel(value: unknown): AllergyResultLevel {
  const key = String(value || '').trim().toUpperCase();
  return (LEVELS.has(key) ? key : 'UNKNOWN') as AllergyResultLevel;
}

@Injectable()
export class AllergyReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly allergenVocabulary: AllergenVocabularyService,
    private readonly cosService: TencentCosService,
  ) {}

  /** 报告列表（含每份报告的结论条数），按检测日期倒序 */
  async list(customerId: string, dogId: string) {
    await this.requireOwnedDog(customerId, dogId);

    const reports = await this.prisma.allergyReport.findMany({
      where: { dogId },
      orderBy: [{ testDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        results: {
          select: {
            id: true,
            allergen: true,
            certainty: true,
            notes: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      dogId,
      total: reports.length,
      reports: await Promise.all(
        reports.map(async (report) => ({
          id: report.id,
          testDate: toDateText(report.testDate),
          testMethod: report.testMethod,
          institution: report.institution,
          summary: report.summary,
          attachments: await this.signAttachments(
            report.attachments ?? [],
            report.sourceKey,
          ),
          resultCount: report.results.length,
          results: report.results,
          createdAt: report.createdAt.toISOString(),
        })),
      ),
    };
  }

  /** 单份报告详情 */
  async getOne(customerId: string, dogId: string, reportId: string) {
    await this.requireOwnedDog(customerId, dogId);

    const report = await this.prisma.allergyReport.findFirst({
      where: { id: reportId, dogId },
      include: { results: { orderBy: { createdAt: 'asc' } } },
    });
    if (!report) {
      throw new NotFoundException('检测报告不存在');
    }

    return {
      ...report,
      attachments: await this.signAttachments(
        report.attachments ?? [],
        report.sourceKey,
      ),
    };
  }

  private attachmentKey(url: string): string {
    if (typeof (this.cosService as any).extractKey === 'function') {
      return this.cosService.extractKey(url);
    }
    try {
      return new URL(url).pathname.replace(/^\/+/, '');
    } catch {
      return String(url || '').replace(/^\/+/, '');
    }
  }

  /**
   * 报告附件 → 可重新签发的短时 URL。
   *
   * 2026-10-21 修：历史报告（付款后由订单草稿转正式报告）曾经把**媒体代理 URL**
   * 存进 `attachments`。代理 token 只存在于当前后端进程，服务重启/过期后
   * 旧 URL 必然 404；但报告张数仍从数组长度来，于是出现“显示 2 个附件、
   * 预览全是空白”。现在：
   *   · 新写入的附件优先生成 COS key；
   *   · 历史行如果还有 sourceKey（`订单主键:草稿序号`），从订单草稿的
   *     `attachmentKeys` 取回原始 key 再签发，不依赖已失效的 token；
   *   · 实在找不到 key 才退回原 URL（旧公开 URL 仍能直接打开）。
   */
  private async signAttachments(
    urls: string[],
    sourceKey?: string | null,
  ): Promise<string[]> {
    const legacyKeys = await this.resolveSourceAttachmentKeys(sourceKey);
    const values = legacyKeys.length > 0 ? legacyKeys : urls;
    if (typeof (this.cosService as any).getSensitiveMediaUrl !== 'function') {
      return values;
    }
    return (values || []).map(
      (url) => this.cosService.getSensitiveMediaUrl(url) || url,
    );
  }

  /** 从付款时留下的订单草稿里恢复原始 COS key（历史报告修复用） */
  private async resolveSourceAttachmentKeys(
    sourceKey?: string | null,
  ): Promise<string[]> {
    if (!sourceKey) return [];
    const [orderId, indexText] = String(sourceKey).split(':');
    const index = Number(indexText);
    if (!orderId || !Number.isInteger(index) || index < 0) return [];

    const order = await this.prisma.customRecipeOrder.findUnique({
      where: { id: orderId },
      select: { allergyReportDrafts: true },
    });
    const drafts = Array.isArray(order?.allergyReportDrafts)
      ? order!.allergyReportDrafts
      : [];
    const draft = drafts[index] as any;
    const keys = Array.isArray(draft?.attachmentKeys)
      ? draft.attachmentKeys
          .map((item: unknown) => String(item || '').trim())
          .filter(Boolean)
      : [];
    return keys;
  }

  /**
   * 新建/修改报告时把代理 URL 换成 COS key。
   *
   * 代理 token 还活着时 extractKey 能还原 key；这样下次读取可以重新签发。
   * 非代理 URL（旧公开 COS 地址、已是 key）原样保留。
   */
  private normalizeAttachmentStorage(urls: string[]): string[] {
    return (urls || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .map((url) => {
        if (!url.includes('/api/v1/media/sensitive/')) return url;
        const key = this.attachmentKey(url);
        return key || url;
      });
  }

  /**
   * 新建一份报告 + 它的结论。
   *
   * 过敏原结论会做**词表归一**：报告上写"鸡胸肉"，存成词表标准名"鸡肉"，
   * 这样它才能和原料库里的食材对上（否则避雷又会失效）。
   * 词表里没有的词原样保留 —— 顾客会写"鸵鸟肉"这种库里没有的东西。
   */
  async create(customerId: string, dogId: string, input: AllergyReportInput) {
    await this.requireOwnedDog(customerId, dogId);

    const results = normalizeResults(input.results);
    const vocabulary = await this.allergenVocabulary.getVocabulary();

    const created = await this.prisma.$transaction(async (tx) => {
      const report = await tx.allergyReport.create({
        data: {
          dogId,
          testDate: parseDate(input.testDate),
          testMethod: normalizeTestMethod(input.testMethod),
          institution: trimTo(input.institution, 120),
          summary: trimTo(input.summary, 2000),
          ocrText: trimTo(input.ocrText, 20000),
          attachments: this.normalizeAttachmentStorage(
            normalizeStringArray(input.attachments),
          ),
        },
      });

      for (const result of results) {
        // 阴性不记成"过敏" —— 它恰恰说明不过敏
        if (isNegativeLevel(result.level)) {
          continue;
        }

        const canonical = canonicalizeAllergen(result.allergen, vocabulary);

        const existing = await tx.allergyRecord.findUnique({
          where: { dogId_allergen: { dogId, allergen: canonical } },
        });

        if (existing) {
          // 已有同名记录：升级可信度、补上报告来源，**不覆盖顾客自己的备注**
          await tx.allergyRecord.update({
            where: { id: existing.id },
            data: {
              certainty: mergeCertainty(existing.certainty, result.level),
              reportId: existing.reportId ?? report.id,
              source: existing.source === 'OWNER' ? 'REPORT' : existing.source,
            },
          });
          continue;
        }

        await tx.allergyRecord.create({
          data: {
            dogId,
            allergen: canonical,
            notes: result.notes,
            certainty: mapLevelToCertainty(result.level),
            source: 'REPORT',
            reportId: report.id,
          },
        });
      }

      return report;
    });

    return this.getOne(customerId, dogId, created.id);
  }

  /** 修改报告（含结论的增删改） */
  async update(
    customerId: string,
    dogId: string,
    reportId: string,
    input: AllergyReportInput,
  ) {
    await this.requireOwnedDog(customerId, dogId);

    const report = await this.prisma.allergyReport.findFirst({
      where: { id: reportId, dogId },
    });
    if (!report) {
      throw new NotFoundException('检测报告不存在');
    }

    const previousAttachments = report.attachments ?? [];
    const nextAttachments =
      input.attachments === undefined
        ? previousAttachments
        : normalizeStringArray(input.attachments);

    await this.prisma.allergyReport.update({
      where: { id: reportId },
      data: {
        testDate:
          input.testDate === undefined ? undefined : parseDate(input.testDate),
        testMethod:
          input.testMethod === undefined
            ? undefined
            : normalizeTestMethod(input.testMethod),
        institution:
          input.institution === undefined
            ? undefined
            : trimTo(input.institution, 120),
        summary:
          input.summary === undefined ? undefined : trimTo(input.summary, 2000),
        ocrText:
          input.ocrText === undefined ? undefined : trimTo(input.ocrText, 20000),
        attachments:
          input.attachments === undefined
            ? undefined
            : this.normalizeAttachmentStorage(nextAttachments),
      },
    });

    // 2026-10-19：从报告里移除的附件，COS 文件也删掉，不留孤儿文件。
    // 只删真正被移除的；删除失败只记日志，不挡顾客修改报告。
    /**
     * 签名 URL 每次都不同，不能按整串 URL 比较（2026-10-19 P0）。
     * 统一按 COS key 判断“哪些被移除”，避免误删所有附件。
     */
    const nextKeys = new Set(
      nextAttachments.map((url) => this.attachmentKey(url)),
    );
    const removedAttachments = previousAttachments.filter(
      (url) => !nextKeys.has(this.attachmentKey(url)),
    );
    await this.deleteAttachmentObjects(removedAttachments);

    return this.getOne(customerId, dogId, reportId);
  }

  /**
   * 删除报告。
   *
   * ⚠️ **不级联删除过敏记录**。
   * 报告是"依据"，过敏记录是"结论" —— 依据没了，结论仍然成立
   * （顾客已经知道狗对鸡肉过敏了）。把结论一起删掉等于
   * "删掉一张纸，狗就不过敏了"，这在医疗信息里是不可接受的。
   * 记录上的 reportId 由外键 ON DELETE SET NULL 置空。
   */
  async remove(customerId: string, dogId: string, reportId: string) {
    await this.requireOwnedDog(customerId, dogId);

    const report = await this.prisma.allergyReport.findFirst({
      where: { id: reportId, dogId },
    });
    if (!report) {
      throw new NotFoundException('检测报告不存在');
    }

    await this.prisma.allergyReport.delete({ where: { id: reportId } });

    // 2026-10-19：报告删除后，原件不再有任何引用，COS 文件一起清理。
    // 过敏结论仍保留（依据没了，结论仍成立）；文件删除失败只记日志。
    await this.deleteAttachmentObjects(report.attachments ?? []);

    return { deleted: true, keptAllergyRecords: true };
  }

  /**
   * 这份结果涉及的过敏原在原料库里会命中哪些食材。
   *
   * 给界面用："报告说对鸡肉阳性" → "那我们家 6 种食材都要避开"。
   * 顾客看到这条才会觉得报告真的被用上了。
   */
  async describeImpact(customerId: string, dogId: string, reportId: string) {
    await this.requireOwnedDog(customerId, dogId);

    const report = await this.prisma.allergyReport.findFirst({
      where: { id: reportId, dogId },
      include: { results: { select: { allergen: true } } },
    });
    if (!report) {
      throw new NotFoundException('检测报告不存在');
    }

    const profile = await this.allergenVocabulary.getDogAllergenProfile(dogId);

    return {
      reportId,
      allergens: report.results.map((result) => result.allergen),
      avoidedIngredientNames: profile.avoidedIngredientNames,
    };
  }

  /** 删除报告附件对应的 COS 文件（best-effort） */
  private async deleteAttachmentObjects(urls: string[]) {
    for (const url of urls) {
      const value = String(url || '').trim();
      if (!value) continue;
      await this.cosService.deleteImageByUrl(value).catch((error: any) => {
        console.error(
          '[AllergyReport] 删除 COS 附件失败:',
          value,
          error?.message ?? error,
        );
      });
    }
  }

  private async requireOwnedDog(customerId: string, dogId: string) {
    const dog = await this.prisma.dog.findUnique({ where: { id: dogId } });
    if (!dog) {
      throw new NotFoundException('Dog not found');
    }
    if (dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied');
    }
    return dog;
  }
}

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

export function normalizeResults(
  value: unknown,
): Array<{ allergen: string; level: AllergyResultLevel; notes: string | null }> {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const results: Array<{
    allergen: string;
    level: AllergyResultLevel;
    notes: string | null;
  }> = [];

  for (const item of value) {
    const allergen = String((item as { allergen?: unknown })?.allergen ?? '')
      .trim()
      .slice(0, 40);
    if (!allergen || seen.has(allergen)) continue;
    seen.add(allergen);

    results.push({
      allergen,
      level: normalizeLevel((item as { level?: unknown })?.level),
      notes: trimTo((item as { notes?: unknown })?.notes, 200),
    });
  }

  if (results.length > 60) {
    throw new BadRequestException('一份报告最多记录 60 项过敏原结论');
  }

  return results;
}

/**
 * 把报告上的写法归一成词表标准名。
 *
 * 例如报告写「鸡胸肉」「鸡肉提取物」→ 存成「鸡肉」。
 * 这一步很关键：不做归一的话，"鸡胸肉"这条记录在推荐避雷里
 * 匹配不到任何东西，等于白记。
 * 词表里没有的词（「鸵鸟肉」）原样返回 —— 顾客确实会写库里没有的东西。
 */
export function canonicalizeAllergen(
  allergen: string,
  vocabulary: { termToCode: ReadonlyMap<string, string>; entryByCode: ReadonlyMap<string, { name: string }> },
): string {
  const key = allergen.replace(/[\u3000\s]+/g, '').trim().toLowerCase();
  const code = vocabulary.termToCode.get(key);
  if (!code) return allergen.trim();
  return vocabulary.entryByCode.get(code)?.name ?? allergen.trim();
}

/** 已确诊的不会被后来的"弱阳性"降级 */
export function mergeCertainty(
  existing: string,
  incomingLevel: string | null | undefined,
): 'CONFIRMED' | 'SUSPECTED' | 'TO_VERIFY' | 'RULED_OUT' {
  const current = String(existing || 'SUSPECTED').toUpperCase();
  const next = mapLevelToCertainty(incomingLevel);
  if (current === 'CONFIRMED' || next === 'CONFIRMED') return 'CONFIRMED';
  if (current === 'RULED_OUT') return 'RULED_OUT';
  return 'SUSPECTED';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, 20);
}

function trimTo(value: unknown, max: number): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

/** 只认 YYYY-MM-DD；其余一律当没填（不猜日期） */
export function parseDate(value: unknown): Date | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const matched = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1990 || year > 2100) return null;
  return new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0),
  );
}

function toDateText(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}
