import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('recipe-order phase one UI contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/recipe-order/index.vue'),
    'utf-8',
  );
  const templateSource = source.slice(0, source.indexOf('<script setup'));

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

  it('sends legacy pricing preview fields alongside packagePlan for production API compatibility', () => {
    expect(source).toContain('function buildPricingPreviewItem');
    expect(source).toContain('quantityG: Math.round(totalGrams.value)');
    expect(source).toContain('packageCount: totalPackages.value');
    expect(source).toContain('packageSpecG: getPrimaryPackageSpecG(normalizedPackagePlan.value)');
    expect(source).toContain('cycleDays: selectedCycleDays.value');
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

  it('presents the redesigned purchase decision sections in order', () => {
    const sectionOrder = [
      '食谱信息',
      'dogProfileSummaryText',
      '订购天数',
      '原料采购方案',
      '原料清单',
      '产品说明',
      '分装及物流说明',
      'bottom-bar',
    ];

    const positions = sectionOrder.map((text) => templateSource.indexOf(text));
    positions.forEach((position, index) => {
      expect(position, `${sectionOrder[index]} should exist`).toBeGreaterThan(-1);
    });

    for (let index = 1; index < positions.length; index += 1) {
      expect(
        positions[index],
        `${sectionOrder[index]} should appear after ${sectionOrder[index - 1]}`,
      ).toBeGreaterThan(positions[index - 1]);
    }
  });

  it('classifies the top recipe, dog feeding, and package blocks without repeated package summaries', () => {
    expect(templateSource).toContain('食谱信息');
    expect(templateSource).toContain('营养标准');
    expect(templateSource).toContain('配方软件');
    expect(templateSource).toContain('能量密度');
    expect(templateSource).toContain('dogProfileSummaryText');
    expect(templateSource).toContain('主食能量');
    expect(templateSource).toContain('本食谱参考饭量');
    expect(templateSource).toContain('packagePlanInlineSummaryText');
    expect(source).toContain('自定义分装');
    expect(source).toContain('isCustomPackagePlan');
    expect(source).toContain('cancelCustomPackagePlan');
    expect(source).toContain('请先取消自定义分装后再切换订购天数');
    expect(source).toContain('MIN_PACKAGE_SPEC_G');
    expect(source).toContain('hasInvalidPackageSpec');
    expect(source).toContain('packagePlanValidationMessage');
    expect(source).toContain('每袋重量不能少于 ${MIN_PACKAGE_SPEC_G}g');
    expect(source).toContain('if (packagePlanValidationMessage.value) return');
    expect(source).toContain('Math.max(MIN_PACKAGE_SPEC_G');
    expect(templateSource).toContain("{{ showPackageEditor ? '取消自定义' : '自定义分装' }}");
    expect(templateSource).toContain(':class="{ active: selectedCycleDays === days, disabled: isCustomPackagePlan }"');
    expect(templateSource).toContain('v-if="packagePlanValidationMessage"');
    expect(templateSource).toContain('{{ packagePlanValidationMessage }}');
    expect(source).not.toContain('packageSpecG: Math.max(MIN_PACKAGE_SPEC_G, Math.floor(Number(row.packageSpecG) || MIN_PACKAGE_SPEC_G))');
    expect(source).toContain('v-if="dogs.length > 1"');
    expect(source).toContain("].join(' ｜ ')");
    expect(source).toContain('.recipe-meta-card');
    expect(source).toContain('align-items: center;');
    expect(source).toContain('text-align: center;');
    expect(source).toContain('添加规格');
    expect(source).toContain('当前 {{ Math.round(totalGrams) }}g，最低订购量为 1000g');
    expect(source).toContain('getInitials');
    expect(source).toContain('calculateDogAgeText');
    expect(source).toContain("MALE: '弟弟'");
    expect(source).toContain("FEMALE: '妹妹'");
    expect(source).toContain('return `${years}岁`');
    expect(source).not.toContain("MALE: '男孩'");
    expect(source).not.toContain("FEMALE: '女孩'");
    expect(source).not.toContain('restMonths > 0 ? `${years}岁${restMonths}个月`');
    expect(source).not.toContain('`姓名 ${selectedDog.value.name}`');
    expect(source).not.toContain('`年龄 ${calculateDogAgeText(selectedDog.value)}`');
    expect(source).not.toContain('`性别 ${getDogGenderLabel(selectedDog.value.gender)}`');
    expect(source).not.toContain('`体重 ${selectedDog.value.currentWeightKg}kg`');
    expect(source).not.toContain('`每日餐数 ${selectedDog.value.mealsPerDay}餐/天`');
    expect(source).not.toContain("].join(' / ')");
    expect(templateSource).not.toContain('修改分装方案');
    expect(templateSource).not.toContain('package-plan-preview');
    expect(templateSource).not.toContain('package-preview-row');
    expect(templateSource).not.toContain('<text class="title-text">参考饭量</text>');
    expect(templateSource).not.toContain('狗狗档案与饭量参考');
    expect(templateSource).not.toContain('当前分装方案');
    expect(templateSource).not.toContain('分装方案</text>');
    expect(templateSource).not.toContain('（总净重）');
    expect(templateSource).not.toContain('每日主食能量');
    expect(templateSource).not.toContain('本食谱每日建议饭量');
    expect(templateSource).not.toContain('查看计算过程');
    expect(templateSource).not.toContain('可自定义');
    expect(templateSource).not.toContain('系统已按 {{ selectedCycleDays }} 天生成');
    expect(templateSource).not.toContain('总袋数');
    expect(templateSource).not.toContain('预计可喂');
    expect(templateSource).not.toContain('订单总量由分装明细自动汇总');
  });

  it('shows source plan cards with pricing impact copy', () => {
    expect(source).toContain('source-plan-card');
    expect(source).toContain('方案会影响原料清单和订单价格');
    expect(source).toContain('formatSourcePlanPrice(option.code)');
    expect(source).toContain('loadSourcePlanPricePreviews');
  });

  it('shows a compact ingredient summary and the full four-column ingredient list', () => {
    expect(source).toContain('ingredient-summary-title');
    expect(source).toContain('查看全部 ${totalIngredientCount.value} 种原料');
    expect(source).toContain('原料名称');
    expect(source).toContain('规格');
    expect(source).toContain('采购渠道');
    expect(source).toContain('用量');
    expect(source).toContain('ingredient-channel-tag');
  });

  it('explains product handling, storage, production, and logistics before checkout', () => {
    expect(source).toContain('为什么要把所有原料打碎？');
    expect(source).toContain('保存方法、保质期和烹饪说明');
    expect(source).toContain('当日采购当日制作，冷冻 24 小时后发货');
    expect(source).toContain('分装及物流说明');
    expect(source).toContain('按袋真空分装');
  });

  it('uses bag-based bottom pricing states instead of daily pricing', () => {
    expect(source).toContain('bottomPriceTitle');
    expect(source).toContain('bottomPriceSubtitle');
    expect(source).toContain('¥${averagePricePerPackage.value.toFixed(2)}/袋');
    expect(source).toContain('多规格共 ${totalPackages.value}袋');
    expect(source).not.toContain('每日预估');
    expect(source).not.toContain('pricePerDayText');
  });
});
