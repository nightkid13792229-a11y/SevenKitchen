/**
 * 疫苗名称库 + 归类闭集（2026-10-05）。
 *
 * ── 这个文件解决什么问题 ────────────────────────────────────────────
 *
 * 老板问："怎么保障用户填写正确的、可以被识别并归类的产品名称？"
 *
 * 我们的回答（老板拍板后的口径）：
 *   ① **一点即选的名字**：每个都带**已知归类**，顾客点一下就不会错；
 *   ② **产品库**：进口 + 国产都能选，选完归类自动带出来；
 *   ③ **手填兜底**：库里确实没有的（新品牌、老本子上的怪写法），
 *      允许自己写名字，但**归类必须自己指定**（必填项）；
 *   ④ **AI 识别**：由 AI 判归类，但只在**我们的四类闭集**里选 ——
 *      判的依据是我们维护的产品映射，不是它自由发挥。
 *
 * 四条合起来保证一件事：**系统永远不猜归类**。
 * 以前"认不出来就当核心苗"，一针驱虫药也能把核心苗的某一针标记成已完成。
 *
 * ── 为什么由后端下发，不写在前端 ──────────────────────────────────
 *
 * 分类与产品数据是后端的 domain 知识（`vaccine-products.ts` 是那份
 * 兽医审过的清单的代码版）。前端复制一份，两边迟早长歪 ——
 * 这个项目以前就吃过这个亏。
 */

import {
  VACCINE_KIND_LABELS,
  VACCINE_KINDS,
  classifyVaccineKinds,
  type VaccineKind,
} from './immunization-schedule';
import { VACCINE_PRODUCTS } from './vaccine-products';

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
 *    选产品能顺带把厂商和批准文号也带出来，比只写个名字有用。
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
 * 老板定的做法：
 *   "AI 先完成一项图片的信息提取，将疫苗产品名称提取出来……
 *    再由 AI 去匹配这个产品名称在我们的产品库中是哪一个产品。
 *    另外，我们在产品库中要对每一个产品进行分类，分类好之后，
 *    AI 匹配到的产品就会自动的匹配到该分类。"
 *
 * 所以 AI 的任务是**认到具体产品**，分类由产品带出来 ——
 * 不是让 AI 直接判分类。这样分类永远只有一份（我们这张表），
 * AI 只负责"认写法"这件它擅长的事。
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

export function buildVaccineCatalog() {
  const presets: VaccineCatalogPreset[] = PRESET_NAMES.map((name) => ({
    name,
    kinds: classifyVaccineKinds(name),
  }));

  return {
    /**
     * 归类闭集 —— 界面上的"归类（必填）"就照这个渲染。
     * `other` 排最后：实在认不出才选它。
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

    presets,

    /**
     * 产品库：进口在前（按批签发批数），国产在后。
     *
     * ⚠️ `recommendable` 只影响"常见的有…"那一行，**不影响能不能选**。
     *    国产苗 `recommendable: false` —— 老板审核意见第 5 条"不推荐国产"，
     *    但 2026-10-05 又补了一句"产品库里面允许用户自己选择国产品牌"。
     */
    products: VACCINE_PRODUCTS.map((product) => ({
      name: product.name,
      manufacturer: product.manufacturer,
      kinds: product.kinds,
      registration: product.registration,
      recommendable: product.recommendable !== false,
    })),

    /** 手填兜底时给顾客看的一句说明 */
    manualHint:
      '产品库里没有的（新品牌、老本子上的写法），可以自己写名字；归类请照本子上的疫苗名称选一个。',
  };
}
