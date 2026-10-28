import { Injectable } from '@nestjs/common';

import {
  AgentProviderConfigService,
  ARK_PROVIDER,
  DEEPSEEK_PROVIDER,
  RECIPE_COVER_IMAGE_PURPOSE,
  RECIPE_COVER_PROMPT_PURPOSE,
  type ProviderSettingsView,
  type UpdateProviderSettingsInput,
} from '../nutrition-governance/agent-provider-config.service';
import { RecipeCoverConfigService } from './recipe-cover-config.service';

export interface RecipeCoverSettingsView {
  deepseek: ProviderSettingsView;
  ark: ProviderSettingsView;
  promptTemplate: string;
  ready: boolean;
}

export interface UpdateRecipeCoverSettingsInput {
  deepseek?: UpdateProviderSettingsInput;
  ark?: UpdateProviderSettingsInput;
  promptTemplate: string;
}

/** 「AI 食谱封面」配置门面：DeepSeek + Ark + 系统提示词，都不走系统默认 */
@Injectable()
export class RecipeCoverSettingsService {
  constructor(
    private readonly providerConfigService: AgentProviderConfigService,
    private readonly recipeCoverConfigService: RecipeCoverConfigService,
  ) {}

  async get(): Promise<RecipeCoverSettingsView> {
    const [deepseek, ark, promptTemplate] = await Promise.all([
      this.providerConfigService.getProviderSettings(
        RECIPE_COVER_PROMPT_PURPOSE,
        DEEPSEEK_PROVIDER,
      ),
      this.providerConfigService.getProviderSettings(
        RECIPE_COVER_IMAGE_PURPOSE,
        ARK_PROVIDER,
      ),
      this.recipeCoverConfigService.getPromptTemplate(),
    ]);
    return {
      deepseek,
      ark,
      promptTemplate,
      ready: this.isReady(deepseek, ark, promptTemplate),
    };
  }

  async update(
    input: UpdateRecipeCoverSettingsInput,
    userId?: string,
  ): Promise<RecipeCoverSettingsView> {
    const deepseek = await this.providerConfigService.updateProviderSettings(
      RECIPE_COVER_PROMPT_PURPOSE,
      DEEPSEEK_PROVIDER,
      input.deepseek ?? {},
      userId,
    );
    const ark = await this.providerConfigService.updateProviderSettings(
      RECIPE_COVER_IMAGE_PURPOSE,
      ARK_PROVIDER,
      input.ark ?? {},
      userId,
    );
    const { promptTemplate } =
      await this.recipeCoverConfigService.updatePromptTemplate(
        { promptTemplate: String(input.promptTemplate ?? '') },
        userId,
      );
    return {
      deepseek,
      ark,
      promptTemplate,
      ready: this.isReady(deepseek, ark, promptTemplate),
    };
  }

  private isReady(
    deepseek: ProviderSettingsView,
    ark: ProviderSettingsView,
    promptTemplate: string,
  ): boolean {
    return (
      deepseek.enabled &&
      deepseek.configured &&
      ark.enabled &&
      ark.configured &&
      promptTemplate.trim().length > 0
    );
  }
}
