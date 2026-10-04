/**
 * 犬用疫苗产品目录（2026-10-04）。
 *
 * ── 这份表从哪来 ──────────────────────────────────────────────
 *
 * 来自 `docs/plans/2026-10-04-vaccine-product-list-review.md`，
 * 那份清单**已经过兽医审核**。审出的两条硬口径：
 *
 *   ① 只收进口苗。老板 2026-10-04 审核意见第 5 条：
 *      "我们不推荐国产疫苗，所有国产疫苗都不推荐。也就是说，
 *       国产疫苗品牌及其产品不进清单。"
 *      → 所以这份表**没有任何国产品牌**，别往里加。
 *        国产苗顾客照样可以自己记录（记录侧是自由文本），只是我们不推荐。
 *
 *   ② 提醒里每个疫苗种类最多列 3 个产品（审核意见第 6 条）。
 *      见 `MAX_RECOMMENDED_PRODUCTS`。
 *
 * ── 为什么要单独建这张表 ──────────────────────────────────────
 *
 * 两个用途：
 *   1. **判断一条记录算哪几类**。以前靠关键词猜，于是"卫佳捌"（既是核心苗
 *      又含钩端螺旋体）只能算一类。有了这张表就能按真实成分算。
 *   2. **提醒里推荐具体产品**（"常见的有：卫佳伍、宠必威优免康"）。
 *
 * ⚠️ 措辞纪律：提醒里只写"常见的有…"，**不写"建议打…"**。
 *    各医院进的货不一样，推荐了顾客也未必买得到；而且"打哪个商品"
 *    已经挨着诊疗，不是我们该拍板的。
 *
 * ⚠️ 厂商名不作为主键：同一个产品在不同文件里挂的厂商名可能不一样
 *    （瑞比克在三处分别挂礼来 / 勃林格 / 硕腾，审计记录见清单 2.5），
 *    所以匹配一律按**商品名**。`manufacturer` 只用于展示。
 */

import type { VaccineKind } from './immunization-schedule';

export interface VaccineProduct {
  /** 商品名（匹配用的主键） */
  name: string;
  /**
   * 别名 / 顾客本子上可能写的其他写法。
   *
   * 只放**含义确定**的写法。故意不放"犬八联"这种：
   * 各家含义不一样，拿它当"含钩端"会误判。
   */
  aliases: string[];
  /** 厂商（仅展示，不参与匹配） */
  manufacturer: string;
  /** 防哪些病 */
  diseases: string[];
  /** 能顶哪些类别 —— 组合苗可以同时是 core + lepto */
  kinds: VaccineKind[];
  /**
   * 说明书上的最低首免周龄（null = 说明书未写明）。
   *
   * 用途：判断这支苗能不能顶上某一步。例如 6 周龄起的那几支
   * 顶不了"16 周龄那一针"，而 8 周龄起的钩端苗顶不了 8 周前的位置。
   */
  minWeeks: number | null;
  /** 现行进口兽药注册证书号 / 批准文号 */
  registration: string;
  /**
   * 现行说明书写的复种间隔（文字，仅展示与审核用）。
   *
   * ⚠️ **不作为计划的计算依据** —— 计划用的是我们自己那套程序表。
   * 两者不一致的地方已由兽医审过，见下面 `note`。
   */
  booster: string;
  /** 审核时特别记下的话，展示给内部看 */
  note?: string;
}

/**
 * 已审核的进口产品目录。
 *
 * 顺序 = 提醒里的推荐顺序（同类里按批签发批数从多到少，
 * 批数多的说明现在真在卖，顾客在医院更可能见到）。
 */
export const VACCINE_PRODUCTS: VaccineProduct[] = [
  /* ── 核心苗 ─────────────────────────────────────────────── */
  {
    name: '卫佳捌',
    aliases: ['vanguard plus 5-cvl', '卫佳8'],
    manufacturer: '硕腾 Zoetis（美国林肯厂）',
    diseases: [
      '犬瘟热',
      '犬腺病毒1型传染性肝炎',
      '犬腺病毒2型呼吸道病',
      '犬副流感',
      '犬细小病毒病',
      '犬冠状病毒病',
      '犬钩端螺旋体病（犬型）',
      '黄疸出血型钩端螺旋体病',
    ],
    kinds: ['core', 'lepto'],
    minWeeks: 6,
    registration: '（2020）外兽药证字26号',
    booster: '每年 1 次',
    note: '八重保护：核心 5 种 + 冠状病毒 + 两型钩端螺旋体。含钩端，所以打它也算在打钩端。',
  },
  {
    name: '宠必威优免康',
    aliases: ['intervet 四联'],
    manufacturer: '英特威 Intervet（荷兰，默沙东）',
    diseases: ['犬瘟热', '犬传染性肝炎', '犬细小病毒病', '犬副流感'],
    kinds: ['core'],
    minWeeks: null,
    registration: '（2019）外兽药证字05号',
    booster: '说明书未写首免周龄',
    note: '说明书里**确实没有**首免周龄，不是我们没查到 —— 不要从"宠必威"别的产品外推。',
  },
  {
    name: '卫佳伍',
    aliases: ['vanguard plus 5', '卫佳5'],
    manufacturer: '硕腾 Zoetis（美国林肯厂）',
    diseases: [
      '犬瘟热',
      '犬腺病毒1型传染性肝炎',
      '犬腺病毒2型呼吸道病',
      '犬副流感',
      '犬细小病毒肠炎',
    ],
    kinds: ['core'],
    minWeeks: 6,
    registration: '（2020）外兽药证字63号',
    booster: '每年 1 次',
    note: '商品名叫"伍"（数的是病），通用名却写"四联"（数的是疫苗成分）—— 顾客写哪种都可能。',
  },
  {
    name: '卫佳细',
    aliases: ['vanguard plus cpv'],
    manufacturer: '硕腾 Zoetis（美国林肯厂）',
    diseases: ['犬细小病毒肠炎'],
    kinds: ['core'],
    minWeeks: 6,
    registration: '（2020）外兽药证字28号',
    booster: '每年 1 次',
    note: '细小单苗。',
  },
  {
    name: '宠必威幼犬保',
    aliases: [],
    manufacturer: '英特威 Intervet（荷兰，默沙东）',
    diseases: ['犬瘟热', '犬细小病毒病'],
    kinds: ['core'],
    minWeeks: 4,
    registration: '（2018）外兽药证字02号',
    booster: '4~6 周龄基础接种',
    note: '说明书"建议 4~6 周龄基础接种"—— 这就是指南里"4 周龄起抢跑一针"那类产品。',
  },
  {
    name: '优乐康',
    aliases: [],
    manufacturer: '勃林格殷格翰（法国厂）',
    diseases: [
      '犬瘟热',
      '犬腺病毒病',
      '犬细小病毒病',
      '犬副流感病毒2型呼吸道感染症',
      '犬钩端螺旋体病',
      '黄疸出血型钩端螺旋体病',
    ],
    kinds: ['core', 'lepto'],
    minWeeks: 7,
    registration: '（2022）外兽药证字41号',
    booster: '每年 1 次',
    note: '含钩端，打它也算在打钩端。',
  },
  {
    name: '宠必威乐必妥',
    aliases: ['乐必妥'],
    manufacturer: '英特威 Intervet（荷兰，默沙东）',
    diseases: ['犬钩端螺旋体病（犬型）', '黄疸出血型钩端螺旋体病'],
    kinds: ['lepto'],
    minWeeks: 8,
    registration: '（2018）外兽药证字44号',
    booster: '每年 1 次',
    note: '**单苗**。钩端螺旋体那一类"每年一次"的程序就是照它说明书定的。',
  },
  {
    name: '海博莱犬四联加钩端',
    aliases: ['hipra 四联', '海博莱四联'],
    manufacturer: '西班牙海博莱 HIPRA',
    diseases: ['犬瘟热', '犬腺病毒病', '犬细小病毒病', '犬副流感', '钩端螺旋体病'],
    kinds: ['core', 'lepto'],
    minWeeks: null,
    registration: '（2022）外兽药证字46号',
    booster: '未查到',
    note: '说明书首免周龄未查到 —— 不要填。',
  },
  {
    name: '维克犬四联加钩端',
    aliases: ['virbac 四联'],
    manufacturer: '法国维克 VIRBAC',
    diseases: ['犬瘟热', '犬腺病毒病', '犬细小病毒病', '犬副流感', '钩端螺旋体病'],
    kinds: ['core', 'lepto'],
    minWeeks: null,
    registration: '（2024）外兽药证字04号',
    booster: '未查到',
    note: '说明书首免周龄未查到 —— 不要填。',
  },

  /* ── 狂犬苗 ─────────────────────────────────────────────── */
  {
    name: '宠必威锐必威',
    aliases: ['锐必威'],
    manufacturer: '英特威 Intervet（荷兰，默沙东）',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: 12,
    registration: '（2022）外兽药证字34号',
    booster: '说明书：每 36 个月 1 次',
    note:
      '说明书写的免疫期是 36 个月，但**国内法规要求每年一次**（《狂犬病防治技术规范》5.1）。' +
      '计划按法规走每年一次 —— 兽医审核意见第 1 条。',
  },
  {
    name: '瑞贝康',
    aliases: [],
    manufacturer: '勃林格殷格翰（法国厂）',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: 12,
    registration: '（2019）外兽药证字71号',
    booster: '每年 1 次',
    note:
      '说明书按母犬免疫状态二分：未免疫母犬的子代最早 4 周龄、已免疫的 11 周龄。' +
      '其余产品都写 3 月龄，兽医审核意见第 2 条确认**首免窗口仍卡 12 周不动**。',
  },
  {
    name: '瑞比克',
    aliases: ['rabvac'],
    // 三方文件挂的厂商名不一致，只写现行证号，不写厂商归属（清单 2.5）
    manufacturer: '（厂商归属三份文件不一致，见清单 2.5）',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: 12,
    registration: '（2022）外兽药证字29号',
    booster: '说明书：1 年后加强，此后每 3 年 1 次',
    note: '说明书说每 3 年，法规说每年 —— 计划按法规走每年一次。',
  },
  {
    name: '迪安适',
    aliases: [],
    manufacturer: '硕腾 Zoetis（美国林肯厂）',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: 12,
    registration: '（2026）外兽药证字09号',
    booster: '每年 1 次',
    note: '说明书免疫期 12 个月，与国内法规一致。',
  },
  {
    name: '维克狂犬',
    aliases: ['virbac 狂犬', 'vp12'],
    manufacturer: '法国维克 VIRBAC',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: 12,
    registration: '（2018）外兽药证字45号',
    booster: '每年 1 次',
  },
];

/** 提醒里每个疫苗种类最多列几个产品（兽医审核意见第 6 条） */
export const MAX_RECOMMENDED_PRODUCTS = 3;

/** 按商品名 / 别名找产品（大小写、空格不敏感） */
/** 去掉所有空白再比 —— 顾客本子上、AI 识别结果里"宠必威 幼犬保"这种带空格的写法很常见 */
function normalizeProductText(value: string): string {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

export function findProductsInName(name: string): VaccineProduct[] {
  const text = normalizeProductText(name);
  if (!text) {
    return [];
  }

  return VACCINE_PRODUCTS.filter((product) => {
    const candidates = [product.name, ...product.aliases];
    return candidates.some((candidate) => {
      const key = normalizeProductText(candidate);
      return key.length > 0 && text.includes(key);
    });
  });
}

/**
 * 某一步可以推荐哪些产品。
 *
 * 两条过滤：
 *   · 这支苗得**真的能顶这一类**（kinds 里有它）；
 *   · 这一步在 N 周龄，这支苗的**最低首免周龄不能晚于它**
 *     （晚于它的苗顶不上这一步）。
 *
 * 说明书没写周龄的（minWeeks 为 null）**不排除** —— 我们没查到不等于不能用，
 * 只是不拿周龄当筛选条件。
 */
export function recommendProductsForStep(
  kind: VaccineKind,
  stepWeeks: number | null,
): VaccineProduct[] {
  return VACCINE_PRODUCTS.filter((product) => {
    if (!product.kinds.includes(kind)) {
      return false
    }
    if (stepWeeks === null || product.minWeeks === null) {
      return true
    }
    return product.minWeeks <= stepWeeks
  }).slice(0, MAX_RECOMMENDED_PRODUCTS)
}
