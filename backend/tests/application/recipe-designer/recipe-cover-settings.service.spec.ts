import { RecipeCoverSettingsService } from 'src/application/recipe-designer/recipe-cover-settings.service';

describe('RecipeCoverSettingsService', () => {
  const deepseek = { enabled: true, configured: true, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKeyLast4: '1234' };
  const ark = { enabled: true, configured: true, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-5-0-pro-260628', apiKeyLast4: '5678' };
  const provider = {
    getProviderSettings: jest.fn(),
    updateProviderSettings: jest.fn(),
  };
  const prompt = {
    getPromptTemplate: jest.fn().mockResolvedValue('prompt'),
    updatePromptTemplate: jest.fn().mockResolvedValue({ promptTemplate: 'prompt-2' }),
  };
  const service = new RecipeCoverSettingsService(provider as never, prompt as never);

  beforeEach(() => {
    jest.clearAllMocks();
    provider.getProviderSettings
      .mockResolvedValueOnce(deepseek)
      .mockResolvedValueOnce(ark);
    provider.updateProviderSettings
      .mockResolvedValueOnce(deepseek)
      .mockResolvedValueOnce(ark);
  });

  it('两个模型 + 提示词都配置才 ready', async () => {
    const view = await service.get();
    expect(view.ready).toBe(true);
    expect(view.deepseek.model).toBe('deepseek-flash');
    expect(view.ark.model).toBe('doubao-seedream-5-0-pro-260628');
  });

  it('缺任一 Key 时 ready=false', async () => {
    provider.getProviderSettings
      .mockReset()
      .mockResolvedValueOnce(deepseek)
      .mockResolvedValueOnce({ ...ark, configured: false });
    expect((await service.get()).ready).toBe(false);
  });

  it('保存时分别写两个用途和提示词', async () => {
    const view = await service.update(
      {
        deepseek: { enabled: true, model: 'deepseek-flash', apiKey: 'sk-d' },
        ark: { enabled: true, model: 'doubao-seedream-5-0-pro-260628', apiKey: 'sk-a' },
        promptTemplate: 'prompt-2',
      },
      'admin-1',
    );
    expect(provider.updateProviderSettings).toHaveBeenNthCalledWith(
      1,
      'RECIPE_COVER_PROMPT',
      'DEEPSEEK',
      expect.objectContaining({ apiKey: 'sk-d' }),
      'admin-1',
    );
    expect(provider.updateProviderSettings).toHaveBeenNthCalledWith(
      2,
      'RECIPE_COVER_IMAGE',
      'ARK',
      expect.objectContaining({ apiKey: 'sk-a' }),
      'admin-1',
    );
    expect(prompt.updatePromptTemplate).toHaveBeenCalledWith(
      { promptTemplate: 'prompt-2' },
      'admin-1',
    );
    expect(view.ready).toBe(true);
  });
});
