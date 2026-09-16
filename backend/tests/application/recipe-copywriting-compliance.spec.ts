import { BadRequestException } from '@nestjs/common';

import {
  assertCopywritingCompliant,
  FORBIDDEN_CLAIM_PATTERNS,
  getForbiddenClaimPatterns,
  normalizeCopywritingOutput,
  scanForbiddenClaims,
} from '../../src/application/recipe-designer/recipe-copywriting-compliance';
import { buildRecipeCopywritingSystemPrompt } from '../../src/application/recipe-designer/recipe-copywriting.service';

describe('食谱文案合规校验', () => {
  describe('scanForbiddenClaims', () => {
    it('命中疾病名与医疗用语', () => {
      expect(scanForbiddenClaims('有助于改善关节炎症')).toEqual(
        expect.arrayContaining(['关节', '炎症', '改善']),
      );
      expect(scanForbiddenClaims('护肝护肾配方')).toEqual(
        expect.arrayContaining(['护肝', '护肾']),
      );
      expect(scanForbiddenClaims('预防肿瘤')).toEqual(
        expect.arrayContaining(['预防', '肿瘤']),
      );
    });

    it('不误伤合法食材名（猪肝 / 牛心 等）', () => {
      expect(scanForbiddenClaims('含猪肝与牛心，补充动物蛋白')).toEqual([]);
      expect(scanForbiddenClaims('搭配红薯、燕麦与西兰花')).toEqual([]);
    });

    it('正常合规文案不命中', () => {
      expect(
        scanForbiddenClaims(
          '含鳕鱼与红薯，符合 FEDIAF 2025 的成犬日常维持鲜食',
          '以鳕鱼和猪里脊提供动物蛋白，搭配红薯、燕麦与西兰花，低温蒸煮后冷链配送。',
        ),
      ).toEqual([]);
    });

    it('空文本不命中', () => {
      expect(scanForbiddenClaims()).toEqual([]);
      expect(scanForbiddenClaims('', null, undefined)).toEqual([]);
    });

    it('禁用清单非空且无单字误伤项', () => {
      expect(FORBIDDEN_CLAIM_PATTERNS.length).toBeGreaterThan(20);
      // 「肝」「肾」等单字不得直接作为禁用项，否则会误伤食材名
      expect(FORBIDDEN_CLAIM_PATTERNS).not.toContain('肝');
      expect(FORBIDDEN_CLAIM_PATTERNS).not.toContain('肾');
    });
  });

  describe('normalizeCopywritingOutput', () => {
    const allowedTags = ['含鳕鱼', '含红薯', '成犬维持', '符合 FEDIAF 2025'];

    it('只保留白名单内的推荐标签', () => {
      const result = normalizeCopywritingOutput(
        {
          sellingPoint: '含鳕鱼与红薯的成犬鲜食',
          description: '以鳕鱼提供动物蛋白。',
          suggestedTags: ['含鳕鱼', '抗炎', '不存在的标签', '成犬维持'],
          basis: '依据配方原料',
        },
        allowedTags,
      );
      expect(result.suggestedTags).toEqual(['含鳕鱼', '成犬维持']);
    });

    it('推荐标签去重', () => {
      const result = normalizeCopywritingOutput(
        { suggestedTags: ['含鳕鱼', '含鳕鱼'] },
        allowedTags,
      );
      expect(result.suggestedTags).toEqual(['含鳕鱼']);
    });

    it('超长文案按上限截断', () => {
      const result = normalizeCopywritingOutput(
        {
          sellingPoint: '很'.repeat(100),
          description: '长'.repeat(1000),
        },
        allowedTags,
      );
      expect(result.sellingPoint.length).toBeLessThanOrEqual(40);
      expect(result.description.length).toBeLessThanOrEqual(400);
    });

    it('缺失字段回退为空值', () => {
      const result = normalizeCopywritingOutput({}, allowedTags);
      expect(result).toEqual({
        sellingPoint: '',
        description: '',
        suggestedTags: [],
        basis: '',
      });
    });
  });

  describe('assertCopywritingCompliant', () => {
    it('命中禁用表述时抛错并指出命中的词', () => {
      let error: unknown;
      try {
        assertCopywritingCompliant({
          sellingPoint: '护肾配方，改善肾脏负担',
          description: '',
          suggestedTags: [],
          basis: '',
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('护肾');
      expect((error as BadRequestException).message).toContain('肾脏');
    });

    it('合规文案不抛错', () => {
      expect(() =>
        assertCopywritingCompliant({
          sellingPoint: '含鳕鱼与红薯，符合 FEDIAF 2025',
          description: '以鳕鱼提供动物蛋白，搭配红薯与燕麦。',
          suggestedTags: ['含鳕鱼'],
          basis: '依据配方原料',
        }),
      ).not.toThrow();
    });
  });

  describe('系统提示词', () => {
    it('内嵌合规红线与四层卖点维度', () => {
      const prompt = buildRecipeCopywritingSystemPrompt();
      expect(prompt).toContain('禁止对宠物饲料作具有预防或者治疗宠物疾病的说明或者宣传');
      expect(prompt).toContain('原料事实');
      expect(prompt).toContain('工艺特性');
      expect(prompt).toContain('标准背书');
      expect(prompt).toContain('allowedTags');
      expect(prompt).toContain('sellingPoint');
      expect(prompt).toContain('description');
    });
  });

  describe('禁用词表可配置（无需改代码即可扩充）', () => {
    const ORIGINAL = process.env.RECIPE_COPYWRITING_FORBIDDEN_CLAIMS;

    afterEach(() => {
      if (ORIGINAL === undefined) {
        delete process.env.RECIPE_COPYWRITING_FORBIDDEN_CLAIMS;
      } else {
        process.env.RECIPE_COPYWRITING_FORBIDDEN_CLAIMS = ORIGINAL;
      }
    });

    it('未配置环境变量时只用内置清单', () => {
      delete process.env.RECIPE_COPYWRITING_FORBIDDEN_CLAIMS;
      expect(getForbiddenClaimPatterns()).toEqual(FORBIDDEN_CLAIM_PATTERNS);
    });

    it('环境变量可追加禁用词：去空白、去重，并参与扫描', () => {
      process.env.RECIPE_COPYWRITING_FORBIDDEN_CLAIMS = ' 护心 , 降糖 ,护心,';
      const patterns = getForbiddenClaimPatterns();
      expect(patterns).toContain('护心');
      expect(patterns).toContain('降糖');
      expect(patterns.filter((word) => word === '护心')).toHaveLength(1);
      // 内置词仍在
      expect(patterns).toContain('护肾');
      // 追加词真的会被扫描命中
      expect(scanForbiddenClaims('本品护心效果好')).toEqual(['护心']);
    });
  });
});
