import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('recipe-order phase one UI contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/recipe-order/index.vue'),
    'utf-8',
  );

  it('exposes the three default order cycles and no custom days input', () => {
    expect(source).toContain('ORDER_CYCLE_OPTIONS');
    expect(source).not.toContain('customDays');
    expect(source).not.toContain('自选');
  });

  it('uses packagePlan instead of single packageCount/packageSpecG payload only', () => {
    expect(source).toContain('packagePlan');
    expect(source).toContain('ingredientSourcePlan');
  });

  it('does not expose quick meal-size editing controls', () => {
    expect(source).not.toContain('startEditPerMeal');
    expect(source).not.toContain('修改</button>');
    expect(source).not.toContain('重置</button>');
  });

  it('ties package plan readiness to the selected dog', () => {
    expect(source).toContain('packagePlanDogId');
    expect(source).toContain('isPackagePlanReadyForDog');
    expect(source).toContain('packagePlanDogId.value = null');
    expect(source).toContain('packagePlanDogId.value = selectedDogId.value');
  });

  it('uses normalized package rows for totals, preview, and checkout storage', () => {
    expect(source).toContain('normalizedPackagePlan');
    expect(source).toContain('getPackagePlanTotal(normalizedPackagePlan.value)');
    expect(source).toContain('packagePlan: normalizedPackagePlan.value');
    expect(source).not.toContain('packagePlan: packagePlan.value,');
  });

  it('debounces package input-driven price preview refreshes', () => {
    expect(source).toContain('pricePreviewDebounceTimer');
    expect(source).toContain('function schedulePricePreview');
    expect(source).toContain('clearTimeout(pricePreviewDebounceTimer');
    expect(source).toContain('schedulePricePreview()');
  });

  it('invalidates stale preview state before debounced package row repricing', () => {
    const updatePackagePlanRowSource = source.match(
      /function updatePackagePlanRow[\s\S]*?\n}\n\nfunction removePackagePlanRow/,
    )?.[0] || '';

    expect(source).toContain('function invalidatePackagePlanPricingPreview');
    expect(source).toContain('pricingPreviewRequestSeq += 1');
    expect(source).toContain('resetPricePreviewState()');
    expect(updatePackagePlanRowSource).toContain('invalidatePackagePlanPricingPreview()');
    expect(updatePackagePlanRowSource.indexOf('invalidatePackagePlanPricingPreview()'))
      .toBeLessThan(updatePackagePlanRowSource.indexOf('schedulePricePreview()'));
  });

  it('stores preparation and cooking methods for checkout display', () => {
    expect(source).toContain("uni.setStorageSync('direct_buy_order_config'");
    expect(source).toContain("preparationMethod: preparationMethod.value || 'CHOPPED'");
    expect(source).toContain("cookingMethod: cookingMethod.value || 'RAW'");
  });
});
