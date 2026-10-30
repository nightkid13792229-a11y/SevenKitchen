import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 路由契约：直接读源码文本，不 import 控制器。
 * 控制器依赖太重（几十个 service），import 会因循环依赖直接报错。
 */
const source = readFileSync(
  join(
    __dirname,
    '../../src/interfaces/controllers/nutrition-governance.controller.ts',
  ),
  'utf8',
);
const dtoSource = readFileSync(
  join(
    __dirname,
    '../../src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts',
  ),
  'utf8',
);
const serviceSource = readFileSync(
  join(
    __dirname,
    '../../src/application/nutrition-governance/nutrition-governance.service.ts',
  ),
  'utf8',
);

describe('智谱封面图配置接口契约', () => {
  it('三个路由都在 agent-providers/zhipu-image 下', () => {
    expect(source).toContain("@Get('agent-providers/zhipu-image')");
    expect(source).toContain("@Put('agent-providers/zhipu-image')");
    expect(source).toContain("@Post('agent-providers/zhipu-image/test')");
  });

  it('控制器只做转发，不自己拼配置', () => {
    expect(source).toContain('getZhipuImageSettings');
    expect(source).toContain('updateZhipuImageSettings');
    expect(source).toContain('testZhipuImageSettings');
    expect(source).not.toContain('agentProviderConfig.upsert');
  });

  it('DTO 允许启用 / Base URL / 模型 / Key / 清空 Key', () => {
    expect(dtoSource).toContain('class UpdateZhipuImageSettingsDto');
    for (const field of ['enabled', 'baseUrl', 'model', 'apiKey', 'clearApiKey']) {
      expect(dtoSource).toContain(`${field}?:`);
    }
  });

  it('服务层把三个方法转给 AgentProviderConfigService', () => {
    expect(serviceSource).toContain('getZhipuImageSettings()');
    expect(serviceSource).toContain('updateZhipuImageSettings(');
    expect(serviceSource).toContain('testZhipuImageSettings()');
  });
});
