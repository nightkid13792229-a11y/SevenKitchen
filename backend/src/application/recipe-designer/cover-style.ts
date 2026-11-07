/**
 * 封面「品牌层 + 预设 + 骨架」的拼装规则（2026-11-07）
 *
 * 设计原则（老板 2026-11-07 定）：
 *   · 品牌层锁死：正俯拍、窗光、暖中性、分组留缝、无文字、四周留白 10%；
 *   · 预设只换「台面 + 道具 + 色调」，三种都用浅色（和首页橱窗的奶油白 UI 搭）；
 *   · 骨架只换「怎么摆」：中心环形 / 平行三行 / 对角三段；
 *   · 食材的具体形态交给文本模型写（每样一句），位置由骨架模板排，
 *     这样同一套规则下每次出的图「一眼同品牌、细看各不同」。
 *
 * 这一层是纯函数，不碰网络和数据库，方便测试与回归。
 */

import type { RecipeCoverIngredient } from './recipe-cover-prompt';

export type CoverPresetId = 'CREAM_STONE' | 'WHITE_MARBLE' | 'LIGHT_OAK';
export type CoverSkeletonId = 'RING' | 'ROWS' | 'DIAGONAL';

export interface CoverPreset {
  id: CoverPresetId;
  label: string;
  /** 台面描述（一句话，直接进提示词） */
  surface: string;
  /** 道具组（只放边缘，不抢主体） */
  props: string;
  /** 色调描述 */
  tone: string;
}

export interface CoverSkeleton {
  id: CoverSkeletonId;
  label: string;
  /** 骨架总述 */
  guide: string;
  /** 按顺序给每件食材一个位置短语 */
  positions: (count: number) => string[];
}

/** 三种浅色预设：都能和首页橱窗的奶油白卡片融在一起 */
export const COVER_PRESETS: CoverPreset[] = [
  {
    id: 'CREAM_STONE',
    label: '米白石材 · 暖调',
    surface:
      '整块米白色天然石材，表面细腻、带极浅的暖灰纹理，明亮通透；画面一角露出浅橡木桌面和米色亚麻布。不要深色石板，不要灰色渐变影棚背景。',
    props:
      '黄铜量勺（装黑胡椒粒，整把勺子都在画面内）、白色小瓷碗（装粗盐）、折叠米色亚麻布',
    tone: '暖中性、明亮、低饱和背景，食材本色鲜亮，整体干净通透、有食欲。',
  },
  {
    id: 'WHITE_MARBLE',
    label: '白大理石 · 冷调',
    surface:
      '整块白色卡拉拉大理石，带浅灰细纹，明亮干净；画面一角露出浅橡木桌面和米白亚麻布。不要深色石板，不要灰色渐变影棚背景。',
    props:
      '银色量勺（装白芝麻）、白色小瓷碗（装粗盐）、小玻璃油瓶',
    tone: '冷调、高调明亮，白肉与鱼肉本色清透，整体干净清爽。',
  },
  {
    id: 'LIGHT_OAK',
    label: '浅橡木 · 奶油调',
    surface:
      '一整块浅色橡木板铺满画面，木纹清晰、颜色浅、不发黄；画面一角铺一小块米白亚麻布。不要深色木板，不要灰色渐变影棚背景。',
    props:
      '木勺（装几粒谷物）、粗陶小碗（装粗盐）、折叠米白亚麻布',
    tone: '奶油暖调、柔和低对比，木板比主体略亮，整体温润、有手作感。',
  },
];

/** 三种骨架：分别对应「主料突出 / 规整图鉴 / 有节奏的散列」 */
export const COVER_SKELETONS: CoverSkeleton[] = [
  {
    id: 'RING',
    label: '中心环绕',
    guide:
      '中心主料 + 环形分组：用量最大的那件放在画面正中央、是最大的一件，其余食材围绕它顺时针均匀分组。',
    positions: (count) => {
      const ring = [
        '左上方',
        '正上方',
        '右上方',
        '正右方',
        '右下方',
        '正下方',
        '左下方',
        '正左方',
      ];
      if (count <= 1) return ['画面正中央'];
      return ['画面正中央', ...ring].slice(0, count);
    },
  },
  {
    id: 'ROWS',
    label: '平行三行',
    guide:
      '平行横排，像食材标本图鉴：所有食材按水平方向分成若干行，行距均匀、朝向一致。',
    positions: (count) => {
      const rowCount = count <= 4 ? 2 : 3;
      const perRow = Math.ceil(count / rowCount);
      return Array.from({ length: count }, (_, index) => {
        const row = Math.floor(index / perRow) + 1;
        const col = (index % perRow) + 1;
        return `第${row}排、从左到右第${col}位`;
      });
    },
  },
  {
    id: 'DIAGONAL',
    label: '对角三段',
    guide:
      '沿画面左下到右上的对角线分成三段，段与段之间留出大片空白，形成有节奏的散列。',
    positions: (count) => {
      const bands = ['左下段', '中间段', '右上段'];
      const perBand = Math.ceil(count / bands.length);
      return Array.from(
        { length: count },
        (_, index) =>
          `${bands[Math.min(Math.floor(index / perBand), 2)]}，沿对角线第${(index % perBand) + 1}件`,
      );
    },
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
 * 抽 N 个互不相同的「预设 × 骨架」组合。
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
  const usedSkeletons = new Set<string>();
  // 第一轮：每个预设各挑一张、骨架尽量不重复，保证「三种气质」都能看到
  for (const preset of shuffle(COVER_PRESETS.map((item) => item.id))) {
    if (picked.length >= wanted) break;
    const options = shuffle(
      pool.filter(
        (item) => item.preset === preset && !usedSkeletons.has(item.skeleton),
      ),
    );
    const fallback = shuffle(pool.filter((item) => item.preset === preset));
    const candidate = options[0] ?? fallback[0];
    if (candidate) {
      picked.push(candidate);
      usedSkeletons.add(candidate.skeleton);
    }
  }
  // 第二轮：预设不够时用剩下的补足
  if (picked.length < wanted) {
    const rest = shuffle(
      pool.filter(
        (variant) =>
          !picked.some((item) => variantKey(item) === variantKey(variant)),
      ),
    );
    picked.push(...rest.slice(0, wanted - picked.length));
  }
  return picked;
}

/** 固定文案：品牌层里不能交给模型发挥的部分 */
export const COVER_CAMERA_RULE =
  '正俯拍 90° 垂直向下（flat lay），50mm 镜头，f/8 全画面清晰；画面里只有台面和食材，看不到桌沿、桌腿、背景墙和窗景，没有透视、没有倾斜。';

export const COVER_SAFE_AREA_RULE =
  '所有食材和道具都必须完整落在画面以内，四边各留 10% 的空白，任何东西（包括勺子柄、布角、碗沿）都不要被画面边缘裁切。';

export const COVER_LIGHT_RULE =
  '光线：左上方 45° 柔和窗光，食材表面有自然高光，向右下投出柔和长阴影；不要均匀平光、不要硬闪光。';

export const COVER_NEGATIVE_RULE =
  '画面中不要出现任何文字、字母、数字、标签、LOGO、水印、包装、人手；不要熟食、煎烤痕迹、血水、黏液、深色石板、灰色渐变影棚背景。';

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

export interface BuildCoverPromptInput {
  /** 已按用量降序排好的食材 */
  ingredients: RecipeCoverIngredient[];
  /** 名称 → 形态说明（文本模型写的；缺失时退回处理方式） */
  forms: Record<string, string>;
  preset: CoverPreset;
  skeleton: CoverSkeleton;
}

/**
 * 拼最终生图提示词。
 * 顺序：清单 → 机位 → 台面 → 骨架与逐项位置 → 道具与安全区 → 光线 → 色调 → 负面 → 机位复述。
 */
export function buildCoverPrompt(input: BuildCoverPromptInput): string {
  const { ingredients, forms, preset, skeleton } = input;
  const names = ingredients.map((item) => item.name);
  const positions = skeleton.positions(ingredients.length);

  const inventory = `画面中必须且只能出现以下 ${ingredients.length} 种食材，不要添加清单以外的任何食材：${names.join('、')}。`;

  const lines = ingredients.map((item, index) => {
    const form =
      String(forms[item.name] ?? '').trim() ||
      String(item.preparationMethod ?? '').trim() ||
      '保持自然形态';
    const ratio = Number(item.ratioPercent);
    return `${index + 1}. ${item.name}：${form}，位于${positions[index]}（${amountHint(index, ingredients.length, ratio)}）。`;
  });

  return [
    inventory,
    COVER_CAMERA_RULE,
    `台面：${preset.surface}`,
    `陈列骨架：${skeleton.guide}`,
    ...lines,
    '每组之间留出明显缝隙，互不重叠、不堆叠，同类食材朝向一致。',
    `道具：${preset.props}，只做点缀，不抢主体。`,
    COVER_SAFE_AREA_RULE,
    COVER_LIGHT_RULE,
    `色调：${preset.tone}`,
    COVER_NEGATIVE_RULE,
    '（正俯拍，镜头垂直向下，画面里只有台面和食材。）',
  ]
    .filter(Boolean)
    .join('\n');
}
