/**
 * `Recipe Agent` 的真实草稿端口（P0b-2a）。
 *
 * 每次运行绑定一份草稿（`draftId`）和当前员工身份（`actor`）：
 * - 读方法走现有 `RecipeDesignerService` + 只读 Prisma（本任务先留空壳，Task 2–4 实现）；
 * - 写方法必须在 P0b-2b 通过 `RecipeDesignerService` 落库（它负责
 *   `contentRevision` 与事务），本任务先统一抛错。
 *
 * 身份直接复用 `RecipeDesignerService.getDraft` 的第二个参数类型，
 * 避免依赖 service 里未导出的 `RecipeDesignerAccessInput`。
 */
import type { FoodCategory } from '../../../domain/recipe-designer/food-category-map';
import type { PrismaService } from '../../../infrastructure/prisma.service';
import type { RecipeDesignerService } from '../recipe-designer.service';
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
import type { RecipeAgentDraftPort } from './recipe-agent.port';

/** 调工具的当前员工身份；与后台草稿接口的 access 入参保持一致。 */
export interface RecipeAgentActor {
  userId: string;
  role?: string | null;
  customerId?: string | null;
}

/** Agent 草稿端口的真实实现；一个实例只服务一份草稿、一个调用者。 */
export class RecipeDesignerAgentAdapter implements RecipeAgentDraftPort {
  constructor(
    private readonly service: RecipeDesignerService,
    private readonly prisma: PrismaService,
    private readonly actor: RecipeAgentActor,
    private readonly draftId: string,
  ) {}

  /** 传给 `RecipeDesignerService` 的 access；类型跟 service 的入参保持一致。 */
  private get access(): Parameters<RecipeDesignerService['getDraft']>[1] {
    return {
      userId: this.actor.userId,
      role: this.actor.role,
      customerId: this.actor.customerId,
    };
  }

  // ---- 读方法：本任务先返回空壳，Task 2–4 换成真实查询 ----

  async getDraft(draftId: string): Promise<AgentDraftSnapshot> {
    return {
      draftId,
      seriesId: null,
      name: '',
      scenario: '',
      contentRevision: 0,
      totalWeightG: 0,
      items: [],
      copy: {
        coverTitle: null,
        sellingPoint: null,
        description: null,
        targetHealthTags: [],
      },
      productionSteps: [],
      lastAssessment: null,
    };
  }

  async searchIngredients(_input: {
    search?: string;
    category?: FoodCategory;
    type?: 'FOOD' | 'SUPPLEMENT';
    limit?: number;
  }): Promise<AgentIngredientCandidate[]> {
    return [];
  }

  async getIngredient(_input: {
    nutritionFoodId: string;
  }): Promise<AgentIngredientDetail | null> {
    return null;
  }

  async getCatalogUsage(_input: {
    mainProteinName?: string;
    ingredientNames?: string[];
  }): Promise<AgentCatalogUsage> {
    return { totalPublishedRecipes: 0, mainProteinCount: 0, recipes: [] };
  }

  // ---- 写方法：P0b-2b 实现（届时用 service 保证 contentRevision 与事务） ----

  async addItem(
    _draftId: string,
    _input: {
      nutritionFoodId: string;
      ingredientId?: string;
      weightG: number;
      preparationMethod?: string;
    },
  ): Promise<AgentDraftItem> {
    throw new Error('P0b-2b: write not implemented');
  }

  async replaceItem(
    _itemId: string,
    _input: {
      nutritionFoodId: string;
      ingredientId?: string;
      weightG: number;
    },
  ): Promise<AgentDraftItem> {
    throw new Error('P0b-2b: write not implemented');
  }

  async updateWeight(
    _itemId: string,
    _weightG: number,
  ): Promise<AgentDraftItem> {
    throw new Error('P0b-2b: write not implemented');
  }

  async removeItem(_itemId: string): Promise<void> {
    throw new Error('P0b-2b: write not implemented');
  }

  async setPreparation(
    _itemId: string,
    _input: { method: string; note?: string | null },
  ): Promise<AgentDraftItem> {
    throw new Error('P0b-2b: write not implemented');
  }

  async setCopy(_draftId: string, _patch: AgentCopyPatch): Promise<void> {
    throw new Error('P0b-2b: write not implemented');
  }

  async setProductionSteps(
    _draftId: string,
    _steps: AgentProductionStep[],
  ): Promise<void> {
    throw new Error('P0b-2b: write not implemented');
  }

  async runAssessment(_draftId: string): Promise<AgentAssessmentView> {
    throw new Error('P0b-2b: write not implemented');
  }
}
