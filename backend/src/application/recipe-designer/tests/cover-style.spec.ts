import {
  buildCoverPrompt,
  COVER_CAMERA_RULE,
  COVER_NEGATIVE_RULE,
  COVER_SAFE_AREA_RULE,
  getCoverPreset,
  getCoverSkeleton,
  pickCoverVariants,
  variantKey,
} from '../cover-style';
import type {
  RecipeCoverIngredient,
  RecipeCoverSupplement,
} from '../recipe-cover-prompt';
import { parseForms } from '../recipe-cover-visual-brief.service';
import { DEFAULT_RECIPE_COVER_PROMPT } from '../recipe-cover-config.service';

const ingredients: RecipeCoverIngredient[] = [
  { name: '牛霖', preparationMethod: '去油、生重、打碎、充分搅拌', ratioPercent: 42 },
  { name: '南瓜', preparationMethod: '熟/去皮', ratioPercent: 18 },
  { name: '糙米', preparationMethod: '煮熟后称重、充分搅拌', ratioPercent: 15 },
  { name: '西蓝花', preparationMethod: '切小朵', ratioPercent: 8 },
  { name: '鸡蛋', preparationMethod: '生/去壳', ratioPercent: 5 },
  { name: '胡萝卜', preparationMethod: '去皮、打碎', ratioPercent: 4 },
  { name: '菠菜', preparationMethod: '熟', ratioPercent: 3 },
  { name: '牛肝', preparationMethod: '去油、打碎', ratioPercent: 2 },
  { name: '青花鱼', preparationMethod: '去骨、打碎', ratioPercent: 1.5 },
  { name: '白蘑菇', preparationMethod: '切片', ratioPercent: 0.8 },
  { name: '青口贝', preparationMethod: '去壳', ratioPercent: 0.4 },
  { name: '南瓜籽', preparationMethod: '干重', ratioPercent: 0.2 },
];

const supplements: RecipeCoverSupplement[] = [
  { name: '海藻粉', weightG: 0.3 },
  { name: '鱼肝油', weightG: 0.1 },
  { name: '蛋氨酸锌', weightG: 0.15 },
];

function build(overrides: Record<string, unknown> = {}): string {
  return buildCoverPrompt({
    ingredients,
    forms: {},
    preset: getCoverPreset('STONE_WARM'),
    skeleton: getCoverSkeleton('HERO_ARC'),
    ...overrides,
  });
}

describe('buildCoverPrompt · 编辑摄影版', () => {
  it('清单只列这些食材，并写死「不要添加清单以外」', () => {
    const prompt = build();

    expect(prompt).toContain(
      '画面中必须且只能出现以下 12 种食材，不要添加清单以外的任何食材：牛霖、南瓜、糙米、西蓝花、鸡蛋、胡萝卜、菠菜、牛肝、青花鱼、白蘑菇、青口贝、南瓜籽。',
    );
  });

  it('斜上方 45–55°，不再正俯拍；机位/安全区/负面词都是固定文案', () => {
    const prompt = build();

    expect(prompt).toContain(COVER_CAMERA_RULE);
    expect(prompt).toContain(COVER_SAFE_AREA_RULE);
    expect(prompt).toContain(COVER_NEGATIVE_RULE);
    expect(prompt).toContain('斜上方 45–55°');
    expect(prompt).toContain('不是正俯拍 90°');
    expect(prompt).toContain('不要被画面边缘裁切');
    expect(prompt).not.toContain('四边各留 10% 的空白');
  });

  it('占比最大的牛霖是主角，要求整块/大块、不要切片切碎', () => {
    const prompt = build();

    expect(prompt).toContain('主料：牛霖');
    expect(prompt).toContain('它是画面里最大、最完整的一件');
    expect(prompt).toContain('不要切片、不要切碎');
  });

  it('主角之外最多 9 个配角上独立位置，其余进边缘小料', () => {
    const prompt = build();

    expect(prompt).toContain('配角（围绕主料排成松散弧形');
    expect(prompt).toContain('1. 南瓜');
    expect(prompt).toContain('8. 青花鱼');
    expect(prompt).toContain('9. 白蘑菇');
    expect(prompt).toContain('小料点缀：青口贝');
    expect(prompt).toContain('带壳整颗');
    expect(prompt).toContain('青口贝');
    expect(prompt).toContain('南瓜籽');
  });

  it('台面/背景/道具/色调来自预设', () => {
    const prompt = build({
      preset: getCoverPreset('OAK_CREAM'),
    });

    expect(prompt).toContain('浅色橡木板');
    expect(prompt).toContain('奶油色灰泥墙');
    expect(prompt).toContain('木勺');
    expect(prompt).toContain('奶油暖调');
  });

  it('形态来自文本模型；没有形态时按名称给自然形态，忽略预处理', () => {
    const prompt = build({
      forms: { 牛霖: '整块平放，表面朝上' },
    });

    expect(prompt).toContain('牛霖 — 整块平放，表面朝上');
    // 不读预处理：南瓜就是「大块厚片」，不写「去皮」
    expect(prompt).toContain('南瓜 — 大块厚片');
    expect(prompt).not.toContain('南瓜 — 去皮');
    // 糙米就是整粒，不写「煮熟/搅拌」
    expect(prompt).toContain('糙米 — 整粒堆成边缘干净的小山');
    // 胡萝卜就是整根/粗条，不写「去皮/打碎」
    expect(prompt).toContain('胡萝卜 — 整根或粗条');
    expect(prompt).not.toContain('胡萝卜 — 去皮');
    expect(prompt).toContain('不要熟食');
  });

  it('补剂只进边缘小碟，不出现包装/瓶子/标签', () => {
    const prompt = build({ supplements });

    expect(prompt).toContain('补剂点缀');
    expect(prompt).toContain('一小碟深绿色粉末');
    expect(prompt).toContain('一小碟金色油');
    expect(prompt).toContain('不要包装、不要瓶子、不要标签、不要文字');
  });

  it('三张候选的提示词互不相同（只换台面/背景/色调）', () => {
    const variants = pickCoverVariants(3, [], () => 0.5);
    const prompts = variants.map((variant) =>
      buildCoverPrompt({
        ingredients,
        forms: {},
        preset: getCoverPreset(variant.preset),
        skeleton: getCoverSkeleton(variant.skeleton),
      }),
    );
    expect(new Set(prompts).size).toBe(3);
    for (const prompt of prompts) {
      expect(prompt).toContain('斜上方 45–55°');
      expect(prompt).not.toContain('正俯拍 90° 垂直向下');
    }
  });
});

describe('pickCoverVariants', () => {
  it('返回指定数量且组合不重复', () => {
    const picked = pickCoverVariants(3, [], () => 0.3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map(variantKey)).size).toBe(3);
  });

  it('优先避开最近用过的组合', () => {
    const recent = ['STONE_WARM:HERO_ARC'];
    for (let i = 0; i < 8; i += 1) {
      const picked = pickCoverVariants(2, recent);
      expect(picked.map(variantKey)).not.toContain('STONE_WARM:HERO_ARC');
    }
  });

  it('数量被夹在 1–3 之间，超量时补齐', () => {
    expect(pickCoverVariants(0)).toHaveLength(1);
    expect(pickCoverVariants(99)).toHaveLength(3);
  });
});

describe('parseForms', () => {
  it('解析「名称｜形态」并去掉序号和列表符号', () => {
    const forms = parseForms(
      ['1. 牛霖｜整块平放，表面朝上', '- 糙米：堆成圆锥', '· 南瓜 | 带皮切块'].join(
        '\n',
      ),
      ['牛霖', '糙米', '南瓜'],
    );
    expect(forms).toEqual({
      牛霖: '整块平放，表面朝上',
      糙米: '堆成圆锥',
      南瓜: '带皮切块',
    });
  });

  it('名称带括号时按包含匹配', () => {
    const forms = parseForms('牛霖（整块）｜表面朝上', ['牛霖']);
    expect(forms['牛霖']).toBe('表面朝上');
  });

  it('没有可用行时返回空对象，让调用方兜底', () => {
    expect(parseForms('这是一段没有格式的文字。', ['牛霖'])).toEqual({});
    expect(parseForms(null, ['牛霖'])).toEqual({});
  });
});

describe('DEFAULT_RECIPE_COVER_PROMPT', () => {
  it('只让模型写形态，不写摆位与机位（那些由模板固定）', () => {
    expect(DEFAULT_RECIPE_COVER_PROMPT).toContain('自然、原始、完整形态');
    expect(DEFAULT_RECIPE_COVER_PROMPT).toContain('不要看食谱里的预处理字段');
    expect(DEFAULT_RECIPE_COVER_PROMPT).toContain('整条鱼');
    expect(DEFAULT_RECIPE_COVER_PROMPT).toContain('不要写：摆放位置');
    expect(DEFAULT_RECIPE_COVER_PROMPT).toContain('不要写：去皮、去骨');
    expect(DEFAULT_RECIPE_COVER_PROMPT).not.toContain('顶尖杂志级');
  });
});
