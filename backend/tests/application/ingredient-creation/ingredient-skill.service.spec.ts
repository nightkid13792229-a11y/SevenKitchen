import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  IngredientSkillService,
  SKILL_BODY_MAX,
} from '../../../src/application/ingredient-creation/ingredient-skill.service';

const ENV_KEY = 'INGREDIENT_SKILLS_DIR';

function writeSkill(dir: string, file: string, content: string) {
  writeFileSync(join(dir, file), content, 'utf8');
}

describe('IngredientSkillService', () => {
  let dir: string;
  const original = process.env[ENV_KEY];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ingredient-skills-'));
    process.env[ENV_KEY] = dir;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = original;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('解析 frontmatter：名字、描述、什么时候用、是否常驻', () => {
    writeSkill(
      dir,
      'core.md',
      `---\nname: core\ndescription: 总纲\nwhenToUse: 每次\n---\n\n# 正文\n内容`,
    );

    const service = new IngredientSkillService();

    expect(service.list()).toEqual([
      { name: 'core', description: '总纲', whenToUse: '每次', always: false },
    ]);
    expect(service.load('core')?.body).toBe('# 正文\n内容');
  });

  it('常驻技能排在最前，其余按名字排序', () => {
    writeSkill(
      dir,
      'b.md',
      `---\nname: b\ndescription: B\n---\nB 正文`,
    );
    writeSkill(
      dir,
      'a.md',
      `---\nname: a\ndescription: A\nalways: true\n---\nA 正文`,
    );
    writeSkill(
      dir,
      'c.md',
      `---\nname: c\ndescription: C\n---\nC 正文`,
    );

    const service = new IngredientSkillService();

    expect(service.list().map((skill) => skill.name)).toEqual(['a', 'b', 'c']);
    expect(service.always().map((skill) => skill.name)).toEqual(['a']);
  });

  it('按名字取技能时大小写不敏感', () => {
    writeSkill(
      dir,
      'expansion.md',
      `---\nname: Name-Expansion\ndescription: 扩展\n---\n正文`,
    );

    const service = new IngredientSkillService();

    expect(service.load('name-expansion')?.body).toBe('正文');
    expect(service.load('  NAME-EXPANSION  ')?.body).toBe('正文');
  });

  it('未知技能 → null；没有 description 的技能不进入清单', () => {
    writeSkill(dir, 'bad.md', `---\nname: bad\n---\n没有描述`);

    const service = new IngredientSkillService();

    expect(service.load('bad')).toBeNull();
    expect(service.list()).toEqual([]);
  });

  it('目录不存在时不抛错，返回空清单', () => {
    process.env[ENV_KEY] = join(dir, 'not-exist');

    const service = new IngredientSkillService();

    expect(service.list()).toEqual([]);
    expect(service.catalogLines()).toEqual([]);
  });

  it('正文超长会被截断', () => {
    writeSkill(
      dir,
      'long.md',
      `---\nname: long\ndescription: 长\n---\n${'字'.repeat(SKILL_BODY_MAX + 50)}`,
    );

    const service = new IngredientSkillService();

    expect(Array.from(service.load('long')?.body ?? '')).toHaveLength(
      SKILL_BODY_MAX,
    );
  });

  it('清单每行带名字、描述与使用时机', () => {
    writeSkill(
      dir,
      'core.md',
      `---\nname: core\ndescription: 总纲\nwhenToUse: 每次\nalways: true\n---\n正文`,
    );

    const service = new IngredientSkillService();

    expect(service.catalogLines()).toEqual([
      '- core［常驻］：总纲（每次）',
    ]);
  });
});
