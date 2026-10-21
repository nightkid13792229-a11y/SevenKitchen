import { collectAllergyKeywords } from '../dog/allergy-keywords';

export interface DogDesignHistoryIngredientRow {
  name: string;
  count: number;
  lastUsedAt: string | null;
  ingredientType: string | null;
  isSupplement: boolean;
}

export interface DogDesignHistorySummary {
  designCount: number;
  seriesNames: string[];
  ingredients: DogDesignHistoryIngredientRow[];
  /** 最近 90 天订单中实际吃过（至少进入冷冻）的食材，按标准原料聚合，仅食材类 */
  recentEatenIngredients: RecentEatenIngredientRow[];
}

export interface RecentEatenIngredientRow {
  ingredientId: string;
  name: string;
  count: number;
  lastUsedAt: string | null;
}

export interface DogOrderSummary {
  orderCount: number;
  recipeNames: string[];
  customRecipeCount: number;
}

/** 历史食谱来源：FINISHED = 已完成的鲜食订单；CUSTOM = 已关联正式食谱的定制单 */
export type DogHistoryRecipeKind = 'FINISHED' | 'CUSTOM';

/** 历史食谱里的一道原料（2026-10-22）：只给展示用的名字与用量文案 */
export interface DogHistoryRecipeIngredient {
  name: string;
  amount: string;
}

/** 历史食谱里的一项宏量营养（2026-10-22）：三项文案都可能缺失，缺失时为 '' */
export interface DogHistoryRecipeMacro {
  name: string;
  dryMatter: string;
  energyPercent: string;
  weightPercent: string;
}

/**
 * 这只狗实际用过的食谱（2026-10-22）。
 *
 * 身份字段 + **归一化后的原料/宏量营养明细**；订单快照、
 * `nutrition_detailed_data` 等原始结构本身不对外返回。
 * 同一份食谱（按食谱身份，老快照按名字）在同一来源下只保留最近一次使用，
 * 明细也跟随保留的那一次（不做跨次合并）。
 */
export interface DogHistoryRecipe {
  /** 食谱身份：鲜食取快照里的公开食谱 id（缺失时回退订单明细 id），定制取关联 Recipe.id */
  id: string;
  name: string;
  kind: DogHistoryRecipeKind;
  /** 最近一次使用时间（ISO）；订单没有可用日期时为 null */
  date: string | null;
  /** 使用该食谱时的订单状态 */
  status: string;
  /** 原料明细；没有可用营养报告时回退快照/食谱项，仍没有则为 [] */
  ingredients: DogHistoryRecipeIngredient[];
  /** 宏量营养明细；没有营养报告时为 [] */
  macros: DogHistoryRecipeMacro[];
}

/**
 * 最近一次就诊（2026-10-21）。
 *
 * 营养师设计时要看的是「什么时候、诊断是什么、现在什么状态、当时主诉/做了哪些检查」，
 * 而不是化验单里几十项原始数值 —— 所以这里**只暴露结论字段**，
 * `labValues` / `vitals` 等原始数据既不查询也不返回。
 */
export interface DogLatestMedicalRecord {
  /** ISO 时间字符串 */
  visitDate: string;
  diagnosis: string;
  status: string;
  chiefComplaint?: string;
  exams?: string;
  /**
   * 这次就诊的附件（2026-10-22）。
   *
   * 化验单/检查报告常以图片或 PDF 存在记录里，营养师要能点开看原件。
   * 这里给的是**最新一条**记录的附件原始值（COS key / URL），
   * 由服务层换成短时签名 URL；无附件时为 `[]`。
   */
  attachments: string[];
}

/**
 * 最近一次体检（2026-10-21）。
 * 同样只给结论，`labValues` 等原始化验数值不进入设计洞察。
 */
export interface DogLatestCheckupRecord {
  /** ISO 时间字符串 */
  checkupDate: string;
  checkupType: string;
  findings?: string;
  /** 这次体检的附件（2026-10-22）：仅最新一条，服务层换签名 URL。 */
  attachments: string[];
}

export interface DogDesignInsight {
  dog: {
    id: string;
    name: string;
    avatarUrl: string | null;
    ownerId: string;
    currentWeightKg: number;
    breedName: string | null;
    lifeStageLabel: string | null;
    /** 性别：MALE / FEMALE */
    gender: string | null;
    /** 由生日推算的月龄（无生日则为 null） */
    ageMonths: number | null;
    /** 是否绝育 */
    isNeutered: boolean | null;
    /** 体况评分 1-9 */
    bcsScore: number | null;
    /** 活动量：RESTING / LOW / NORMAL / HIGH / WORKING */
    activityLevel: string | null;
    /** 每日餐数 */
    mealsPerDay: number | null;
    /** 零食输入模式：ESTIMATE_LEVEL / EXACT_KCAL */
    treatInputMode: string | null;
    /** 零食等级：NONE / LOW / MODERATE / HIGH */
    treatLevel: string | null;
    /** 精确模式下每日零食热量 kcal */
    manualTreatKcal: number | null;
    /** 每日目标能量 kcal（档案缓存值） */
    targetFoodKcal: number | null;
    allergyFoods: string | null;
    /**
     * 来自 `allergy_record` 的结构化过敏记录（顾客在健康档案 / 定制单里填的）。
     *
     * 2026-09-27 新增：`allergyFoods` 是旧文本字段，顾客端没有入口，
     * 而营养师与 AI 过去只看它 —— 顾客填的过敏在这里完全不可见。
     * 现在单独暴露一份，**只读**，供设计面板展示与 AI 使用；
     * 不并进 `allergyFoods`，是为了不干扰设计面板那个可编辑的设计备注表单
     * （否则一保存就会把顾客的记录复制进旧字段）。
     */
    structuredAllergies: string[];
    /**
     * 带可信度的过敏明细（2026-10-04 第四期）。
     *
     * `structuredAllergies` 只有名字，营养师看不出"这条是报告确诊的、
     * 还是顾客随手记的"。而这两者处理方式完全不同：
     *   确诊 → 配方必须完全避开；可疑 → 建议避开并和顾客确认。
     * 所以单独给一份带 certainty 的。
     */
    allergyDetail: Array<{
      allergen: string;
      certainty: string;
      source: string;
    }>;
    pickyFoods: string | null;
    preferredFoods: string | null;
    medicalHistory: string | null;
  };
  designHistory: DogDesignHistorySummary;
  orderSummary: DogOrderSummary;
  /**
   * 这只狗历史上实际用过的食谱（2026-10-22）。
   *
   * 来源：已完成的鲜食订单明细快照 + 已关联正式食谱的定制单；
   * 已取消订单不算，空食谱名不展示。按最近使用时间倒序，同一份食谱只出现一次。
   * 每项带归一化后的原料/宏量明细；订单快照原始结构不外带。
   */
  historyRecipes: DogHistoryRecipe[];
  /**
   * 最近一次就诊 / 体检（2026-10-21）。
   *
   * 此前设计器只能看到档案里的旧文本病史，看不到健康档案里的实际记录。
   * 现在各给**最近一条**，不返回全部记录列表（设计面板只需要一个参照点，
   * 全量列表既没人看，也会把化验原始数值带出去）。
   */
  latestMedicalRecord: DogLatestMedicalRecord | null;
  latestCheckupRecord: DogLatestCheckupRecord | null;
  /**
   * 顾客最近一笔「食谱定制」订单里填的内容。
   *
   * 2026-09-28 新增（老板确认的第 4 条）：此前设计器**完全看不到**这笔订单 ——
   * 顾客选的是减重还是增重、勾没勾健康管理、备注里说了什么、订单里填的
   * 过敏与疾病、喜好与忌口，营养师和 AI 一个都读不到，
   * "参考顾客填写的信息来设计"这件事根本不成立。
   *
   * 只取最近一笔未取消的订单；`null` 表示这只狗没有定制单。
   */
  customRecipeOrder: {
    orderId: string;
    status: string;
    /** 顾客选的体重目标：LOSE_WEIGHT / MAINTAIN / GAIN_WEIGHT / HEALTH_SUPPORT */
    targetGoal: string;
    /** 顾客是否勾选了「需要健康管理」 */
    needsHealthManagement: boolean;
    /** 顾客填的备注（原样给出，供营养师阅读） */
    additionalNotes: string | null;
    allergies: string[];
    /** 过敏原自由文本（2026-10-19）：订单快照，设计器原文显示 */
    allergyText?: string | null;
    medicalConditions: string[];
    preferredIngredients: string[];
    dislikedIngredients: string[];
    /** 饲喂历史（2026-10-19 P0）：营养师设计过渡方案/配方时必须看到 */
    currentFoodMain?: string | null;
    currentFoodOther?: string | null;
    changeReasons?: string[];
    changeReasonOther?: string | null;
    stomachConditions?: string[];
    stomachOther?: string | null;
    /** 顾客是否明确回答过敏（HAS_ALLERGY / NO_ALLERGY / UNKNOWN） */
    allergyStatus?: string | null;
    /** 本单份数（1–5，老订单为 1） */
    recipeQuantity: number;
    /** 顾客选择的主蛋白轮换 code（空数组 = 由营养师搭配） */
    requestedProteinCodes: string[];
    createdAt: string | null;
    /**
     * 顾客在本单上传的附件（2026-10-22）。
     *
     * 库里的 `attachments` 是 JSON（COS key / URL 数组），这里归一化成
     * 字符串数组；服务层再换成短时签名 URL。无附件时为 `[]`。
     */
    attachments: string[];
  } | null;
}

interface InsightDesignItemLike {
  id?: string;
  name?: string;
  ingredientName?: string;
  nutritionFoodName?: string;
  nutritionFood?: { name?: string; displayNameZh?: string | null } | null;
  ingredient?: { name?: string; type?: string | null } | null;
  ingredientType?: string | null;
}

interface InsightDesignLike {
  id?: string;
  name?: string;
  seriesLifeStage?: string | null;
  updatedAt?: string | Date;
  items?: InsightDesignItemLike[];
}

interface InsightSeriesLike {
  id?: string;
  name?: string;
  designs?: InsightDesignLike[];
}

interface InsightOrderItemLike {
  id?: string;
  recipeSnapshot?: unknown;
  dogId?: string | null;
  order?: {
    status?: string | null;
    freezingSince?: string | Date | null;
    shippedAt?: string | Date | null;
    completedAt?: string | Date | null;
    paidAt?: string | Date | null;
    createdAt?: string | Date | null;
  } | null;
}

/**
 * 定制单（历史食谱用）：只有**已关联正式食谱**的记录才有食谱可展示。
 * 其它问卷/报价字段不读取，避免把整单内容带进洞察。
 */
interface InsightCustomRecipeOrderLike {
  id?: string | null;
  status?: string | null;
  createdAt?: string | Date | null;
  deliveredAt?: string | Date | null;
  recipe?: {
    id?: string | null;
    recipeId?: string | null;
    name?: string | null;
    /** 与订单快照同一份营养报告结构（camelCase 字段） */
    nutritionDetailedData?: unknown;
    /** 无营养报告时回退到食谱项：exampleWeight + ingredient.name */
    items?: InsightCustomRecipeItemLike[] | null;
  } | null;
}

interface InsightCustomRecipeItemLike {
  exampleWeight?: unknown;
  ingredient?: { name?: string | null } | null;
}

/**
 * 订单「实际食用」的时间：优先冷冻时间（freezingSince），
 * 其次发货/完成/付款，最后回退到创建时间。
 */
function resolveOrderEatenTime(
  order?: InsightOrderItemLike['order'],
): string | null {
  return toIsoString(
    order?.freezingSince ??
      order?.shippedAt ??
      order?.completedAt ??
      order?.paidAt ??
      order?.createdAt ??
      null,
  );
}

/** 快照内单个原料（与订单 RecipeSnapshotItem 结构对齐） */
interface InsightSnapshotItemLike {
  ingredient_id?: unknown;
  name?: unknown;
  ingredient_type?: unknown;
  /** 示例重量（克）；无营养报告时用它兜底展示用量 */
  example_weight?: unknown;
}

interface InsightSnapshotLike {
  items?: InsightSnapshotItemLike[];
}

interface InsightDogLike {
  id: string;
  name: string;
  avatarUrl?: string | null;
  ownerId?: string;
  currentWeightKg?: number;
  breed?: { name?: string | null } | null;
  customBreedName?: string | null;
  gender?: string | null;
  birthday?: string | Date | null;
  isNeutered?: boolean | null;
  bcsScore?: number | null;
  activityLevel?: string | null;
  mealsPerDay?: number | null;
  treatInputMode?: string | null;
  treatLevel?: string | null;
  manualTreatKcal?: number | null;
  cachedTargetFoodKcal?: number | null;
  allergyFoods?: string | null;
  /** 结构化过敏记录（顾客在健康档案 / 定制单里填的），只取 allergen 字段 */
  allergyRecords?: Array<{
    allergen?: string | null;
    certainty?: string | null;
    source?: string | null;
  }> | null;
  pickyFoods?: string | null;
  preferredFoods?: string | null;
  medicalHistory?: string | null;
}

/**
 * 就诊记录（只取设计需要的结论字段）。
 * 传进来的对象即使带 `labValues` / `vitals` 也不会被读取或输出。
 */
interface InsightMedicalRecordLike {
  visitDate?: string | Date | null;
  diagnosis?: string | null;
  status?: string | null;
  chiefComplaint?: string | null;
  exams?: string | null;
  /** 附件原文（COS key / URL）；即使多传也不会带出 labValues / vitals */
  attachments?: string[] | null;
}

/**
 * 体检记录（只取设计需要的结论字段）。
 * `labValues` 等原始化验数值不会进入洞察结果。
 */
interface InsightCheckupRecordLike {
  checkupDate?: string | Date | null;
  checkupType?: string | null;
  findings?: string | null;
  /** 附件原文（COS key / URL）；即使多传也不会带出 labValues */
  attachments?: string[] | null;
}

function calcAgeMonths(birthday?: string | Date | null): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  return (
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  );
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  return toValidDate(value)?.toISOString() ?? null;
}

/**
 * 附件列表归一化（2026-10-22）。
 *
 * 定制单的 `attachments` 是 JSON 列，历史数据可能是 null / 非数组 /
 * 混入非字符串；这里只保留非空字符串，保证输出永远是 `string[]`。
 * 保留原始顺序（展示顺序与顾客上传顺序一致）。
 */
export function normalizeInsightAttachments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => Boolean(item));
}

/**
 * 从多条记录中按日期取最新一条。
 *
 * 服务层查询已经按日期倒序并只取 1 条，这里再兜一次底：
 * 纯函数不依赖调用方的排序，即使传入多条或乱序，也只输出最新一条。
 */
function pickLatestByDate<T>(
  records: readonly T[] | null | undefined,
  getDate: (record: T) => string | Date | null | undefined,
): T | null {
  let latest: T | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const record of records ?? []) {
    const time = toValidDate(getDate(record))?.getTime();
    if (time === undefined || time <= latestTime) continue;
    latest = record;
    latestTime = time;
  }
  return latest;
}

function buildLatestMedicalRecord(
  record: InsightMedicalRecordLike | null,
): DogLatestMedicalRecord | null {
  if (!record) return null;
  const visitDate = toIsoString(record.visitDate);
  // 没有有效日期的记录无法判断"最近"，也不该出现在洞察里
  if (!visitDate) return null;
  const chiefComplaint = firstString(record.chiefComplaint);
  const exams = firstString(record.exams);
  return {
    visitDate,
    diagnosis: firstString(record.diagnosis),
    status: firstString(record.status),
    ...(chiefComplaint ? { chiefComplaint } : {}),
    ...(exams ? { exams } : {}),
    attachments: normalizeInsightAttachments(record.attachments),
  };
}

function buildLatestCheckupRecord(
  record: InsightCheckupRecordLike | null,
): DogLatestCheckupRecord | null {
  if (!record) return null;
  const checkupDate = toIsoString(record.checkupDate);
  if (!checkupDate) return null;
  const findings = firstString(record.findings);
  return {
    checkupDate,
    checkupType: firstString(record.checkupType),
    ...(findings ? { findings } : {}),
    attachments: normalizeInsightAttachments(record.attachments),
  };
}

export function resolveInsightItemName(
  item: InsightDesignItemLike,
): string {
  return firstString(
    item.name,
    item.ingredientName,
    item.nutritionFoodName,
    item.nutritionFood?.displayNameZh,
    item.nutritionFood?.name,
    item.ingredient?.name,
  );
}

export function resolveInsightItemIngredientType(
  item: InsightDesignItemLike,
): string | null {
  const type = firstString(
    item.ingredientType,
    item.ingredient?.type,
  );
  return type || null;
}

export function isInsightItemSupplement(item: InsightDesignItemLike): boolean {
  const type = resolveInsightItemIngredientType(item);
  return type === 'SUPPLEMENT';
}

/**
 * 汇总一只爱犬名下所有设计（RecipeSeries.designs）使用过的食材及频次。
 * 纯函数，便于单元测试。
 */
export function aggregateDogDesignHistory(
  seriesList: InsightSeriesLike[],
): DogDesignHistorySummary {
  const ingredientByName = new Map<
    string,
    DogDesignHistoryIngredientRow
  >();
  const seriesNames: string[] = [];
  let designCount = 0;

  for (const series of seriesList) {
    const seriesName = firstString(series.name);
    if (seriesName && !seriesNames.includes(seriesName)) {
      seriesNames.push(seriesName);
    }
    const designs = series.designs ?? [];
    designCount += designs.length;

    for (const design of designs) {
      const lastUsedAt = toIsoString(design.updatedAt);
      for (const item of design.items ?? []) {
        const name = resolveInsightItemName(item);
        if (!name) continue;
        const existing = ingredientByName.get(name);
        if (existing) {
          existing.count += 1;
          if (
            lastUsedAt &&
            (!existing.lastUsedAt || lastUsedAt > existing.lastUsedAt)
          ) {
            existing.lastUsedAt = lastUsedAt;
          }
        } else {
          ingredientByName.set(name, {
            name,
            count: 1,
            lastUsedAt,
            ingredientType: resolveInsightItemIngredientType(item),
            isSupplement: isInsightItemSupplement(item),
          });
        }
      }
    }
  }

  const ingredients = Array.from(ingredientByName.values()).sort(
    (left, right) =>
      right.count - left.count ||
      (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '') ||
      left.name.localeCompare(right.name),
  );

  return { designCount, seriesNames, ingredients, recentEatenIngredients: [] };
}

/**
 * 汇总该狗历史订单信息（OrderItem 快照中的食谱名）。
 */
export function aggregateDogOrderSummary(
  orderItems: InsightOrderItemLike[],
): DogOrderSummary {
  const recipeNames: string[] = [];
  for (const item of orderItems) {
    const snapshot = item.recipeSnapshot;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      continue;
    }
    const record = snapshot as Record<string, unknown>;
    const name = firstString(
      record.recipeTitle,
      record.recipeName,
      record.name,
      record.title,
    );
    if (name && !recipeNames.includes(name)) {
      recipeNames.push(name);
    }
  }
  return {
    orderCount: orderItems.length,
    recipeNames,
    customRecipeCount: 0,
  };
}

/** 快照 JSON 只在是普通对象时才读取（历史数据可能为 null / 数组 / 字符串） */
function resolveSnapshotRecord(
  snapshot: unknown,
): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }
  return snapshot as Record<string, unknown>;
}

/** 快照里的食谱名：现行快照是 name，老数据可能是 recipeTitle / recipeName / title */
function resolveSnapshotRecipeName(record: Record<string, unknown>): string {
  return firstString(
    record.recipeTitle,
    record.recipeName,
    record.name,
    record.title,
  );
}

function isCancelledOrderStatus(status: string | null | undefined): boolean {
  return firstString(status).toUpperCase() === 'CANCELLED';
}

/** 新记录的日期更晚（或旧记录没有日期）时才替换，保证「保留最近一次使用」 */
function isLaterUsage(
  candidate: string | null,
  current: string | null,
): boolean {
  if (!candidate) return false;
  if (!current) return true;
  return candidate > current;
}

/** 历史食谱的归一化明细（只保留展示字段，原始报告结构不外带） */
interface HistoryRecipeDetails {
  ingredients: DogHistoryRecipeIngredient[];
  macros: DogHistoryRecipeMacro[];
}

/**
 * 营养报告里的原料行 → `{ name, amount }`。
 * 空名字的行没有展示意义，直接跳过；用量缺失给 ''。
 */
function normalizeHistoryReportIngredients(
  value: unknown,
): DogHistoryRecipeIngredient[] {
  if (!Array.isArray(value)) return [];
  const rows: DogHistoryRecipeIngredient[] = [];
  for (const row of value) {
    const record = resolveSnapshotRecord(row);
    if (!record) continue;
    const name = firstString(record.ingredientName);
    if (!name) continue;
    rows.push({ name, amount: firstString(record.amountLabel) });
  }
  return rows;
}

/** 营养报告里的宏量行 → `{ name, dryMatter, energyPercent, weightPercent }` */
function normalizeHistoryReportMacros(
  value: unknown,
): DogHistoryRecipeMacro[] {
  if (!Array.isArray(value)) return [];
  const rows: DogHistoryRecipeMacro[] = [];
  for (const row of value) {
    const record = resolveSnapshotRecord(row);
    if (!record) continue;
    const name = firstString(record.name);
    if (!name) continue;
    rows.push({
      name,
      dryMatter: firstString(record.dryMatterLabel),
      energyPercent: firstString(record.energyPercentLabel),
      weightPercent: firstString(record.weightPercentLabel),
    });
  }
  return rows;
}

/** 示例重量 → `${weight}g`；非数字/缺失给 '' */
function formatHistoryWeightAmount(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}g` : '';
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '';
    const numeric = Number(text);
    return Number.isFinite(numeric) ? `${numeric}g` : '';
  }
  return '';
}

/** 快照 `items` 兜底：name + example_weight */
function normalizeHistorySnapshotIngredients(
  value: unknown,
): DogHistoryRecipeIngredient[] {
  if (!Array.isArray(value)) return [];
  const rows: DogHistoryRecipeIngredient[] = [];
  for (const item of value) {
    const record = resolveSnapshotRecord(item);
    if (!record) continue;
    const name = firstString(record.name);
    if (!name) continue;
    rows.push({
      name,
      amount: formatHistoryWeightAmount(record.example_weight),
    });
  }
  return rows;
}

/** 定制单关联 `Recipe.items` 兜底：ingredient.name + exampleWeight */
function normalizeHistoryCustomRecipeIngredients(
  value: unknown,
): DogHistoryRecipeIngredient[] {
  if (!Array.isArray(value)) return [];
  const rows: DogHistoryRecipeIngredient[] = [];
  for (const item of value) {
    const record = resolveSnapshotRecord(item);
    if (!record) continue;
    const ingredient = resolveSnapshotRecord(record.ingredient);
    const name = firstString(ingredient?.name);
    if (!name) continue;
    rows.push({
      name,
      amount: formatHistoryWeightAmount(record.exampleWeight),
    });
  }
  return rows;
}

/**
 * 归一化一份历史食谱明细。
 *
 * 优先读营养报告（`report.ingredientRows` / `report.macroRows`）；
 * 原料行缺失/全为空名字时回退到调用方给的 items 兜底，
 * 宏量没有其它数据源，缺失就是 []。
 */
function normalizeHistoryRecipeDetails(input: {
  nutritionDetailedData: unknown;
  fallbackIngredients: DogHistoryRecipeIngredient[];
}): HistoryRecipeDetails {
  const nutrition = resolveSnapshotRecord(input.nutritionDetailedData);
  const report = resolveSnapshotRecord(nutrition?.report);
  const ingredients = normalizeHistoryReportIngredients(
    report?.ingredientRows,
  );
  return {
    ingredients:
      ingredients.length > 0 ? ingredients : input.fallbackIngredients,
    macros: normalizeHistoryReportMacros(report?.macroRows),
  };
}

/**
 * 这只狗历史食谱清单（2026-10-22）。
 *
 * 数据来源：
 *  - `orderItems`：鲜食订单明细（已完成/已发货等均可），食谱名取自 `recipeSnapshot`；
 *  - `customRecipeOrders`：已关联正式 `Recipe` 的定制单。
 *
 * 规则：
 *  - 已取消订单不算「用过」，空食谱名不展示；
 *  - 去重键 = 食谱身份（快照/Recipe id，缺失时退回名字）+ 来源，保留最近一次使用；
 *    明细跟随被保留的那一次，不跨次合并；
 *  - 按使用时间倒序，没有日期的排最后。
 *
 * 输出只含身份字段 + 归一化后的原料/宏量明细；
 * 快照与 `nutrition_detailed_data` 的原始结构不对外返回。
 */
export function buildDogHistoryRecipes(
  orderItems?: readonly InsightOrderItemLike[] | null,
  customRecipeOrders?: readonly InsightCustomRecipeOrderLike[] | null,
): DogHistoryRecipe[] {
  const byKey = new Map<string, DogHistoryRecipe>();

  const add = (entry: DogHistoryRecipe, identity: string) => {
    const key = `${entry.kind}|${
      identity || `name:${entry.name.toLowerCase()}`
    }`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      return;
    }
    if (isLaterUsage(entry.date, existing.date)) {
      byKey.set(key, entry);
    }
  };

  for (const item of orderItems ?? []) {
    if (isCancelledOrderStatus(item.order?.status)) continue;
    const snapshot = resolveSnapshotRecord(item.recipeSnapshot);
    if (!snapshot) continue;
    const name = resolveSnapshotRecipeName(snapshot);
    if (!name) continue;
    const snapshotId = firstString(
      snapshot.id,
      snapshot.recipeId,
      snapshot.recipe_id,
    );
    const details = normalizeHistoryRecipeDetails({
      nutritionDetailedData: snapshot.nutrition_detailed_data,
      fallbackIngredients: normalizeHistorySnapshotIngredients(snapshot.items),
    });
    add(
      {
        id: snapshotId || firstString(item.id) || name,
        name,
        kind: 'FINISHED',
        date: toIsoString(item.order?.paidAt ?? item.order?.createdAt),
        status: firstString(item.order?.status),
        ingredients: details.ingredients,
        macros: details.macros,
      },
      snapshotId,
    );
  }

  for (const order of customRecipeOrders ?? []) {
    if (isCancelledOrderStatus(order.status)) continue;
    const recipe = order.recipe;
    const name = firstString(recipe?.name);
    if (!name) continue;
    const recipeId = firstString(recipe?.id, recipe?.recipeId);
    const details = normalizeHistoryRecipeDetails({
      nutritionDetailedData: recipe?.nutritionDetailedData,
      fallbackIngredients: normalizeHistoryCustomRecipeIngredients(
        recipe?.items,
      ),
    });
    add(
      {
        id: recipeId || firstString(order.id) || name,
        name,
        kind: 'CUSTOM',
        // 交付时间才是「真正用上」的时间；还没交付则退回下单时间
        date: toIsoString(order.deliveredAt ?? order.createdAt),
        status: firstString(order.status),
        ingredients: details.ingredients,
        macros: details.macros,
      },
      recipeId,
    );
  }

  return Array.from(byKey.values()).sort(
    (left, right) =>
      (right.date ?? '').localeCompare(left.date ?? '') ||
      left.name.localeCompare(right.name) ||
      left.kind.localeCompare(right.kind),
  );
}

/**
 * 按「标准原料」聚合订单快照中的食材（排除补剂/包材），用于「最近吃过的食材」展示。
 * 调用方需先按 90 天窗口和订单状态（≥ FREEZING）过滤 orderItems。
 * 排序：最近使用时间倒序（最新吃过的排前），同名按名称升序。
 */
export function aggregateRecentEatenIngredients(
  orderItems: InsightOrderItemLike[],
): RecentEatenIngredientRow[] {
  const byId = new Map<string, RecentEatenIngredientRow>();

  for (const orderItem of orderItems) {
    const eatenAt = resolveOrderEatenTime(orderItem.order);
    const snapshot = orderItem.recipeSnapshot;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      continue;
    }
    const items = (snapshot as InsightSnapshotLike).items ?? [];
    for (const item of items) {
      if (item.ingredient_type === 'SUPPLEMENT' || item.ingredient_type === 'PACKAGING') {
        continue;
      }
      const ingredientId = typeof item.ingredient_id === 'string' ? item.ingredient_id : '';
      if (!ingredientId) continue;
      const name = firstString(item.name) || ingredientId;

      const existing = byId.get(ingredientId);
      if (existing) {
        existing.count += 1;
        if (eatenAt && (!existing.lastUsedAt || eatenAt > existing.lastUsedAt)) {
          existing.lastUsedAt = eatenAt;
        }
      } else {
        byId.set(ingredientId, {
          ingredientId,
          name,
          count: 1,
          lastUsedAt: eatenAt,
        });
      }
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) =>
      (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '') ||
      left.name.localeCompare(right.name),
  );
}

export function buildDogDesignInsight(input: {
  dog: InsightDogLike;
  seriesList: InsightSeriesLike[];
  orderItems: InsightOrderItemLike[];
  /** 已按 90 天窗口与订单状态（≥ FREEZING）过滤的订单，用于「最近吃过的食材」 */
  recentEatenOrderItems?: InsightOrderItemLike[];
  lifeStageLabel: string | null;
  /**
   * 该狗的就诊记录。可传多条（或乱序），内部按 visitDate 取最新一条；
   * 输出只给 `latestMedicalRecord`，不返回列表。
   */
  medicalRecords?: InsightMedicalRecordLike[];
  /**
   * 该狗的体检记录。可传多条（或乱序），内部按 checkupDate 取最新一条；
   * 输出只给 `latestCheckupRecord`，不返回列表。
   */
  checkupRecords?: InsightCheckupRecordLike[];
  /** 最近一笔「食谱定制」订单（没有则 null，或省略） */
  customRecipeOrder?: DogDesignInsight['customRecipeOrder'];
  /**
   * 该狗所有「已关联正式食谱」的定制单（不过滤取消的也没关系，builder 会排除）。
   * 用于顶层 `historyRecipes`。
   */
  customRecipeOrders?: readonly InsightCustomRecipeOrderLike[] | null;
}): DogDesignInsight {
  const dog = input.dog;
  const breedName = firstString(
    dog.customBreedName,
    dog.breed?.name,
  ) || null;
  const latestMedicalRecord = buildLatestMedicalRecord(
    pickLatestByDate(input.medicalRecords, (record) => record.visitDate),
  );
  const latestCheckupRecord = buildLatestCheckupRecord(
    pickLatestByDate(input.checkupRecords, (record) => record.checkupDate),
  );

  return {
    dog: {
      id: dog.id,
      name: dog.name,
      avatarUrl: dog.avatarUrl ?? null,
      ownerId: dog.ownerId ?? '',
      currentWeightKg: dog.currentWeightKg ?? 0,
      breedName,
      lifeStageLabel: input.lifeStageLabel,
      gender: dog.gender ?? null,
      ageMonths: calcAgeMonths(dog.birthday),
      isNeutered: dog.isNeutered ?? null,
      bcsScore: dog.bcsScore ?? null,
      activityLevel: dog.activityLevel ?? null,
      mealsPerDay: dog.mealsPerDay ?? null,
      treatInputMode: dog.treatInputMode ?? null,
      treatLevel: dog.treatLevel ?? null,
      manualTreatKcal: dog.manualTreatKcal ?? null,
      targetFoodKcal: dog.cachedTargetFoodKcal ?? null,
      allergyFoods: dog.allergyFoods ?? null,
      // 顾客在健康档案里填的过敏记录：营养师与 AI 过去完全看不到这一份。
      // 这里归一化成关键词列表，供设计面板展示与 AI 使用（只读，不参与回写）。
      structuredAllergies: collectAllergyKeywords({
        allergens: (dog.allergyRecords ?? []).map(
          (record) => record?.allergen,
        ),
      }),
      // 带可信度的明细：营养师要能分清"报告确诊"与"顾客随手记的"
      allergyDetail: (dog.allergyRecords ?? [])
        .map((record) => ({
          allergen: String(record?.allergen ?? '').trim(),
          certainty: String(record?.certainty || 'SUSPECTED').toUpperCase(),
          source: String(record?.source || 'OWNER').toUpperCase(),
        }))
        .filter((item) => Boolean(item.allergen)),
      pickyFoods: dog.pickyFoods ?? null,
      preferredFoods: dog.preferredFoods ?? null,
      medicalHistory: dog.medicalHistory ?? null,
    },
    designHistory: {
      ...aggregateDogDesignHistory(input.seriesList),
      recentEatenIngredients: aggregateRecentEatenIngredients(
        input.recentEatenOrderItems ?? [],
      ),
    },
    orderSummary: aggregateDogOrderSummary(input.orderItems),
    historyRecipes: buildDogHistoryRecipes(
      input.orderItems,
      input.customRecipeOrders,
    ),
    latestMedicalRecord,
    latestCheckupRecord,
    customRecipeOrder: input.customRecipeOrder
      ? {
          ...input.customRecipeOrder,
          attachments: normalizeInsightAttachments(
            input.customRecipeOrder.attachments,
          ),
        }
      : null,
  };
}
