import { KnowledgeBaseService } from '../../src/application/recipe-designer/knowledge-base.service';
import { HEALTH_ONLY_DOMAINS } from '../../src/domain/recipe-designer/knowledge-base/types';
import {
  buildCsv,
  buildMarkdown,
  healthEntriesOf,
  sourceDisplayName,
} from '../../scripts/export-knowledge-review-packet';

/**
 * 审核包导出（2026-10-01）。
 *
 * 为什么值得锁：
 *   健康知识全部是"待审核"，老板定的边界是**没人审过就不给顾客看**。
 *   所以现在最卡脖子的是兽医的审核工时 —— 审核包就是为压缩这个工时做的。
 *   它必须**只含健康侧条目**（不能把食谱营养那 200 多条一起倒给兽医，
 *   那会把审核量放大四倍），并且每条都要带上结论、要点、注意事项、出处、
 *   风险等级、紧急程度与证据强度，兽医用一份文档就能判断。
 */
describe('健康知识审核包导出', () => {
  const service = new KnowledgeBaseService();
  const entries = healthEntriesOf(service);

  it('只导出健康侧条目，不带食谱营养那批', () => {
    const healthOnly = new Set<string>(HEALTH_ONLY_DOMAINS);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => healthOnly.has(entry.domain))).toBe(true);
    expect(entries.length).toBeLessThan(service.getAll().length);
  });

  it('每条都带得上审核需要的信息', () => {
    const incomplete = entries
      .filter(
        (entry) =>
          !entry.id ||
          !entry.title ||
          !entry.summary ||
          !entry.riskLevel ||
          !entry.questionType ||
          !entry.reviewBy ||
          (entry.sources || []).length === 0,
      )
      .map((entry) => entry.id);

    expect(incomplete).toEqual([]);
  });

  it('Markdown 里每条都有编号、结论、出处与审核勾选框', () => {
    const markdown = buildMarkdown(entries, '2026-10-01');

    for (const entry of entries.slice(0, 20)) {
      expect(markdown).toContain(`### ${entry.id}`);
    }
    expect(markdown).toContain('**结论**：');
    expect(markdown).toContain('**出处**：');
    expect(markdown).toContain('□ 通过');
    expect(markdown).toContain('□ 需修改');
    expect(markdown).toContain('**意见**：');
  });

  it('分诊条目的紧急程度是中文写死的，不是让兽医自己猜', () => {
    const markdown = buildMarkdown(entries, '2026-10-01');
    const triage = entries.filter((entry) => entry.questionType === 'TRIAGE');

    expect(triage.length).toBeGreaterThan(0);
    expect(markdown).toContain('**紧急程度**：立即就医');
  });

  it('CSV 一行一条、带 BOM、留了回填列', () => {
    const csv = buildCsv(entries);
    const lines = csv.trim().split('\n');

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(lines.length).toBe(entries.length + 1);
    expect(lines[0]).toContain('审核结论');
    expect(lines[0]).toContain('审核意见');
  });

  it('出处显示名带版本与证据级，便于兽医核对是不是最新版', () => {
    const named = sourceDisplayName('WSAVA-VACC-2024');

    expect(named).toContain('WSAVA');
    expect(named).toContain('证据级');
  });

  it('没登记过的来源 ID 原样显示（不假装有出处）', () => {
    expect(sourceDisplayName('NOT-REGISTERED')).toBe('NOT-REGISTERED');
  });
});
