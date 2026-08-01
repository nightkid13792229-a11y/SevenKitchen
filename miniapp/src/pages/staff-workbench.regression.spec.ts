import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pagesJson = readFileSync(resolve(__dirname, '../pages.json'), 'utf8');
const refundsPagePath = resolve(__dirname, 'staff-refunds/index.vue');
const workbenchSource = readFileSync(resolve(__dirname, 'staff-workbench/index.vue'), 'utf8');

describe('staff workbench refund consolidation', () => {
  it('does not register the retired staff refunds page', () => {
    expect(pagesJson).not.toContain('pages/staff-refunds/index');
  });

  it('does not retain the retired staff refunds page file', () => {
    expect(existsSync(refundsPagePath)).toBe(false);
  });

  it('does not link the workbench to the retired staff refunds page', () => {
    expect(workbenchSource).not.toContain('/pages/staff-refunds/index');
  });

  it('does not retain the retired workbench refund entry', () => {
    expect(workbenchSource).not.toContain('goToRefunds');
  });
});
