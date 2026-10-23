/**
 * Agent 草稿端口（P0a Task 2）。
 *
 * 工具层只依赖这个接口：读工具用前四个方法，写工具用中间七个，评估用最后一个。
 * P0a 用 `tests/helpers/fake-recipe-agent-port.ts` 的内存实现驱动；
 * P0b 再接 Prisma 和现有 `RecipeDesignerService`。
 */
import type { FoodCategory } from '../../../domain/recipe-designer/food-category-map';
import type {
  AgentAssessmentView,
  AgentCatalogUsage,
  AgentCopyPatch,
  AgentDraftItem,
  AgentDraftSnapshot,
  AgentIngredientCandidate,
  AgentIngredientDetail,
  AgentProductionStep,
} from './agent-types';

export interface RecipeAgentDraftPort {
  /** 读当前草稿（含上次评估）。 */
  getDraft(draftId: string): Promise<AgentDraftSnapshot>;

  /** 按关键词 / 分类 / 原料类型搜原料库；只返回真实、启用、营养档案已验证的原料。 */
  searchIngredients(input: {
    search?: string;
    category?: FoodCategory;
    type?: 'FOOD' | 'SUPPLEMENT';
    limit?: number;
  }): Promise<AgentIngredientCandidate[]>;

  /** 某个原料的详情；找不到返回 `null`。 */
  getIngredient(input: {
    nutritionFoodId: string;
  }): Promise<AgentIngredientDetail | null>;

  /** 目录使用情况：某主蛋白 / 某套原料用过几次、跟哪几道重合。 */
  getCatalogUsage(input: {
    mainProteinName?: string;
    ingredientNames?: string[];
  }): Promise<AgentCatalogUsage>;

  /** 往当前草稿追加一条真实原料；成功后内容版本 +1。 */
  addItem(
    draftId: string,
    input: {
      nutritionFoodId: string;
      ingredientId?: string;
      weightG: number;
      preparationMethod?: string;
    },
  ): Promise<AgentDraftItem>;

  /** 换掉一条原料；成功后内容版本 +1。 */
  replaceItem(
    itemId: string,
    input: {
      nutritionFoodId: string;
      ingredientId?: string;
      weightG: number;
    },
  ): Promise<AgentDraftItem>;

  /** 改一条原料的克数；成功后内容版本 +1。 */
  updateWeight(itemId: string, weightG: number): Promise<AgentDraftItem>;

  /** 删掉一条原料；成功后内容版本 +1。 */
  removeItem(itemId: string): Promise<void>;

  /** 设预处理方式和备注；成功后内容版本 +1。 */
  setPreparation(
    itemId: string,
    input: { method: string; note?: string | null },
  ): Promise<AgentDraftItem>;

  /** 写文案字段；成功后内容版本 +1。 */
  setCopy(draftId: string, patch: AgentCopyPatch): Promise<void>;

  /** 写结构化制作步骤；成功后内容版本 +1。 */
  setProductionSteps(
    draftId: string,
    steps: AgentProductionStep[],
  ): Promise<void>;

  /** 在当前内容版本上跑现有评估引擎，返回并落库评估结果。 */
  runAssessment(draftId: string): Promise<AgentAssessmentView>;
}
