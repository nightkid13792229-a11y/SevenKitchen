import {
  AGENT_TOOL_DEFINITIONS,
  createAgentToolHandlers,
} from 'src/application/recipe-designer/agent/tool-registry';
import type { RecipeAgentControlPort } from 'src/application/recipe-designer/agent/recipe-agent.port';
import {
  createFakeRecipeAgentPort,
  fakeAssessment,
  fakeDraftSnapshot,
} from '../../../helpers/fake-recipe-agent-port';

const tagPolicy = { isAllowedTag: () => true };

function createFakeControlPort(
  overrides: Partial<RecipeAgentControlPort> = {},
): RecipeAgentControlPort {
  return {
    askUser: jest.fn(),
    requestException: jest.fn(),
    finishDraft: jest.fn(),
    getApprovalState: jest
      .fn()
      .mockResolvedValue({ approvedException: false, confirmedOmissions: [] }),
    ...overrides,
  };
}

describe('tool registry', () => {
  it('18 个工具，名字唯一', () => {
    const names = AGENT_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toHaveLength(18);
    expect(new Set(names).size).toBe(18);
    expect(names).toEqual(
      expect.arrayContaining([
        'get_draft',
        'search_ingredients',
        'get_ingredient',
        'get_catalog_usage',
        'add_ingredient',
        'replace_ingredient',
        'update_weight',
        'remove_ingredient',
        'set_preparation',
        'set_copy',
        'set_production_steps',
        'run_assessment',
        'check_coverage',
        'check_catalog_conflicts',
        'check_ready',
        'ask_user',
        'request_exception',
        'finish_draft',
      ]),
    );
  });

  it('每个定义都有 handler', () => {
    const handlers = createAgentToolHandlers({
      port: createFakeRecipeAgentPort(),
      controlPort: createFakeControlPort(),
      tagPolicy,
      draftId: 'draft-1',
    });
    for (const def of AGENT_TOOL_DEFINITIONS) {
      expect(typeof handlers[def.name]).toBe('function');
    }
  });

  it('ask_user 最多两个问题，且不能为空', async () => {
    const handlers = createAgentToolHandlers({
      port: createFakeRecipeAgentPort(),
      controlPort: createFakeControlPort(),
      tagPolicy,
      draftId: 'draft-1',
    });
    expect((await handlers.ask_user({ questions: [] })).ok).toBe(false);
    expect(
      (
        await handlers.ask_user({
          questions: [{ question: 'a' }, { question: 'b' }, { question: 'c' }],
        })
      ).ok,
    ).toBe(false);
  });

  it('check_ready 不通过时 finish_draft 拒绝', async () => {
    const controlPort = createFakeControlPort();
    const handlers = createAgentToolHandlers({
      port: createFakeRecipeAgentPort({
        assessment: fakeAssessment({ contentRevision: 4, deficient: 1 }),
      }),
      controlPort,
      tagPolicy,
      draftId: 'draft-1',
    });
    const result = await handlers.finish_draft({ summary: '交付' });
    expect(result.ok).toBe(false);
    expect(controlPort.finishDraft).not.toHaveBeenCalled();
  });

  it('request_exception 需要合法类型和理由', async () => {
    const controlPort = createFakeControlPort();
    const handlers = createAgentToolHandlers({
      port: createFakeRecipeAgentPort(),
      controlPort,
      tagPolicy,
      draftId: 'draft-1',
    });
    expect(
      (await handlers.request_exception({ type: 'OTHER', reason: 'x' })).ok,
    ).toBe(false);
    expect(
      (
        await handlers.request_exception({
          type: 'COMPLIANCE',
          reason: '急性胰腺炎',
        })
      ).ok,
    ).toBe(true);
    expect(controlPort.requestException).toHaveBeenCalledTimes(1);
  });

  it('模型传 exceptionApproved 不能自批，只能读 getApprovalState', async () => {
    const port = createFakeRecipeAgentPort({
      assessment: fakeAssessment({ contentRevision: 4, deficient: 1 }),
    });

    const denied = createAgentToolHandlers({
      port,
      controlPort: createFakeControlPort(),
      tagPolicy,
      draftId: 'draft-1',
    });
    const deniedResult = await denied.check_ready({ exceptionApproved: true });
    expect(deniedResult.ok).toBe(true);
    if (!deniedResult.ok) return;
    expect(deniedResult.data.status).toBe('BLOCKED');

    const approved = createAgentToolHandlers({
      port,
      controlPort: createFakeControlPort({
        getApprovalState: jest.fn().mockResolvedValue({
          approvedException: true,
          confirmedOmissions: [],
        }),
      }),
      tagPolicy,
      draftId: 'draft-1',
    });
    const approvedResult = await approved.check_ready({});
    if (!approvedResult.ok) return;
    expect(approvedResult.data.status).toBe('PASS_WITH_WARNINGS');
  });

  it('confirmedOmissions 只能来自 getApprovalState', async () => {
    const draft = fakeDraftSnapshot({
      items: fakeDraftSnapshot().items.filter((i) => i.category !== 'MUSHROOM'),
    });
    const port = createFakeRecipeAgentPort({ draft });

    const bare = createAgentToolHandlers({
      port,
      controlPort: createFakeControlPort(),
      tagPolicy,
      draftId: 'draft-1',
    });
    const bareResult = await bare.check_ready({
      confirmedOmissions: ['MUSHROOM'],
    });
    expect(bareResult.ok).toBe(true);
    if (!bareResult.ok) return;
    expect(bareResult.data.status).toBe('BLOCKED');

    const confirmed = createAgentToolHandlers({
      port,
      controlPort: createFakeControlPort({
        getApprovalState: jest.fn().mockResolvedValue({
          approvedException: false,
          confirmedOmissions: ['MUSHROOM'],
        }),
      }),
      tagPolicy,
      draftId: 'draft-1',
    });
    const confirmedResult = await confirmed.check_ready({});
    if (!confirmedResult.ok) return;
    expect(confirmedResult.data.status).toBe('PASS_WITH_WARNINGS');
  });

  it('已批例外时 finish_draft 生成交付卡', async () => {
    const controlPort = createFakeControlPort({
      getApprovalState: jest
        .fn()
        .mockResolvedValue({ approvedException: true, confirmedOmissions: [] }),
    });
    const handlers = createAgentToolHandlers({
      port: createFakeRecipeAgentPort({
        assessment: fakeAssessment({ contentRevision: 4, deficient: 1 }),
      }),
      controlPort,
      tagPolicy,
      draftId: 'draft-1',
    });
    const result = await handlers.finish_draft({ summary: '按例外交付' });
    expect(result.ok).toBe(true);
    expect(controlPort.finishDraft).toHaveBeenCalledTimes(1);
  });
});
