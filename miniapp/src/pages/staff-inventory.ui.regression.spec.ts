import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readPage = (path: string) =>
  readFileSync(resolve(__dirname, path), 'utf8');

describe('staff inventory stocktake entry (C5)', () => {
  const page = readPage('staff-inventory/stocktake-create.vue');

  it('is a blind count: no book quantity or variance', () => {
    expect(page).not.toContain('expectedQuantityG');
    expect(page).not.toContain('账面');
    expect(page).not.toContain('差异');
  });

  it('shows progress, draft and next step', () => {
    expect(page).toContain('已盘');
    expect(page).toContain('未盘');
    expect(page).toContain('存草稿');
    expect(page).toContain('下一步');
  });

  it('uses a numeric keyboard that advances to the next row', () => {
    expect(page).toContain('type="digit"');
    expect(page).toContain('confirm-type="next"');
    expect(page).toContain('focusNext');
  });

  it('starts from the server draft and falls back to a new stocktake', () => {
    expect(page).toContain('getStocktakeDraft');
    expect(page).toContain('startStocktake');
    expect(page).toContain('previewStocktake');
    expect(page.indexOf('getStocktakeDraft')).toBeLessThan(
      page.indexOf('await startStocktake'),
    );
  });

  it('warns before submitting with uncounted lines', () => {
    expect(page).toContain('还有 ${skipped} 项没盘');
    expect(page).toContain('previewStocktake(stocktakeId.value, skipped > 0)');
  });
});

describe('staff inventory stocktake result and records (C6)', () => {
  const result = readPage('staff-inventory/stocktake-result.vue');
  const records = readPage('staff-inventory/stocktake-records.vue');
  const pagesJson = readFileSync(
    resolve(__dirname, '../pages.json'),
    'utf8',
  );

  it('separates auto-applied and pending review lines', () => {
    expect(result).toContain('自动入账');
    expect(result).toContain('待复核');
    expect(result).toContain('未盘');
    expect(result).toContain('提交复核');
  });

  it('does not sum absolute deltas as a number', () => {
    expect(result).not.toContain('totalAbsDeltaG');
  });

  it('records page shows review actions and a restart path', () => {
    expect(records).toContain('待复核');
    expect(records).toContain('通过并入账');
    expect(records).toContain('驳回');
    expect(records).toContain('重新盘点');
    expect(records).toContain("role === 'ADMIN'");
  });

  it('registers both new pages', () => {
    expect(pagesJson).toContain('"path": "stocktake-records"');
    expect(pagesJson).toContain('"path": "stocktake-result"');
  });
});

describe('staff inventory adjustment create (C7)', () => {
  const page = readPage('staff-inventory/adjustment-create.vue');
  const pagesJson = readFileSync(resolve(__dirname, '../pages.json'), 'utf8');

  it('offers the four categories and explains approval', () => {
    expect(page).toContain('内部领用');
    expect(page).toContain('过期报废');
    expect(page).toContain('破损污染');
    expect(page).toContain('其他');
    expect(page).toContain('免审批');
    expect(page).toContain('待复核');
  });

  it('shows the estimated amount and posts a positive quantity', () => {
    expect(page).toContain('estimatedAmount');
    expect(page).toContain('createInventoryAdjustment');
    expect(page).toContain('quantity: quantity.value');
  });

  it('registers the page', () => {
    expect(pagesJson).toContain('"path": "adjustment-create"');
  });
});

describe('staff inventory home (C8)', () => {
  const page = readPage('staff-inventory/index.vue');
  const drawer = readPage('staff-inventory/components/InventoryDrawer.vue');
  const stockCreate = readPage('staff-purchasing/stock-create.vue');

  it('shows freshness, warning, search and four filters', () => {
    expect(page).toContain('数据截至');
    expect(page).toContain('上次盘库');
    expect(page).toContain('需要补货');
    expect(page).toContain('低于安全');
    expect(page).toContain('未设阈值');
    expect(page).toContain('全部');
    expect(page).toContain('搜原料、渠道、规格');
  });

  it('shows last movement, negative-stock flag and both actions', () => {
    expect(page).toContain('lastMovement');
    expect(page).toContain('待核实');
    expect(page).toContain('看流水');
    expect(page).toContain('去补货');
  });

  it('uses the drawer instead of dead navigation', () => {
    expect(page).toContain('InventoryDrawer');
    expect(page).toContain("openDrawer('needs')");
    expect(page).toContain("openDrawer('ledger'");
    expect(drawer).toContain('缺什么');
    expect(drawer).toContain('最近流水');
  });

  it('prefills the replenishment page with the ingredient', () => {
    expect(stockCreate).toContain('options?.ingredientId');
    expect(stockCreate).toContain('applyPendingIngredient');
  });

  it('has no in-page big title', () => {
    expect(page).not.toContain('<h1');
    expect(page).not.toContain('class="page-title"');
  });
});

describe('staff inventory in-transit display (D5)', () => {
  const page = readPage('staff-inventory/index.vue');
  const drawer = readPage('staff-inventory/components/InventoryDrawer.vue');

  it('shows in-transit and remaining shortage separately', () => {
    expect(page).toContain('在途');
    expect(page).toContain('还差');
    expect(page).toContain('已覆盖');
    expect(drawer).toContain('在途');
    expect(drawer).toContain('还差');
  });

  it('uses the net shortage for the estimated cost', () => {
    expect(page).toContain('netShortageEstimatedCost');
    expect(page).not.toContain('建议补 {{ fmt(item.suggestedPurchaseQuantity) }}');
  });
});

describe('staff inventory replenishment entry (2026-11-10)', () => {
  const page = readPage('staff-inventory/index.vue');

  it('opens the new replenishment page instead of the legacy plan page', () => {
    expect(page).toContain('/pages/staff-purchasing/replenishment/index');
    expect(page).not.toContain('stock-create?ingredientId=');
  });
});
