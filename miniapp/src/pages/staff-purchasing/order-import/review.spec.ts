import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'review.vue'), 'utf8');

/** 顶部绿色合计区：从 summary 开始到 meta-row 之前 */
const summaryBlock = source.slice(
  source.indexOf('<view v-if="activeImport" class="summary">'),
  source.indexOf('<view v-if="activeImport" class="meta-row">'),
);

describe('order import review summary', () => {
  it('uses the reconciled amount in the top banner instead of the booked purchase amount', () => {
    expect(summaryBlock).not.toBe('');
    expect(summaryBlock).toContain('核对金额');
    expect(summaryBlock).not.toContain('采购金额');
    expect(summaryBlock).toContain('money(reconcileAmount)');
    expect(summaryBlock).not.toContain('activeSummary.matchedAmount');
  });

  it('computes the reconciled amount as goods + shipping + packaging', () => {
    expect(source).toContain(
      'const reconcileAmount = computed(() => feeSummary.value?.expected ?? 0)',
    );
  });

  it('shows 未读到 when the voucher amount was not read, instead of using the subtotal', () => {
    expect(summaryBlock).toContain('未读到');
    expect(summaryBlock).not.toContain('activeImport.paid ?? activeImport.subtotal');
  });

  it('lists 匹配原料 in the same CFCT order as the purchase detail page', () => {
    // 抽屉里是「本次清单里的原料」，顺序跟详情页一致（2026-11-05 老板定）
    expect(source).toContain("from '../food-category-order'");
    expect(source).toContain(
      'const items = sortPurchaseItemsForDisplay(list.value?.items || []);',
    );
  });
});

describe('order import edit sheet（2026-11-05 改版）', () => {
  /** 抽屉模板：从「修改一行」到「改运费」之前 */
  const sheetBlock = source.slice(
    source.indexOf('<!-- 修改一行'),
    source.indexOf('<!-- 改运费 / 包装费 -->'),
  );

  it('截图里的商品名可以直接改（不再是只读标题）', () => {
    expect(sheetBlock).toContain('v-model="editing.rawName"');
    expect(sheetBlock).not.toContain('修改「{{ editing.rawName }}」');
  });

  it('小计不再是输入框，只留下「和截图对不对」的一行核对', () => {
    expect(sheetBlock).not.toContain('editing.totalText');
    expect(sheetBlock).toContain('{{ checkText }}');
    expect(source).toContain('与截图小计一致');
    expect(source).toContain('按截图反算');
  });

  it('个人采购是标题栏上的开关，不再单独占一行', () => {
    expect(sheetBlock).toContain('<switch');
    expect(sheetBlock).not.toContain('算个人采购');
    expect(source).toContain('function onPersonalChange');
    // 开关只切换标记，不再把已选商品清空
    const handler = source.slice(
      source.indexOf('function onPersonalChange'),
      source.indexOf('function stepQty'),
    );
    expect(handler).not.toContain('editing.value.procurementSkuId = null');
  });

  it('数量单价并排，规格跟着商品名走（不再单独一行）', () => {
    expect(sheetBlock).toContain('class="amount-grid"');
    expect(sheetBlock).toContain('stepQty(-1)');
    expect(sheetBlock).not.toContain('净含量/规格');
    expect(sheetBlock).toContain('匹配商品');
  });

  it('认不准的行在清单上标「待确认」，不再一律写「已匹配」', () => {
    expect(source).toContain('function lineTrusted');
    expect(source).toContain("return lineTrusted(line) ? '已匹配' : '待确认'");
    expect(source).toContain('matched-review');
  });
});

describe('order import edit sheet · 真机反馈修复（2026-11-05 晚）', () => {
  it('单位改成弹层：showActionSheet 最多 6 项，8 项会直接失败不弹', () => {
    expect(source).toContain('function openUnitPicker');
    expect(source).toContain('unit-option');
    expect(source).not.toContain('uni.showActionSheet');
  });

  it('商品名自带规格时不再重复显示（…鲑鱼块 1kg · 1000g）', () => {
    expect(source).toContain('function extraSpecOf');
    expect(source).toContain('editingSpecText');
  });

  it('单价按两位小数显示（125.9 → 125.90）', () => {
    expect(source).toContain("priceText: line.unitPrice === null ? '' : money(line.unitPrice)");
  });

  it('选商品列表能搜（40 多个商品滑起来太慢）', () => {
    expect(source).toContain('const filteredSkuOptions = computed');
    expect(source).toContain('v-model="skuSearch"');
  });

  it('点选择器那一枪不会穿透，把整个抽屉关掉', () => {
    expect(source).toContain('pickerClosedAt');
    expect(source).toContain('sheetOpenedAt');
  });

  it('没带清单 id 进来时给空状态，不要一直转圈', () => {
    expect(source).toContain('loading.value = false');
    expect(source).toContain('loaded.value = true');
  });

  it('个人采购打开后，匹配商品那行变成说明文字，也不再能点开', () => {
    expect(source).toContain('个人采购 · 不生成采购记录');
    expect(source).toContain('function openSkuPicker');
    expect(source).toContain('if (editing.value?.isPersonal) return;');
  });
});

describe('order import edit sheet · 脏检查', () => {
  it('刚打开没改任何东西时，关掉不该弹「还没保存」', () => {
    // 价格输入框显示两位小数，原始值也必须按同一格式存，否则一比就认为改过
    expect(source).toContain(
      "_origPriceText: line.unitPrice === null ? '' : money(line.unitPrice)",
    );
    expect(source).not.toContain(
      "_origPriceText: line.unitPrice === null ? '' : String(line.unitPrice)",
    );
  });
});

describe('order import edit sheet · 匹配商品改二级联动（2026-11-05 晚）', () => {
  const pickerBlock = source.slice(
    source.indexOf('<!-- 选商品：左选原料、右选商品'),
    source.lastIndexOf('</template>'),
  );

  it('左栏列原料、右栏列这道原料下的商品，不再是一张 40 行的平铺表', () => {
    expect(pickerBlock).toContain('class="cascade-left"');
    expect(pickerBlock).toContain('class="cascade-right"');
    expect(pickerBlock).toContain('v-for="ingredient in pickerIngredients"');
    expect(pickerBlock).toContain('v-for="option in pickerSkuOptions"');
  });

  it('打开时就停在「这行现在匹配的原料」上，并把它滚进屏幕', () => {
    expect(source).toContain('const pickerIngredientAnchor = computed');
    expect(source).toContain('scroll-into-view="pickerIngredientAnchor"');
    expect(source).toContain("pickerIngredientId.value =\n    editing.value?.ingredientId");
  });

  it('左栏每个原料带上商品数，右栏标出「当前」', () => {
    expect(pickerBlock).toContain('cascade-count');
    expect(pickerBlock).toContain('picker-current');
  });

  it('搜字的时候退回平铺结果（知道商品名的人还是能直接搜）', () => {
    expect(pickerBlock).toContain('v-if="skuSearch"');
    expect(pickerBlock).toContain('filteredSkuOptions');
  });
});
