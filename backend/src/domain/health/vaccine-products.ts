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
  aliases?: string[];
  /**
   * 品牌 / 厂商（2026-10-05 新增，参与推荐排序）。
   *
   * 老板的规则："在疫苗产品推荐的时候，优先推荐同厂商或者同品牌的产品。
   * 早期的核心疫苗，比如宠必威的幼犬保，第一针打完之后，从第二针 6~8 周起，
   * 就应该打同品牌的 4 联疫苗了，而不是继续打幼犬保这种二联疫苗。"
   *
   * 所以同一家的产品要能**归到一起**：硕腾的卫佳伍/卫佳捌/卫佳细/迪安适
   * 是一个 brand，英特威的宠必威系列是另一个。
   * 同一家的苗免疫程序一致、衔接得上，混着打对孩子和家长都是麻烦。
   */
  brand: string;
  /** 厂商全称（展示用） */
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
  /**
   * 能不能出现在"常见的有…"那一行里（2026-10-05）。
   *
   * ⚠️ 国产苗一律 `false` —— 老板审核意见第 5 条："所有国产疫苗都不推荐"。
   *    但**可以出现在产品库里让顾客自己选**（老板 2026-10-05 补充：
   *    "推荐的时候不可以推荐国产品牌，但是产品库里面允许用户自己选择国产品牌"）。
   *    两个概念别混：**推荐 ≠ 可选**。
   */
  recommendable?: boolean;
}

/**
 * 已审核的进口产品目录。
 *
 * 顺序 = 提醒里的推荐顺序（同类里按批签发批数从多到少，
 * 批数多的说明现在真在卖，顾客在医院更可能见到）。
 */
export const VACCINE_PRODUCTS: VaccineProduct[] = [
  /* ── 进口苗（可推荐；顺序 = 推荐顺序，按批签发批数） ── */
  /* ── 核心苗 ─────────────────────────────────────────────── */
  {
    name: '卫佳捌',
    aliases: ['vanguard plus 5-cvl', '卫佳8'],
    manufacturer: '硕腾 Zoetis（美国林肯厂）',
    brand: '硕腾',
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
    brand: '英特威（默沙东）',
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
    brand: '硕腾',
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
    brand: '硕腾',
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
    brand: '英特威（默沙东）',
    diseases: ['犬瘟热', '犬细小病毒病'],
    // ⚠️ 单独一类，不能跟普通核心苗混（2026-10-05）：
    //    它 4 周龄起 1 针，之后仍要走 6~8 周起的正常首免 —— 周期完全不同。
    //    混进 core 的话，系统拿"6~8 周起"的窗口去套它，这一针排不进计划。
    kinds: ['core_early'],
    minWeeks: 4,
    registration: '（2018）外兽药证字02号',
    booster: '4~6 周龄基础接种（1 针，之后仍走常规首免）',
    note:
      '说明书"建议 4~6 周龄基础接种"—— 就是指南里"4 周龄起抢跑一针"那类产品。' +
      '老板 2026-10-05 特意点名它需要单独分类，否则没法排期。',
  },
  {
    name: '优乐康',
    aliases: [],
    manufacturer: '勃林格殷格翰（法国厂）',
    brand: '勃林格',
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
    brand: '英特威（默沙东）',
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
    brand: '海博莱',
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
    brand: '维克',
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
    brand: '英特威（默沙东）',
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
    brand: '勃林格',
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
    // 归属按老板 2026-10-05 确认：归勃林格。
    // （此前三份文件挂的厂家不一致：硕腾官网列在自家、说明书载勃林格、
    //   注册数据登记人为礼蓝 —— 老板拍板归勃林格，品牌匹配据此生效。）
    brand: '勃林格',
    manufacturer: '勃林格殷格翰（美国）',
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
    brand: '硕腾',
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
    brand: '维克',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: 12,
    registration: '（2018）外兽药证字45号',
    booster: '每年 1 次',
  },
];

/** 提醒里每个疫苗种类最多列几个产品（兽医审核意见第 6 条） */
export const MAX_RECOMMENDED_PRODUCTS = 3;

/**
 * 这支苗覆不覆盖**核心四病**（2026-10-05）。
 *
 * 老板的规则里藏着一个要求：推荐的产品得**真的顶得上这一步**。
 * 他举的例子是"幼犬保打完之后该打同品牌的 4 联，而不是继续打二联"——
 * 同理，**细小单苗（卫佳细）也不能拿来顶常规首免**：
 * 它只防细小，不防犬瘟热、腺病毒、副流感。
 *
 * 判据用产品自己的 `diseases`（我们核过成分的数据），不是猜名字。
 */
export function coversCoreSeries(product: VaccineProduct): boolean {
  const text = product.diseases.join(' ');
  return (
    /犬瘟/.test(text) &&
    /细小/.test(text) &&
    /腺病毒|传染性肝炎/.test(text) &&
    /副流感/.test(text)
  );
}

/**
 * 这支苗**能不能顶上某一类**（2026-10-05）。
 *
 * 这是老板第 2 问引出来的规则：
 *   "像卫佳细这种单联疫苗……即便顾客记录接种了这一类的疫苗，
 *    也当做没有接种过。核心疫苗需要重新开始免疫流程呢？"
 *
 * 实质是：**记了算记录，但顶不上就该继续提醒**。
 * 光看"分类"不够 —— 卫佳细和卫佳伍都归"核心疫苗"，可卫佳细只防细小一种，
 * 顶不上要求防四种病的核心首免。
 *
 * ⚠️ 宁严勿松：顶不上就继续提醒（多提醒无害，漏提醒有害）。
 */
export function productCoversKind(
  product: VaccineProduct,
  kind: VaccineKind,
): boolean {
  if (!product.kinds.includes(kind)) {
    return false
  }

  const text = product.diseases.join(' ')

  if (kind === 'rabies') return /狂犬/.test(text)
  if (kind === 'lepto') return /钩端/.test(text)
  // 核心苗那几步要求**四种都防**（犬瘟热 + 腺病毒/传染性肝炎 + 细小 + 副流感）——
  // 卫佳细（只防细小）、犬二联（只防两种）因此都顶不上。
  if (kind === 'core') return coversCoreSeries(product)
  // 早期核心疫苗：防犬瘟 + 细小，且**不是**完整四联（完整四联走 core 那一步）
  if (kind === 'core_early') {
    return /犬瘟/.test(text) && /细小/.test(text) && !coversCoreSeries(product)
  }

  return true
}

/**
 * 这只狗现在用的是哪个品牌（2026-10-05）。
 *
 * 老板："优先推荐同厂商或者同品牌的产品……其他的续接种也尽量优先同品牌的产品。"
 * 从**它已经打过的记录**里认：最近的几条记录里，能匹配到产品库的那个品牌。
 * 认不出来就没偏好，按默认顺序（批签发批数）推。
 */
export function resolvePreferredBrand(names: string[]): string {
  // 从最近往早看：最近一次用什么牌子，接着用同一个最顺
  for (let index = names.length - 1; index >= 0; index -= 1) {
    const hits = findProductsInName(String(names[index] || ''));
    for (const hit of hits) {
      if (hit.brand) {
        return hit.brand;
      }
    }
  }
  return '';
}

/** 按商品名 / 别名找产品（大小写、空格不敏感） */
/**
 * 比对前把"写法噪音"抹掉（2026-10-05）。
 *
 * 本子上印的是「宠必威® 幼犬保」，我们库里存的是「宠必威幼犬保」——
 * 中间一个 ® 就让 includes 匹配不上。实测就是这么翻车的：
 * 老板记录里那三条「宠必威® 幼犬保」全都判不出来。
 *
 * 抹掉的东西：
 *   · 空白（半角/全角）
 *   · 商标符号 ® ™ ©
 *   · 常见分隔符 · ・ - _ / \ 、，。．和括号
 *
 * ⚠️ 只抹**写法噪音**，不抹有含义的字。像"犬八联"这种各家含义不一样的
 *    叫法仍然不认 —— 那是靠人（或 AI）判的，不是靠字符串。
 */
function normalizeProductText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[®™©]/g, '')
    .replace(/[·・\-_/\\、,，.。．()（）【】\[\]]/g, '');
}

export function findProductsInName(name: string): VaccineProduct[] {
  const text = normalizeProductText(name);
  if (!text) {
    return [];
  }

  return VACCINE_PRODUCTS.filter((product) => {
    const candidates = [product.name, ...(product.aliases || [])];
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
  options: { preferredBrand?: string; allowCombo?: boolean } = {},
): VaccineProduct[] {
  const preferredBrand = String(options.preferredBrand || '').trim();
  // allowCombo 默认 true；只有"这一步不该顺带重复别的分类"时才传 false
  const allowCombo = options.allowCombo !== false;

  const eligible = VACCINE_PRODUCTS.filter((product) => {
    // 不推荐的（国产）直接排除 —— 它们只在产品库里可选
    if (product.recommendable === false) {
      return false
    }
    if (!product.kinds.includes(kind)) {
      return false
    }
    /*
     * 别推"会顺带重复另一个分类"的多联苗（2026-10-05 老板第 4 问）。
     *
     * 老板举的例子：幼犬 16 周后打了一针卫佳捌（核心+钩端），
     * 那钩端第 2 针（2~4 周后）该推什么？
     *   · 再推一针卫佳捌 → 等于**核心苗在 2~4 周内又打了一次**，
     *     而核心苗这时候应该等到 26 周才补强 —— 重复了。
     *   · 推一支**钩端单苗**（宠必威乐必妥）→ 正好。
     *
     * 所以：这一步如果**不需要**顺带打另一个分类（allowCombo = false），
     * 就只推"单一分类"的苗。什么时候 allowCombo 为真？
     * 见 buildVaccinePlan：这段时间**本来就有另一类该打**的时候 ——
     * 那时候多联苗一次搞定反而更好。
     */
    if (!allowCombo && product.kinds.length > 1) {
      return false
    }
    // 核心苗那几步必须**真的顶得上**：细小单苗不能拿来顶常规首免
    if (kind === 'core' && !coversCoreSeries(product)) {
      return false
    }
    if (stepWeeks === null || product.minWeeks === null) {
      return true
    }
    return product.minWeeks <= stepWeeks
  })

  // **同品牌优先**（老板规则一）：这只狗现在用什么牌子，续针就接着推那个牌子 ——
  // 同厂的免疫程序衔接得上，家长也不用记两套。
  // 同品牌内部仍按批签发批数排（批数多 = 现在真在卖）。
  if (preferredBrand) {
    const sameBrand = eligible.filter((p) => p.brand === preferredBrand)
    const others = eligible.filter((p) => p.brand !== preferredBrand)
    return [...sameBrand, ...others].slice(0, MAX_RECOMMENDED_PRODUCTS)
  }

  return eligible.slice(0, MAX_RECOMMENDED_PRODUCTS)
}

/* ===========================================================================
 * 国产苗：**只在产品库里可选，永远不参与推荐**（2026-10-05）
 *
 * 老板审核意见第 5 条定了"所有国产疫苗都不推荐"；
 * 2026-10-05 又补了一句把两件事分清楚：
 *   "推荐的时候不可以推荐国产品牌，但是产品库里面允许用户自己选择国产品牌。"
 *
 * 为什么必须有这一段：国产苗在本地医院的实际可得性**通常高于进口苗**
 * （中牧江西那支犬四联 64 批+，比所有进口苗都多）。产品库里没有它们，
 * 顾客打了国产苗就无处可记 —— 只能乱选一个，那比不做产品库更糟。
 *
 * 2026-10-05 审计：对照国家兽药基础数据库核过一次，补录了 4 个此前漏收的
 * 国产狂犬批准文号（惠中 / 佑本 / 爱宠 / 齐鲁）。
 * **佑达康**（北京科牧丰，兽药生字010726044）批准文号**已于 2025-11-04 过期**，
 * 是否续展未查到 —— 不收，免得推荐一个可能已经停产的。
 *
 * ⚠️ 数据来源：国家兽药基础数据库的兽药产品批准文号 / 批签发数据
 *    （见 docs/plans/2026-10-04-vaccine-product-list-review.md 附录）。
 *    这里只用到"商品名 / 企业 / 批准文号 / 防狂犬还是联苗"这些**核对过的**字段；
 *    说明书里的首免周龄多数没查到，一律 `minWeeks: null`，不编。
 */
const DOMESTIC_PRODUCTS: VaccineProduct[] = [
  /* ── 国产联苗（核心） ── */
  {
    name: '犬四联（中牧江西）',
    aliases: ['中牧犬四联'],
    manufacturer: '中牧实业股份有限公司江西生物药厂',
    brand: '中牧',
    diseases: ['犬瘟热', '犬副流感', '犬腺病毒', '犬细小病毒病'],
    kinds: ['core'],
    minWeeks: null,
    registration: '兽药生字140406047',
    booster: '说明书：断奶幼犬连打 3 次、间隔 21 天；成犬每年 2 次',
    note: '国产犬四联里批签发最多的一支（64 批+）。说明书用"断奶幼犬"表述，不给周龄。',
    recommendable: false,
  },
  {
    name: '科旺福',
    aliases: ['科前犬四联'],
    manufacturer: '武汉科前生物股份有限公司',
    brand: '科前',
    diseases: ['犬瘟热', '犬副流感', '犬腺病毒', '犬细小病毒病'],
    kinds: ['core'],
    minWeeks: null,
    registration: '兽药生字170046047',
    booster: '同上（同一新兽药核准说明书）',
    recommendable: false,
  },
  {
    name: '宠安士佳',
    aliases: ['五星犬四联'],
    manufacturer: '吉林省五星动物保健有限公司',
    brand: '五星',
    diseases: ['犬瘟热', '犬副流感', '犬腺病毒', '犬细小病毒病'],
    kinds: ['core'],
    minWeeks: null,
    registration: '兽药生字070416047',
    booster: '同上（同一新兽药核准说明书）',
    recommendable: false,
  },
  {
    name: '犬特威',
    manufacturer: '吉林特研生物技术有限责任公司',
    brand: '吉林特研',
    diseases: ['犬瘟热', '犬细小病毒病'],
    kinds: ['core'],
    minWeeks: null,
    registration: '兽药生字070296044',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '汪幼保',
    manufacturer: '洛阳惠中生物技术有限公司',
    brand: '洛阳惠中',
    diseases: ['犬瘟热', '犬细小病毒病'],
    kinds: ['core'],
    minWeeks: 6,
    registration: '兽药生字163006096',
    booster: '说明书：6 周龄以上犬注射 1.0ml，1 头份',
    recommendable: false,
  },
  {
    name: '金倍安',
    manufacturer: '金宇保灵生物药品有限公司',
    brand: '金宇保灵',
    diseases: ['犬瘟热', '犬细小病毒病'],
    kinds: ['core'],
    minWeeks: null,
    registration: '兽药生字050156044',
    booster: '未查到',
    recommendable: false,
  },

  /* ── 国产狂犬苗 ── */
  {
    name: '犬康',
    manufacturer: '金宇益康生物技术（辽宁）股份有限公司',
    brand: '金宇益康',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字060137524',
    booster: '未查到',
    note: '国产狂犬里批签发最多的一支（17 批）。',
    recommendable: false,
  },
  {
    name: '贝倍旺',
    manufacturer: '中牧实业股份有限公司江西生物药厂',
    brand: '中牧',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字140406048',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '犬力康',
    manufacturer: '国药集团动物保健股份有限公司',
    brand: '国药动保',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字170266040',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '科旺优',
    manufacturer: '武汉科前生物股份有限公司',
    brand: '科前',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字170047523',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '犬泰',
    manufacturer: '广州市华南农大生物药品有限公司',
    brand: '华南农大',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字190916040',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '福犬',
    manufacturer: '吉林和元生物工程股份有限公司',
    brand: '吉林和元',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字070187514',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '宠易佳',
    manufacturer: '青岛易邦生物工程有限公司',
    brand: '青岛易邦',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字150136658',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '诺瑞贝',
    manufacturer: '常州同泰生物药业有限公司',
    brand: '常州同泰',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字100657523',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '多倍美',
    manufacturer: '天津瑞普生物技术股份有限公司空港分公司',
    brand: '天津瑞普',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字020307517',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '贝乐美',
    manufacturer: '吉林正业生物制品股份有限公司',
    brand: '吉林正业',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字070227517',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '诺维瑞',
    manufacturer: '长春西诺生物科技有限公司',
    brand: '长春西诺',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字070386088',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '瑞倍尔安',
    manufacturer: '唐山怡安生物工程有限公司',
    brand: '唐山怡安',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字031417512',
    booster: '未查到',
    recommendable: false,
  },
  {
    name: '惠中犬狂犬',
    aliases: ['洛阳惠中狂犬'],
    manufacturer: '洛阳惠中生物技术有限公司',
    brand: '洛阳惠中',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字163006658',
    booster: '未查到',
    note: '2026-10-05 审计补录（对照国家兽药基础数据库的批准文号，此前漏收）。',
    recommendable: false,
  },
  {
    name: '佑本犬狂犬',
    manufacturer: '杭州佑本动物疫苗有限公司',
    brand: '杭州佑本',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字110546048',
    booster: '未查到',
    note: '2026-10-05 审计补录。',
    recommendable: false,
  },
  {
    name: '爱宠犬狂犬',
    manufacturer: '广西爱宠生物科技有限公司',
    brand: '广西爱宠',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字200766048',
    booster: '未查到',
    note: '2026-10-05 审计补录。',
    recommendable: false,
  },
  {
    name: '齐鲁犬狂犬',
    manufacturer: '齐鲁动物保健品有限公司',
    brand: '齐鲁',
    diseases: ['狂犬病'],
    kinds: ['rabies'],
    minWeeks: null,
    registration: '兽药生字150257517',
    booster: '未查到',
    note: '2026-10-05 审计补录。',
    recommendable: false,
  },
  {
    name: '汪倍护',
    manufacturer: '泰州博莱得利生物科技有限公司',
    brand: '泰州博莱得利',
    diseases: ['犬瘟热', '犬细小病毒病', '狂犬病'],
    kinds: ['core', 'rabies'],
    minWeeks: null,
    registration: '兽药生字101846066',
    booster: '未查到',
    note: '二联活疫苗 + 狂犬灭活的组合装，所以两类都算。',
    recommendable: false,
  },
];

// 国产苗并进同一个目录：产品库要能看到它们，推荐那一步再按 recommendable 过滤
VACCINE_PRODUCTS.push(...DOMESTIC_PRODUCTS);
