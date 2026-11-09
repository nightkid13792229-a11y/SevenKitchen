/**
 * 真实 Agent 评估（全库计划 Task 12）。
 *
 * 前置：
 * - 本地后端已起（`KB_EVAL_BASE_URL`，默认 http://127.0.0.1:3011/api/v1）；
 * - 已 seed 测试账号（`KB_EVAL_ALLOW_SEED=1 npm run kb:seed-eval`）；
 * - 库里配好 RECIPE_DESIGN 的模型。
 *
 * 用法：
 * - `npm run kb:agent -- --scenario D1`
 * - `npm run kb:agent -- --all --json`
 * - `npm run kb:agent -- --all --out /tmp/agent-eval.md`
 *
 * 每个场景新建草稿，跑完删除；失败也会删。
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentEvalClient, type AgentSessionView } from '../../src/application/knowledge-base/agent-eval-client';
import {
  judgeDesignScenario,
  type DesignScenarioSpec,
  type JudgeVerdict,
} from '../../src/application/knowledge-base/agent-eval-judge';

const REPO_ROOT = resolve(__dirname, '../../..');
const SCENARIOS_PATH = resolve(
  REPO_ROOT,
  'docs/knowledge-base/eval/design-scenarios.json',
);

interface ScenarioFile {
  scenarios: DesignScenarioSpec[];
}

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index >= 0 ? String(argv[index + 1] ?? '').trim() : undefined;
};
const scenarioId = flag('--scenario');
const runAll = argv.includes('--all') || !scenarioId;
const asJson = argv.includes('--json');
const outPath = flag('--out');
const keepDraft = argv.includes('--keep-draft');

const BASE_URL =
  process.env.KB_EVAL_BASE_URL ?? 'http://127.0.0.1:3011/api/v1';
const USERNAME = process.env.KB_EVAL_ADMIN_USERNAME ?? 'kb-eval-staff';
const PASSWORD = process.env.KB_EVAL_ADMIN_PASSWORD ?? '';

function short(text: string, limit = 120): string {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

async function main(): Promise<void> {
  if (!PASSWORD) {
    throw new Error('缺少 KB_EVAL_ADMIN_PASSWORD（测试账号密码）');
  }
  const payload = JSON.parse(
    readFileSync(SCENARIOS_PATH, 'utf8'),
  ) as ScenarioFile;
  const scenarios = runAll
    ? payload.scenarios
    : payload.scenarios.filter((item) => item.id === scenarioId);
  if (scenarios.length === 0) {
    throw new Error(`没有找到场景 ${scenarioId}`);
  }

  const client = new AgentEvalClient({ baseUrl: BASE_URL });
  const login = await client.login(USERNAME, PASSWORD);
  const results: Array<{
    verdict: JudgeVerdict;
    sessionId: string;
    status: string;
    answer: string;
    trace?: AgentSessionView['messages'];
    audit?: unknown;
    error?: string;
  }> = [];

  for (const spec of scenarios) {
    const draft = await client.createDraft(login.token, {
      name: `eval-${spec.id}-${Date.now()}`,
      scenario: spec.scenario ?? 'ADULT_MER_110',
    });
    let view: AgentSessionView | undefined;
    try {
      for (const turn of spec.turns) {
        await client.startRun(login.token, draft.id, turn);
        view = await client.pollSession(login.token, draft.id);
      }
      const verdict = judgeDesignScenario({
        spec,
        messages: view?.messages ?? [],
        citationAudit: view?.session.citationAudit,
      });
      const answer =
        [...(view?.messages ?? [])]
          .reverse()
          .find(
            (message) =>
              message.role === 'ASSISTANT' &&
              typeof message.content === 'string' &&
              message.content.trim(),
          )?.content ?? '';
      results.push({
        verdict,
        sessionId: view?.session.id ?? '',
        status: view?.session.status ?? 'UNKNOWN',
        answer,
        trace: view?.messages,
        audit: view?.session.citationAudit,
      });
    } catch (error) {
      results.push({
        verdict: {
          id: spec.id,
          passed: false,
          failures: [`运行失败：${(error as Error).message}`],
          stats: {
            searchCalls: 0,
            openCalls: 0,
            assessCalls: 0,
            citations: 0,
            overrides: 0,
            answerLength: 0,
          },
        },
        sessionId: view?.session.id ?? '',
        status: view?.session.status ?? 'FAILED',
        answer: '',
        trace: view?.messages,
        error: (error as Error).message,
      });
    } finally {
      if (keepDraft) {
        console.log(`保留草稿：${draft.id}`);
      } else {
        await client.deleteDraft(login.token, draft.id).catch(() => undefined);
      }
    }
  }

  const passed = results.filter((item) => item.verdict.passed).length;
  const summary = {
    baseUrl: BASE_URL,
    scenarios: results.length,
    passed,
    failed: results.length - passed,
    results: results.map((item) => ({
      id: item.verdict.id,
      passed: item.verdict.passed,
      failures: item.verdict.failures,
      stats: item.verdict.stats,
      sessionId: item.sessionId,
      status: item.status,
      answer: short(item.answer, 300),
      ...(item.error ? { error: item.error } : {}),
      ...(item.audit ? { audit: item.audit } : {}),
      ...(asJson && item.trace
        ? {
            trace: item.trace.map((message) => ({
              role: message.role,
              toolName: message.toolName ?? null,
              toolArgs: message.toolArgs ?? null,
              content:
                typeof message.content === 'string'
                  ? short(message.content, 200)
                  : null,
            })),
          }
        : {}),
    })),
  };

  if (asJson) {
    const text = `${JSON.stringify(summary, null, 2)}\n`;
    if (outPath) {
      writeFileSync(outPath, text);
      console.log(`报告已写入：${outPath}`);
    } else {
      process.stdout.write(text);
    }
  } else {
    const lines = [
      `# Agent 设计任务评估（${new Date().toISOString().slice(0, 10)}）`,
      '',
      `> 接口：${BASE_URL}　|　${passed}/${results.length} 通过`,
      '',
      '| 场景 | 结果 | 检索 | 开表 | 评估 | 引用 | 覆盖 | 失败原因 |',
      '|---|---|---:|---:|---:|---:|---:|---|',
      ...results.map((item) => {
        const s = item.verdict.stats;
        return `| ${item.verdict.id} | ${item.verdict.passed ? '✅' : '❌'} | ${s.searchCalls} | ${s.openCalls} | ${s.assessCalls} | ${s.citations} | ${s.overrides} | ${item.verdict.failures.join('；') || '—'} |`;
      }),
      '',
      '## 回答摘要',
      '',
      ...results.map(
        (item) => `### ${item.verdict.id}\n\n${short(item.answer, 400)}\n`,
      ),
    ];
    const text = lines.join('\n');
    if (outPath) {
      writeFileSync(outPath, text);
      console.log(`报告已写入：${outPath}`);
    } else {
      process.stdout.write(`${text}\n`);
    }
  }

  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
