import { AgentEvalClient } from '../../../src/application/knowledge-base/agent-eval-client';

/**
 * L2 客户端（全库计划 Task 12）：只测 HTTP 形状与状态机，不发真实请求。
 */

function jsonResponse(body: unknown, status = 200): any {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function client(fetchImpl: jest.Mock, overrides: Record<string, unknown> = {}) {
  return new AgentEvalClient({
    baseUrl: 'http://127.0.0.1:3011/api/v1',
    fetchImpl: fetchImpl as any,
    pollIntervalMs: 1,
    ...overrides,
  });
}

describe('AgentEvalClient 登录与草稿', () => {
  it('登录成功返回 token/userId，并解包 data', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        code: 0,
        data: { token: 't1', userId: 'kb-eval-staff' },
      }),
    );
    const result = await client(fetchImpl).login('kb-eval-staff', 'pw');

    expect(result).toEqual({ token: 't1', userId: 'kb-eval-staff' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3011/api/v1/auth/admin-login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      username: 'kb-eval-staff',
      password: 'pw',
    });
  });

  it('业务错误码要抛错', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ code: 401, message: '用户名或密码错误' }));
    await expect(client(fetchImpl).login('x', 'y')).rejects.toThrow('401');
  });

  it('创建草稿带 Bearer，返回 id', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ code: 0, data: { id: 'd1' } }));
    const result = await client(fetchImpl).createDraft('t1', {
      name: 'eval-D1',
      scenario: 'ADULT_MER_110',
    });

    expect(result.id).toBe('d1');
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.authorization).toBe('Bearer t1');
    expect(JSON.parse(init.body)).toEqual({
      name: 'eval-D1',
      scenario: 'ADULT_MER_110',
    });
  });
});

describe('AgentEvalClient 会话状态机', () => {
  it('RUNNING 后等到 WAITING_USER 即成功', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, data: { session: { id: 's1', status: 'RUNNING' }, messages: [] } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            session: { id: 's1', status: 'WAITING_USER', citationAudit: { gate: { passed: true } } },
            messages: [{ role: 'ASSISTANT', content: '答案' }],
          },
        }),
      );
    const view = await client(fetchImpl).pollSession('t1', 'd1', {
      timeoutMs: 1000,
      intervalMs: 1,
    });

    expect(view.session.status).toBe('WAITING_USER');
    expect(view.messages).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('FAILED 直接抛错并带 lastError', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        code: 0,
        data: {
          session: { id: 's1', status: 'FAILED', lastError: '超过运行时长上限' },
          messages: [],
        },
      }),
    );
    await expect(
      client(fetchImpl).pollSession('t1', 'd1'),
    ).rejects.toThrow('超过运行时长上限');
  });

  it('超时要抛错', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        code: 0,
        data: { session: { id: 's1', status: 'RUNNING' }, messages: [] },
      }),
    );
    await expect(
      client(fetchImpl).pollSession('t1', 'd1', { timeoutMs: 20, intervalMs: 5 }),
    ).rejects.toThrow('超时');
  });

  it('删除草稿走 DELETE', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ code: 0, data: { ok: true } }));
    await client(fetchImpl).deleteDraft('t1', 'd1');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/recipe-designer/drafts/d1');
    expect(init.method).toBe('DELETE');
  });
});
