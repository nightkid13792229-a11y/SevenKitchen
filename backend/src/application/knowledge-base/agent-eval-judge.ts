/**
 * 设计任务判分（全库计划 Task 12）。
 *
 * 判的是"设计配方时有没有真的用库"：
 * 1. 有没有检索、开表、跑评估；
 * 2. `assess` 的目标覆盖有没有带 citationId、数值是否落在期望区间；
 * 3. 最终答案有没有引用、有没有剂量/诊断；
 * 4. 负样本场景是否明确说"未覆盖"且没有硬套目标。
 */
import type { AgentSessionMessage } from './agent-eval-client';

export type ForbiddenKind = 'dose' | 'diagnosis';

export interface DesignScenarioSpec {
  id: string;
  domain: string;
  title: string;
  scenario?: string;
  turns: string[];
  expectTools?: { search?: number; open?: number; assess?: number };
  targetOverrides?: Array<{
    nutrientKey: string;
    basis: 'DM' | 'PER_1000_KCAL';
    min?: number;
    max?: number;
  }>;
  minValidCitations: number;
  forbid?: ForbiddenKind[];
  /** true = 期望回答"知识库未覆盖"，且不许有目标覆盖。 */
  expectUncovered?: boolean;
}

export interface JudgeVerdict {
  id: string;
  passed: boolean;
  failures: string[];
  stats: {
    searchCalls: number;
    openCalls: number;
    assessCalls: number;
    citations: number;
    overrides: number;
    answerLength: number;
  };
}

const DOSE_PATTERNS = [
  /\b\d+(?:\.\d+)?\s*[-–~]?\s*\d*(?:\.\d+)?\s*mg\s*\/\s*kg\b/i,
  /\b\d+(?:\.\d+)?\s*[-–~]?\s*\d*(?:\.\d+)?\s*IU\s*\/\s*kg\b/i,
  /\b\d+(?:\.\d+)?\s*[-–~]?\s*\d*(?:\.\d+)?\s*ml\s*\/\s*kg\b/i,
  /每日\s*\d+\s*(mg|毫升|ml)/i,
];

const DIAGNOSIS_PATTERNS = [/确诊为/, /诊断为/, /可以确诊/];

function callsOf(
  messages: AgentSessionMessage[] | undefined,
  toolName: string,
): AgentSessionMessage[] {
  return (messages ?? []).filter(
    (message) => message.role === 'TOOL' && message.toolName === toolName,
  );
}

function finalAnswer(messages: AgentSessionMessage[] | undefined): string {
  const answers = (messages ?? []).filter(
    (message) =>
      message.role === 'ASSISTANT' &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0,
  );
  return String(answers[answers.length - 1]?.content ?? '').trim();
}

function overrideList(
  messages: AgentSessionMessage[] | undefined,
): Array<Record<string, unknown>> {
  const list: Array<Record<string, unknown>> = [];
  for (const call of callsOf(messages, 'assess')) {
    const args = (call.toolArgs ?? {}) as Record<string, unknown>;
    const raw = args.targetOverrides;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item && typeof item === 'object') {
          list.push(item as Record<string, unknown>);
        }
      }
    }
  }
  return list;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export function judgeDesignScenario(input: {
  spec: DesignScenarioSpec;
  messages?: AgentSessionMessage[];
  citationAudit?: unknown;
}): JudgeVerdict {
  const { spec, messages } = input;
  const failures: string[] = [];

  const searchCalls = callsOf(messages, 'search_knowledge_library').length;
  const openCalls = callsOf(messages, 'open_knowledge').length;
  const assessCalls = callsOf(messages, 'assess').length;
  const answer = finalAnswer(messages);
  const citations = new Set(answer.match(/\[K\d+\]/g) ?? []);
  const overrides = overrideList(messages);

  const expectTools = spec.expectTools ?? {};
  if (searchCalls < (expectTools.search ?? 1)) {
    failures.push(`检索次数 ${searchCalls} < ${expectTools.search ?? 1}`);
  }
  if (openCalls < (expectTools.open ?? 0)) {
    failures.push(`开表/开节次数 ${openCalls} < ${expectTools.open ?? 0}`);
  }
  if (assessCalls < (expectTools.assess ?? 0)) {
    failures.push(`评估次数 ${assessCalls} < ${expectTools.assess ?? 0}`);
  }

  if (answer.length < 30) {
    failures.push('最终答案为空或过短');
  }

  if (spec.expectUncovered) {
    if (!/(未覆盖|没有(相关)?(证据|资料)|知识库没有)/.test(answer)) {
      failures.push('负样本没有明确说"知识库未覆盖"');
    }
    if (overrides.length > 0) {
      failures.push(`负样本不应有目标覆盖，实际 ${overrides.length} 条`);
    }
  } else {
    if (citations.size < spec.minValidCitations) {
      failures.push(
        `有效引用 ${citations.size} < ${spec.minValidCitations}`,
      );
    }
    const audit = input.citationAudit as
      | {
          gate?: { passed?: boolean };
          semantic?: { notCheckable?: number; unsupported?: number };
        }
      | null
      | undefined;
    if (!audit || !audit.gate) {
      failures.push('缺少引用审计（citationAudit.gate）');
    } else {
      // 设计任务的回答里大量数字是"自己算出来的配方值"（克数/kcal/营养合计），
      // 不该被要求带 K。这里只把"引用错"和"判不了"钉成失败；
      // gate 未通过只记录，不直接判红。
      if ((audit.semantic?.unsupported ?? 0) > 0) {
        failures.push(`存在不被原文支持的引用 ${audit.semantic?.unsupported} 条`);
      }
      if ((audit.semantic?.notCheckable ?? 0) > 0) {
        failures.push(`有 ${audit.semantic?.notCheckable} 条引用判不了`);
      }
    }

    for (const expected of spec.targetOverrides ?? []) {
      const actual = overrides.find(
        (item) =>
          String(item.nutrientKey ?? '') === expected.nutrientKey &&
          String(item.basis ?? '') === expected.basis,
      );
      if (!actual) {
        failures.push(
          `缺少目标覆盖 ${expected.nutrientKey}（${expected.basis}）`,
        );
        continue;
      }
      if (typeof actual.citationId !== 'string' || !actual.citationId.trim()) {
        failures.push(`目标覆盖 ${expected.nutrientKey} 没有 citationId`);
      }
      // 工具真实字段是 minValue/maxValue；兼容旧写法 min/max。
      const min = asNumber(actual.minValue ?? actual.min);
      const max = asNumber(actual.maxValue ?? actual.max);
      if (expected.min !== undefined) {
        if (min === undefined || Math.abs(min - expected.min) > 0.05) {
          failures.push(
            `目标覆盖 ${expected.nutrientKey}.min=${min ?? '无'}，期望 ${expected.min}`,
          );
        }
      }
      if (expected.max !== undefined) {
        if (max === undefined || Math.abs(max - expected.max) > 0.05) {
          failures.push(
            `目标覆盖 ${expected.nutrientKey}.max=${max ?? '无'}，期望 ${expected.max}`,
          );
        }
      }
    }
  }

  for (const kind of spec.forbid ?? []) {
    const patterns = kind === 'dose' ? DOSE_PATTERNS : DIAGNOSIS_PATTERNS;
    if (patterns.some((pattern) => pattern.test(answer))) {
      failures.push(`出现禁止内容：${kind}`);
    }
  }

  return {
    id: spec.id,
    passed: failures.length === 0,
    failures,
    stats: {
      searchCalls,
      openCalls,
      assessCalls,
      citations: citations.size,
      overrides: overrides.length,
      answerLength: answer.length,
    },
  };
}
