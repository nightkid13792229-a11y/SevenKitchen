import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 定制订单 → 设计器 / AI 的通路（2026-09-28，老板确认的第 4 条）
 *
 * 声明式守卫：这条通路上任何一环被摘掉，"参考顾客填写的信息设计"就又不成立了。
 * 覆盖三段：
 *   1. 后端 insight 取最近一笔未取消的定制单
 *   2. 后台：订单页一键进设计器；设计器接受 ?dogId=
 *   3. 设计器面板渲染顾客需求
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

  it('后台订单页可以一键进设计器', () => {
    const detail = admin('src/views/CustomRecipes/OrderDetail.vue');

    expect(detail).toContain('openInDesigner');
    expect(detail).toContain('/order-design/');
    expect(detail).toContain('进入本单工作台');
  });

  it('设计器接受 ?dogId= 并预填参考爱犬', () => {
    const designer = admin('src/views/RecipeDesigner/index.vue');

    expect(designer).toContain('const route = useRoute()');
    expect(designer).toContain('applyEntryQuery');
    expect(designer).toContain('route.query.dogId');
    expect(designer).toContain('pendingReferenceDogId.value = dogId');
  });

  it('设计器面板渲染顾客的定制需求', () => {
    const panel = admin(
      'src/views/RecipeDesigner/components/DogInsightPanel.vue',
    );
    const types = admin('src/types/recipeDesigner.ts');

    expect(panel).toContain('主蛋白');
    expect(panel).toContain('本单需求');
    expect(panel).toContain('过敏信息');
    expect(panel).toContain('顾客额外备注');
    expect(panel).toContain('latestMedicalRecord');
    expect(panel).not.toContain('顾客的定制需求');
    expect(panel).not.toContain('订单里填的忌口');

    // 类型上必须有这个字段，否则面板拿不到数据
    expect(types).toContain('customRecipeOrder: {');
    expect(types).toContain('requestedProteinCodes: string[]');
    expect(types).toContain('latestMedicalRecord');
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
    /**
     * 交付走**交付服务**（批次 2.1 起）。
     *
     * ⚠️ 这里原来断言的是 `deliverExistingRecipe` —— 那个方法
     * 只改订单、不留快照、绕过状态机，2026-10-16 批次 5.7 已删除。
     * 断言跟着搬到**活着的那条路径**上，否则这条守卫就变成
     * "守着一个不存在的东西"。
     */
    expect(controller).toContain('deliveryService.deliver(');
  });

  it('交付会校验"这道食谱属于该顾客与该狗"（隐私边界不能被绕过）', () => {
    /**
     * ⚠️ 这条守卫的**对象换过一次**（2026-10-16 批次 5.7）：
     *
     * 原来盯的是 `CustomRecipeService.deliverExistingRecipe`。
     * 那个方法只改订单、不留内容快照、而且**绕过状态机**，
     * 批次 2.1 起交付一律走 `CustomRecipeDeliveryService.deliver()`，
     * 旧方法已经没有任何生产代码在调 —— 所以删了。
     *
     * 但**这条守卫要守的东西一点没变**：把别人家狗的食谱交付出去，
     * 是 2026-09-28 专门修过的隐私边界。所以断言搬到活着的路径上。
     */
    const delivery = backend(
      'src/application/custom-recipe/custom-recipe-delivery.service.ts',
    );

    expect(delivery).toContain('recipe.customerOwnerId !== order.customerId');
    expect(delivery).toContain('recipe.customerDogId !== order.dogId');
    // 非定制食谱也不能挂到定制单上
    expect(delivery).toContain('recipe.isCustomRecipe');
    /**
     * 口径 4：已交付/已完成的单可以**重新交付**（售后改稿后就要走这条）——
     * 这条在交付服务里由状态机保证，不是靠一个 `redelivered` 变量。
     */
    const state = backend('src/domain/custom-recipe/custom-recipe.state.ts');
    expect(state).toContain('COMPLETED');
  });
});
