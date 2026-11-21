import { loadSkillsForPhase } from '../../../src/application/recipe-designer/agent/skill-loader';

describe('recipe agent skills', () => {
  it('loads the plan skill', () => {
    expect(loadSkillsForPhase('PLAN')).toContain('recipe-plan');
  });

  it('loads design and assessment skills', () => {
    const text = loadSkillsForPhase('DESIGN');
    expect(text).toContain('recipe-design');
    expect(text).toContain('recipe-assessment');
  });
});
