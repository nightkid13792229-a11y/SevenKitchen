import {
  PHASE_TOOL_BUDGET,
  forceProposeToolFor,
  phaseSystemLine,
  toolsForPhase,
} from '../../../src/application/recipe-designer/agent/phase-policy';

function names(phase: 'PLAN' | 'SELECT' | 'DESIGN', flow: 'ORDER' | 'CATALOG') {
  return toolsForPhase(phase, flow).map((tool) => tool.function.name);
}

describe('recipe agent phase policy', () => {
  it('PLAN only exposes read tools, ask and propose_plan', () => {
    const tools = names('PLAN', 'ORDER');

    expect(tools).toContain('read_design_context');
    expect(tools).toContain('propose_plan');
    expect(tools).not.toContain('propose_selection');
    expect(tools).not.toContain('edit_recipe');
    expect(tools).not.toContain('assess');
    expect(tools).not.toContain('write_copy');
  });

  it('SELECT exposes propose_selection but still no write tools', () => {
    const tools = names('SELECT', 'ORDER');

    expect(tools).toContain('propose_selection');
    expect(tools).toContain('revise_plan');
    expect(tools).not.toContain('find_food');
    expect(tools).not.toContain('read_draft');
    expect(tools).not.toContain('kb_find');
    expect(tools).not.toContain('propose_plan');
    expect(tools).not.toContain('edit_recipe');
    expect(tools).not.toContain('assess');
    expect(tools).not.toContain('write_copy');
  });

  it('DESIGN exposes write tools', () => {
    const tools = names('DESIGN', 'ORDER');

    expect(tools).toContain('edit_recipe');
    expect(tools).toContain('assess');
    expect(tools).toContain('write_copy');
    expect(tools).toContain('revise_plan');
    expect(tools).toContain('reopen_selection');
    expect(tools).not.toContain('propose_plan');
    expect(tools).not.toContain('propose_selection');
  });

  it('ORDER hides the product-line taxonomy tool in every phase', () => {
    for (const phase of ['PLAN', 'SELECT', 'DESIGN'] as const) {
      expect(names(phase, 'ORDER')).not.toContain('read_taxonomy');
    }
  });

  it('CATALOG keeps the taxonomy tool', () => {
    expect(names('PLAN', 'CATALOG')).toContain('read_taxonomy');
  });

  it('only forces propose near the resource budget', () => {
    const forceAt = PHASE_TOOL_BUDGET.PLAN - 12;
    expect(forceAt).toBeLessThan(PHASE_TOOL_BUDGET.PLAN);
    expect(forceProposeToolFor('PLAN', forceAt - 1)).toBeNull();
    expect(forceProposeToolFor('PLAN', forceAt)).toBe('propose_plan');
    expect(forceProposeToolFor('SELECT', forceAt)).toBe('propose_selection');
    expect(forceProposeToolFor('DESIGN', 30)).toBeNull();
  });

  it('gives the model a phase instruction', () => {
    expect(phaseSystemLine('PLAN')).toContain('不要改配方');
    expect(phaseSystemLine('PLAN')).toContain('0 命中就换词');
    expect(phaseSystemLine('SELECT')).toContain('不要改配方');
    expect(phaseSystemLine('DESIGN')).toContain('配方编辑');
  });
});
