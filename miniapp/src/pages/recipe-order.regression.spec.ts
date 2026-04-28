import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('recipe-order phase one UI contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/recipe-order/index.vue'),
    'utf-8',
  );
  const templateSource = source.slice(0, source.indexOf('<script setup'));
  const pagesJsonSource = readFileSync(
    resolve(process.cwd(), 'src/pages.json'),
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
    expect(source).toContain('dogId: selectedDog.value?.id || selectedDogId.value');
    expect(source).toContain('recipeId: recipeId.value');
    expect(source).toContain("preparationMethod: preparationMethod.value || 'CHOPPED'");
    expect(source).toContain("cookingMethod: cookingMethod.value || 'RAW'");
  });

  it('presents the redesigned purchase decision sections in order', () => {
    const sectionOrder = [
      '食谱信息',
      'dogProfileSummaryText',
      '配置天数',
      '原料来源',
      '说明',
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

    expect(pagesJsonSource).toContain('"navigationBarTitleText": "成品配置页面"');
    expect(templateSource).toContain('保存采购及分装配置');
    expect(templateSource).not.toContain('订购天数');
    expect(templateSource).not.toContain('原料采购来源');
    expect(templateSource).not.toContain('产品说明');
    expect(templateSource).not.toContain('确认订单');
  });

  it('renders all recipe life-stage tags in Chinese on the order page', () => {
    expect(templateSource).toContain('getLifeStageLabel(stage)');
    expect(source).toContain('../../utils/life-stage-match');
    expect(source).toContain('getLifeStageLabel');
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
    expect(source).toContain('请先取消自定义分装后再切换配置天数');
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

  it('merges source plan selection and ingredient list into one compact section', () => {
    expect(templateSource).toContain('ingredient-source-section');
    expect(templateSource).toContain('原料来源');
    expect(templateSource).not.toContain('方案会影响原料清单和订单价格');
    expect(templateSource).toContain('source-plan-card compact');
    expect(templateSource).toContain('formatSourcePlanShortName(option.code)');
    expect(templateSource).not.toContain('ingredient-summary');
    expect(templateSource).not.toContain('sourcePlanDescription');
    expect(templateSource).not.toContain('sourcePlanFallbackNote');
    expect(source).toContain("const selectedSourcePlan = ref<IngredientSourcePlanCode>('WHOLESALE')");
    expect(source).not.toContain("const selectedSourcePlan = ref<IngredientSourcePlanCode>('MARKET_PREMIUM')");
    expect(source).not.toContain('ingredientSummaryMeta');
    expect(source).not.toContain('种食材 · ${supplementIngredients.value.length}种补剂');
    expect(source).not.toContain('净重 ${totalFoodKg.toFixed(2)}kg');
    expect(templateSource).toContain('原料清单生成中，请稍后查看');
    expect(templateSource).not.toContain('<text class="title-text">原料采购方案</text>');
    expect(templateSource).not.toContain('<text class="title-text">原料清单</text>');
    expect(templateSource).not.toContain('<text class="title-text">采购来源</text>');
    expect(templateSource).not.toContain('<text class="title-text">原料与采购</text>');
    expect(templateSource).not.toContain('当前部分原料暂无替代来源时');
    expect(templateSource).not.toContain('>已选</text>');
    expect(source).toContain('function formatSourcePlanShortName');
    expect(source).toContain("ORGANIC: '有机优先'");
    expect(source).toContain("MARKET_PREMIUM: '超市优先'");
    expect(source).toContain("WHOLESALE: '批发市场优先'");
    expect(source).not.toContain("WHOLESALE: '性价比优先'");
    expect(source).not.toContain('function getSourcePlanDescription');
    expect(source).not.toContain('优先选择有机、草饲、散养、非转基因来源');
    expect(source).not.toContain('优先选择山姆、盒马、沃集鲜等商超来源');
    expect(source).not.toContain('人食级原料，优先选择生鲜批发来源');
    expect(source).not.toContain('原料优先选择有机、非转基因、生态散养来源');
    expect(source).not.toContain('原料优先选择山姆、盒马、沃集鲜等知名商超来源');
    expect(source).not.toContain('原料选择以人食级为底线，尽量选择肉团、生鲜批发等性价比高的来源');
    expect(source).not.toContain('个别原料买不到时，会自动选择标准接近的来源');
    expect(source).toContain('source-plan-card');
    expect(source).toContain('formatSourcePlanPrice(option.code)');
    expect(source).toContain('loadSourcePlanPricePreviews');
  });

  it('shows ingredients and supplements in a compact two-line detail layout', () => {
    expect(templateSource).toContain('v-if="totalIngredientCount > 0" class="ingredients-content"');
    expect(source).not.toContain('ingredientPreviewItems');
    expect(source).not.toContain('ingredientDetailsButtonText');
    expect(source).not.toContain('showIngredientDetails');
    expect(source).not.toContain('toggleIngredientDetails');
    expect(source).not.toContain('查看全部 ${totalIngredientCount.value} 种原料');
    expect(source).not.toContain('收起原料清单');
    expect(templateSource).not.toContain('原料用量');
    expect(templateSource).not.toContain('补剂用量');
    expect(templateSource).not.toContain('原料列表');
    expect(templateSource).not.toContain('营养补剂');
    expect(templateSource).not.toContain('ingredient-table-header');
    expect(templateSource).not.toContain('ingredient-header-cell');
    expect(templateSource).not.toContain('采购渠道</text>');
    expect(templateSource).not.toContain('产品规格</text>');
    expect(templateSource).toContain('ingredient-list-title');
    expect(templateSource).toContain('原料明细</text>');
    expect(templateSource).not.toContain("<text class=\"ingredient-spec\">{{ ingredient.brand || '-' }}</text>");
    expect(templateSource).not.toContain('@tap="showIngredientDetail(ingredient)"');
    expect(templateSource).not.toContain('ingredient-name-button');
    expect(templateSource).not.toContain('ingredient-name-arrow');
    expect(templateSource).toContain('v-for="ingredient in displayIngredientRows"');
    expect(templateSource).toContain('ingredient-type-tag');
    expect(templateSource).toContain('{{ ingredient.typeLabel }}');
    expect(templateSource).toContain('ingredient.typeClass');
    expect(templateSource).toContain('ingredient-row-main');
    expect(templateSource).toContain('<text class="ingredient-name">{{ ingredient.nameText }}</text>');
    expect(templateSource).toContain('{{ ingredient.amountText }}');
    expect(templateSource).toContain('ingredient-meta-row');
    expect(templateSource).toContain('ingredient-meta-item');
    expect(templateSource).toContain('ingredient-meta-label');
    expect(templateSource).toContain('渠道</text>');
    expect(templateSource).toContain('品牌</text>');
    expect(templateSource).toContain('规格</text>');
    expect(templateSource).toContain('{{ ingredient.purchaseChannelText }}');
    expect(templateSource).toContain('{{ ingredient.brandText }}');
    expect(templateSource).toContain('{{ ingredient.productModelText }}');
    expect(templateSource).not.toContain('{{ formatIngredientAmount(ingredient) }}');
    expect(templateSource).not.toContain('{{ buildIngredientDisplayName(ingredient) }}');
    expect(templateSource).not.toContain('{{ buildIngredientPurchaseChannelText(ingredient) }}');
    expect(templateSource).not.toContain('{{ buildIngredientBrandText(ingredient) }}');
    expect(source).toContain('displayIngredientRows');
    expect(source).toContain('procurementSkuName?: string');
    expect(source).toContain('buildIngredientDisplayName');
    expect(source).toContain('buildIngredientPurchaseChannelText');
    expect(source).toContain('buildIngredientBrandText');
    expect(source).toContain('displayIngredients');
    expect(source).toContain('getIngredientTypeLabel');
    expect(source).toContain('getIngredientTypeClass');
    expect(source).not.toContain('ingredient-table-grid');
    expect(source).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(source).toContain('white-space: normal;');
    expect(source).not.toContain('ingredient-spec-cell');
    expect(source).toContain('productModel?: string');
    expect(source).not.toContain('function showIngredientDetail(ingredient: IngredientCostItem)');
    expect(source).not.toContain('title: ingredient.name');
    expect(source).not.toContain("品牌：${ingredient.brand || '-'}");
    expect(source).not.toContain("规格：${ingredient.productModel || '-'}");
  });

  it('explains product handling, storage, production, and logistics before checkout', () => {
    expect(templateSource).toContain('product-explanation-media');
    expect(templateSource).toContain('product-explanation-media-label');
    expect(templateSource).toContain('product-explanation-logistics-card');
    expect(templateSource).toContain('product-explanation-logistics-visual');
    expect(templateSource).toContain('product-explanation-package-frame');
    expect(templateSource).toContain('product-explanation-package-image');
    expect(templateSource).toContain('mode="aspectFit"');
    expect(templateSource).toContain('product-explanation-shipping-row');
    expect(templateSource).toContain('product-explanation-shipping-main');
    expect(templateSource).toContain('product-explanation-shipping-copy');
    expect(templateSource).toContain('product-explanation-shipping-logo');
    expect(templateSource).toContain('product-explanation-shipping-title');
    expect(templateSource).toContain('product-explanation-shipping-subtitle');
    expect(templateSource).toContain('product-explanation-shipping-pill');
    expect(source).toContain('mediaKind');
    expect(source).toContain('mediaLabel');
    expect(source).toContain('packageImageUrl');
    expect(source).toContain('shippingLogoUrl');
    expect(source).toContain('loadProductExplanationMediaConfig');
    expect(source).toContain("url: '/global-config'");
    expect(source).toContain('packageExampleImageUrl');
    expect(source).toContain('shippingCompanyLogoUrl');
    expect(source).toContain("const DEFAULT_PACKAGE_EXAMPLE_IMAGE_URL = 'https://img.sevenkitchen.cloud/package-images/1769932497277-7bf4f880.jpg'");
    expect(source).toContain("const DEFAULT_SHIPPING_COMPANY_LOGO_URL = 'https://img.sevenkitchen.cloud/shipping-logos/1769932504418-14b5188c.png'");
    expect(source).not.toContain('/static/product-explanation/package-example');
    expect(source).not.toContain('/static/product-explanation/shipping-logo');
    expect(source).toContain('https://img.sevenkitchen.cloud/package-images/1769932497277-7bf4f880.jpg');
    expect(source).toContain('https://img.sevenkitchen.cloud/shipping-logos/1769932504418-14b5188c.png');
    expect(source).toContain('STALE_PRODUCT_EXPLANATION_MEDIA_URLS');
    expect(source).toContain('isUsableProductExplanationMediaUrl');
    expect(source).toContain('isUsableProductExplanationMediaUrl(configuredPackageImageUrl)');
    expect(source).toContain('isUsableProductExplanationMediaUrl(configuredShippingLogoUrl)');
    expect(source).toContain('packageImageUrl: DEFAULT_PACKAGE_EXAMPLE_IMAGE_URL');
    expect(source).toContain('shippingLogoUrl: DEFAULT_SHIPPING_COMPANY_LOGO_URL');
    const localProductExplanationStaticDir = resolve(process.cwd(), 'src/static/product-explanation');
    expect(
      existsSync(localProductExplanationStaticDir)
        ? readdirSync(localProductExplanationStaticDir)
        : [],
    ).toEqual([]);
    expect(source).toContain("normalizeImageUrl('http://img.sevenkitchen.cloud/package-images/1767527958742-149215e3.jpg')");
    expect(source).toContain("normalizeImageUrl('http://img.sevenkitchen.cloud/shipping-logos/1767529001420-55fde8f2.png')");
    expect(source).not.toContain("title: '分装与物流'");
    expect(source).not.toContain("title: '当日采购当日制作'");
    expect(source).toContain('保质期与存储方式');
    expect(source).toContain('-18℃');
    expect(source).toContain('冷冻保存');
    expect(source).toContain('可保存 6 个月');
    expect(source).toContain('0-4℃');
    expect(source).toContain('冷藏保存');
    expect(source).toContain('可保存 3 天');
    expect(source).toContain('最佳营养保存期');
    expect(source).toContain('建议 1 个月内吃完，不建议囤货');
    expect(source).toContain('烹饪方法');
    expect(source).toContain('蒸');
    expect(source).toContain('炖');
    expect(source).toContain('低温慢煮');
    expect(source).toContain('烹饪时间与重量和体积相关，请参考产品标签');
    expect(source).toContain('微波');
    expect(source).toContain('炸');
    expect(source).toContain('炒');
    expect(source).toContain('煎');
    expect(source).toContain('不建议微波、炸、炒、煎等高温烹饪方式');
    expect(source).toContain('product-explanation-plain-card');
    expect(source).not.toContain('制作流程');
    expect(source).not.toContain('保质期、保存方法、烹饪方法');
    expect(source).not.toContain('保质期：冷冻保存，建议 3 个月内吃完');
    expect(source).not.toContain('保存方法：收到后请立即冷冻，单袋解冻后尽快喂完');
    expect(source).not.toContain('烹饪方法：提前冷藏解冻，可隔水温热后喂食');
    expect(source).not.toContain('成品形态');
    expect(source).not.toContain('所有食材会按配方处理后打碎，并充分混匀');
    expect(source.indexOf('保质期与存储方式')).toBeLessThan(source.indexOf('烹饪方法'));
    expect(source).not.toContain('为什么要把所有原料打碎？');
    expect(source).not.toContain('减少挑食，避免只挑肉不吃菜或补剂');
    expect(source).not.toContain('保存和喂食方法');
    expect(source).not.toContain('按袋真空分装，每袋贴有信息标签');
    expect(source).not.toContain('使用冷冻包材和冰袋配送，减少运输温度波动');
    expect(source).not.toContain('明显完全解冻，请拍照后联系客服');
    expect(source).not.toContain('冷冻满 24 小时后发货');
    expect(source).not.toContain('具体制作与发货时间以下单确认页为准');
    expect(templateSource).not.toContain('<view class="section logistics-section">');
    expect(templateSource).not.toContain('<text class="title-text">分装及物流说明</text>');
  });

  it('uses bag-based bottom pricing states instead of daily pricing', () => {
    expect(source).toContain('bottomPriceTitle');
    expect(source).toContain('bottomPriceSubtitle');
    expect(source).toContain('¥${averagePricePerPackage.value.toFixed(2)}/袋');
    expect(source).toContain('多规格共 ${totalPackages.value}袋');
    expect(source).not.toContain('每日预估');
    expect(source).not.toContain('pricePerDayText');
  });

  it('keeps the bottom pricing summary next to the confirmation button and right aligned', () => {
    expect(templateSource).toContain('保存采购及分装配置');
    expect(templateSource).not.toContain('立即下单');
    expect(templateSource).not.toContain('确认订单');

    const bottomBarBlocks = [...source.matchAll(/\.bottom-bar\s*\{([\s\S]*?)\}/g)]
      .map((match) => match[1]);
    const bottomPriceBlocks = [...source.matchAll(/\.bottom-price\s*\{([\s\S]*?)\}/g)]
      .map((match) => match[1]);
    const buyButtonBlocks = [...source.matchAll(/\.btn-buy-now\s*\{([\s\S]*?)\}/g)]
      .map((match) => match[1]);

    expect(bottomBarBlocks.length).toBeGreaterThan(0);
    expect(bottomPriceBlocks.length).toBeGreaterThan(0);
    expect(buyButtonBlocks.length).toBeGreaterThan(0);

    bottomBarBlocks.forEach((block) => {
      expect(block).toContain('justify-content: flex-end;');
    });

    bottomPriceBlocks.forEach((block) => {
      expect(block).toContain('flex: 0 1 auto;');
      expect(block).toContain('align-items: flex-end;');
      expect(block).toContain('text-align: right;');
      expect(block).not.toContain('flex: 1;');
    });

    buyButtonBlocks.forEach((block) => {
      expect(block).toContain('margin: 0;');
    });
  });

  it('keeps the long save configuration button label on one line', () => {
    const buyButtonBlocks = [...source.matchAll(/\.btn-buy-now\s*\{([\s\S]*?)\}/g)]
      .map((match) => match[1]);

    expect(buyButtonBlocks.length).toBeGreaterThan(0);

    buyButtonBlocks.forEach((block) => {
      expect(block).toContain('width: 336rpx;');
      expect(block).toContain('display: flex;');
      expect(block).toContain('align-items: center;');
      expect(block).toContain('justify-content: center;');
      expect(block).toContain('white-space: nowrap;');
      expect(block).toContain('line-height: 1;');
      expect(block).not.toContain('width: 240rpx;');
      expect(block).not.toContain('line-height: 84rpx;');
    });
  });

  it('submits the saved purchase and package configuration directly with contact details', () => {
    const continueBuyNowSource = source.match(
      /async function continueBuyNow[\s\S]*?\n}\n\nfunction goToCreateDog/,
    )?.[0] || '';

    expect(continueBuyNowSource).toContain("url: '/orders'");
    expect(continueBuyNowSource).toContain("method: 'POST'");
    expect(continueBuyNowSource).toContain("type: 'FRESH_FOOD'");
    expect(continueBuyNowSource).toContain('snapshotId: pricingSnapshotId.value');
    expect(continueBuyNowSource).not.toContain('addressId:');
    expect(continueBuyNowSource).not.toContain('targetProductionDate:');
    expect(continueBuyNowSource).toContain("url: `/orders/${orderId}/confirm`");
    expect(continueBuyNowSource).toContain('showSaveSuccessDialog.value = true');
    expect(continueBuyNowSource).not.toContain("title: '保存成功'");
    expect(continueBuyNowSource).not.toContain('Seven爸爸的微信号：zhaochengccc');
    expect(continueBuyNowSource).not.toContain('/pages/checkout/index');
    expect(source).not.toContain('uni.navigateTo({\n    url: `/pages/checkout/index');
  });

  it('shows the saved configuration success copy with one-tap WeChat ID copying', () => {
    expect(templateSource).toContain('v-if="showSaveSuccessDialog"');
    expect(templateSource).toContain('保存成功');
    expect(templateSource).toContain('成品配置方案已经保存。');
    expect(templateSource).toContain('请联系Seven爸爸了解制作信息。');
    expect(templateSource).toContain('微信号：{{ SEVEN_DAD_WECHAT_ID }}');
    expect(templateSource).toContain('@tap="copySevenDadWechatId"');
    expect(templateSource).toContain('复制微信号');
    expect(templateSource).toContain('@tap="closeSaveSuccessDialog"');
    expect(templateSource).toContain('知道了');
    expect(source).toContain("const SEVEN_DAD_WECHAT_ID = 'zhaochengccc'");
    expect(source).toContain('function copySevenDadWechatId()');
    expect(source).toContain('uni.setClipboardData');
    expect(source).toContain('data: SEVEN_DAD_WECHAT_ID');
    expect(source).toContain("title: '微信号已复制'");
  });
});
