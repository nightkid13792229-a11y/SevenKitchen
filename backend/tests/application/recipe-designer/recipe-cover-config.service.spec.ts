import { BadRequestException } from '@nestjs/common';
import {
  RecipeCoverConfigService,
  DEFAULT_RECIPE_COVER_PROMPT,
} from 'src/application/recipe-designer/recipe-cover-config.service';

describe('RecipeCoverConfigService', () => {
  const prisma = {
    recipeCoverConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const service = new RecipeCoverConfigService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('没有配置时返回默认提示词', async () => {
    prisma.recipeCoverConfig.findUnique.mockResolvedValue(null);
    const prompt = await service.getPromptTemplate();
    expect(prompt).toContain('commercial food photographer');
    expect(prompt).toBe(DEFAULT_RECIPE_COVER_PROMPT);
  });

  it('空提示词也回退默认', async () => {
    prisma.recipeCoverConfig.findUnique.mockResolvedValue({
      promptTemplate: '   ',
    });
    await expect(service.getPromptTemplate()).resolves.toBe(
      DEFAULT_RECIPE_COVER_PROMPT,
    );
  });

  it('返回已保存提示词的 trim 结果', async () => {
    prisma.recipeCoverConfig.findUnique.mockResolvedValue({
      promptTemplate: '  自定义提示词  ',
    });
    await expect(service.getPromptTemplate()).resolves.toBe('自定义提示词');
  });

  it('保存后写入 singleton 并 trim', async () => {
    prisma.recipeCoverConfig.upsert.mockResolvedValue({
      promptTemplate: '新提示词',
    });

    const result = await service.updatePromptTemplate(
      { promptTemplate: '  新提示词  ' },
      'admin-1',
    );

    expect(prisma.recipeCoverConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'singleton' },
        create: expect.objectContaining({
          id: 'singleton',
          promptTemplate: '新提示词',
          updatedBy: 'admin-1',
        }),
        update: expect.objectContaining({
          promptTemplate: '新提示词',
          updatedBy: 'admin-1',
        }),
      }),
    );
    expect(result.promptTemplate).toBe('新提示词');
  });

  it('空提示词不允许保存', async () => {
    await expect(
      service.updatePromptTemplate({ promptTemplate: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('超长提示词不允许保存', async () => {
    await expect(
      service.updatePromptTemplate({ promptTemplate: 'x'.repeat(6001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
