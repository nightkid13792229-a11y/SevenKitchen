import {
  buildDesignContextImageMessage,
  splitDesignContextImages,
} from '../../../src/application/recipe-designer/agent/design-context-images';
import type { AgentDesignContext } from '../../../src/application/recipe-designer/agent/design-context.types';
import type { ToolOutcome } from '../../../src/application/recipe-designer/agent/agent-types';

function outcome(attachments: AgentDesignContext['attachments']): ToolOutcome {
  return {
    ok: true,
    data: {
      mode: 'ORDER',
      attachments,
      counts: {
        medicalRecords: 1,
        checkupRecords: 0,
        allergyRecords: 0,
        allergyReports: 0,
        weightRecords: 0,
        attachments: attachments.length,
        images: attachments.filter((item) => item.kind === 'IMAGE').length,
      },
    } as unknown as AgentDesignContext,
  };
}

function attachment(index: number) {
  return {
    id: `MEDICAL:rec-1:${index}`,
    recordType: 'MEDICAL' as const,
    recordId: 'rec-1',
    recordDate: '2026-11-12',
    kind: 'IMAGE' as const,
    label: `就诊 2026-11-12 附件${index + 1}`,
    url: `https://img.example.com/${index}.jpg`,
  };
}

describe('design context images', () => {
  it('only handles read_design_context', () => {
    const result = splitDesignContextImages(
      'read_draft',
      outcome([attachment(0)]),
    );
    expect(result.images).toEqual([]);
  });

  it('collects image attachments and strips urls from the tool result', () => {
    const result = splitDesignContextImages(
      'read_design_context',
      outcome([attachment(0), attachment(1)]),
    );

    expect(result.images).toHaveLength(2);
    expect(result.outcome.data).toMatchObject({
      inlineImageCount: 2,
      omittedImageCount: 0,
    });
    const attachments = (result.outcome.data as AgentDesignContext).attachments;
    expect(attachments[0]).not.toHaveProperty('url');
    expect(attachments[0]).toMatchObject({ id: 'MEDICAL:rec-1:0' });
  });

  it('caps inline images and reports how many were omitted', () => {
    const many = Array.from({ length: 210 }, (_, index) => attachment(index));
    const result = splitDesignContextImages(
      'read_design_context',
      outcome(many),
    );

    expect(result.images).toHaveLength(200);
    expect(result.outcome.data).toMatchObject({ omittedImageCount: 10 });
  });

  it('builds one user message with label + image url pairs', () => {
    const message = buildDesignContextImageMessage([
      { url: 'https://img.example.com/a.jpg', label: '就诊 附件1' },
    ]);

    expect(message.role).toBe('user');
    expect(message.content).toEqual([
      expect.objectContaining({ type: 'text' }),
      { type: 'text', text: '就诊 附件1' },
      {
        type: 'image_url',
        image_url: { url: 'https://img.example.com/a.jpg' },
      },
    ]);
  });
});
