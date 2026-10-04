import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 定制订单 → 设计器 / AI 的通路（2026-09-28，老板确认的第 4 条）
 *
 * 声明式守卫：这条通路上任何一环被摘掉，"参考顾客填写的信息设计"就又不成立了。
 * 覆盖四段：
 *   1. 后端 insight 取最近一笔未取消的定制单
 *   2. AI 四步向导的档案里带上顾客的目标与备注
 *   3. AI 提示词要求落实 targetGoal 与 additionalNotes
 *   4. 后台：订单页一键进设计器；设计器接受 ?dogId=；面板渲染顾客需求
 */
describe('定制订单 → 设计器 / AI 通路', () => {
  const backend = (path: string) =>
    readFileSync(resolve(process.cwd(), path), 'utf-8');
  const admin = (path: string) =>
    readFileSync(resolve(process.cwd(), '../admin-web', path), 'utf-8');

  it('insight 取最近一笔未取消的定制单，并原样带给前端', () => {
    const source = backend(
      'src/application/recipe-designer/recipe-designer.service.ts',
    );

    expect(source).toContain('customRecipeOrder.findFirst');
    expect(source).toContain('CustomRecipeStatus.CANCELLED');
    expect(source).toContain('customRecipeOrder: customOrder');
    // 顾客目标与健康管理标记都要带上
    expect(source).toContain('targetGoal: customOrder.targetGoal');
    expect(source).toContain(
      'needsHealthManagement: Boolean(customOrder.needsHealthManagement)',
    );
  });

  it('AI 四步向导的犬档案里带上顾客的定制需求', () => {
    const source = backend(
      'src/application/recipe-designer/recipe-designer.service.ts',
    );
    const wizard = backend(
      'src/application/recipe-designer/recipe-ai-wizard.service.ts',
    );

    expect(source).toContain('customOrder: customerOrder');
    expect(wizard).toContain('customOrder?: {');
    expect(wizard).toContain('targetGoal: string;');
    expect(wizard).toContain('additionalNotes: string | null;');
  });

  it('AI 提示词明确要求落实顾客的体重目标与备注', () => {
    const wizard = backend(
      'src/application/recipe-designer/recipe-ai-wizard.service.ts',
    );

    // 营养方案那一步（决定热量）必须落实 targetGoal
    expect(wizard).toContain('减重 → 在安全前提下把每日热量定在维持所需之下');
    expect(wizard).toContain('禁止忽略顾客的目标');
    // 食材推荐那一步也要照顾客的备注落实忌口
    expect(wizard).toContain('dog.customOrder');
    expect(wizard).toContain('additionalNotes 是顾客的原话');
  });

  it('订单里填的口味会合并进交给 AI 的档案字段（不写回档案）', () => {
    const source = backend(
      'src/application/recipe-designer/recipe-designer.service.ts',
    );

    expect(source).toContain('mergeFoodText(');
    expect(source).toContain('customerOrder?.dislikedIngredients');
    expect(source).toContain('customerOrder?.preferredIngredients');
    // 知情同意的范围只有过敏与疾病，口味不能顺手写回档案
    expect(source).toContain('不能顺手把口味也写进去');
  });

  it('后台订单页可以一键进设计器', () => {
    const detail = admin('src/views/CustomRecipes/OrderDetail.vue');

    expect(detail).toContain('openInDesigner');
    expect(detail).toContain('/recipe-designer?dogId=');
    expect(detail).toContain('在设计器中设计');
  });

  it('设计器接受 ?dogId= 并预填参考爱犬', () => {
    const designer = admin('src/views/RecipeDesigner/index.vue');

    expect(designer).toContain('const route = useRoute()');
    expect(designer).toContain('applyEntryQuery');
    expect(designer).toContain('route.query.dogId');
    expect(designer).toContain('createForm.referenceDogId = dogId');
  });

  it('设计器面板渲染顾客的定制需求', () => {
    const panel = admin(
      'src/views/RecipeDesigner/components/DogInsightPanel.vue',
    );
    const types = admin('src/types/recipeDesigner.ts');

    expect(panel).toContain('顾客的定制需求');
    expect(panel).toContain('insight.customRecipeOrder');
    expect(panel).toContain('体重目标');
    expect(panel).toContain('订单里填的忌口');
    expect(panel).toContain('顾客备注');

    // 类型上必须有这个字段，否则面板拿不到数据
    expect(types).toContain('customRecipeOrder: {');
    expect(types).toContain('needsHealthManagement: boolean');
  });

  /**
   * 2026-10-04：补上**反方向**的通路 —— 设计器做好的食谱要能挂回订单。
   *
   * 此前这条是断的：设计器发布私有定制食谱时不写定制单号，全后端只有后台那个
   * 手工表单会写，于是员工必须回订单页把数值/食材/步骤**手工重抄一遍**。
   */
  it('设计器发布的定制食谱会挂上"正在等食谱"的订单（员工不用再手抄）', () => {
    const source = backend(
      'src/application/recipe-designer/recipe-designer.service.ts',
    );

    expect(source).toContain('resolveCustomRecipeOrderIdForDog');
    // 挂单：有订单才写，挂不上就保留原链路
    expect(source).toMatch(/customOrderId \? \{ customOrderId \} : \{\}/);
    // 只认"钱已收、食谱未交"的两种状态
    expect(source).toMatch(
      /CustomRecipeStatus\.PAID,\s*CustomRecipeStatus\.IN_PROGRESS/,
    );

    // 后台必须有一条不依赖手工重抄的交付通路
    const controller = backend(
      'src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts',
    );
    expect(controller).toContain('orders/:orderId/recipe-candidates');
    expect(controller).toContain('orders/:orderId/deliver-recipe');
    expect(controller).toContain('deliverExistingRecipe');
  });

  it('一键交付会校验"这道食谱属于该顾客与该狗"（隐私边界不能被绕过）', () => {
    const service = backend(
      'src/application/custom-recipe/custom-recipe.service.ts',
    );

    expect(service).toContain('async deliverExistingRecipe');
    expect(service).toContain('recipe.customerOwnerId !== order.customerId');
    expect(service).toContain('recipe.customerDogId !== order.dogId');
    // 口径 4：已交付的单可以重新交付，并如实告诉调用方这是重交
    expect(service).toContain('redelivered');
  });
});
