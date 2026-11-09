/**
 * 分域评估聚合（全库计划 Task 11）。
 *
 * 扫描 `docs/knowledge-base/eval/<domain>/questions.json`，逐域跑
 * `evaluate-library.ts --domain <id>`，任一域失败则整体失败。
 *
 * 用法：`npm run kb:eval:all`
 */
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const BACKEND_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(BACKEND_ROOT, '..');
const EVAL_DIR = resolve(REPO_ROOT, 'docs/knowledge-base/eval');

function main(): void {
  if (!existsSync(EVAL_DIR)) {
    console.error(`没有分域题集目录：${EVAL_DIR}`);
    process.exitCode = 1;
    return;
  }

  const domains = readdirSync(EVAL_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) =>
      existsSync(resolve(EVAL_DIR, name, 'questions.json')),
    )
    .sort();

  if (domains.length === 0) {
    console.error('没有找到任何 questions.json');
    process.exitCode = 1;
    return;
  }

  const results: Array<{ domain: string; passed: boolean }> = [];
  for (const domain of domains) {
    const questions = resolve(EVAL_DIR, domain, 'questions.json');
    console.log(`\n=== ${domain} ===`);
    const run = spawnSync(
      'npx',
      [
        'ts-node',
        '-r',
        'tsconfig-paths/register',
        'scripts/knowledge-base/evaluate-library.ts',
        '--questions',
        questions,
        '--domain',
        domain,
        '--no-write',
      ],
      { cwd: BACKEND_ROOT, stdio: 'inherit', env: process.env },
    );
    results.push({ domain, passed: run.status === 0 });
  }

  console.log('\n=== 分域汇总 ===');
  for (const item of results) {
    console.log(`${item.domain}: ${item.passed ? '通过' : '未通过'}`);
  }
  process.exitCode = results.every((item) => item.passed) ? 0 : 1;
}

main();
