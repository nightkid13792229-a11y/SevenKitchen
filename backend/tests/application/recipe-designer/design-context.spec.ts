import {
  buildAttachmentList,
  classifyAttachment,
  summarizeDesignContext,
} from '../../../src/application/recipe-designer/agent/design-context';
import type { AgentDesignContext } from '../../../src/application/recipe-designer/agent/design-context.types';

function context(
  overrides: Partial<AgentDesignContext> = {},
): AgentDesignContext {
  return {
    mode: 'ORDER',
    order: null,
    dog: { name: '舒客' } as AgentDesignContext['dog'],
    medicalRecords: [],
    checkupRecords: [],
    allergyRecords: [],
    allergyReports: [],
    weightRecords: [],
    weightGoalPlan: null,
    dietPreferences: { liked: [], disliked: [] },
    attachments: [],
    counts: {
      medicalRecords: 1,
      checkupRecords: 0,
      allergyRecords: 0,
      allergyReports: 0,
      weightRecords: 1,
      attachments: 6,
      images: 6,
    },
    missing: ['体检记录', '过敏记录'],
    unavailableReason: null,
    ...overrides,
  };
}

describe('design context helpers', () => {
  describe('classifyAttachment', () => {
    it('recognises images regardless of query string', () => {
      expect(classifyAttachment('https://img.example.com/a.JPG?sign=1')).toBe(
        'IMAGE',
      );
    });

    it('recognises pdf', () => {
      expect(classifyAttachment('https://img.example.com/report.pdf')).toBe(
        'PDF',
      );
    });

    it('falls back to OTHER when there is no known extension', () => {
      expect(classifyAttachment('https://img.example.com/download?id=1')).toBe(
        'OTHER',
      );
    });
  });

  describe('buildAttachmentList', () => {
    it('builds stable ids and readable labels', () => {
      const list = buildAttachmentList('MEDICAL', 'rec-1', '2026-11-12', [
        'https://img.example.com/a.jpg',
        '',
        'https://img.example.com/b.pdf',
      ]);

      expect(list).toHaveLength(2);
      expect(list[0]).toMatchObject({
        id: 'MEDICAL:rec-1:0',
        kind: 'IMAGE',
        label: '就诊 2026-11-12 附件1',
      });
      // 空 URL 被过滤后，序号仍按原数组下标，保证 id 不会因为过滤而错位
      expect(list[1]).toMatchObject({
        id: 'MEDICAL:rec-1:2',
        kind: 'PDF',
        label: '就诊 2026-11-12 附件3',
      });
    });
  });

  describe('summarizeDesignContext', () => {
    it('summarises order, counts and missing records', () => {
      const summary = summarizeDesignContext(
        context({
          order: {
            orderNo: 'CR202611198532',
          } as AgentDesignContext['order'],
        }),
      );

      expect(summary).toContain('CR202611198532');
      expect(summary).toContain('舒客');
      expect(summary).toContain('附件 6 张');
      expect(summary).toContain('缺：体检记录、过敏记录');
    });

    it('says product-line designs are not bound to a dog', () => {
      const summary = summarizeDesignContext(
        context({
          mode: 'CATALOG',
          dog: null,
          counts: {
            medicalRecords: 0,
            checkupRecords: 0,
            allergyRecords: 0,
            allergyReports: 0,
            weightRecords: 0,
            attachments: 0,
            images: 0,
          },
          missing: [],
        }),
      );

      expect(summary).toContain('产品线设计');
      expect(summary).not.toContain('舒客');
    });

    it('surfaces an unavailable reason instead of pretending data exists', () => {
      const summary = summarizeDesignContext(
        context({
          order: null,
          dog: null,
          unavailableReason: '订单不存在或已删除',
        }),
      );

      expect(summary).toContain('背景读取失败：订单不存在或已删除');
    });
  });
});
