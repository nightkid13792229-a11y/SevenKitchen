/**
 * Agent 草稿端口（P0a Task 2）。
 *
 * 工具层只依赖这个接口：读工具用前四个方法，写工具用中间七个，评估用最后一个。
 * P0a 用 `tests/helpers/fake-recipe-agent-port.ts` 的内存实现驱动；
 * P0b 再接 Prisma 和现有 `RecipeDesignerService`。
 */
import type {
  FoodCategory,
  RequiredFoodCategory,
} from '../../../domain/recipe-designer/food-category-map';
import type {
  AgentAssessmentView,
  AgentCatalogUsage,
  AgentCopyPatch,
  AgentDogRecipeHistory,
  AgentDraftItem,
  AgentDraftSnapshot,
  AgentIngredientCandidate,
  AgentIngredientDetail,
  AgentProductionStep,
  AgentRecipeDetail,
  AgentRecipeSearchPage,
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

  /**
   * 某个原料的详情；找不到返回 `null`。
   *
   * `nutritionFoodId` 或 `ingredientId` 至少给一个：
   * - 按 `nutritionFoodId` 选中该营养档案，并返回同原料的全部档案；
   * - 按 `ingredientId` 选中主/默认档案，并返回全部档案。
   */
  getIngredient(input: {
    nutritionFoodId?: string;
    ingredientId?: string;
  }): Promise<AgentIngredientDetail | null>;

  /** 目录使用情况：某主蛋白 / 某套原料用过几次、跟哪几道重合。 */
  getCatalogUsage(input: {
    mainProteinName?: string;
    ingredientNames?: string[];
  }): Promise<AgentCatalogUsage>;

  /**
   * 只读搜索全部食谱。
   *
   * - 公开、定制、未公开的正式食谱版本都可查；同一 recipeId 只返回最高版本；
   * - 其他设计师未归档的设计草稿也纳入；当前草稿单独返回；
   * - 绝不返回客户 / 订单 / 狗 / 主人字段；
   * - 结果分页，绝不整表返回给模型。
   */
  searchRecipes(input: {
    search?: string;
    ingredientName?: string;
    lifeStage?: string;
    page: number;
    limit: number;
  }): Promise<AgentRecipeSearchPage>;

  /**
   * 只读一道食谱 / 草稿的完整详情。
   *
   * `recipeId` 可以是任意 `Recipe.id` 或逻辑 `recipeId`（公开 / 定制 / 未公开）；
   * `draftId` 可以是当前草稿或任意未归档设计草稿。找不到返回 null。
   * 返回内容只含配方，不含客户 / 订单 / 狗 / 主人字段。
   */
  getRecipeDetail(input: {
    recipeId?: string;
    draftId?: string;
  }): Promise<AgentRecipeDetail | null>;

  /**
   * 当前设计这只狗**真实吃过 / 交付过**的食谱历史。
   *
   * 只读当前草稿绑定的狗狗（不接受 dogId，防止越权查别的狗）；
   * 产品线 / 没绑定订单的草稿返回 `{ dogName: null, total: 0, recipes: [] }`。
   * 数据来自鲜食订单快照 + 已完成定制单的交付快照，与「爱犬设计洞察」同源。
   */
  getDogRecipeHistory(input: {
    /** 按菜名或原料名过滤，例如「牛肉」「西兰花」 */
    keyword?: string;
    /** 最多返回几道，默认 8，上限 20 */
    limit?: number;
  }): Promise<AgentDogRecipeHistory>;

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

  /** 设部位 / 状态 / 预处理；成功后内容版本 +1。 */
  setPreparation(
    itemId: string,
    input: { method: string },
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

/**
 * Agent 控制端口（P0a Task 5）。
 *
 * 管“人”这一侧：提问、申请例外/缺类确认；`finishDraft` 仅保留给旧会话
 * 兼容，新运行不再调用，也不会生成新的交付快照。
 *
 * **审批状态只能由后端从会话/数据库读取**（spec 4.3 / 5.2）：
 * `getApprovalState` 是 `check_ready` 唯一的审批来源，
 * 模型只能 `request_exception`，不能把 `exceptionApproved` 设成 true。
 */
export interface RecipeAgentControlPort {
  /** 在对话里挂一个问题，等人回答；调用后这次运行进入等待状态。 */
  askUser(input: {
    questions: Array<{ question: string; options?: string[] }>;
  }): Promise<void>;

  /** 发起达标例外（管理员批）或缺类确认（营养师确认）申请；理由必填。 */
  requestException(input: {
    type: 'COMPLIANCE' | 'CATEGORY_OMISSION';
    reason: string;
    detail?: string;
  }): Promise<void>;

  /**
   * @deprecated 旧会话兼容：写交付快照并置 COMPLETED。
   * 新运行不再调用（`finish_draft` 工具已下线），不要再新增调用方。
   */
  finishDraft(input: { summary: string; warnings: string[] }): Promise<void>;

  /** 当前会话/数据库里的审批状态；模型不可传入，也不可覆盖。 */
  getApprovalState(): Promise<{
    approvedException: boolean;
    confirmedOmissions: RequiredFoodCategory[];
  }>;
}
