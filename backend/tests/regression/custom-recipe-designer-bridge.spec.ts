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
});
