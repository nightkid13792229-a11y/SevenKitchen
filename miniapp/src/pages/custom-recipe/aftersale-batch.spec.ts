import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 多份订单 · 按份售后 · 页面源码守卫（2026-10-21 · 第二阶段 Task 6）
 *
 * ## 这条守卫守的是什么
 *
 * **一、每份食谱卡片都要能进售后，并且进的是自己那一份。**
 * 链接里漏了 `recipeId`，点第二张卡打开的是第一份 —— 页面看起来正常，
 * 售后却指向了错的食谱。路由拼接只允许在 helper 里做。
 *
 * **二、售后页要真的能多选、能分别写说明。**
 * 只发一个 `deliveryItemIds` 而后端需要逐份说明时，
 * 顾客写了半天却只存了一条共用说明 —— 这属于"表单收集了但没提交"。
 *
 * **三、老订单一个字都不能变。**
 * `deliveryItemIds` / `recipeRequests` 是多份订单的追加字段；
 * 老订单的整单售后如果被顺手带上，后端会当成"指定了具体食谱"而拒绝。
 *
 * **四、不做抵扣。**
 * 2026-10-20 已全面下线成品抵扣，这一页也不许再出现 credit。
 */

const ORDER_DETAIL = 'src/pages/custom-recipe/order-detail.vue';
const AFTERSALE = 'src/pages/custom-recipe/aftersale.vue';
const API = 'src/api/custom-recipe.ts';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

/** 去掉注释，免得自己写的注释把自己骗了 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
}

describe('订单详情 · 每份食谱的「继续调整」', () => {
  const source = stripComments(read(ORDER_DETAIL));

  it('★ 每张批次卡片都有「继续调整」入口', () => {
    expect(source).toContain('继续调整');
    expect(source).toContain('viewBatchAftersale');
    // 入口挂在 deliveryBatch.items 的循环里
    expect(source).toMatch(/v-for="[^"]*deliveryBatch\.items/);
  });

  it('★ 跳到售后页时带上这一份的 recipeId（路由只在 helper 里拼）', () => {
    expect(source).toContain('buildAftersaleUrl');
    expect(source).toContain('viewBatchAftersale(item)');
    expect(source).toContain('item.recipeId');
    // 页面不许再手拼售后链接
    expect(source).not.toContain('/pages/custom-recipe/aftersale?orderId=');
  });

  it('★ 只有后端允许售后时才显示，不允许就只保留订单级原因', () => {
    expect(source).toMatch(/aftersaleAction\??\.enabled/);
    expect(source).toContain('aftersaleAction.disabledReason');
  });

  it('★ 原来的「进入食谱」和订单级售后按钮都还在', () => {
    expect(source).toContain('进入食谱');
    expect(source).toContain('viewBatchDelivery');
    expect(source).toContain('viewAftersale');
    expect(source).toContain('售后与问题反馈');
    // 订单级入口仍然只带 orderId
    expect(source).toContain('buildAftersaleUrl(orderId.value)');
  });
});

describe('售后页 · 选择要调整的食谱', () => {
  const source = stripComments(read(AFTERSALE));

  it('★ 接收可选的 recipeId，并取订单详情里的批次明细', () => {
    expect(source).toContain('recipeId');
    expect(source).toContain('fetchOrderDetail');
    expect(source).toContain('deliveryBatch');
  });

  it('★ 显示「选择要调整的食谱」复选列表', () => {
    expect(source).toContain('选择要调整的食谱');
    expect(source).toMatch(/v-for="[^"]*batchItems/);
    expect(source).toContain('toggleRecipeSelection');
    expect(source).toContain('isRecipeSelected');
  });

  it('★ 默认选中链接带过来的那一份（规则在 helper 里）', () => {
    expect(source).toContain('preselectAftersaleDeliveryItemIds');
    expect(source).toContain('decodeURIComponent(options.recipeId)');
  });

  it('★ 每一份选中后都有自己的说明输入框，按 deliveryItemId 存', () => {
    expect(source).toContain('recipeTexts[item.deliveryItemId]');
    expect(source).toContain('handleRecipeTextInput');
    expect(source).toContain('recipeTexts[deliveryItemId]');
  });

  it('★ 提交时带 deliveryItemIds / recipeRequests，原有字段不变', () => {
    expect(source).toContain('buildAftersaleSelectionPayload');
    expect(source).toContain('isBatch: isBatchOrder.value');
    expect(source).toContain('deliveryItemIds');
    expect(source).toContain('recipeRequests');
    expect(source).toContain('type: form.type');
    expect(source).toContain('description: form.description.trim()');
    expect(source).toContain('photos: attachments.value');
  });

  it('★ 至少选一份：有行内错误，提交按钮同步禁用', () => {
    expect(source).toContain('validateAftersaleBatchSelection');
    expect(source).toContain('batchSelectionError');
    expect(source).toContain(':disabled="submitting || !canSubmit"');
  });

  it('★ 没有批次时仍走原来的整单表单，不显示份选择', () => {
    expect(source).toContain('isBatchOrder');
    expect(source).toMatch(/v-if="isBatchOrder"/);
    expect(source).toContain('canSubmitNew');
  });

  it('★ 不做抵扣 / credit', () => {
    expect(source).not.toMatch(/抵扣|credit/i);
  });

  it('★ 配额只展示后端口径，页面不做加减', () => {
    expect(source).not.toMatch(/freeRevisionsLeft\s*[-+*/]/);
    expect(source).not.toMatch(/windowDaysLeft\s*[-+*/]/);
    // 页面仍然直接画后端给的数字
    expect(source).toContain('quota.freeRevisionsLeft');
    expect(source).toContain('quota.windowDaysLeft');
  });
});

describe('售后 API · 追加字段但不改老字段', () => {
  const api = stripComments(read(API));

  it('★ 提交入参支持 deliveryItemIds / recipeRequests', () => {
    expect(api).toContain('deliveryItemIds');
    expect(api).toContain('recipeRequests');
    expect(api).toContain('AftersaleRecipeRequest');
  });

  it('★ 原有 orderId / type / description / photos 仍在', () => {
    expect(api).toContain('orderId: string');
    expect(api).toContain('type: input.type');
    expect(api).toContain('description: input.description');
    expect(api).toContain('photos: input.photos ?? []');
  });

  it('★ 老订单不传这两个键（条件展开，不污染整单售后）', () => {
    expect(api).toContain('input.deliveryItemIds !== undefined');
    expect(api).toContain('input.recipeRequests !== undefined');
  });

  it('★ 仍然没有抵扣字段', () => {
    expect(api).not.toMatch(/creditAmount|deduct/i);
  });
});
