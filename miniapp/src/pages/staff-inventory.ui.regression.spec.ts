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
