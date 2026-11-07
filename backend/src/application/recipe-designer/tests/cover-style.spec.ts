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
import type { RecipeCoverIngredient } from '../recipe-cover-prompt';
import { parseForms } from '../recipe-cover-visual-brief.service';
import { DEFAULT_RECIPE_COVER_PROMPT } from '../recipe-cover-config.service';

const ingredients: RecipeCoverIngredient[] = [
  { name: '牛霖', preparationMethod: '整块', ratioPercent: 42 },
  { name: '南瓜', preparationMethod: '切块', ratioPercent: 18 },
  { name: '糙米', preparationMethod: '蒸熟', ratioPercent: 15 },
  { name: '西蓝花', preparationMethod: '切小朵', ratioPercent: 8 },
];

describe('buildCoverPrompt', () => {
  it('清单只列这几种食材，并写死「不要添加清单以外」', () => {
    const prompt = buildCoverPrompt({
      ingredients,
      forms: {},
      preset: getCoverPreset('CREAM_STONE'),
      skeleton: getCoverSkeleton('RING'),
    });
    expect(prompt).toContain(
      '画面中必须且只能出现以下 4 种食材，不要添加清单以外的任何食材：牛霖、南瓜、糙米、西蓝花。',
    );
  });

  it('机位、安全区、负面词都是固定文案，不受模型影响', () => {
    const prompt = buildCoverPrompt({
      ingredients,
      forms: {},
      preset: getCoverPreset('CREAM_STONE'),
      skeleton: getCoverSkeleton('ROWS'),
    });
    expect(prompt).toContain(COVER_CAMERA_RULE);
    expect(prompt).toContain(COVER_SAFE_AREA_RULE);
    expect(prompt).toContain(COVER_NEGATIVE_RULE);
    expect(prompt).toContain('看不到桌沿');
    expect(prompt).toContain('四边各留 10%');
  });

  it('台面/道具/色调来自预设，骨架来自骨架', () => {
    const prompt = buildCoverPrompt({
      ingredients,
      forms: {},
      preset: getCoverPreset('LIGHT_OAK'),
      skeleton: getCoverSkeleton('DIAGONAL'),
    });
    expect(prompt).toContain('浅色橡木板');
    expect(prompt).toContain('木勺');
    expect(prompt).toContain('奶油暖调');
    expect(prompt).toContain('对角线分成三段');
  });

  it('每种食材都有形态与位置；没有形态时退回处理方式', () => {
    const prompt = buildCoverPrompt({
      ingredients,
      forms: { 牛霖: '整块平放，表面朝上' },
      preset: getCoverPreset('CREAM_STONE'),
      skeleton: getCoverSkeleton('RING'),
    });
    expect(prompt).toContain('牛霖：整块平放，表面朝上，位于画面正中央');
    expect(prompt).toContain('南瓜：切块，位于');
    expect(prompt).toContain('糙米：蒸熟，位于');
    // 蒸/熟这类状态词只应出现在形态说明里，不应被当成「熟食」画出来
    expect(prompt).toContain('不要熟食');
  });

  it('三张候选的提示词互不相同（预设或骨架不同）', () => {
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
  });
});

describe('pickCoverVariants', () => {
  it('返回指定数量且组合不重复', () => {
    const picked = pickCoverVariants(3, [], () => 0.3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map(variantKey)).size).toBe(3);
  });

  it('优先避开最近用过的组合', () => {
    const recent = ['CREAM_STONE:RING', 'WHITE_MARBLE:ROWS', 'LIGHT_OAK:DIAGONAL'];
    for (let i = 0; i < 12; i += 1) {
      const picked = pickCoverVariants(3, recent);
      expect(picked.map(variantKey).some((key) => recent.includes(key))).toBe(
        false,
      );
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
    expect(DEFAULT_RECIPE_COVER_PROMPT).toContain('形态说明');
    expect(DEFAULT_RECIPE_COVER_PROMPT).toContain('不要写：摆放位置');
    expect(DEFAULT_RECIPE_COVER_PROMPT).not.toContain('顶尖杂志级');
  });
});
