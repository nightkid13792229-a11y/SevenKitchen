import { BadRequestException } from '@nestjs/common';
import { SupplementImportAgentClient } from '../../../src/application/supplement-import/supplement-import-agent.client';

describe('SupplementImportAgentClient', () => {
  const config = {
    baseUrl: 'https://agent.example.com/v1/',
    apiKey: 'sk-test',
    visionModel: 'gpt-4.1-mini',
    temperature: 0.1,
    timeoutMs: 1000,
    maxRetries: 0,
  };

  let client: SupplementImportAgentClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    client = new SupplementImportAgentClient();
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses fenced JSON content from the agent response', async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        '```json\n{"ingredient":{"name":"海藻碘片"},"nutrition":{"items":[]}}\n```',
      ),
    );

    const result = await client.recognize(config, [
      'https://cdn.example.com/a.jpg',
    ]);

    expect(result.ingredient?.name).toBe('海藻碘片');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://agent.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('rejects malformed JSON content', async () => {
    fetchMock.mockResolvedValue(okResponse('{not json'));

    await expect(client.recognize(config, [])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects empty message content', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    await expect(client.recognize(config, [])).rejects.toThrow(
      '补剂识别 Agent 返回内容为空',
    );
  });

  it('rejects oversized JSON content before parsing', async () => {
    fetchMock.mockResolvedValue(
      okResponse(`{"rawOcrText":"${'x'.repeat(210_000)}"}`),
    );

    await expect(client.recognize(config, [])).rejects.toThrow(
      '补剂识别 Agent 返回内容过大',
    );
  });
});

function okResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  };
}
