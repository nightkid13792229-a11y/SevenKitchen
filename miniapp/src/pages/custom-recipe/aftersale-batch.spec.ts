import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 多份订单 · 食谱调整（2026-10-25 重写）
 *
 * 新的交互不是“勾选多份 + 每份一个小输入框”，而是：
 *   · 一个“调整哪个食谱？”大容器；
 *   · Tab 切换摘要和表单；
 *   · 每份独立文字 + 附件；
 *   · 有文字的份才提交；多份也只算 1 次。
 */
const ORDER_DETAIL = 'src/pages/custom-recipe/order-detail.vue';
const AFTERSALE = 'src/pages/custom-recipe/aftersale.vue';
const API = 'src/api/custom-recipe.ts';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
}

describe('订单详情 · 每份食谱的「调整食谱」', () => {
  const source = stripComments(read(ORDER_DETAIL));

  it('★ 每张批次卡片都有入口，并带上这一份的 recipeId', () => {
    expect(source).toContain('调整食谱');
    expect(source).toContain('查看进展');
    expect(source).toContain('viewBatchAftersale');
    expect(source).toContain('item.recipeId');
    expect(source).toMatch(/v-for="[^"]*deliveryBatch\.items/);
    expect(source).toContain('buildAftersaleUrl');
  });

  it('★ 售后入口只在可申请或有进展时显示', () => {
    // 2026-10-25：改为按这一份的真实进展判断，不再整单统一“查看进展”
    expect(source).toContain('showAftersaleEntry(item.recipeId)');
    expect(source).toContain('aftersaleEntryLabel(item.recipeId)');
    expect(source).toContain('isAftersaleOpenForRecipe');
    expect(source).toContain('openAftersaleRecipeIds');
  });
});

describe('食谱调整页 · 多份食谱', () => {
  const source = stripComments(read(AFTERSALE));

  it('★ 接收 recipeId，读订单详情和交付内容里的摘要', () => {
    expect(source).toContain('decodeURIComponent(options.recipeId)');
    expect(source).toContain('fetchOrderDetail');
    expect(source).toContain('fetchDelivery');
    expect(source).toContain('deliveryBatch');
  });

  it('★ 默认激活进入时那一份（entry 优先）', () => {
    expect(source).toContain('const entry = next.find');
    expect(source).toContain('item.recipeId === recipeId.value');
    expect(source).toContain('entry?.key');
  });

  it('★ 大容器 + Tab 切换摘要和表单', () => {
    expect(source).toContain('调整哪个食谱？');
    expect(source).toContain('v-for="item in items"');
    expect(source).toContain('selectRecipe(item.key)');
    expect(source).toContain('activeKey');
    expect(source).toContain('食谱摘要');
    expect(source).toContain('想怎么调整');
  });

  it('★ 每份独立草稿（文字 + 附件）', () => {
    expect(source).toContain('drafts[item.key]');
    expect(source).toContain('activeDraft');
    expect(source).toContain('attachments');
  });

  it('★ 提交只带有文字的份，带 deliveryItemIds / recipeRequests / 每份 photos', () => {
    expect(source).toContain('filledItems');
    expect(source).toContain('deliveryItemIds');
    expect(source).toContain('recipeRequests');
    expect(source).toContain('photos: (drafts[item.key]?.attachments || []).map');
    expect(source).toContain("type: 'ADJUST_RECIPE'");
    expect(source).toContain('共 ${filledItems.length} 份食谱调整需求');
  });

  it('★ 老订单单份不传按份字段', () => {
    expect(source).toContain('const isBatch = filledItems.some');
    expect(source).toContain('...(isBatch');
  });

  it('★ 只有一份时不显示 Tab/大标题问题', () => {
    expect(source).toContain("items.length > 1 ? '调整哪个食谱？'");
    expect(source).toContain("items.length > 1 ? '写哪几份，就提交哪几份'");
  });

  it('★ 配额只展示后端口径，页面不做加减', () => {
    expect(source).not.toMatch(/freeRevisionsLeft\s*[-+*/]/);
    expect(source).not.toMatch(/windowDaysLeft\s*[-+*/]/);
    expect(source).toContain('freeRevisionsLeft');
    expect(source).toContain('windowDaysLeft');
  });
});

describe('售后 API · 每份附件', () => {
  const api = stripComments(read(API));

  it('★ 提交入参支持每份 photos', () => {
    expect(api).toContain('AftersaleRecipeRequest');
    expect(api).toContain('photos?: string[]');
    expect(api).toContain('recipeRequests');
    expect(api).toContain('deliveryItemIds');
  });

  it('★ 上传返回 id，删除有独立接口', () => {
    expect(api).toContain('deleteAftersaleAttachment');
    expect(api).toContain('/custom-recipe/attachments/');
    expect(api).toContain('fileUrl');
    expect(api).toContain('id: String(data.id');
  });

  it('★ 老字段仍在', () => {
    expect(api).toContain('type: input.type');
    expect(api).toContain('description: input.description');
    expect(api).toContain('photos: input.photos ?? []');
  });
});
