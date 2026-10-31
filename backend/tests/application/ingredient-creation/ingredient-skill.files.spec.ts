import { IngredientSkillService } from '../../../src/application/ingredient-creation/ingredient-skill.service';

/**
 * 真实技能文件的自检：确保部署出去的文档能被解析、且关键规则没被改丢。
 *
 * 这些文件是模型运行时会读到的提示词，写坏了不会报错，只会让模型悄悄跑偏，
 * 所以用测试把「必须存在的规则」钉住。
 */
describe('IngredientSkillService · 仓库里的真实技能文件', () => {
  const service = new IngredientSkillService();

  it('三份技能都能解析，并且都有 name / description', () => {
    const skills = service.list();

    expect(skills.map((skill) => skill.name).sort()).toEqual([
      'core',
      'name-expansion',
      'record-selection',
    ]);
    for (const skill of skills) {
      expect(skill.description.length).toBeGreaterThan(0);
    }
    // core 是常驻技能，其余按需加载。
    expect(service.always().map((skill) => skill.name)).toEqual(['core']);
  });

  it('选记录：覆盖率差超过 10 个百分点时不能被口径压过', () => {
    const body = service.load('record-selection')?.body ?? '';

    expect(body).toContain('超过 10 个百分点');
    expect(body).toContain('必须选覆盖率高的那条');
    expect(body).toContain('未标生熟');
    // 候选名只写原名，不拼来源 key。
    expect(body).toContain('不要把来源 key');
  });

  it('名字扩展：简繁两种写法要同时给 CFCT 和 TFDA', () => {
    const body = service.load('name-expansion')?.body ?? '';

    expect(body).toContain('简体、繁体两套词都要分别给 CFCT 和 TFDA 各一份');
    expect(body).toContain('不要按语种把词分给不同的库');
  });
});
