/**
 * 封面「品牌层 + 预设 + 摆法」的拼装规则（2026-11-18 编辑摄影版）
 *
 * 设计原则（老板 2026-11-18 定）：
 *   · 走「编辑摄影」而不是「原料标本图」：斜上方 45–55°、自然窗光、有方向的长影子；
 *   · 一个明显的主角（占比最大的肉/鱼/内脏），整块/大块，占最大面积；
 *   · 配角在主角周围排成松散弧形，各自成组、留缝；
 *   · 小料和补剂只放在边缘的小碟/小勺里，不出现品牌包装、补剂瓶、文字；
 *   · 台面/背景/色调可换，机位和摆法固定，不再每张一个样。
 *
 * 这一层是纯函数，不碰网络和数据库，方便测试与回归。
 */

import type {
  RecipeCoverIngredient,
  RecipeCoverSupplement,
} from './recipe-cover-prompt';

export type CoverPresetId = 'STONE_WARM' | 'MARBLE_COOL' | 'OAK_CREAM';
export type CoverSkeletonId = 'HERO_ARC';

export interface CoverPreset {
  id: CoverPresetId;
  label: string;
  /** 台面描述（一句话，直接进提示词） */
  surface: string;
  /** 背景描述（一句话） */
  background: string;
  /** 道具组（只放边缘，不抢主体） */
  props: string;
  /** 色调描述 */
  tone: string;
}

export interface CoverSkeleton {
  id: CoverSkeletonId;
  label: string;
  /** 摆法总述 */
  guide: string;
}

/** 三套台面/色调：都用浅色，和首页橱窗的奶油白 UI 搭 */
export const COVER_PRESETS: CoverPreset[] = [
  {
    id: 'STONE_WARM',
    label: '石板 · 暖窗光',
    surface:
      '一块浅灰米色天然石板，边缘粗糙、有细微纹理，放在浅橡木桌上；石板占画面下方约三分之二，木板和米色亚麻布在边缘露出。',
    background:
      '暖米色石灰墙，轻微失焦；左上角有柔和窗光，背景干净、不抢主体。',
    props: '米色亚麻布、两只小陶瓷碗、木质量勺、小玻璃油瓶',
    tone: '暖中性、真实、低饱和背景，食材本色鲜亮；高光偏暖、阴影偏冷。',
  },
  {
    id: 'MARBLE_COOL',
    label: '大理石 · 冷调',
    surface:
      '整块白色卡拉拉大理石，带浅灰细纹，放在白色台面上；石板占画面下方约三分之二。',
    background:
      '白色微水泥墙，轻微失焦；柔和漫射日光，背景干净、通透。',
    props: '白色亚麻布、两只白瓷小碗、银色量勺、小玻璃油瓶',
    tone: '冷调、明亮、干净，食材本色清透；阴影柔和、对比克制。',
  },
  {
    id: 'OAK_CREAM',
    label: '橡木 · 奶油调',
    surface:
      '一整块浅色橡木板，木纹清晰、颜色浅、不发黄，放在奶油色台面上；木板占画面下方约三分之二。',
    background: '奶油色灰泥墙，轻微失焦；暖窗光从左上角进来。',
    props: '米白亚麻布、粗陶小碗、木勺、小玻璃油瓶',
    tone: '奶油暖调、柔和低对比，温润有手作感；食材本色温暖。',
  },
];

/** 只有一种摆法：主料 + 弧形配角；不再每张换骨架 */
export const COVER_SKELETONS: CoverSkeleton[] = [
  {
    id: 'HERO_ARC',
    label: '主料弧形',
    guide:
      '主料作为主角放在前景中央偏左，整块/大块，占最大面积；其余食材在它周围排成松散的弧形，各自成组、留出缝隙；小料和补剂小碗放在边缘，不要围成一圈。',
  },
];

export function getCoverPreset(id: CoverPresetId): CoverPreset {
  return COVER_PRESETS.find((preset) => preset.id === id) ?? COVER_PRESETS[0];
}

export function getCoverSkeleton(id: CoverSkeletonId): CoverSkeleton {
  return (
    COVER_SKELETONS.find((skeleton) => skeleton.id === id) ?? COVER_SKELETONS[0]
  );
}

export interface CoverVariant {
  preset: CoverPresetId;
  skeleton: CoverSkeletonId;
}

export function variantKey(variant: CoverVariant): string {
  return `${variant.preset}:${variant.skeleton}`;
}

/**
 * 抽 N 个互不相同的「预设 × 摆法」组合。
 * `recentKeys` 是同一份食谱最近用过的组合，优先避开，避免连着几次长得一样。
 */
export const MAX_COVER_VARIANTS = 3;

export function pickCoverVariants(
  count: number,
  recentKeys: string[] = [],
  random: () => number = Math.random,
): CoverVariant[] {
  const all: CoverVariant[] = [];
  for (const preset of COVER_PRESETS) {
    for (const skeleton of COVER_SKELETONS) {
      all.push({ preset: preset.id, skeleton: skeleton.id });
    }
  }

  const wanted = Math.max(
    1,
    Math.min(MAX_COVER_VARIANTS, Math.round(Number(count) || 1)),
  );

  const shuffle = <T>(list: T[]): T[] => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const recent = new Set(recentKeys);
  // 优先用没出过的组合；全都出过时才退回全量
  const fresh = all.filter((variant) => !recent.has(variantKey(variant)));
  const pool = fresh.length >= wanted ? fresh : all;

  const picked: CoverVariant[] = [];
  const usedPresets = new Set<string>();
  // 第一轮：每个预设各挑一张，保证「三种气质」都能看到
  for (const preset of shuffle(COVER_PRESETS.map((item) => item.id))) {
    if (picked.length >= wanted) break;
    const options = shuffle(pool.filter((item) => item.preset === preset));
    const candidate = options[0];
    if (candidate) {
      picked.push(candidate);
      usedPresets.add(preset);
    }
  }
  // 第二轮：预设不够时用剩下的补足
  if (picked.length < wanted) {
    const rest = shuffle(
      pool.filter(
        (variant) =>
          !usedPresets.has(variant.preset) &&
          !picked.some((item) => variantKey(item) === variantKey(variant)),
      ),
    );
    picked.push(...rest.slice(0, wanted - picked.length));
  }
  return picked;
}

/** 固定文案：品牌层里不能交给模型发挥的部分 */
export const COVER_CAMERA_RULE =
  '斜上方 45–55° 拍摄，50mm 镜头，f/3.5，焦点在前景主料，浅景深；石板/木板占画面下方约三分之二，背景占上方约三分之一；有真实透视，不是正俯拍 90°。';

export const COVER_SAFE_AREA_RULE =
  '所有食材和道具都完整落在画面内，四边留一点呼吸空间，不要被画面边缘裁切；画面不要塞满，留出安静的负空间。';

export const COVER_LIGHT_RULE =
  '自然窗光从左上角照进来，柔和但有方向性，向右下投出长而软的阴影；高光偏暖、阴影偏冷；不要均匀平光、不要硬闪光。';

export const COVER_NEGATIVE_RULE =
  '画面中不要出现任何文字、字母、数字、标签、LOGO、水印、包装、补剂瓶、人手；不要熟食、煎烤痕迹、肉糜/肉末、切碎的小丁、血水、黏液、灰色影棚背景；不要额外食材；不要重复的食材或餐具。';

/** 主角之外，最多给几个「有独立位置」的配角；其余进边缘小料 */
const MAX_MAIN_GROUPS = 9;

const PROTEIN_PATTERN =
  /(肉|鸡|鸭|牛|羊|猪|兔|鹿|鹅|鸽|火鸡|鱼|虾|蟹|贝|心|肝|胗|蛋|三文鱼|青口|生蚝|鱿鱼|鹌鹑)/;
const GRAIN_PATTERN = /(米|麦|燕麦|糙米|小米|藜麦|高粱|玉米|薏米)/;
const OIL_PATTERN = /油/;
const SALT_PATTERN = /盐/;
const EGG_PATTERN = /蛋/;
const SMALL_CUT_PATTERN =
  /(打碎|切碎|切丁|切末|切小朵|绞肉|绞碎|肉糜|肉末|打粉|磨粉|成泥|泥状|小丁|小块|切小块)/;

/** 封面不画的预处理整词（清理词不在此列） */
const HIDDEN_FORM_TOKENS = new Set([
  '生',
  '熟',
  '干',
  '生重',
  '熟重',
  '干重',
  '煮熟',
  '蒸熟',
  '煮熟后称重',
  '烤',
  '煎',
  '炸',
  '炒',
  '焯',
  '煮',
  '打碎',
  '切碎',
  '切丁',
  '切末',
  '切小朵',
  '切小块',
  '绞',
  '绞肉',
  '绞碎',
  '打粉',
  '磨粉',
  '成泥',
  '泥状',
  '肉糜',
  '肉末',
  '小丁',
  '小块',
  '搅拌',
  '充分搅拌',
  '混合',
  '打浆',
  '破壁',
  '去皮',
  '去骨',
  '去油',
  '去壳',
  '去瓤',
  '去蒂',
  '去筋',
  '去膜',
  '去刺',
  '去腮',
  '去内脏',
  '去头',
  '去尾',
]);

const FORM_SEPARATOR = /[\/、，,;；]+/;

/** 鱼种的外观提示：模型容易把青花鱼画成三文鱼，补一句颜色/鱼皮 */
const FISH_HINTS: Array<[RegExp, string]> = [
  [/青花鱼|鲭鱼/, '银蓝色鱼皮、深色条纹'],
  [/三文鱼|鲑鱼/, '橙粉色鱼肉、白色脂肪纹'],
  [/鳕鱼/, '雪白色鱼肉'],
  [/沙丁鱼/, '银灰色小鱼'],
  [/秋刀鱼/, '细长银灰色鱼身'],
];

function fishHint(name: string): string {
  return FISH_HINTS.find(([pattern]) => pattern.test(name))?.[1] ?? '';
}

function normalizeName(name: unknown): string {
  return String(name ?? '').trim();
}

function isProtein(name: string): boolean {
  return PROTEIN_PATTERN.test(name);
}

function isGrain(name: string): boolean {
  return GRAIN_PATTERN.test(name);
}

/**
 * 选主角：优先最大的肉/鱼/内脏；如果最大的整体是谷物且蛋白太小，就用整体最大。
 * 这样「燕麦占一半、鸡胸只占 10%」的食谱不会把鸡胸当主角。
 */
function pickHero(
  ingredients: RecipeCoverIngredient[],
): RecipeCoverIngredient {
  const top = ingredients[0];
  if (!top) {
    throw new Error('封面至少需要一种食材');
  }
  if (isProtein(top.name)) return top;
  const protein = ingredients.find(
    (item) =>
      isProtein(item.name) && Number(item.ratioPercent ?? 0) >= 10,
  );
  return protein ?? top;
}

/** 去掉「打碎/切丁/绞肉」这类小切法，以及生/熟/干/煮/搅拌这类状态 */
function sanitizeForm(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const parts = text
    .split(FORM_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  const kept = parts.filter(
    (part) => !HIDDEN_FORM_TOKENS.has(part) && !SMALL_CUT_PATTERN.test(part),
  );

  // 没有需要去掉的片段时保留原句的标点，避免把「整块平放，表面朝上」改成顿号
  if (kept.length === parts.length) return text;
  return kept.join('、');
}

function fallbackForm(name: string): string {
  if (isGrain(name)) return '整粒堆成边缘干净的小山';
  if (OIL_PATTERN.test(name)) return '装在小玻璃瓶/小碟里';
  if (SALT_PATTERN.test(name)) return '一小碟白色盐粒';
  if (EGG_PATTERN.test(name)) return '带壳整颗，旁边一颗打散';
  if (/虾仁/.test(name)) return '整只虾仁';
  if (/虾/.test(name)) return '带壳整只';
  if (/蟹肉/.test(name)) return '蟹肉块';
  if (/蟹/.test(name)) return '带壳整只';
  if (/贝肉/.test(name)) return '整颗贝肉';
  if (/贝/.test(name)) return '带壳整颗';
  if (/籽|仁|芝麻/.test(name)) return '一小撮';
  if (/甘蓝|卷心菜|生菜|白菜/.test(name)) return '大块叶片或粗丝';
  if (/胡萝卜/.test(name)) return '整根或粗条';
  if (/菠菜|青菜|油菜/.test(name)) return '整片叶子';
  if (/南瓜|红薯|紫薯|土豆/.test(name)) return '大块厚片';
  if (/西蓝花|西兰花|花菜/.test(name)) return '整朵';
  if (/蘑菇|香菇|口蘑/.test(name)) return '整颗或厚片';
  if (/鱼排|鱼片|鱼柳/.test(name)) return '整片鱼排，表面朝上';
  if (/鱼/.test(name)) return '整条鱼，鱼头鱼尾完整';
  if (/心|肝|胗/.test(name)) return '整块';
  if (isProtein(name)) return '整块/大块，表面朝上';
  return '整块/大块，保持自然形态';
}

function resolveForm(
  item: RecipeCoverIngredient,
  forms: Record<string, string>,
  options: { hero: boolean },
): string {
  const name = normalizeName(item.name);
  // 2026-11-18 老板定：封面不读 preparationMethod，只用名称 + 文本模型写的形态
  let form = sanitizeForm(forms[name]) || fallbackForm(name);

  // 谷物写成「粉」时改回整粒：封面不画面粉
  if (isGrain(name) && /粉/.test(form)) {
    form = '整粒堆成边缘干净的小山';
  }

  // 鱼种外观：避免青花鱼被画成三文鱼色
  const hint = fishHint(name);
  if (hint && !form.includes(hint)) {
    form = `${form}，${hint}`;
  }

  if (
    options.hero &&
    !isGrain(name) &&
    !OIL_PATTERN.test(name) &&
    !SALT_PATTERN.test(name) &&
    !/(整块|大块|整条|整颗|整片)/.test(form)
  ) {
    form = `${form}；整块/大块，不要切片或切碎`;
  }

  return form;
}

/** 用量分档：不写百分比，避免模型把数字画进画面 */
function amountHint(
  index: number,
  total: number,
  ratio: number | null | undefined,
): string {
  if (total <= 2) return '面积按用量分配';
  if (!Number.isFinite(Number(ratio))) return '面积按用量分配';
  const rank = index + 1;
  const largeCut = Math.ceil(total * 0.34);
  const smallCut = total - Math.ceil(total * 0.25) + 1;
  if (rank === 1) return '用量最大，给最大面积';
  if (rank <= largeCut) return '用量较大';
  if (rank >= smallCut) return '用量较小，面积最小';
  return '用量中等';
}

/** 补剂只表现「粉/胶囊/片/油」的状态，不出现包装 */
function describeSupplement(name: string): string {
  const value = normalizeName(name);
  if (/油/.test(value)) return '一小碟金色油';
  if (/海藻|螺旋藻/.test(value)) return '一小碟深绿色粉末';
  if (/蛋壳|钙/.test(value)) return '一小碟米白色粉末';
  if (/纤维/.test(value)) return '一小碟白色粉末';
  if (/酵母/.test(value)) return '一小碟淡黄色粉末';
  if (/粉/.test(value)) return '一小碟浅色粉末';
  if (/胶囊/.test(value)) return '一小碟透明胶囊';
  if (/片/.test(value)) return '一小碟圆形片剂';
  return '一小碟补剂粉末';
}

function buildSupplementLine(
  supplements: RecipeCoverSupplement[] | undefined,
): string {
  const picks = [...(supplements ?? [])]
    .filter((item) => normalizeName(item.name))
    .sort(
      (a, b) =>
        Number(b.weightG ?? b.ratioPercent ?? 0) -
        Number(a.weightG ?? a.ratioPercent ?? 0),
    )
    .slice(0, 3);

  if (picks.length === 0) return '';

  const descriptions = [
    ...new Set(picks.map((item) => describeSupplement(item.name))),
  ];
  return `补剂点缀：画面后方边缘放 ${picks.length} 个小碟/小勺（${descriptions.join(
    '、',
  )}），只表现粉/胶囊/油的状态，不要包装、不要瓶子、不要标签、不要文字。`;
}

export interface BuildCoverPromptInput {
  /** 已按用量降序排好的食材（食品类） */
  ingredients: RecipeCoverIngredient[];
  /** 补剂：只用来决定边缘小碟里放什么状态，不出现品牌包装 */
  supplements?: RecipeCoverSupplement[];
  /** 名称 → 形态说明（文本模型写的；缺失时按名称给自然形态） */
  forms: Record<string, string>;
  preset: CoverPreset;
  skeleton: CoverSkeleton;
}

/**
 * 拼最终生图提示词。
 * 顺序：品牌句 → 清单 → 主料 → 配角 → 小料 → 补剂 → 道具 → 台面/背景 → 摆法 → 机位 → 光线 → 色调 → 安全区 → 生鲜规则 → 负面 → 质感。
 */
export function buildCoverPrompt(input: BuildCoverPromptInput): string {
  const ingredients = input.ingredients
    .filter((item) => normalizeName(item.name))
    .slice()
    .sort(
      (a, b) => Number(b.ratioPercent ?? 0) - Number(a.ratioPercent ?? 0),
    );

  if (ingredients.length === 0) return '';

  const hero = pickHero(ingredients);
  const heroName = normalizeName(hero.name);
  const rest = ingredients.filter(
    (item) => normalizeName(item.name) !== heroName,
  );
  const main = rest.slice(0, MAX_MAIN_GROUPS);
  const accents = rest.slice(MAX_MAIN_GROUPS);
  const names = ingredients.map((item) => normalizeName(item.name));

  const inventory = `画面中必须且只能出现以下 ${names.length} 种食材，不要添加清单以外的任何食材：${names.join(
    '、',
  )}。`;
  const heroForm = resolveForm(hero, input.forms, { hero: true });
  const heroCutRule =
    isGrain(heroName) ||
    OIL_PATTERN.test(heroName) ||
    SALT_PATTERN.test(heroName) ||
    EGG_PATTERN.test(heroName)
      ? ''
      : '；不要切片、不要切碎';
  const heroLine = `主料：${heroName} — ${heroForm}。它是画面里最大、最完整的一件，放在前景中央偏左，占最大面积${heroCutRule}。`;

  const mainLines = main.map((item, index) => {
    const form = resolveForm(item, input.forms, { hero: false });
    return `${index + 1}. ${normalizeName(item.name)} — ${form}（${amountHint(
      index + 1,
      ingredients.length,
      item.ratioPercent,
    )}）；放在主料周围的弧形里，各自成组、留缝。`;
  });

  const accentLine = accents.length
    ? `小料点缀：${accents
        .map(
          (item) =>
            `${normalizeName(item.name)}（${resolveForm(item, input.forms, {
              hero: false,
            })}）`,
        )
        .join('、')}；放在画面边缘的小碟/小勺里，不要抢主料。`
    : '';

  const supplementLine = buildSupplementLine(input.supplements);

  return [
    '高端鲜食狗粮品牌的商业美食封面，超写实编辑摄影，不是目录图，也不是信息图。',
    inventory,
    heroLine,
    mainLines.length
      ? `配角（围绕主料排成松散弧形，各自成组、留缝）：\n${mainLines.join(
          '\n',
        )}`
      : '',
    accentLine,
    supplementLine,
    `道具：${input.preset.props}；只放在边缘，轻微失焦，不抢主体；不要品牌包装、不要补剂瓶、不要标签。`,
    `台面：${input.preset.surface}`,
    `背景：${input.preset.background}`,
    `摆法：${input.skeleton.guide}`,
    COVER_CAMERA_RULE,
    COVER_LIGHT_RULE,
    `色调：${input.preset.tone}`,
    COVER_SAFE_AREA_RULE,
    '所有食材都保持自然、原始、完整的形态：整块肉、整条鱼（鱼头鱼尾完整）、带壳贝类、整颗蛋、整粒谷物、整颗/整根蔬菜；不要去皮去骨去壳、不要打碎、不要绞肉、不要切小丁、不要打泥、不要煮熟。',
    COVER_NEGATIVE_RULE,
    '真实纹理、自然瑕疵、食材表面有新鲜的水光/油光；不要过度磨皮、不要塑料感。',
  ]
    .filter(Boolean)
    .join('\n');
}
