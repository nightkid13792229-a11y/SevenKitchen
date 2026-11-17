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
    expect(source).toContain("'先选这笔订单的渠道'");
    // 手填模式说人话：先选在哪买的
    expect(source).toContain("'先选在哪买的'");
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
    expect(source).toContain('pendingLineCount > 0');
    expect(source).toContain('activeUnitMismatchCount');
  });

  it('实付没读到时，可报销金额显示「—」而不是 0.00', () => {
    expect(source).toContain("if (paid === null || paid === undefined) return '—';");
  });
});

describe('补货核对页 · 真机反馈（2026-11-12）', () => {
  it('商品名不再单行省略，长名字能看到全', () => {
    const css = source.slice(
      source.indexOf('.line-name {'),
      source.indexOf('.line-meta {'),
    );
    expect(css).not.toContain('text-overflow: ellipsis');
    expect(css).not.toContain('white-space: nowrap');
    expect(css).toContain('word-break: break-all');
  });

  it('已签收的订单显示签收时间，不再只写「预计到货 未填」', () => {
    expect(source).toContain('function orderInfoText');
    expect(source).toContain('已签收');
    expect(source).toContain('保存后直接算到货');
    expect(source).toContain('item.deliveredAt');
    expect(source).toContain('{{ orderInfoText(activeImport) }}');
  });

  it('单位对不上时按钮先拦住，不让点了保存才报错', () => {
    expect(source).toContain('行单位对不上，先改单位');
    expect(source).toContain('unitMismatch');
    expect(source).toContain('unitWarningText');
  });

  it('有单位/规格提示时，把截图规格一起显示出来', () => {
    expect(source).toContain('截图规格：{{ line.spec }}');
  });
});

describe('补货核对页 · 包装层级（2026-11-12）', () => {
  it('SKU 选项带上接口返回的 packagingText', () => {
    expect(source).toContain('packagingText: sku.packagingText || null');
    expect(source).toContain('packagingText: sku.packagingText ?? null');
  });

  it('核对页把匹配商品的包装层级显示出来', () => {
    expect(source).toContain('function packagingTextOf');
    expect(source).toContain('商品规格：{{ packagingTextOf(line) }}');
    expect(source).toContain('option.packagingText');
    expect(source).toContain('sheet-sku-packaging');
    expect(source).toContain('editing.skuPackagingText');
  });
});

/**
 * 2026-11-14 老板真机反馈：AI 识别后点「新建商品」，在新商品页点保存，
 * 会弹「这一笔还没保存，离开后要重新识别或手填」——可东西刚存好。
 *
 * 根因：这个离开提醒是装给**当时屏幕上那一页**的。本页被新商品页压着的时候，
 * load() 跑到最后又装一次提醒，就装到了新商品页上，那边保存完自动退回时被拦下。
 */
describe('识别结果页 · 离开提醒只装在自己这页（2026-11-14）', () => {
  it('本页被别的页盖住时不装提醒，免得装到新增采购商品页上', () => {
    const guard = source.slice(
      source.indexOf('function updateUnloadGuard'),
      source.indexOf('onLoad((options: Record<string, string>) => {'),
    );
    expect(guard).not.toBe('');
    expect(guard).toContain('pageVisible');
    expect(guard).toContain(
      'pageVisible && hasContent && !submitted.value',
    );
    // 手填只在真填过商品/金额时才拦；空白页不弹
    expect(guard).toContain('manualHasInput.value');
  });

  it('被盖住（去了新建商品页）就先把提醒撤掉', () => {
    const hideBlock = source.slice(
      source.indexOf('onHide(() => {'),
      source.indexOf('onUnload(() => {'),
    );
    expect(hideBlock).toContain('pageVisible = false');
    expect(hideBlock).toContain('updateUnloadGuard()');
  });

  it('回到这页立刻装回来，不等数据拉完', () => {
    const showBlock = source.slice(
      source.indexOf('onShow(() => {'),
      source.indexOf('onHide(() => {'),
    );
    expect(showBlock).toContain('updateUnloadGuard()');
    expect(showBlock.indexOf('updateUnloadGuard()')).toBeLessThan(
      showBlock.indexOf('void load()'),
    );
  });

  it('日采保存成功后自动返回前先撤掉提醒，不拦自己', () => {
    const saved = source.slice(
      source.indexOf('const res: any = await confirmOrderImports(ids)'),
      source.indexOf('setTimeout(() => uni.navigateBack(), 700)'),
    );
    expect(saved).not.toBe('');
    expect(saved).toContain('disableAlertBeforeUnload');
  });
});

/**
 * 2026-11-18 收口：手填不是 AI 核对页换个标题。
 * - 手填没有个人采购、没有订单号、没有截图/未读到/已改动；
 * - 新增采购商品复用现有页面，只加「回来挂到这一行」；
 * - 搜原料名要能搜到，本渠道没有商品时给「新建」而不是「没搜到」。
 */
describe('手填页收口（2026-11-18）', () => {
  const manualBlock = source.slice(
    source.indexOf('<!-- 手填：只回答三个问题'),
    source.indexOf('<!-- AI 核对（保持原样） -->'),
  );

  it('是一个独立的三块模板，不是 AI 页换标题', () => {
    expect(manualBlock).not.toBe('');
    expect(manualBlock).toContain('class="manual-page"');
    expect(manualBlock).toContain('在哪买的');
    expect(manualBlock).toContain('买了什么');
    expect(manualBlock).toContain('花了多少');
    expect(manualBlock).toContain('＋ 加第一项');
    expect(manualBlock).toContain('保存补货记录');
    expect(manualBlock).toContain('放弃这次填写');
  });

  it('手填不再出现个人采购 / 订单号 / 截图 / 未读到 / 已改动', () => {
    expect(manualBlock).not.toContain('个人采购');
    expect(manualBlock).not.toContain('订单号');
    expect(manualBlock).not.toContain('截图');
    expect(manualBlock).not.toContain('未读到');
    expect(manualBlock).not.toContain('已改动');
  });

  it('订单号去掉，但下单日期和运费/包装费保留', () => {
    expect(manualBlock).toContain('哪天买的');
    expect(manualBlock).toContain('onManualDateChange');
    expect(manualBlock).toContain('运费 / 包装费');
    expect(source).toContain('orderTime:');
    expect(source).toContain('12:00');
  });

  it('加一项弹窗手填只保留商品/数量/单价，名字和单位跟着商品', () => {
    expect(source).toContain(
      '<view v-if="manualMode" class="sheet-head manual-sheet-head">',
    );
    expect(source).toContain(
      '<view v-if="manualMode" class="sheet-head manual-sheet-head">\n            <text class="sheet-title">',
    );
    // 个人采购开关只在 AI 分支里
    expect(source).toContain('<view v-else class="sheet-head">');
    expect(source).toContain('editing.value.rawName = sku.name');
    expect(source).toContain('单位跟着采购商品走');
    expect(source).toContain('manualMode.value && !editing.value.procurementSkuId');
    expect(source).toContain("title: '先选采购商品'");
  });

  it('搜原料名能搜到：命中原料先把它的全部商品拉出来，再按渠道过滤', () => {
    expect(source).toContain('watch(skuSearch');
    expect(source).toContain('ensureSkusForIngredient(item.ingredientId)');
    expect(source).toContain('searchEmptyIngredients');
    expect(source).toContain('searchNoResult');
    expect(source).toContain('正在加载商品…');
    expect(source).toContain('loadingSkuIds');
    expect(source).toContain('goNewSkuForIngredient');
    expect(source).toContain('这个渠道下还没有商品');
  });

  it('加载中不先给「没有商品」：右栏和搜索都有加载态', () => {
    expect(source).toContain('pickerIngredientLoading');
    expect(source).toContain('searchSkuLoading');
    expect(source).toContain('v-else-if="pickerIngredientLoading"');
  });

  it('新增采购商品复用现有页面，只补「回来挂到这一行」', () => {
    // 只从现有页面返回，不在这里新画一个新建页
    expect(source).not.toContain('新建采购商品页');
    expect(source).toContain('mergeSkuOverride');
    expect(source).toContain('editing.value?.isNew && sku?.id');
    expect(source).toContain('已选上刚新建的商品，补齐数量/单价再添加');
    // 现有页面本身没有新增路由/新表单
    expect(source).toContain('buildSkuCreateQuery(\'order-import\')');
  });

  it('先选渠道再加第一项：选完直接接着加', () => {
    expect(source).toContain('pendingAddAfterChannel');
    expect(source).toContain('选完就继续加商品');
    expect(source).toContain('manualAddLine');
  });

  it('空白手填页不再拦「还没保存」', () => {
    expect(source).toContain('manualHasInput');
    expect(source).toContain("'这次手填还没保存，离开后填写的内容会丢掉。'");
  });
});

/**
 * 独立审核后的二轮修复（2026-11-18）：
 * - 原料目录加载中/失败要有可见状态和重试，不能静默空着；
 * - 日采（order-demand）不要被补货的 ensure/加载态影响；
 * - AI 未匹配行不能拿截图原文伪装已选商品；
 * - 费用弹层里没保存的金额也要进离开提醒；
 * - 手填实付和商品合计差异要提示，不能静默。
 */
describe('手填页审核修复（2026-11-18 二轮）', () => {
  it('原料目录有加载/失败态和重试，搜索延时期间不先报没找到', () => {
    expect(source).toContain('const catalogLoading = ref(false)');
    expect(source).toContain('const catalogError = ref');
    expect(source).toContain('const searchPending = ref(false)');
    expect(source).toContain('async function loadCatalog');
    expect(source).toContain('void loadCatalog()');
    expect(source).toContain('runSkuSearch');
    expect(source).toContain('正在加载原料…');
    expect(source).toContain('原料没加载出来');
    expect(source).toContain('点这里重试');
  });

  it('日采不再被补货的 ensure/加载态盖住', () => {
    // 右栏加载态只对补货生效
    expect(source).toContain("if (pageMode.value !== 'replenishment') return false;");
    // 打开抽屉、点原料、改行都不再给日采发商品请求
    expect(source).toContain("if (pageMode.value === 'replenishment') {\n    void ensureSkusForIngredient(pickerIngredientId.value);");
    expect(source).toContain("if (pageMode.value === 'replenishment') {\n    void ensureSkusForIngredient(ingredientId);");
    expect(source).toContain("line.ingredientId && pageMode.value === 'replenishment'");
  });

  it('AI 未匹配行不再拿截图原文冒充已选商品', () => {
    expect(source).toContain(
      "skuName: sku?.name || (manualMode.value ? line.rawName : '') || ''",
    );
  });

  it('费用弹层里没保存的金额也进离开提醒', () => {
    expect(source).toContain('feeEditing.value &&');
    expect(source).toContain('watch(\n  feeEditing,');
    expect(source).toContain('watch(');
  });

  it('手填实付和商品合计差异有提示；费用预览说「实付还没填」', () => {
    expect(source).toContain('manualFeeGapText');
    expect(source).toContain('manual-money-note');
    expect(source).toContain('实付还没填');
  });

  it('手填深链强制走补货；orderTime 为空时选今天也会补写', () => {
    expect(source).toContain(
      "if (manualMode.value) pageMode.value = 'replenishment';",
    );
    expect(source).toContain(
      'value === manualOrderDate.value && item.orderTime',
    );
    // 旧的手填提示条已死，删掉
    expect(source).not.toContain('手填：先选渠道');
  });

  it('手填次要文字用更深的颜色，正文和按钮触控高度不小于 40px', () => {
    expect(source).toContain('.manual-item-meta {\n  font-size: 24rpx;\n  color: #6b6653;');
    expect(source).toContain('.manual-money-row {\n  display: flex;');
    expect(source).toContain('min-height: 80rpx;');
    expect(source).toContain('min-height: 88rpx;');
  });
});
