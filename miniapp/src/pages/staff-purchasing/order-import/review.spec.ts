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
    expect(summaryBlock).toContain('明细合计');
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
    expect(summaryBlock).toContain('paidText');
    expect(source).toContain("if (paid === null || paid === undefined) return '未读到';");
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
    expect(sheetBlock).toContain('对应商品');
  });

  it('认不准的行在清单上标「待确认」，不再一律写「已匹配」', () => {
    expect(source).toContain('function lineTrusted');
    expect(source).toContain("return lineTrusted(line) ? '已匹配' : '待确认'");
    expect(source).toContain('matched-review');
  });

  // 「待确认」能直接生成，「选商品」会卡住整笔——两个标签长得一样会被当成同一件事
  // （2026-11-06 老板反馈：分不清哪行要动手）。这里锁住配色必须有区别。
  it('「选商品」和「待确认」不是同一个颜色', () => {
    const cssBlock = (selector: string) => {
      const start = source.indexOf(selector);
      expect(start).toBeGreaterThan(-1);
      return source.slice(start, source.indexOf('}', start));
    };
    const review = cssBlock('.state.matched-review');
    const needsSku = cssBlock('.state.needs-sku');
    const background = (css: string) =>
      /background:\s*([^;]+);/.exec(css)?.[1].trim() ?? '';

    // 待确认是浅底黄，选商品是实心色块：底色和字色都不能一样
    expect(background(needsSku)).not.toBe('');
    expect(background(needsSku)).not.toBe(background(review));
    expect(needsSku).not.toBe(review);
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
    expect(source).toContain('个人采购 · 不报销');
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

describe('order import edit sheet · 选商品时别忘了在配什么', () => {
  it('选商品弹窗顶部带上识别到的商品名 + 截图规格/金额', () => {
    expect(source).toContain('class="picker-context"');
    expect(source).toContain('正在匹配');
    expect(source).toContain('editing?.rawName');
    expect(source).toContain('const pickerContextMeta = computed');
  });
});

describe('选商品抽屉只列这笔订单渠道的商品（2026-11-06）', () => {
  it('抽屉按订单渠道筛商品，别的渠道不再混进来', () => {
    expect(source).toContain("from '../../../utils/purchase-channel'");
    expect(source).toContain('keepSkuForChannel');
    expect(source).toContain('const pickerOrderChannel = computed');
  });

  it('订单还没确认渠道时不打开抽屉，先让人定渠道', () => {
    // 渠道是商品匹配的门禁：没渠道就不知道筛哪一家
    expect(source).toContain("title: '先选这笔订单的渠道'");
  });

  it('抽屉顶部写明这笔是哪个渠道，不靠人猜', () => {
    expect(source).toContain('picker-channel-tag');
    expect(source).toContain('这笔在');
  });

  it('同渠道没有商品时说清楚，并引导去新建（新建会带渠道）', () => {
    expect(source).toContain('这个渠道下还没有采购商品');
  });

  it('新建采购商品带着这笔的渠道过去', () => {
    const starter = source.slice(
      source.indexOf('function goNewSku'),
      source.indexOf('async function saveEdit'),
    );
    expect(starter).toContain('channel=');
    expect(starter).toContain('pickerOrderChannel.value');
  });
});

/**
 * 2026-11-07 老板要求：从这页新建商品、保存回来，这一行要已经匹配上新商品，
 * 别再让人自己点「匹配商品」去挑一遍。
 */
describe('识别结果页 · 新建商品回来自动匹配', () => {
  const autoMatchBlock = source.slice(
    source.indexOf('async function applyPendingSkuMatch'),
    source.indexOf('// 核对到一半想补传一笔'),
  );

  it('按「哪一行 + 哪个商品」把这行改成已匹配', () => {
    expect(autoMatchBlock).not.toBe('');
    expect(autoMatchBlock).toContain(
      'updateOrderImportLine(owner.id, pending.lineId, payload)',
    );
    expect(autoMatchBlock).toContain('procurementSkuId: pending.sku.id');
  });

  it('匹配成功后收起抽屉，并告诉员工匹配上了', () => {
    expect(autoMatchBlock).toContain('if (drawerOpen) closeEdit(true)');
    expect(autoMatchBlock).toContain('已匹配刚新建的商品');
  });

  it('数量/单价没填好时别把抽屉关掉：选上商品，让人补完再保存', () => {
    expect(autoMatchBlock).toContain('selectSkuOnEditing(pending.sku)');
    expect(autoMatchBlock).toContain('补齐数量/单价再保存');
  });

  it('别家渠道的商品不硬挂到这笔上', () => {
    expect(autoMatchBlock).toContain('canAutoMatchSku');
    expect(autoMatchBlock).toContain('没有自动匹配');
  });
});

describe('补货模式', () => {
  it('saves through the replenishment endpoint instead of generating order-demand records', () => {
    expect(source).toContain("pageMode.value === 'replenishment'");
    expect(source).toContain('saveReplenishmentRecord');
    expect(source).toContain("'保存补货记录'");
  });

  it('loads the whole catalog for matching when there is no plan', () => {
    expect(source).toContain('getStockPurchaseIngredients');
    expect(source).toContain('catalogIngredients');
  });
});

describe('补货多笔订单', () => {
  it('loads every draft id and saves each one', () => {
    expect(source).toContain('options?.ids');
    expect(source).toContain('listIds.value.map((id) => getOrderImports(id))');
    expect(source).toContain('listIdsToSave');
    expect(source).toContain('for (const id of listIdsToSave)');
  });
});

describe('补货手填兜底', () => {
  it('can add a manual line through the same review sheet', () => {
    expect(source).toContain('openNewLine');
    expect(source).toContain('createOrderImportLine');
    expect(source).toContain('手动加一行');
    expect(source).toContain('manualMode');
  });
});

describe('采购记录必须挂商品', () => {
  it('核对页不再提供「按重量记」这种免商品入口', () => {
    expect(source).not.toContain('按重量记');
    expect(source).not.toContain('canRecordByWeight');
    expect(source).not.toContain('chooseWeightUnit');
  });

  it('弹窗里仍然保留新建采购商品入口：散称也要落到商品上', () => {
    expect(source).toContain('新建采购商品');
    expect(source).toContain('goNewSku');
  });
});

describe('补货核对 UX 收口', () => {
  it('deletes a bad line, edits order info, and shows the reimbursement amount', () => {
    expect(source).toContain('deleteOrderImportLine');
    expect(source).toContain('删掉这一行');
    expect(source).toContain('订单信息');
    expect(source).toContain('可报销');
    expect(source).toContain('confirmDuplicateOrderIfAny');
  });
});

describe('补货核对页 · 顶部合计可读性（2026-11-11）', () => {
  it('6 项金额用 3 列网格，标签不再互相压住', () => {
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(source).toContain('white-space: normal');
  });

  it('待处理为 0 时不再标黄', () => {
    expect(source).toContain(
      'activeSummary.unmatched + activeSummary.needsSku > 0',
    );
  });

  it('实付没读到时，可报销金额显示「—」而不是 0.00', () => {
    expect(source).toContain("if (paid === null || paid === undefined) return '—';");
  });
});
