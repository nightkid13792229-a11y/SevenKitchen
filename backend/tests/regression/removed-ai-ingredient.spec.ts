import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * 这个文件守的是「已经被删掉的危险做法不要再回来」，不是「不许再做 AI 辅助建原料」。
 *
 * 2026-05-27 做过一版手机端「AI 新增食材」：后台有一个 agent 服务直接生成并写入原料，
 * 小程序里有列表 / 草稿 / 详情三个页面。2026-05-30 整套删除，只保留迁移历史
 * （删除原因已不可考，老板 2026-10-22 确认记不清了）。
 *
 * 2026-10-22 重新做的是**后台 Web 端的六站向导**：每一步人工确认、提交只落「待验证」、
 * 确认可用必须管理员点。两者的安全边界不同，所以这里改为守具体的危险行为：
 *   1) 不要再出现那个「自动创建并写入」的 agent 服务；
 *   2) 不要再出现把营养档案自动写成「已验证」的代码路径；
 *   3) 保留已应用的迁移历史，避免部署时版本对不上。
 * 手机端页面是否复活，由 `miniapp/src/pages/ingredient-creation.regression.spec.ts` 负责。
 */
describe('removed AI ingredient creation workflow (auto-write path)', () => {
  const backendRoot = resolve(__dirname, '../..');
  const featureSlug = ['ingredient', 'creation'].join('-');
  const agentSlug = ['ingredient', 'creation', 'agent'].join('-');
  const agentPascal = ['Ingredient', 'Creation', 'Agent'].join('');
  const featureSnake = ['ingredient', 'creation'].join('_');

  const retainedMigrationHistory = [
    join('prisma', 'migrations', `202605270003_add_${featureSnake}_agent`),
    join('prisma', 'migrations', `202605300001_drop_${featureSnake}_agent`),
  ];

  function collectFiles(path: string): string[] {
    if (!existsSync(path)) {
      return [];
    }

    if (statSync(path).isFile()) {
      return [path];
    }

    return readdirSync(path).flatMap((entry) => collectFiles(join(path, entry)));
  }

  it('does not resurrect the removed auto-creating agent service', () => {
    const offenders = collectFiles(join(backendRoot, 'src'))
      .filter((file) => !file.endsWith('.map'))
      .filter((file) => {
        if (relative(backendRoot, file).includes(agentSlug)) {
          return true;
        }
        return readFileSync(file, 'utf8').includes(agentPascal);
      })
      .map((file) => relative(backendRoot, file));

    expect(offenders).toEqual([]);
  });

  it('keeps applied migration history for production deployments', () => {
    for (const path of retainedMigrationHistory) {
      expect(existsSync(join(backendRoot, path))).toBe(true);
    }
  });

  it('never auto-verifies nutrition profiles created by the wizard', () => {
    const commitService = join(
      backendRoot,
      'src',
      'application',
      featureSlug,
      `${featureSlug}-commit.service.ts`,
    );

    expect(existsSync(commitService)).toBe(true);
    const source = readFileSync(commitService, 'utf8');

    // 必须仍以 PENDING 落库
    expect(source).toMatch(/status:\s*'PENDING'/);
    // 不允许出现任何把状态写成已验证的代码（注释里提到 VERIFIED 不算）
    expect(source).not.toMatch(/status:\s*'VERIFIED'/);
    expect(source).not.toMatch(/status:\s*NutritionFoodStatus\.VERIFIED/);
  });
});
