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

import {
  VACCINE_KIND_LABELS,
  VACCINE_KINDS,
  type VaccineKind,
} from './schedule-table';

/**
 * 疫苗**成分（病种）**词表（2026-10-06 老板定的模型）。
 *
 * 老板原话："我们需要把产品库做的更详细一点。也就是每一个产品，它里面包含
 * 哪些种类的疫苗。然后我们再根据它是否包含犬瘟、细小和腺病毒这三类疫苗，
 * 来决定它是不是核心疫苗。……而在用户需要确认和手动修改的分类中，
 * 我们不应该把分类呈现给用户看……我们需要把它拆开，拆成每一个疫苗种类
 * 让顾客选择，至于分类的判定则交由后台来完成。"
 *
 * 所以从今天起：
 *   · `components`（含哪些病种）是**唯一的事实**
 *   · `kinds`（能顶哪几类）**由它推导**，不再手写 —— 两者不可能再打架
 *   · 顾客看到的是病种，类别只在后台用来排期
 */
export type VaccineComponent =
  | 'cdv' // 犬瘟热
  | 'cpv' // 犬细小病毒
  | 'cav' // 犬腺病毒（传染性肝炎 + 呼吸道病）
  | 'cpi' // 犬副流感
  | 'rabies' // 狂犬病
  | 'lepto' // 钩端螺旋体
  | 'ccov' // 犬冠状病毒
  | 'bordetella' // 博德特氏菌（犬窝咳）
  | 'lyme'; // 莱姆病（伯氏疏螺旋体）

export const VACCINE_COMPONENT_LABELS: Record<VaccineComponent, string> = {
  cdv: '犬瘟热',
  cpv: '犬细小病毒',
  cav: '犬腺病毒',
  cpi: '犬副流感',
  rabies: '狂犬病',
  lepto: '钩端螺旋体',
  ccov: '犬冠状病毒',
  bordetella: '博德特氏菌',
  lyme: '莱姆病',
};

/** 顾客勾选时的顺序：核心三支在前，然后是狂犬，再是非核心 */
export const VACCINE_COMPONENTS: readonly VaccineComponent[] = [
  'cdv',
  'cpv',
  'cav',
  'rabies',
  'lepto',
  'cpi',
  'ccov',
  'bordetella',
  'lyme',
];

/**
 * WSAVA 2024：犬的**核心疫苗只有三支** —— 犬瘟、腺病毒、细小。
 *
 * ⚠️ 副流感**不在**这里（它属非核心，与博德特氏菌同归"犬窝咳"）。
 * 来源：Squires et al., JSAP 65(5):277–316（2024 WSAVA 指南）。
 */
export const CORE_COMPONENTS: readonly VaccineComponent[] = [
  'cdv',
  'cpv',
  'cav',
];

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
  /** 防哪些病（**给人看的原文**，来自说明书；机器判定一律用 components） */
  diseases: string[];
  /**
   * 含哪些病种 —— **分类的唯一来源**（2026-10-06）。
   * 改这里就够了，kinds 会自动跟着变。
   */
  components: VaccineComponent[];
  /**
   * 4 周龄就能打的早期苗（宠必威幼犬保）。
   *
   * 它不是"成分特殊"，而是**周期特殊** —— 4 周龄抢跑一针，
   * 之后仍要从 6~8 周走常规首免（见 immunization-schedule 的 core_early）。
   * 所以这一条没法从成分推出来，得单独标。
   */
  earlySeries?: boolean;
  /**
   * 能顶哪些类别 —— **由 components 推导**（见 kindsOfComponents），
   * 不再手写。组合苗可以同时是 core + lepto。
   */
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
/** 原始数据：只登记成分，kinds 由下面的 kindsOfComponents 统一推导 */
const RAW_VACCINE_PRODUCTS: Omit<VaccineProduct, 'kinds'>[] = [
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
    components: ['cdv', 'cav', 'cpi', 'cpv', 'ccov', 'lepto'],
    minWeeks: 6,
    registration: '（2020）外兽药证字26号',
    booster: '每年 1 次',
    note: '八重保护：核心 5 种 + 冠状病毒 + 两型钩端螺旋体。含钩端，所以打它也算在打钩端。',
  },
  {
    name: '宠必威优免康',
    /*
     * ⚠️ 短名别名必须有（2026-10-09 实测）：
     * 疫苗本/贴纸上常常只写「优免康」，不带"宠必威"前缀；
     * 而匹配规则是"输入里要包含库里的名字"，只写短名就查不到 ✗ ——
     * 后果不只是显示难看：**计划那边靠名字反推"这一针顶哪一类"**，
     * 查不到就等于这一针白打了（实测赛文那条 2023-08-09 的优免康记录
     * 就这么被漏掉，核心疫苗仍然显示"该打了"）。
     */
    /*
     * ⚠️ 法定**通用名**必须有（2026-10-16 补）：疫苗本/贴纸上印的常常不是商品名，
     * 而是这一串法定名。逐字来源：默沙东动物保健中国官网产品页
     * `msd-animal-health.com.cn/products/nobivac-dhppi/`（"通用名 犬瘟热、传染性肝炎、
     * 细小病毒病、副流感四联活疫苗"，商品名 宠必威®优免康）—— 与
     * `docs/plans/2026-10-04-vaccine-product-list-review.md` 2.6 表里的写法一致（两处互证）。
     * 注意它写的是"传染性肝炎"而不是"腺病毒"（同一个 CAV），别按"腺病毒"去拼。
     */
    aliases: [
      'intervet 四联',
      '优免康',
      '犬瘟热、传染性肝炎、细小病毒病、副流感四联活疫苗',
    ],
    manufacturer: '英特威 Intervet（荷兰，默沙东）',
    brand: '英特威（默沙东）',
    diseases: ['犬瘟热', '犬传染性肝炎', '犬细小病毒病', '犬副流感'],
    components: ['cdv', 'cav', 'cpv', 'cpi'],
    minWeeks: null,
    registration: '（2019）外兽药证字05号',
    booster: '说明书未写首免周龄',
    note: '说明书里**确实没有**首免周龄，不是我们没查到 —— 不要从"宠必威"别的产品外推。',
  },
  {
    name: '卫佳伍',
    /*
     * 通用名逐字来源（2026-10-16 补）：硕腾中国官网「疫苗家族」的产品资料
     * （`zoetis.cn` 卫佳伍产品介绍 PDF 标题就是这一串），与
     * `docs/plans/2026-10-04-vaccine-product-list-review.md` 2.6 表（取自国家兽药基础数据库）
     * 一致 —— 两处互证 ✓。
     *
     * ⚠️ 卫佳捌里**也含**这同一套四联成分，所以这一串严格说是"四联那部分"的名字；
     *    本子上只印这一串时按**卫佳伍**认（它的法定通用名就是它）✓，
     *    真打了卫佳捌的本子会带 CV-L / 捌 字样，走更长的那条匹配 ✓。
     */
    aliases: [
      'vanguard plus 5',
      '卫佳5',
      '犬瘟热、腺病毒2型、副流感、细小病毒病四联活疫苗',
    ],
    manufacturer: '硕腾 Zoetis（美国林肯厂）',
    brand: '硕腾',
    diseases: [
      '犬瘟热',
      '犬腺病毒1型传染性肝炎',
      '犬腺病毒2型呼吸道病',
      '犬副流感',
      '犬细小病毒肠炎',
    ],
    components: ['cdv', 'cav', 'cpv', 'cpi'],
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
    components: ['cpv'],
    minWeeks: 6,
    registration: '（2020）外兽药证字28号',
    booster: '每年 1 次',
    note: '细小单苗。',
  },
  {
    name: '宠必威幼犬保',
    // 短名别名，同上（贴纸上常只写「幼犬保」）
    aliases: ['幼犬保'],
    manufacturer: '英特威 Intervet（荷兰，默沙东）',
    brand: '英特威（默沙东）',
    diseases: ['犬瘟热', '犬细小病毒病'],
    // ⚠️ 单独一类，不能跟普通核心苗混（2026-10-05）：
    //    它 4 周龄起 1 针，之后仍要走 6~8 周起的正常首免 —— 周期完全不同。
    //    混进 core 的话，系统拿"6~8 周起"的窗口去套它，这一针排不进计划。
    components: ['cdv', 'cpv'],
    /** 4 周龄就能打（抢跑一针）—— 周期和常规首免完全不同，见 core_early 的说明 */
    earlySeries: true,
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
    components: ['cdv', 'cav', 'cpv', 'cpi', 'lepto'],
    minWeeks: 7,
    registration: '（2022）外兽药证字41号',
    booster: '每年 1 次',
    note: '含钩端，打它也算在打钩端。',
  },
  {
    name: '宠必威乐必妥',
    /*
     * 「乐必妥」（短名）+ 法定**通用名**（2026-10-16 补）。
     * 通用名逐字来源：默沙东动物保健中国官网产品列表页 ——
     * 「宠必威®乐必妥（NOBIVAC® LEPTO）｜犬钩端螺旋体病（犬型、黄疸出血型）二价灭活疫苗」。
     */
    aliases: ['乐必妥', '犬钩端螺旋体病（犬型、黄疸出血型）二价灭活疫苗'],
    manufacturer: '英特威 Intervet（荷兰，默沙东）',
    brand: '英特威（默沙东）',
    diseases: ['犬钩端螺旋体病（犬型）', '黄疸出血型钩端螺旋体病'],
    components: ['lepto'],
    minWeeks: 8,
    registration: '（2018）外兽药证字44号',
    booster: '每年 1 次',
    note: '**单苗**。钩端螺旋体那一类"每年一次"的程序就是照它说明书定的。',
  },
  {
    name: '海博莱犬四联加钩端',
    /*
     * 法定**通用名**（2026-10-16 补）：逐字取自
     * `docs/plans/2026-10-04-vaccine-product-list-review.md` 2.6 表
     * （该表的来源是国家兽药基础数据库，A 级）。
     *
     * ⚠️ 四家的"四联"通用名各不相同（2.6 表列了 4 个版本），所以只能逐字抄，
     *    不能拿"四联"两个字当检索键 ✗。
     */
    aliases: [
      'hipra 四联',
      '海博莱四联',
      '犬瘟热、腺病毒病、细小病毒病、副流感四联活疫苗',
    ],
    manufacturer: '西班牙海博莱 HIPRA',
    brand: '海博莱',
    /*
     * 钩端按**血清型**分开写（老板 2026-10-14 要求，与卫佳捌/宠必威乐必妥同口径）——
     * 官方注册通用名里就是"犬钩端螺旋体病（犬型、黄疸出血型）"，是**二价**的，
     * 只写"钩端螺旋体病"会看不出它防的是哪两型。
     */
    diseases: [
      '犬瘟热',
      '犬腺病毒病',
      '犬细小病毒病',
      '犬副流感',

      '犬钩端螺旋体病（犬型）',
      '黄疸出血型钩端螺旋体病',
    ],
    components: ['cdv', 'cav', 'cpv', 'cpi', 'lepto'],
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
    /*
     * 钩端按**血清型**分开写（老板 2026-10-14 要求，与卫佳捌/宠必威乐必妥同口径）——
     * 官方注册通用名里就是"犬钩端螺旋体病（犬型、黄疸出血型）"，是**二价**的，
     * 只写"钩端螺旋体病"会看不出它防的是哪两型。
     */
    diseases: [
      '犬瘟热',
      '犬腺病毒病',
      '犬细小病毒病',
      '犬副流感',

      '犬钩端螺旋体病（犬型）',
      '黄疸出血型钩端螺旋体病',
    ],
    components: ['cdv', 'cav', 'cpv', 'cpi', 'lepto'],
    minWeeks: null,
    registration: '（2024）外兽药证字04号',
    booster: '未查到',
    note: '说明书首免周龄未查到 —— 不要填。',
  },

  /* ── 狂犬苗 ─────────────────────────────────────────────── */
  {
    name: '宠必威锐必威',
    /*
     * 毒株别名（2026-10-16 补）：本子上常常只印「狂犬病灭活疫苗（Pasteur RIV株）」
     * 而不印商品名 ✗ —— 只靠"锐必威"三个字认不出来。
     * 毒株逐字来源：`docs/plans/2026-10-04-vaccine-product-list-review.md` 3.2 表
     * （取自国家兽药基础数据库的说明书，A 级）。毒株是一支苗唯一的，不会认错别家 ✓。
     *
     * ⚠️ 通用名「犬、猫狂犬病灭活疫苗」**故意不放**：好几支狂犬苗共用它，
     *    放进来会把瑞比克/迪安适的写法吸到锐必威上 ✗。
     */
    aliases: ['锐必威', 'pasteur riv株'],
    manufacturer: '英特威 Intervet（荷兰，默沙东）',
    brand: '英特威（默沙东）',
    diseases: ['狂犬病'],
    components: ['rabies'],
    minWeeks: 12,
    registration: '（2022）外兽药证字34号',
    booster: '说明书：每 36 个月 1 次',
    note:
      '说明书写的免疫期是 36 个月，但**国内法规要求每年一次**（《狂犬病防治技术规范》5.1）。' +
      '计划按法规走每年一次 —— 兽医审核意见第 1 条。',
  },
  {
    name: '瑞贝康',
    // 2026-10-09 老板让去官网核的：勃林格中国官网产品页写的就是
    // 「瑞贝康（狂犬病灭活疫苗（G52株））」+【进口兽药注册证书号】（2019）外兽药证字71号
    // —— 和我们库里登记的证号一字不差 ✓，页面引用的英文名就是 Rabisin ✓。
    // 「瑞比信」官网没有这个写法 ✗（大概是旧译名或医院自己写的），先不加 ✓。
    /*
     * 毒株别名（2026-10-16 补）：本子上常写「狂犬病灭活疫苗（G52株）」不写商品名。
     * 毒株逐字来源：上面的官网核对 + `docs/plans/2026-10-04-vaccine-product-list-review.md`
     * 3.2 表（G52 株）。G52 只有瑞贝康用 ✓。
     */
    aliases: ['rabisin', 'g52株'],
    manufacturer: '勃林格殷格翰（法国厂）',
    brand: '勃林格',
    diseases: ['狂犬病'],
    components: ['rabies'],
    minWeeks: 12,
    registration: '（2019）外兽药证字71号',
    booster: '每年 1 次',
    note:
      '说明书按母犬免疫状态二分：未免疫母犬的子代最早 4 周龄、已免疫的 11 周龄。' +
      '其余产品都写 3 月龄，兽医审核意见第 2 条确认**首免窗口仍卡 12 周不动**。',
  },
  {
    name: '瑞比克',
    // 毒株别名（2026-10-16 补）：HCP-SAD 株逐字来源同锐必威/G52
    // （`2026-10-04-vaccine-product-list-review.md` 3.2 表，A 级）。只有瑞比克用 HCP-SAD ✓。
    aliases: ['rabvac', 'hcpsad株'],
    // 归属按老板 2026-10-05 确认：归勃林格。
    // （此前三份文件挂的厂家不一致：硕腾官网列在自家、说明书载勃林格、
    //   注册数据登记人为礼蓝 —— 老板拍板归勃林格，品牌匹配据此生效。）
    brand: '勃林格',
    manufacturer: '勃林格殷格翰（美国）',
    diseases: ['狂犬病'],
    components: ['rabies'],
    minWeeks: 12,
    registration: '（2022）外兽药证字29号',
    booster: '说明书：1 年后加强，此后每 3 年 1 次',
    note: '说明书说每 3 年，法规说每年 —— 计划按法规走每年一次。',
  },
  {
    name: '迪安适',
    // 毒株别名（2026-10-16 补）：SVR-289（≥1.0 IU），来源同 3.2 表（A 级）。只有迪安适用它 ✓。
    aliases: ['svr289株'],
    manufacturer: '硕腾 Zoetis（美国林肯厂）',
    brand: '硕腾',
    diseases: ['狂犬病'],
    components: ['rabies'],
    minWeeks: 12,
    registration: '（2026）外兽药证字09号',
    booster: '每年 1 次',
    note: '说明书免疫期 12 个月，与国内法规一致。',
  },
  {
    name: '维克狂犬',
    // 毒株别名（2026-10-16 补）：VP12 株，来源同 3.2 表（A 级）。只有维克狂犬用 VP12 ✓。
    aliases: ['virbac 狂犬', 'vp12', 'vp12株'],
    manufacturer: '法国维克 VIRBAC',
    brand: '维克',
    diseases: ['狂犬病'],
    components: ['rabies'],
    minWeeks: 12,
    registration: '（2018）外兽药证字45号',
    booster: '每年 1 次',
  },
];

/**
 * 由成分推导"能顶哪几类"（2026-10-06）。
 *
 * 规则（老板定的口径 + WSAVA 2024）：
 *   · 早期苗（幼犬保，4 周龄抢跑）      → core_early（**不再补 core**，周期完全不同）
 *   · 含犬瘟/腺病毒/细小**其中任意一种** → core（"这是核心病种的疫苗"）
 *   · 含钩端螺旋体                      → lepto
 *   · 含狂犬                            → rabies
 *   · 上面都没有                        → other（只记录、不参与计划）
 *
 * ⚠️ 注意 core 的口径是"**含核心病种之一**"，不是"三种全覆盖"：
 *    卫佳细（只防细小）也算 core —— 它确实是核心病种的疫苗。
 *    能不能**顶掉核心首免那一整套**是另一回事，由 coversCoreSeries 判
 *    （要求三种全覆盖），两者不要混。
 *
 * 这套推导与改之前 37 支手写的 kinds **逐一等价**，
 * 有测试对账（vaccine-product-kinds-audit.spec.ts）钉着。
 */
export function kindsOfComponents(product: {
  components: VaccineComponent[];
  earlySeries?: boolean;
}): VaccineKind[] {
  /*
   * ⚠️ 2026-10-12 老板按 WSAVA 纠正的口径（我核对过指南 ✓）：
   *   · WSAVA 2024 的**核心疫苗**只有三件：犬瘟 CDV / 细小 CPV-2 / 腺病毒 CAV-2 ✓
   *   · **副流感（cpi）不算核心** ✗ —— 只是市面四联/五联里常带着它 ✓
   *   · 所以"算不算核心"要看**是否同时包含这三件** ✓，不是"沾一个就算"✗
   *   · 只含**犬瘟 + 细小**的（二联）→ 归**早期苗** ✓，不算核心 ✗
   */
  const hasAllCore = CORE_COMPONENTS.every((c) =>
    product.components.includes(c),
  );
  const hasEarlyPair =
    product.components.includes('cdv') && product.components.includes('cpv');
  const hasRabies = product.components.includes('rabies');

  if (product.earlySeries || (hasEarlyPair && !hasAllCore && !hasRabies)) {
    return ['core_early'];
  }

  const kinds: VaccineKind[] = [];
  if (hasAllCore) {
    kinds.push('core');
  }
  if (product.components.includes('lepto')) {
    kinds.push('lepto');
  }
  if (hasRabies) {
    kinds.push('rabies');
  }

  return kinds.length > 0 ? kinds : ['other'];
}

/**
 * **每类推荐列表**（"常见的有…"）最多列几个产品（兽医审核意见第 6 条）。
 *
 * ⚠️ 只管"举例"性质的那个列表（`recommendProductsForStep`）。
 *    "两类可以一起打、可选这些"（`findComboProducts`）**不用**这个上限 ——
 *    那个列表要列全，少列一支顾客会以为"系统不认这支"（老板 2026-10-14 发现
 *    维克犬四联加钩端被截掉）。
 */
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
  /*
   * 能不能顶掉**核心首免那一整套**：三种核心病都要覆盖。
   *
   * ⚠️ 2026-10-06 修正：原来是"四种都防"（犬瘟+细小+腺病毒+**副流感**）。
   *    按 WSAVA 2024，犬的核心疫苗只有三支（犬瘟、腺病毒、细小），
   *    副流感属非核心 —— 所以判据改成三种，而且直接看成分表，不再抠病名字符串。
   */
  return CORE_COMPONENTS.every((component) =>
    product.components.includes(component),
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
    return false;
  }

  if (kind === 'rabies') return product.components.includes('rabies');
  if (kind === 'lepto') return product.components.includes('lepto');
  // 核心苗那几步要求**三种核心病全覆盖**（犬瘟 + 腺病毒 + 细小，2026-10-06 按
  // WSAVA 2024 修正，不再要求副流感）—— 卫佳细（只防细小）、犬二联因此都顶不上。
  if (kind === 'core') return coversCoreSeries(product);
  // 早期核心疫苗：含犬瘟 + 细小，且**不是**完整核心覆盖（完整覆盖走 core 那一步）
  if (kind === 'core_early') {
    return (
      product.components.includes('cdv') &&
      product.components.includes('cpv') &&
      !coversCoreSeries(product)
    );
  }

  return true;
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
/**
 * 产品名的规范化（去 ® ™ ©、空格、大小写、全半角、连字符）。
 *
 * 2026-10-09 导出：疫苗本"再看一眼图"的复核也要用它校验候选 ——
 * 不能让两处各写一份归一化（这个项目吃过两次这种亏）。
 */
export function normalizeProductText(value: string): string {
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
 * 品牌一致性检查（2026-10-09 老板定）。
 *
 * 为什么需要它：**"同一个模型再审一遍"抓不住"同一个模型看错字"** ✗ ——
 * 实测（赛文那本真本子，连跑 3 遍）：两遍把贴纸「宠必威锐必威」读成
 * 「英特威®瑞比克」✗，而复核说"一致"✗（两次错得一模一样，复核只是点头）。
 *
 * 但这两遍里有一条**纯代码就能发现**的矛盾 ✓：
 *   文字里的品牌是「英特威」，而它匹配到的「瑞比克」是**勃林格**的 ✗。
 * 我们库里本来就登记了每支苗的品牌 —— 拿来对一下就知道对不上 ✓
 * （零成本、完全确定、可写测试 ✓）。
 *
 * 只在"文字里出现了**明确的品牌词**、而我们匹配到的产品**不属于**那个品牌"时报冲突 ✓。
 * 文字里没有品牌词（本子上只写"狂犬""犬四联"这种）→ 不报 ✓（我们判不了 ✗ 也不该猜 ✗）。
 */
export interface BrandConsistencyResult {
  conflict: boolean;
  /** 文字里出现的那个品牌词（冲突时才有） */
  textBrand: string;
  /** 我们匹配到的产品所属品牌 */
  productBrand: string;
}

/**
 * 会被当成"品牌词"的候选（从产品库的 brand / manufacturer 里自动收集）。
 *
 * 排除地理与类别词：它们是描述不是品牌，拿来判冲突会误报 ✗
 * （例如「西班牙海博莱」里的"西班牙"、"犬四联"里的"犬"）。
 */
const BRAND_TOKEN_STOPLIST = new Set([
  '荷兰',
  '西班牙',
  '法国',
  '美国',
  '德国',
  '中国',
  '英国',
  '意大利',
  '国产',
  '进口',
  '犬',
  '猫',
  '狗',
  '疫苗',
  '联苗',
  '单苗',
  '灭活',
  '活苗',
  '株',
  '型',
]);

function tokenizeBrandText(value: string): string[] {
  return String(value || '')
    .split(/[^0-9A-Za-z\u4e00-\u9fa5]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !BRAND_TOKEN_STOPLIST.has(token));
}

/** 每支产品的品牌词（含厂商名里的词），用于判断"文字里出现了哪个品牌" */
function brandTokensOf(product: {
  brand?: string;
  manufacturer?: string;
}): string[] {
  return Array.from(
    new Set([
      ...tokenizeBrandText(String(product.brand || '')),
      ...tokenizeBrandText(String(product.manufacturer || '')),
    ]),
  );
}

/** 全库的品牌词（用于从文字里认出"这是哪家的牌子"） */
function allBrandTokens(): Map<string, string[]> {
  const byToken = new Map<string, string[]>();
  for (const product of VACCINE_PRODUCTS) {
    const brand = String(product.brand || '').trim();
    if (!brand) continue;
    for (const token of brandTokensOf(product)) {
      const list = byToken.get(token) || [];
      if (!list.includes(brand)) list.push(brand);
      byToken.set(token, list);
    }
  }
  return byToken;
}

export function checkBrandConsistency(
  text: string,
  productName: string,
): BrandConsistencyResult {
  const product = VACCINE_PRODUCTS.find((item) => item.name === productName);
  if (!product) {
    return { conflict: false, textBrand: '', productBrand: '' };
  }

  const productBrand = String(product.brand || '').trim();
  const allowed = brandTokensOf(product);
  const normalizedText = normalizeProductText(text);

  for (const [token, brands] of allBrandTokens().entries()) {
    // 文字里出现了这个品牌词吗（规范化后比对，® 空格这些不影响）
    if (!normalizedText.includes(normalizeProductText(token))) continue;
    // 就是我们自己这一家的词 → 不冲突
    if (allowed.includes(token)) continue;
    return {
      conflict: true,
      textBrand: token,
      productBrand: productBrand || brands.join('/'),
    };
  }

  return { conflict: false, textBrand: '', productBrand };
}

/**
 * 从一段自由文本里认出**具体是哪一支产品**（2026-10-06）。
 *
 * 为什么需要：疫苗瓶签/本子上写的往往不是库里的规范名 ——
 * 老板实测的那张瓶签写的是「卫佳® Vanguard® Plus 5/CV-L」，
 * 库里叫「卫佳捌」（别名 vanguard plus 5-cvl）。
 * 分类本来就已经认对了（走的也是这套匹配），但界面上那一行还显示瓶签原文，
 * 顾客看不出"系统认为这是哪一支"，手填框也会跟着冒出来。
 *
 * 匹配规则与 findProductsInName 完全一致（名称或别名**被包含**），
 * 命中多支时取**最具体的那个**（规范化后名字最长的）——
 * 这样带 CV-L 的瓶签不会掉到「卫佳伍」上（两者都含 vanguard plus 5）。
 */
export function findProductByText(name: string): VaccineProduct | null {
  const matches = findProductsInName(name);
  if (matches.length === 0) {
    return null;
  }

  return [...matches].sort(
    (a, b) =>
      normalizeProductText(b.name).length - normalizeProductText(a.name).length,
  )[0];
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
/**
 * 每一类疫苗的**起始周龄**（2026-10-12 老板第 2 问）。
 *
 * 老板："疫苗计划中第一针核心疫苗，常见疫苗推荐里面，为什么会有卫佳捌呢？
 *        卫佳捌含有钩端螺旋体，在第一针来打卫佳捌的话，钩端螺旋体是不是
 *        起不到什么作用呢？"
 * —— 对 ✓。6 周龄打的那一针，核心部分有效 ✓，但**钩端部分没意义** ✗
 *   （钩端首免要 8 周龄才起 ✓，我们自己的排期就是这么定的 ✓）。
 * 原来的过滤只看"产品的最低周龄 ≤ 这一步的周龄"✗ —— 而卫佳捌的 minWeeks
 * 是按**核心**那部分算的（6 周 ✓），于是它被推到了 6 周龄的首免第 1 针里 ✗。
 *
 * 现在改成：**产品覆盖的每一类，都要各自满足它自己的起始周龄** ✓。
 * ⚠️ 这几个数字必须与 immunization-schedule.ts 里的排期保持一致 ✓
 * （有测试钉着 ✓ —— 那两处不一致过一次就够受了 ✗）。
 */
export const KIND_START_WEEKS: Record<string, number> = {
  core_early: 4,
  core: 6,
  lepto: 8,
  rabies: 12,
};

export function recommendProductsForStep(
  kind: VaccineKind,
  stepWeeks: number | null,
  options: {
    preferredBrand?: string;
    /**
     * 这一步**优先用这支产品**（2026-10-07 老板定的钩端保守口径）。
     *
     * 老板："钩端螺旋体的首免加强都采用相同的产品即可，包括隔太久重新开始免疫。"
     * —— 这是我们自己更保守的做法（指南只要求"覆盖不减少"，没要求同产品）。
     * 只有当这支产品**仍然顶得上这一步**时才会排到第一位；不适用时照常推荐别的。
     */
    preferredProduct?: string;
    allowCombo?: boolean;
  } = {},
): VaccineProduct[] {
  const preferredBrand = String(options.preferredBrand || '').trim();
  const preferredProduct = String(options.preferredProduct || '').trim();
  // allowCombo 默认 true；只有"这一步不该顺带重复别的分类"时才传 false
  const allowCombo = options.allowCombo !== false;

  const eligible = VACCINE_PRODUCTS.filter((product) => {
    // 不推荐的（国产）直接排除 —— 它们只在产品库里可选
    if (product.recommendable === false) {
      return false;
    }
    if (!product.kinds.includes(kind)) {
      return false;
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
      return false;
    }
    // 核心苗那几步必须**真的顶得上**：细小单苗不能拿来顶常规首免
    if (kind === 'core' && !coversCoreSeries(product)) {
      return false;
    }
    if (stepWeeks === null) {
      return true;
    }
    /*
     * 产品覆盖的每一类，都要各自满足起始周龄 ✓
     * （多联苗不能靠"核心那部分够龄"就把钩端一起带进去 ✗）
     *
     * ⚠️ 2026-10-12 两次教训，顺序很要命 ✗：
     *   ① 第一次放在 `stepWeeks === null` 之前 → TS18047 被 nest build 拦下 ✓
     *   ② 第二次放在 `product.minWeeks === null` 之后 →
     *      **海博莱犬四联加钩端**（minWeeks 是 null）被提前放行了 ✗，
     *      于是 6 周龄那一针又在推含钩端的苗 ✗（老板的问题只解决了一半 ✗）。
     *   现在：先查"每一类够不够龄"✓，再查产品自己的 minWeeks ✓。
     */
    for (const covered of product.kinds) {
      const startWeeks = KIND_START_WEEKS[covered];
      if (startWeeks !== undefined && stepWeeks < startWeeks) {
        return false;
      }
    }
    if (product.minWeeks === null) {
      return true;
    }
    return product.minWeeks <= stepWeeks;
  });

  // **同品牌优先**（老板规则一）：这只狗现在用什么牌子，续针就接着推那个牌子 ——
  // 同厂的免疫程序衔接得上，家长也不用记两套。
  // 同品牌内部仍按批签发批数排（批数多 = 现在真在卖）。
  // ② **同一支产品优先**（比同品牌更严）：钩端这一类的保守口径
  const exact = preferredProduct
    ? eligible.filter((p) => p.name === preferredProduct)
    : [];
  const rest = preferredProduct
    ? eligible.filter((p) => p.name !== preferredProduct)
    : eligible;

  if (preferredBrand) {
    const sameBrand = rest.filter((p) => p.brand === preferredBrand);
    const others = rest.filter((p) => p.brand !== preferredBrand);
    return [...exact, ...sameBrand, ...others].slice(
      0,
      MAX_RECOMMENDED_PRODUCTS,
    );
  }

  return [...exact, ...rest].slice(0, MAX_RECOMMENDED_PRODUCTS);
}

/**
 * 「这两类能不能用**一支联苗**一起打」—— 用在重合窗口上的查询（老板 2026-10-14）。
 *
 * 老板原话："现在核心疫苗和钩端螺旋体接种窗口期有部分是重合的……
 *            并且在各自的计划展开之后，并未做合并接种的相关提醒呢？"
 *
 * ── 为什么不能复用 `recommendProductsForStep` 的结果取交集 ──────────
 *
 * 原来前端就是那么做的（"两张卡的推荐产品有没有交集"）✗ —— 在测27 这种
 * 典型情形下会**漏报**：
 *   · 核心第 1 针在 6 周龄，**故意不推**卫佳捌（钩端要 8 周龄才起效）✓
 *   · 钩端第 1 针推卫佳捌 ✓
 *   · 两张卡的推荐列表于是没有交集 ✗ → 不提示合并 ✗
 * 可是等到**两窗口重合的那段**（8~10 周龄），卫佳捌两边的成分都够龄了 ✓，
 * 完全可以用一针覆盖两类 ✓。
 *
 * ⇒ 正确判据是：**在重合窗口那一段的周龄上，有没有一支苗同时覆盖这两类、
 *   并且覆盖的每一类都各自够龄**。本函数就是干这个的。
 *
 * @param kindA 其中一类
 * @param kindB 另一类
 * @param weeksAtOverlap 重合窗口**起点**对应的周龄
 */
export function findComboProducts(
  kindA: VaccineKind,
  kindB: VaccineKind,
  weeksAtOverlap: number | null,
): VaccineProduct[] {
  if (kindA === kindB) return [];

  return VACCINE_PRODUCTS.filter((product) => {
    // 不推荐的（国产）不参与 —— 与 recommendProductsForStep 同一口径
    if (product.recommendable === false) return false;
    // 必须**同时**覆盖这两类，才算"一支顶两类"
    if (!product.kinds.includes(kindA) || !product.kinds.includes(kindB))
      return false;
    // 多联苗不能靠"核心那部分够龄"把另一类一起带进去
    for (const covered of product.kinds) {
      const startWeeks = KIND_START_WEEKS[covered];
      if (
        startWeeks !== undefined &&
        weeksAtOverlap !== null &&
        weeksAtOverlap < startWeeks
      ) {
        return false;
      }
    }
    if (product.minWeeks === null || weeksAtOverlap === null) return true;
    return product.minWeeks <= weeksAtOverlap;
  });
  /*
   * ⚠️ 这里**不设上限**（老板 2026-10-14 发现漏了产品）。
   *
   * 原来跟"每类推荐列表"共用 `MAX_RECOMMENDED_PRODUCTS = 3`，
   * 结果**同时覆盖核心+钩端的 4 支苗只显示了前 3 支** ——
   * 维克犬四联加钩端（法国维克）被截掉了 ✗。
   * 老板："你提到维克也有类似产品，但为什么在提醒中却没有加上维克呢？"
   *
   * 两个列表的性质不同，不该共用一个上限：
   *   · "常见的有…"（每类推荐）→ 3 个够了，本来就只是举例 ✓
   *   · "这两类可以一起打，可选这些"（本函数）→ **列全才有用** ✓
   *     顾客要拿它对照自己医院实际有的那支；少列一支，
   *     他会以为"系统不认这支" ✗。
   *
   * 而且这类产品**天然就少**：必须一支苗同时覆盖两类，
   * 当前全库只有 4 支（卫佳捌 / 优乐康 / 海博莱 / 维克）✓，
   * 不存在"排一长串"的风险 ✓。
   */
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
const DOMESTIC_PRODUCTS: Omit<VaccineProduct, 'kinds'>[] = [
  /* ── 国产联苗（核心） ── */
  {
    /*
     * 中立条目（2026-10-16 补）：**法定通用名本身**。
     *
     * 为什么单独建一条、而不是挂到下面三家任何一家头上：这个通用名是
     * **共享的** —— 中牧江西 / 科前 / 五星 三家按同一个新兽药核准说明书生产
     * （下面三家的 `booster` 都写着"同上（同一新兽药核准说明书）"）。
     * 本子上只印通用名、不印商品名时（实测 19.jpg 就是这样），
     * 我们**分不出是哪一家** ✓ 硬挂一家 = 把别家的苗记成这家的 ✗。
     *
     * 依据（都是 A 级）：
     *   · 农业部公告 第2629号：制定了《犬瘟热、犬副流感、犬腺病毒与犬细小病毒病
     *     四联活疫苗》试行规程 / 质量标准 / 说明书和标签，标准制定单位
     *     军事医学科学院军事兽医研究所（`ivdc.org.cn` 公告原文，2017-12-25）✓
     *   · 中牧实业股份有限公司在亚洲宠物展 2026 展商页上挂的犬用疫苗产品，
     *     名字逐字就是这个通用名 ✓（`online.petfairasia.com` 中牧品牌页）
     *   · 成分（犬瘟热 / 犬副流感 / 犬腺病毒 / 犬细小病毒病）**就写在这个通用名里**，
     *     与下面三家已审核条目的 `components` 完全一致 ✓ —— 不是猜的组合。
     *
     * ⚠️ 名字取「犬四联活疫苗」而不是长通用名：一是短名好显示，二是
     *    `findProductByText` 命中多支时取**名字最长**的那支 ——
     *    本子上写了厂家（"中牧犬四联"）的话，长名字的「犬四联（中牧江西）」会赢 ✓，
     *    只有光秃秃一个通用名时才落回这一条 ✓。
     */
    name: '犬四联活疫苗',
    aliases: ['犬瘟热、犬副流感、犬腺病毒与犬细小病毒病四联活疫苗'],
    manufacturer: '国产（中牧 / 科前 / 五星 等，见批准文号）',
    brand: '',
    diseases: ['犬瘟热', '犬副流感', '犬腺病毒', '犬细小病毒病'],
    components: ['cdv', 'cav', 'cpi', 'cpv'],
    minWeeks: null,
    registration: '农业部公告第2629号（新兽药核准说明书，多家生产）',
    booster: '说明书：断奶幼犬连打 3 次、间隔 21 天；成犬每年 2 次',
    note:
      '**中立条目**：代表"国产犬四联活疫苗"这个法定通用名，不指向某一家厂。' +
      '分得出厂家时走下面三条具体条目 ✓；本子上只有通用名时落这一条 ✓。' +
      '是否接受这种"中立条目"的建法，待老板 / 兽医确认（见 B1 报告）。',
    recommendable: false,
  },
  {
    name: '犬四联（中牧江西）',
    aliases: ['中牧犬四联'],
    manufacturer: '中牧实业股份有限公司江西生物药厂',
    brand: '中牧',
    diseases: ['犬瘟热', '犬副流感', '犬腺病毒', '犬细小病毒病'],
    components: ['cdv', 'cav', 'cpi', 'cpv'],
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
    components: ['cdv', 'cav', 'cpi', 'cpv'],
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
    components: ['cdv', 'cav', 'cpi', 'cpv'],
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
    components: ['cdv', 'cpv'],
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
    components: ['cdv', 'cpv'],
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
    components: ['cdv', 'cpv'],
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
    components: ['rabies'],
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
    components: ['rabies'],
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
    components: ['rabies'],
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
    components: ['rabies'],
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
    components: ['rabies'],
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
    components: ['rabies'],
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
    components: ['rabies'],
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
    components: ['rabies'],
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
    components: ['rabies'],
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
    components: ['rabies'],
    minWeeks: null,
    registration: '兽药生字070227517',
    booster: '未查到',
    note:
      '2026-10-16 补记毒株：吉林正业官网产品页写明「通用名称：狂犬病灭活疫苗（Flury LEP株）」' +
      '（用于预防犬的狂犬病，3 月龄以上犬，每 12 个月 1 次）—— 即 **Flury LEP 株**。' +
      '⚠️ 同上（齐鲁）：毒株是国标株、多家共用，不做别名，只写毒株的写法归中立条目 ✓。',
    recommendable: false,
  },
  {
    name: '诺维瑞',
    /*
     * 2026-10-16 补：本子上印的是「西诺生物 狂犬病冻干灭活疫苗（CTN-1株）」
     * —— 厂家简称 + **法定通用名 + 毒株**，一个商品名字都没有 ✗。
     *
     * 依据：长春西诺生物科技有限公司官网产品页（`ccsino.com.cn/products_1/8.html`）逐字写着
     *   通用名称：狂犬病冻干灭活疫苗(CTN-1株)／商品名称：诺维瑞／
     *   【批准文号】兽药生字070386088／生产企业：长春西诺生物科技有限公司
     * —— 和库里这一条登记的批准文号**一字不差** ✓（同一支苗，不是靠名字猜的 ✓）。
     * 说明书：3 月龄以上犬 1 头份，每 12 个月 1 次。
     *
     * ⚠️ 「西诺生物」这个厂家简称**故意不做别名**：西诺也做猫三联，
     *    本子上写"西诺生物"时未必是这支狂犬苗 ✗。
     */
    aliases: ['狂犬病冻干灭活疫苗（CTN-1株）', '狂犬病冻干灭活疫苗', 'ctn1株'],
    manufacturer: '长春西诺生物科技有限公司',
    brand: '长春西诺',
    diseases: ['狂犬病'],
    components: ['rabies'],
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
    components: ['rabies'],
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
    components: ['rabies'],
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
    components: ['rabies'],
    minWeeks: null,
    registration: '兽药生字110546048',
    booster: '未查到',
    note: '2026-10-05 审计补录。',
    recommendable: false,
  },
  {
    name: '爱宠犬狂犬',
    /*
     * 2026-10-16 补：本子上印的是「宠派纯® 狂犬病灭活疫苗（PV/BHK-21株）」。
     * 「宠派纯」是**商品名**（不是厂家名）—— 依据：爱宠生物集团 2023-08 的上市通稿
     * （"由爱宠生物集团自主研发的一款用于预防宠物狂犬病的疫苗产品——「宠派纯」重磅上市"，
     * 投资界 2023-08-30 转载），生产方即广西爱宠生物科技有限公司 ✓。
     *
     * ⚠️ 只收商品名，**不收毒株**（PV/BHK-21株）：同一毒株不只爱宠一家在用，
     *    拿毒株当键会把别家的苗吸到这一支上 ✗。毒株写在这里备查，不参与匹配。
     */
    aliases: ['宠派纯'],
    manufacturer: '广西爱宠生物科技有限公司',
    brand: '广西爱宠',
    diseases: ['狂犬病'],
    components: ['rabies'],
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
    components: ['rabies'],
    minWeeks: null,
    registration: '兽药生字150257517',
    booster: '未查到',
    note:
      '2026-10-05 审计补录。' +
      '2026-10-16 补记毒株：批签发记录（兽药生字150257517，狂犬病灭活疫苗（FluryLEP株），' +
      '齐鲁动物保健品有限公司）与本站登记一致 ✓ —— 即它是 **Flury LEP 株**。' +
      '⚠️ 毒株**没做成别名**：Flury LEP 是国标株，吉林正业等多家都在用（见贝乐美），' +
      '只写毒株的写法分不出是哪一家 —— 归库里那条中立的 Flury LEP 条目 ✓。',
    recommendable: false,
  },
  {
    /*
     * 中立条目（2026-10-16 补）：**国标毒株 + 通用名**。
     *
     * 为什么单独建一条：Flury LEP 是国产犬用狂犬苗的**国标株**，多家共用 ——
     *   · 齐鲁动物保健品（兽药生字150257517）批签发记录写的就是
     *     「狂犬病灭活疫苗（FluryLEP株）」（`syt126.com` 国产生物制品批签发页，
     *     批准文号与库里登记的齐鲁那支**一字不差** ✓）
     *   · 吉林正业（兽药生字070227517，即库里的贝乐美）官网产品页逐字写
     *     「通用名称：狂犬病灭活疫苗（Flury LEP株）」，用于预防犬的狂犬病，
     *     3 月龄以上犬、每 12 个月 1 次 ✓
     *   · `docs/plans/2026-10-04-vaccine-product-list-review.md` 2.1 也把
     *     《狂犬病灭活疫苗（Flury LEP株）》列为国产国标范本，间隔"每年 1 次" ✓
     *
     * 一支苗的毒株决定不了是哪一家 → 只写毒株/通用名时归这一条 ✓，
     * 本子上有厂家名（"齐鲁…"）时也不会被它抢走（那条靠名字更长赢 ✓）。
     * 成分 = 狂犬病，**写在通用名里**，不是推的 ✓。
     */
    name: '狂犬病灭活疫苗（Flury LEP株）',
    aliases: ['flurylep株', '狂犬病灭活疫苗（flury lep株）'],
    manufacturer: '国产（齐鲁 / 吉林正业 等，见批准文号）',
    brand: '',
    diseases: ['狂犬病'],
    components: ['rabies'],
    minWeeks: null,
    registration: '兽药国家标准（Flury LEP 株，多家生产）',
    booster: '每年 1 次',
    note:
      '**中立条目**：代表"国产狂犬病灭活疫苗（Flury LEP株）"这个国标写法，不指向某一家厂。' +
      '只在写法里没有厂家 / 商品名时命中 ✓。是否接受这种"中立条目"的建法，' +
      '待老板 / 兽医确认（见 B1 报告）。',
    recommendable: false,
  },
  {
    name: '汪倍护',
    manufacturer: '泰州博莱得利生物科技有限公司',
    brand: '泰州博莱得利',
    diseases: ['犬瘟热', '犬细小病毒病', '狂犬病'],
    components: ['cdv', 'cpv', 'rabies'],
    minWeeks: null,
    registration: '兽药生字101846066',
    booster: '未查到',
    note: '二联活疫苗 + 狂犬灭活的组合装，所以两类都算。',
    recommendable: false,
  },
];

// 国产苗并进同一个目录：产品库要能看到它们，推荐那一步再按 recommendable 过滤
/**
 * 全部产品 = 进口（可推荐）+ 国产（可选不推荐）。
 *
 * ⚠️ 两者都**只登记成分**，kinds 在这里统一推导 —— 所以必须放在
 * DOMESTIC_PRODUCTS 声明之后（放在前面会踩 TDZ）。
 */
export const VACCINE_PRODUCTS: VaccineProduct[] = [
  ...RAW_VACCINE_PRODUCTS,
  ...DOMESTIC_PRODUCTS,
].map((product) => ({
  ...product,
  kinds: kindsOfComponents(product),
}));

/**
 * 名字**没读全**时的候选（2026-10-06 老板实测）。
 *
 * 老板："我试了几次相同的疫苗本上传之后，并不完全保证能识别出卫佳8，
 * 有可能它还是识别出卫佳，并没有识别出8这个字。如果不能完全有把握的
 * 识别出来，能不能诚实的告诉用户呢？"
 *
 * 所以这里做一件事：当读到的那串字**是某几支产品名字的前半截**时，
 * 把它们列出来交给界面 —— 界面会如实说"这行字没读全，可能是这几支，
 * 请核对瓶子上的名字"，而不是硬认一个或者闷声说"没认出来"。
 *
 * 只做前缀判断，不做模糊猜测：宁可少给候选，也不能给错方向
 * （"卫佳" → 卫佳伍/卫佳捌/卫佳细；"卫" 太短，不给）。
 */
export function suggestProductsForPartialName(name: string): VaccineProduct[] {
  const text = normalizeProductText(name);
  // 太短的前缀（一两个字）会命中一大堆，反而误导
  if (text.length < 2) {
    return [];
  }

  return VACCINE_PRODUCTS.filter((product) => {
    const candidates = [product.name, ...(product.aliases || [])];
    return candidates.some((candidate) => {
      const key = normalizeProductText(candidate);
      // 候选名比读到的更长，而且**以读到的这串字开头** = 后半截没读出来
      return key.length > text.length && key.startsWith(text);
    });
  });
}

/**
 * 病种值的归一化（2026-10-06）—— 与 normalizeVaccineKind 同一个套路。
 *
 * 只认词表里的英文小写值（容忍大小写与空格），认不出返回 null。
 * 脏值绝不允许进库：它会被拿去推导类别，进而影响免疫计划。
 */
export function normalizeVaccineComponent(
  value: unknown,
): VaccineComponent | null {
  const key = String(value || '')
    .trim()
    .toLowerCase();
  return (VACCINE_COMPONENTS as readonly string[]).includes(key)
    ? (key as VaccineComponent)
    : null;
}

/* ===========================================================================
 * 名字 → 类别（2026-10-15 从 immunization-schedule.ts 搬过来）
 *
 * 规则来自需求第六节：「系统优先查产品库，查不到按名字字面判类别；
 * 两条都判不出时，才请家长勾病种」。
 * =========================================================================== */

/** 校验一个值是不是我们认的类别（来自 AI 或顾客时都要过这一关） */
export function normalizeVaccineKind(value: unknown): VaccineKind | null {
  const key = String(value || '')
    .trim()
    .toLowerCase();
  return (VACCINE_KINDS as readonly string[]).includes(key)
    ? (key as VaccineKind)
    : null;
}

/**
 * 核心苗的常见写法（联数 + 病名）。
 *
 * 必须有这一步：产品目录里进口苗为主，顾客写"六联""犬瘟热"是常态；
 * 少了它这些记录会掉成"未归类"，被挡在计划外面。
 *
 * ⚠️ **副流感不在这条里**（2026-10-06 按 WSAVA 2024 修正）：犬的核心疫苗
 * 只有犬瘟、腺病毒、细小三支；副流感属非核心（与博德特氏菌同归"犬窝咳"）。
 * 以前把副流感算核心，会让一支"副流感单苗"顶掉核心苗的某一针。
 *
 * "联数"（二联…九联）仍然算核心：联苗按惯例都覆盖那三种核心病。
 */
const CORE_NAME_PATTERN =
  /犬瘟|细小|腺病毒|传染性肝炎|distemper|parvo|adenovirus|[四五六七八九]联/i;

/**
 * 「二联 / 三联」**不算核心苗**（2026-10-16 收紧）。
 *
 * 为什么改：中文习惯里"犬二联"= 犬瘟 + 细小（**没有腺病毒**），
 * "犬三联"写法各家不一（可能含腺病毒，也可能含副流感）。
 * 而核心疫苗的判据是**犬瘟 + 细小 + 腺病毒三件齐全**（WSAVA 2024）。
 *
 * ⚠️ 两个方向的错后果不对称：算成"打过核心苗了" → **狗漏打**；
 *    算成"没打过" → 最多多提醒一次。所以看不准的一律**不判核心**。
 *
 * 这类苗归 `core_early`（"只防犬瘟+细小"那一档，与产品目录里
 * components = [cdv, cpv] 的国产苗同一种归类）；家长也可以在记录上
 * 勾"含哪些疫苗"来精确化，勾完就按病种重算。
 */
const CORE_EARLY_LIKE_PATTERN = /[二三]联/;

/**
 * 非核心、而且我们**没有**接种程序的（犬窝咳、冠状病毒、莱姆病…）。
 *
 * 这些以前会被当成"核心苗"，从而能顶掉核心苗的某一针 —— 是错的。
 * 记下来是对的，影响计划是不对的（需求第四节：可选疫苗不进页面）。
 */
const OTHER_NAME_PATTERN =
  /犬窝咳|窝咳|冠状病毒|莱姆|博德特|支气管败血|副流感|parainfluenza|bordetella|kennel\s*cough/i;

/** 钩端螺旋体的字面写法（含我们核过成分、确定含钩端的商品名） */
const LEPTO_NAME_PATTERN = /钩端螺旋体|钩端|lepto|卫佳捌|优乐康|乐必妥/i;

/** 早期核心疫苗的字面写法（4 周龄抢跑那一针） */
const CORE_EARLY_NAME_PATTERN = /幼犬保|早期苗|抢跑/i;

/**
 * 猫（以及其他**非犬**）疫苗的写法（2026-10-16 补，B1 跑分实测出来的）。
 *
 * 这个模块**只做犬** ✓，猫苗不进产品库是对的 —— 但"不进库"还不够：
 * 名字还得**不归类**，否则会冒充犬的那几类 ✗。
 *
 * 实测（2026-10-16，改之前）：
 *   · 「猫三联」                                  → **['core_early']** ✗
 *   · 「猫泛白细胞减少症、杯状病毒病、鼻气管炎三联灭活疫苗（708株+60株+64株）」→ **['core_early']** ✗
 * 成因：`CORE_EARLY_LIKE_PATTERN` 的 /[二三]联/ 命中了"三联"，于是**猫**的苗
 * 被算成**犬早期核心疫苗** —— 而 core_early 是会影响计划的（4 周龄那一针"算完成"）。
 * 记到狗身上就是"系统以为打过犬二联了" ✗（宁可不归类，不可误判）。
 *
 * ⚠️ 只列**猫专有**的说法，**不能**见到"猫"字就拦 ✗：
 *    好几支狂犬苗本来就是"犬、猫"共用的（宠必威锐必威、瑞比克、迪安适），
 *    本子上写「犬、猫狂犬病灭活疫苗」是**犬**的记录，必须照旧判成狂犬 ✓。
 */
const NON_DOG_VACCINE_PATTERN =
  /猫瘟|猫鼻气管炎|猫杯状|嵌杯|猫泛白细胞减少|泛白细胞减少|猫白血病|猫艾滋|猫三联|猫四联|猫五联|妙三多|feline|fvrcp|fcv|fpv/i;

/**
 * 一条记录（一个名字）能算作哪几类。
 *
 * 必须返回数组：**一支组合苗可以同时顶好几个种类**。
 * 典型是硕腾卫佳捌 —— 它既是核心苗，又含钩端螺旋体；
 * 顾客打了它，核心苗那一步和钩端螺旋体那一步都该算完成。
 *
 * 判定顺序（需求第六节）：
 *   ⓿ 认得出是**猫 / 其他物种**的写法 → **空数组**（本模块只做犬，2026-10-16 补）
 *   ① 已审核的**产品目录**里查得到的 → 按它真实的成分算（唯一事实）
 *   ② 目录里没有的 → 按名字**字面**判（狂犬 / 钩端 / 核心 / 早期 / 其他）
 *   ③ 都判不出 → **空数组**（未归类，不算数）—— 绝不猜成核心苗：
 *      猜错的后果是"系统以为那一针打完了"，从此不再提醒。
 */
export function classifyVaccineKinds(name: string): VaccineKind[] {
  const text = String(name || '').toLowerCase();

  /*
   * ⓿ 物种这一关必须在字面判定**之前**（2026-10-16）：
   *    否则"猫三联"会被 /[二三]联/ 判成犬的 core_early ✗（实测过，见上面那条注释）。
   *    狂犬苗是犬猫共用的 —— 所以这里只拦"猫专有"的说法，不拦"猫"这个字 ✓：
   *    「犬、猫狂犬病灭活疫苗」照旧走下面 → rabies ✓（有测试钉着）。
   */
  if (NON_DOG_VACCINE_PATTERN.test(text)) {
    return [];
  }

  const kinds = new Set<VaccineKind>();

  // ① 产品目录（按真实成分；组合苗能一次占好几类）
  for (const product of findProductsInName(text)) {
    for (const kind of product.kinds) {
      kinds.add(kind);
    }
  }

  // ② 目录里没有的，按字面判
  if (/狂犬|rabies/.test(text)) {
    kinds.add('rabies');
  }
  if (LEPTO_NAME_PATTERN.test(text)) {
    kinds.add('lepto');
  }
  if (CORE_EARLY_NAME_PATTERN.test(text) || CORE_EARLY_LIKE_PATTERN.test(text)) {
    kinds.add('core_early');
  }
  // 早期苗不算 core（周期完全不同）；已经在 core_early 里的不再补 core
  if (CORE_NAME_PATTERN.test(text) && !kinds.has('core_early')) {
    kinds.add('core');
  }
  // 非核心、而且我们没有接种程序的（犬窝咳、冠状、莱姆…）→ other：
  // 如实记下来，但**不参与计划**，绝不能让它们把核心苗的某一针"算完成"。
  if (OTHER_NAME_PATTERN.test(text)) {
    kinds.add('other');
  }

  return [...kinds];
}

/** 保留旧签名：返回"最主要的那一类"（认不出来时是 other，不冒充 core） */
export function classifyVaccineName(name: string): VaccineKind {
  const kinds = classifyVaccineKinds(name);
  if (kinds.includes('core')) return 'core';
  return kinds[0] ?? 'other';
}

/**
 * 一条**记录**最终算哪几类（写入时算一次，读取时按下面的规则复核一次）。
 *
 * 技术方案 1.1.2 的读取规则：
 *   「若 `components` 为空、而这个名字现在能在产品库里认出来了
 *     （产品库后来补齐了），**按产品库重算一次**」——
 *   这样产品库变强，老记录跟着变准，不会留下"当年判错、永远判错"的记录。
 *
 * 其余情况一律以**记录自己存的 kinds** 为准（那是写入时按同一套规则算出来的）。
 */
export function classifyRecordKinds(record: {
  vaccineName?: string;
  components?: unknown;
  kinds?: unknown;
}): VaccineKind[] {
  const name = String(record?.vaccineName || '');
  const storedKinds = Array.isArray(record?.kinds)
    ? record.kinds
        .map((item) => normalizeVaccineKind(item))
        .filter((item): item is VaccineKind => item !== null)
    : [];
  const storedComponents = Array.isArray(record?.components)
    ? record.components
        .map((item) => normalizeVaccineComponent(item))
        .filter((item): item is VaccineComponent => item !== null)
    : [];

  const product = findProductByText(name);

  // 读时重算：当时没勾成分、名字现在产品库认得出 → 以产品库为准
  if (product && storedComponents.length === 0) {
    const recomputed = kindsOfComponents({
      components: product.components,
      earlySeries: product.earlySeries,
    });
    // 只有重算得出结果时才覆盖（产品库给出空结果属于异常，保持原样更安全）
    if (recomputed.length > 0) {
      return recomputed;
    }
  }

  if (storedKinds.length > 0) {
    return storedKinds;
  }

  if (product && product.components.length > 0) {
    return kindsOfComponents({
      components: product.components,
      earlySeries: product.earlySeries,
    });
  }

  return classifyVaccineKinds(name);
}

/* ===========================================================================
 * 目录下发（2026-10-05；2026-10-15 从 vaccine-catalog.ts 并进来）
 *
 * ── 为什么由后端下发，不写在前端 ──────────────────────────────────
 * 分类与产品数据是后端的 domain 知识。前端复制一份，两边迟早长歪 ——
 * 这个项目以前就吃过这个亏（冲突 B7/B8：前端硬编码"类别 → 成分"、
 * 字段标签一份零调用 + 值硬编码在 3 处）。
 *
 * 技术方案 3.2：`GET /vaccines/catalog` 加**字段标签与顺序**下发；
 * 产品只下发**对外字段**（`name` / `components` / `manufacturer` /
 * `recommendable`）—— 匹配（同品牌优先、别名）只在后端做，所以
 * `aliases` / `brand` / `minWeeks` / `registration` / `booster` / `note` /
 * `earlySeries` 不下发。
 * =========================================================================== */

export interface VaccineCatalogPreset {
  /** 顾客看到的写法 */
  name: string;
  /** 这一类占哪几类（点它就等于指定了归类） */
  kinds: VaccineKind[];
}

/**
 * 一点即选的名字。
 *
 * 都是**顾客本子上真会写的写法**（联数 / 病名 / 疫苗种类），
 * 每个的归类都由 domain 的分类器算出来 —— 不手写，免得跟分类逻辑脱节。
 *
 * ⚠️ 故意**不放商品名**（卫佳伍、宠必威…）：那些走产品库那条路，
 *    选产品能顺带把厂商带出来，比只写个名字有用。
 */
const PRESET_NAMES: string[] = [
  '狂犬疫苗',
  '犬二联',
  '犬四联',
  '犬六联',
  '犬八联',
  '犬瘟热',
  '犬细小病毒',
  '犬传染性肝炎',
  '犬副流感',
  '钩端螺旋体',
  '犬窝咳',
  '犬冠状病毒',
];

/**
 * 给 AI 看的「产品名 → 分类」清单（2026-10-05）。
 *
 * AI 的任务是**认到具体产品**，分类由产品带出来 —— 不是让 AI 直接判分类。
 * 这样分类永远只有一份（我们这张表）。
 */
export function buildProductMatchReference(): string {
  return VACCINE_PRODUCTS.map((product) => {
    const aliases = (product.aliases || []).length
      ? `（也叫 ${(product.aliases || []).join('、')}）`
      : '';
    return `· ${product.name}${aliases} —— ${product.kinds
      .map((kind) => VACCINE_KIND_LABELS[kind])
      .join(' + ')}`;
  }).join('\n');
}

/** 产品名 → 分类（AI 匹配到产品后由这里带出，AI 不直接给分类） */
export function kindsOfProductName(name: string): VaccineKind[] {
  const hit = VACCINE_PRODUCTS.find((product) => product.name === name);
  return hit ? [...hit.kinds] : [];
}

/**
 * 记录的**字段标题**（界面三处共用一份）。
 *
 * 老板 2026-10-12 把"含哪些病种"改成了"含哪些疫苗"——
 * 当时录入卡改了、确认页漏了，于是同一样东西两处叫法不同。
 * 从后端下发之后就不存在"改一处漏一处"（冲突 B8）。
 */
export const VACCINE_FIELD_LABELS = {
  name: '疫苗名称',
  /** 确认页是紧凑行，用简称"疫苗名" */
  nameCompact: '疫苗名',
  components: '含哪些疫苗',
  componentsWithHint: '含哪些疫苗（可多选）',
  componentsCompact: '含哪些疫苗',
  date: '接种日期',
  notes: '备注（可选）',
} as const;

/**
 * 字段在界面上的**先后顺序**（老板 2026-10-14 定：名字 → 含哪些疫苗 → 接种日期）。
 */
export const VACCINE_FIELD_ORDER = [
  'name',
  'components',
  'date',
  'notes',
] as const;

export function buildVaccineCatalog() {
  const presets: VaccineCatalogPreset[] = PRESET_NAMES.map((name) => ({
    name,
    kinds: classifyVaccineKinds(name),
  }));

  return {
    /**
     * 归类闭集 —— 界面的"归类（必填）"照这个渲染。
     * 顺序 = 全集顺序；`other` 排最后：实在认不出才选它。
     */
    kinds: VACCINE_KINDS.map((value) => ({
      value,
      label: VACCINE_KIND_LABELS[value],
      /**
       * 归到这一类**会不会影响免疫计划**。
       * `other` 是 false —— 如实记录，但不参与任何一针的"算完成"。
       */
      affectsPlan: value !== 'other',
    })),

    /**
     * **病种词表**（2026-10-06 老板定的模型）—— 顾客勾的就是它。
     * 界面上不出现"核心疫苗"这种内部术语，只有病种。
     */
    components: VACCINE_COMPONENTS.map((value) => ({
      value,
      label: VACCINE_COMPONENT_LABELS[value],
      /** 是不是 WSAVA 2024 那三支核心疫苗之一 —— 界面给个视觉提示，不参与判定 */
      isCore: (CORE_COMPONENTS as readonly string[]).includes(value),
    })),

    presets,

    /**
     * 产品库：进口在前（按批签发批数），国产在后。
     *
     * ⚠️ 只下发**对外字段**（技术方案 1.3）。`aliases` / `brand` /
     *    `minWeeks` / `registration` / `booster` / `note` / `earlySeries`
     *    是内部字段：匹配与排期只在后端做。
     *
     * ⚠️ `recommendable` 只影响"常见的有…"那一行，**不影响能不能选**。
     */
    products: VACCINE_PRODUCTS.map((product) => ({
      components: [...product.components],
      name: product.name,
      manufacturer: product.manufacturer,
      recommendable: product.recommendable !== false,
    })),

    /** 界面上的字段标题与顺序（冲突 B8：由后端下发，前端只用） */
    fieldLabels: VACCINE_FIELD_LABELS,
    fieldOrder: VACCINE_FIELD_ORDER,

    /** 手填兜底时给顾客看的一句说明 */
    manualHint:
      '产品库里没有的（新品牌、老本子上的写法），可以自己写名字；归类请照本子上的疫苗名称选一个。',
  };
}
