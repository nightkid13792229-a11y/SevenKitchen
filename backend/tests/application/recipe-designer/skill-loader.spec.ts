import { loadSkillsForPhase } from '../../../src/application/recipe-designer/agent/skill-loader';

describe('recipe agent skills', () => {
  it('loads the plan skill', () => {
    expect(loadSkillsForPhase('PLAN')).toContain('recipe-plan');
  });

  it('loads design and assessment skills', () => {
    const text = loadSkillsForPhase('DESIGN');
    expect(text).toContain('recipe-design');
    expect(text).toContain('recipe-assessment');
    expect(text).toContain('recipe-supplement');
  });

  it('does not hard-code general food taboos in skills', () => {
    expect(loadSkillsForPhase('PLAN')).not.toContain('豆类、粗纤维');
    expect(loadSkillsForPhase('PLAN')).not.toContain('MAINTAIN 不写');
    expect(loadSkillsForPhase('SELECT')).not.toContain('高脂坚果');
    expect(loadSkillsForPhase('SELECT')).not.toContain('高碘海藻');
  });
});
