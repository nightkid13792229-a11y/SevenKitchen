import {
  buildEvidenceDigest,
  buildPlanSynthesisMessages,
} from '../../../src/application/recipe-designer/agent/plan-synthesis';
import type { DeepSeekToolsMessage } from '../../../src/application/recipe-designer/deepseek-tools-chat';

function toolMessage(data: unknown): DeepSeekToolsMessage {
  return {
    role: 'tool',
    tool_call_id: 't1',
    content: JSON.stringify({ ok: true, data }),
  };
}

describe('plan synthesis fallback context', () => {
  it('builds a compact digest from read pages and search hits', () => {
    const digest = buildEvidenceDigest([
      toolMessage({
        documentId: 'sacn5-chapters-SACN5-67',
        pages: [{ pageNo: 5, text: '脂肪 ≤15% DM' }],
      }),
      toolMessage({
        hits: [
          {
            documentId: 'fediaf',
            pageNo: 15,
            snippet: '粗蛋白 ≥18% DM',
          },
        ],
      }),
    ]);

    expect(digest).toContain('SACN5-67 p5');
    expect(digest).toContain('脂肪 ≤15% DM');
    expect(digest).toContain('fediaf p15');
    expect(digest).toContain('粗蛋白 ≥18% DM');
  });

  it('puts key clinical pages before unrelated pages and lists what was read', () => {
    const digest = buildEvidenceDigest([
      toolMessage({
        documentId: 'misc-doc',
        pages: [{ pageNo: 1, text: 'general feeding notes' }],
      }),
      toolMessage({
        documentId: 'sacn5-chapters-SACN5-67',
        pages: [{ pageNo: 5, text: '犬胰腺炎 脂肪 ≤15% DM，蛋白 15–30% DM' }],
      }),
    ]);

    expect(digest).toContain('本次读过的文档/页码');
    expect(digest.indexOf('【sacn5-chapters-SACN5-67 p5】')).toBeLessThan(
      digest.indexOf('【misc-doc p1】'),
    );
  });

  it('deduplicates the same page and respects the char cap', () => {
    const page = {
      documentId: 'doc',
      pages: [{ pageNo: 1, text: 'x'.repeat(500) }],
    };
    const digest = buildEvidenceDigest(
      [toolMessage(page), toolMessage(page)],
      600,
    );
    expect(digest.match(/【doc p1】/g)).toHaveLength(1);
    expect(digest.length).toBeLessThanOrEqual(600);
  });

  it('includes the design context, digest and an explicit propose instruction', () => {
    const messages = buildPlanSynthesisMessages({
      systemPrompt: 'system',
      phaseLine: 'plan',
      userMessage: '给舒客做方案',
      designContextJson: '{"mode":"ORDER"}',
      evidenceDigest: '【doc p1】evidence',
    });

    expect(messages.map((message) => message.role)).toEqual([
      'system',
      'system',
      'user',
      'user',
      'user',
      'user',
    ]);
    expect(String(messages[3].content)).toContain('本单档案');
    expect(String(messages[4].content)).toContain('证据摘录');
    expect(String(messages[5].content)).toContain('propose_plan');
  });
});
