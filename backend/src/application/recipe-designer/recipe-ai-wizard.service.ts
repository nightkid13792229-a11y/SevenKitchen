import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { callDeepSeekJson } from './deepseek-chat';
import { normalizeOptionalText, normalizeStringArray } from './deepseek-chat';
import type { DogDesignHistorySummary, DogOrderSummary } from '../../domain/recipe-designer/dog-design-insight';
import type {
  IngredientRecommendationResult,
  NutritionPlanResult,
  RecipeReviewResult,
  SopResult,
} from '../../domain/recipe-designer/recipe-ai-wizard/types';
import { RECIPE_DESIGN_AGENT_PURPOSE } from './ai-design-suggestion.service';

// ---------- 输入类型 ----------

export interface AiWizardDogProfile {
  name: string;
  breedName: string | null;
  gender: string | null;
  ageMonths: number | null;
  isNeutered: boolean | null;
  bcsScore: number | null;
  currentWeightKg: number;
  lifeStageLabel: string | null;
  activityLevel: string | null;
  mealsPerDay: number | null;
  treatLevel: string | null;
  manualTreatKcal: number | null;
  targetFoodKcal: number | null;
  allergyFoods: string | null;
  pickyFoods: string | null;
  preferredFoods: string | null;
  medicalHistory: string | null;
  /** 体重历史（近 6 条：日期 + kg） */
  weightTrend: Array<{ date: string; weightKg: number }>;
  /** 体检记录 */
  checkups: Array<{
    type: string;
    date: string;
    findings: string | null;
    recommendations: string | null;
  }>;
  /** 病历 */
  medicalRecords: Array<{
    date: string;
    chiefComplaint: string | null;
    diagnosis: string | null;
    treatment: string | null;
    medications: string[];
    status: string | null;
  }>;
}

export interface AiWizardDraftSummary {
  name: string;
  scenario: string;
  items: Array<{
    name: string;
    category: string | null;
    weightG: number;
    ratioPercent: number | null;
    isSupplement: boolean;
    preparationMethod: string | null;
    nutritionProfileSummary?: string | null;
  }>;
  totalWeightG: number;
  energyDensityKcalPerKg: number | null;
  assessmentSummaryText: string;
}

export interface NutritionPlanInput {
  dog: AiWizardDogProfile;
  /** 知识检索标签（由犬档案推导：生命阶段、疾病等） */
  knowledgeTags: string[];
  extraKeywords: string[];
  currentDraft: AiWizardDraftSummary | null;
  /** 用户/营养师对既有方案的修改建议（按建议优化重生成） */
  userNotes?: string | null;
}

export interface IngredientRecommendationInput {
  dog: AiWizardDogProfile;
  nutritionPlan: NutritionPlanResult | null;
  knowledgeTags: string[];
  designHistory: DogDesignHistorySummary;
  orderSummary: DogOrderSummary;
  frameworkTemplateName: string;
  currentDraft: AiWizardDraftSummary | null;
}

export interface RecipeReviewInput {
  nutritionPlan: NutritionPlanResult | null;
  knowledgeTags: string[];
  frameworkTemplateName: string;
  draft: AiWizardDraftSummary;
}

export interface SopInput {
  draft: AiWizardDraftSummary;
  audience: 'both' | 'production' | 'customer';
}

// ---------- 服务 ----------

@Injectable()
export class RecipeAiWizardService {
  constructor(
    private readonly agentProviderConfigService: AgentProviderConfigService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_DESIGN_AGENT_PURPOSE,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** 步骤一：营养方案 */
  async generateNutritionPlan(
    input: NutritionPlanInput,
  ): Promise<NutritionPlanResult> {
    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_DESIGN_AGENT_PURPOSE,
      });
    const knowledgeContext = this.knowledgeBaseService.buildPromptContext(
      input.knowledgeTags,
      input.extraKeywords,
    );
    const parsed = await callDeepSeekJson({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
      systemPrompt: buildNutritionPlanSystemPrompt(),
      userPayload: {
        task: 'generate_nutrition_plan',
        dog: input.dog,
        knowledgeContext,
        currentDraft: input.currentDraft ?? null,
        userNotes: input.userNotes ?? null,
      },
    });
    return normalizeNutritionPlanResult(parsed);
  }

  /** 步骤二：食材推荐 */
  async generateIngredientRecommendation(
    input: IngredientRecommendationInput,
  ): Promise<IngredientRecommendationResult> {
    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_DESIGN_AGENT_PURPOSE,
      });
    const knowledgeContext = this.knowledgeBaseService.buildPromptContext(
      input.knowledgeTags,
    );
    const parsed = await callDeepSeekJson({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
      systemPrompt: buildIngredientRecommendationSystemPrompt(),
      userPayload: {
        task: 'generate_ingredient_recommendation',
        dog: input.dog,
        nutritionPlan: input.nutritionPlan ?? null,
        knowledgeContext,
        designHistory: input.designHistory,
        orderSummary: input.orderSummary,
        frameworkTemplateName: input.frameworkTemplateName,
        currentDraft: input.currentDraft ?? null,
      },
    });
    return normalizeIngredientRecommendationResult(parsed);
  }

  /** 步骤三：食谱审核 */
  async reviewRecipe(input: RecipeReviewInput): Promise<RecipeReviewResult> {
    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_DESIGN_AGENT_PURPOSE,
      });
    const knowledgeContext = this.knowledgeBaseService.buildPromptContext(
      input.knowledgeTags,
    );
    const parsed = await callDeepSeekJson({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
      systemPrompt: buildRecipeReviewSystemPrompt(),
      userPayload: {
        task: 'review_recipe',
        nutritionPlan: input.nutritionPlan ?? null,
        knowledgeContext,
        frameworkTemplateName: input.frameworkTemplateName,
        draft: input.draft,
      },
    });
    return normalizeRecipeReviewResult(parsed);
  }

  /** 步骤四：制作 SOP */
  async generateSop(input: SopInput): Promise<SopResult> {
    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_DESIGN_AGENT_PURPOSE,
      });
    const parsed = await callDeepSeekJson({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
      systemPrompt: buildSopSystemPrompt(),
      userPayload: {
        task: 'generate_production_sop',
        audience: input.audience,
        draft: input.draft,
      },
    });
    return normalizeSopResult(parsed);
  }
}

// ---------- 系统提示词 ----------

function buildNutritionPlanSystemPrompt(): string {
  return [
    '你是一名资深宠物犬鲜食营养师，为宠物鲜食工作室的配方设计提供营养方案。',
    '你会收到一只犬的完整档案（性别、年龄、绝育、BCS、活动量、餐数、零食、目标热量、体重趋势、体检记录、病历等），以及一段「可引用的权威知识条目」。',
    '若提供了 userNotes（用户/营养师对既有方案的修改建议），请把该建议作为优先修订意见，在不违背犬档案与权威知识的基础上，据此优化/调整方案；若 userNotes 为空则按常规生成。',
    '请基于犬档案与知识条目，生成一份完整营养方案：',
    '- summary: string，1-2 句概括核心营养要点与设计方向。',
    '- caloriesPerDayKcal: number|null，每日目标热量（kcal）。结合体重、体重趋势、活动量、零食热量计算；数据不足时为 null 并说明。',
    '- caloriesBasis: string，热量计算依据的简要说明。',
    '- mealsPerDay: number|null，建议每日餐数。',
    '- macroRatio: {protein, fat, carbohydrate, note?}，宏量营养素供能占比建议（如 "25-30%"），note 说明理由。',
    '- nutritionFocus: [{point, reason, citationIds?}]，关键营养关注点（钙磷、脂肪酸、纤维等），reason 说明依据。',
    '- precautions: [{point, reason, citationIds?}]，注意事项（疾病禁忌、体检发现、需兽医确认事项）。',
    '- citations: [{id, source, chapter?}]，本方案实际引用的知识条目清单（id 必须是知识条目中的 [xxx] 编号）。',
    '- warnings: string[]，需要人工核对的注意点。',
    '要求：',
    '1. 只基于提供的犬档案与知识条目推断，不得虚构档案中不存在的信息；',
    '2. 引用知识条目时必须标注条目 ID 与出处，不得凭空编造出处；',
    '3. 涉及疾病/药物建议保持克制，标注需兽医确认；',
    '4. 所有建议均为辅助参考，最终由营养师人工判断。',
    '5. 最终响应必须是一个合法的 JSON 对象（以 JSON 格式输出，禁止输出 JSON 以外的任何文字或代码块标记）。',
  ].join('\n');
}

function buildIngredientRecommendationSystemPrompt(): string {
  return [
    '你是一名资深宠物犬鲜食营养师，负责在营养方案达成共识后推荐食材。',
    '你会收到：犬档案（含过敏/挑食/偏好）、已认可的营养方案（可能为空）、权威知识条目、历史设计食材汇总、最近90天实际吃过的食材、食谱结构框架模板名、当前配方明细（可能为空）。',
    '请输出食材推荐：',
    '- framework: {templateName, covered[], missing[], note?}，按框架模板逐类核对当前配方已覆盖/缺失的类别。默认模板类别：MEAT 肌肉蛋白源、ORGAN 内脏、GRAIN 谷物/薯类、VEGETABLE 蔬菜、FRUIT 水果、OIL 油脂/坚果种子。',
    '- recommendations: [{name, category, categoryLabel, inLibrary, ingredientId?, nutritionFoodId?, suggestedWeightG, reason, avoidRecent?}]，推荐食材 4-12 项。category 用 MEAT/ORGAN/SEAFOOD/VEGETABLE/FRUIT/GRAIN/DAIRY/EGG/OIL/SUPPLEMENT/OTHER；categoryLabel 写中文；inLibrary 表示该食材是否在原料库中（若名称与知识/常见食材一致但你不确定，填 false 并让前端匹配）；suggestedWeightG 为建议用量 g（可 null）；avoidRecent 表示该食材近期吃过、建议间隔使用。',
    '- avoidIngredients: [{name, reason}]，应避免的食材及原因（过敏、疾病禁忌、挑食）。',
    '- diversityNotes: string[]，多样性相关说明（如近期高频食材、建议轮换）。',
    '- warnings: string[]，需要人工核对的注意点。',
    '要求：',
    '1. 过敏食材必须硬性避开；挑食食材避开并尽量给替代；',
    '2. 尽量推荐近 90 天没吃过的食材以增加多样性；',
    '3. 遵循框架但不要死守，特殊疾病食谱可说明框架调整；应季性只做常识性提示（如秋冬可考虑根茎类、夏季少油），不要编造具体的应季数据表；',
    '4. 只基于提供信息推断，不虚构；涉及疾病需兽医确认；最终由营养师人工判断。',
    '5. 最终响应必须是一个合法的 JSON 对象（以 JSON 格式输出，禁止输出 JSON 以外的任何文字或代码块标记）。',
  ].join('\n');
}

function buildRecipeReviewSystemPrompt(): string {
  return [
    '你是一名资深宠物犬鲜食营养师，负责审核已完成设计的食谱配方。',
    '你会收到：已认可的营养方案（可能为空）、权威知识条目、框架模板名、当前配方明细（含每种食材的名称/分类/重量/占比/是否补剂/烹饪方式）及营养评估摘要。',
    '请审核并输出：',
    '- overall: "pass"|"attention"|"risk"，总体结论。',
    '- summary: string，1-2 句总体评价。',
    '- issues: [{level: "error"|"warning"|"info", category: "structure"|"ratio"|"diversity"|"plan"|"nutrition", message, suggestion?, suggestedIngredient?: {name, category?, weightG?}}]，问题清单，suggestion 给出改进建议；若建议补充某食材，用 suggestedIngredient 给出名称/分类/建议用量。',
    '- planDeviations: [{item, expected, actual}]，与已认可营养方案的偏差（无方案或一致时为空）。',
    '- warnings: string[]，需要人工核对的注意点。',
    '审核维度：',
    '1. 结构：框架各类别是否齐全（缺哪类）；',
    '2. 比例：蛋白源/内脏/谷物/蔬菜等占比是否合理；',
    '3. 多样性：近期重复度高不高、种类是否偏少（参考历史食材）；',
    '4. 与营养方案一致性：热量、关键营养素偏差；',
    '5. 营养评估解读：把营养评估摘要中的硬性数据翻译成通俗结论。',
    '要求：只基于提供信息判断，不虚构；涉及疾病需兽医确认；审核结论供营养师参考。',
    '输出必须是合法的 JSON 对象（以 JSON 格式输出，禁止输出 JSON 以外的任何文字或代码块标记）。',
  ].join('\n');
}

function buildSopSystemPrompt(): string {
  return [
    '你是一名宠物鲜食厨房的生产流程专家，负责把一份配方明细转化为可执行的制作 SOP。',
    '你会收到配方明细（食材名称、用量 g、分类、烹饪方式、总重、能量密度）与目标受众（production 生产版 / customer 客户DIY版 / both 两者都要）。',
    '请输出结构化 SOP：',
    '- production: [{stage, steps: [{title, description, ingredients?, temperature?, duration?, equipment?, qualityCheck?}]}]，生产版分阶段流程，建议阶段：备料 → 清洗处理 → 切配称重 → 分锅烹煮 → 混合 → 冷却 → 分装 → 冷冻。每步给出操作说明、涉及食材、温度、时间、设备、质检要点。',
    '- customer: [{stage, steps: [...]}]，客户 DIY 版，用通俗语言写步骤与注意事项（面向客户，无专业设备也能操作，说明替代方案）。',
    '- warnings: string[]，制作风险提示（如生肉卫生、中心温度要求、冷冻保存期限）。',
    '要求：',
    '1. 步骤必须覆盖配方中所有食材，用量写清；',
    '2. 涉及安全（生肉、温度、卫生）必须给明确提示；',
    '3. audience 为 production 时 customer 可为空数组，为 customer 时 production 可为空数组；',
    '4. 不虚构配方明细中不存在的食材。',
    '5. 最终响应必须是一个合法的 JSON 对象（以 JSON 格式输出，禁止输出 JSON 以外的任何文字或代码块标记）。',
  ].join('\n');
}

// ---------- 归一化 ----------

function normalizeNutritionPlanResult(
  parsed: Record<string, unknown>,
): NutritionPlanResult {
  const warnings = normalizeStringArray(parsed.warnings);
  const rawCitations = Array.isArray(parsed.citations) ? parsed.citations : [];
  const citations = rawCitations
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      id: normalizeOptionalText(entry.id) || normalizeOptionalText(entry.entryId),
      source: normalizeOptionalText(entry.source),
      chapter: normalizeOptionalText(entry.chapter) || undefined,
    }))
    .filter((entry) => entry.id && entry.source);

  const rawMacro = parsed.macroRatio as Record<string, unknown> | null;
  const macroRatio =
    rawMacro && typeof rawMacro === 'object'
      ? {
          protein: normalizeOptionalText(rawMacro.protein),
          fat: normalizeOptionalText(rawMacro.fat),
          carbohydrate:
            normalizeOptionalText(rawMacro.carbohydrate) ||
            normalizeOptionalText(rawMacro.carbs),
          note: normalizeOptionalText(rawMacro.note) || undefined,
        }
      : null;

  return {
    summary: normalizeOptionalText(parsed.summary) || '暂无总结',
    caloriesPerDayKcal:
      typeof parsed.caloriesPerDayKcal === 'number'
        ? parsed.caloriesPerDayKcal
        : typeof parsed.caloriesPerDay === 'number'
          ? parsed.caloriesPerDay
          : null,
    caloriesBasis: normalizeOptionalText(parsed.caloriesBasis),
    mealsPerDay:
      typeof parsed.mealsPerDay === 'number' ? parsed.mealsPerDay : null,
    macroRatio,
    nutritionFocus: normalizeFocusList(parsed.nutritionFocus),
    precautions: normalizeFocusList(parsed.precautions),
    citations,
    warnings,
  };
}

function normalizeFocusList(
  value: unknown,
): Array<{ point: string; reason: string; citationIds?: string[] }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      point: normalizeOptionalText(entry.point) || normalizeOptionalText(entry.name) || '',
      reason: normalizeOptionalText(entry.reason),
      citationIds: Array.isArray(entry.citationIds)
        ? normalizeStringArray(entry.citationIds)
        : undefined,
    }))
    .filter((entry) => Boolean(entry.point));
}

function normalizeIngredientRecommendationResult(
  parsed: Record<string, unknown>,
): IngredientRecommendationResult {
  const warnings = normalizeStringArray(parsed.warnings);
  const rawFramework = parsed.framework as Record<string, unknown> | null;
  const framework = {
    templateName: normalizeOptionalText(rawFramework?.templateName) || '默认',
    covered: Array.isArray(rawFramework?.covered)
      ? normalizeStringArray(rawFramework.covered)
      : [],
    missing: Array.isArray(rawFramework?.missing)
      ? normalizeStringArray(rawFramework.missing)
      : [],
    note: normalizeOptionalText(rawFramework?.note) || undefined,
  };

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          name: normalizeOptionalText(entry.name),
          category: normalizeOptionalText(entry.category) || 'OTHER',
          categoryLabel: normalizeOptionalText(entry.categoryLabel),
          inLibrary: entry.inLibrary === true,
          ingredientId:
            normalizeOptionalText(entry.ingredientId) || undefined,
          nutritionFoodId:
            normalizeOptionalText(entry.nutritionFoodId) || undefined,
          suggestedWeightG:
            typeof entry.suggestedWeightG === 'number'
              ? entry.suggestedWeightG
              : null,
          reason: normalizeOptionalText(entry.reason),
          avoidRecent: entry.avoidRecent === true,
        }))
        .filter((entry) => Boolean(entry.name))
    : [];

  const avoidIngredients = Array.isArray(parsed.avoidIngredients)
    ? parsed.avoidIngredients
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          name: normalizeOptionalText(entry.name),
          reason: normalizeOptionalText(entry.reason),
        }))
        .filter((entry) => Boolean(entry.name))
    : [];

  return {
    framework,
    recommendations,
    avoidIngredients,
    diversityNotes: normalizeStringArray(parsed.diversityNotes),
    warnings,
  };
}

function normalizeRecipeReviewResult(
  parsed: Record<string, unknown>,
): RecipeReviewResult {
  const overall = normalizeOptionalText(parsed.overall) as
    | 'pass'
    | 'attention'
    | 'risk';
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          level: (normalizeOptionalText(entry.level) || 'info') as
            | 'error'
            | 'warning'
            | 'info',
          category: (normalizeOptionalText(entry.category) ||
            'nutrition') as ReviewIssueCategory,
          message: normalizeOptionalText(entry.message),
          suggestion: normalizeOptionalText(entry.suggestion) || undefined,
          suggestedIngredient: entry.suggestedIngredient
            ? {
                name: normalizeOptionalText(
                  (entry.suggestedIngredient as Record<string, unknown>).name,
                ),
                category: normalizeOptionalText(
                  (entry.suggestedIngredient as Record<string, unknown>)
                    .category,
                ) || undefined,
                weightG:
                  typeof (
                    entry.suggestedIngredient as Record<string, unknown>
                  ).weightG === 'number'
                    ? ((entry.suggestedIngredient as Record<string, unknown>)
                        .weightG as number)
                    : undefined,
              }
            : undefined,
        }))
        .filter((entry) => Boolean(entry.message))
    : [];

  const planDeviations = Array.isArray(parsed.planDeviations)
    ? parsed.planDeviations
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          item: normalizeOptionalText(entry.item),
          expected: normalizeOptionalText(entry.expected),
          actual: normalizeOptionalText(entry.actual),
        }))
        .filter((entry) => Boolean(entry.item))
    : [];

  return {
    overall:
      overall === 'pass' || overall === 'attention' || overall === 'risk'
        ? overall
        : 'attention',
    summary: normalizeOptionalText(parsed.summary) || '暂无总结',
    issues,
    planDeviations,
    warnings: normalizeStringArray(parsed.warnings),
  };
}

function normalizeSopResult(parsed: Record<string, unknown>): SopResult {
  const normalizeStages = (value: unknown): SopStage[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) => ({
        stage: normalizeOptionalText(entry.stage) || normalizeOptionalText(entry.name),
        steps: Array.isArray(entry.steps)
          ? entry.steps
              .filter((step): step is Record<string, unknown> => Boolean(step))
              .map((step) => ({
                title: normalizeOptionalText(step.title) || normalizeOptionalText(step.name),
                description: normalizeOptionalText(step.description),
                ingredients: Array.isArray(step.ingredients)
                  ? normalizeStringArray(step.ingredients)
                  : undefined,
                temperature: normalizeOptionalText(step.temperature) || undefined,
                duration: normalizeOptionalText(step.duration) || undefined,
                equipment: normalizeOptionalText(step.equipment) || undefined,
                qualityCheck: normalizeOptionalText(step.qualityCheck) || undefined,
              }))
              .filter((step) => Boolean(step.title))
          : [],
      }))
      .filter((entry) => Boolean(entry.stage));
  };

  return {
    production: normalizeStages(parsed.production),
    customer: normalizeStages(parsed.customer),
    warnings: normalizeStringArray(parsed.warnings),
  };
}

type ReviewIssueCategory = NonNullable<RecipeReviewResult['issues'][number]['category']>;
type SopStage = NonNullable<SopResult['production'][number]>;
