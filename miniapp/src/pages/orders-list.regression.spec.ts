import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('orders list repurchase action contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/orders-list/index.vue'),
    'utf-8',
  );
  const templateSource = source.slice(0, source.indexOf('<script setup'));
  const buyAgainButtonSource =
    templateSource.match(
      /<button[\s\S]*?@tap="buyAgain\(order\)"[\s\S]*?<\/button>/,
    )?.[0] || '';
  const hasQuickActionsSource =
    source.match(/function hasQuickActions[\s\S]*?\n}\n\nfunction canApplyAftersale/)?.[0] ||
    '';
  const repurchaseSource =
    source.match(/function getRepurchasePackageCount[\s\S]*?\n}\n\nfunction formatAmount/)?.[0] ||
    '';

  it('shows buy again on every order card without status gating', () => {
    expect(buyAgainButtonSource).toContain('@tap="buyAgain(order)"');
    expect(buyAgainButtonSource).not.toContain("order.status === 'COMPLETED'");
    expect(buyAgainButtonSource).not.toContain("order.status === 'CANCELLED'");

    expect(hasQuickActionsSource).not.toContain("order.status === 'COMPLETED'");
    expect(hasQuickActionsSource).not.toContain("order.status === 'CANCELLED'");
  });

  it('uses the same safe repurchase handoff as order detail', () => {
    expect(repurchaseSource).toContain("url: `/recipes/${recipeId}`");
    expect(repurchaseSource).toContain("'PUBLIC'");
    expect(repurchaseSource).toContain("'ACTIVE'");
    expect(repurchaseSource).toContain('该食谱已下架，无法再次购买');
    expect(repurchaseSource).toContain('autoConfig=true');
    expect(repurchaseSource).toContain('packageCount');
    expect(repurchaseSource).toContain('packageSpecG');
    expect(repurchaseSource).toContain('perMealG');
  });
});
