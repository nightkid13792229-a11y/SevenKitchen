/**
 * Shipping Application Service
 * Application layer service for shipping operations
 */

import {
  Injectable,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ShippingFeeService,
  type ShippingFeeInput,
  type ShippingFeeResult,
} from '../../domain/shipping';
import type {
  ShippingTemplate,
  ShippingTemplateRepository,
} from '../../domain/shipping';
import { GlobalConfigService } from '../config/global-config.service';
import { SHIPPING_TEMPLATE_REPOSITORY } from './shipping.service.tokens';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly shippingFeeService: ShippingFeeService,
    @Inject(SHIPPING_TEMPLATE_REPOSITORY)
    private readonly shippingTemplateRepository: ShippingTemplateRepository,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /**
   * Calculate shipping fee preview
   * Used for preview endpoints before order creation
   */
  async calculateShippingFeePreview(
    input: ShippingFeeInput,
  ): Promise<ShippingFeeResult> {
    const template = await this.resolveTemplate(input.shippingTemplateId);
    return this.shippingFeeService.calculateShippingFee(input, template);
  }

  /**
   * 决定这次算价用哪张运费模板 —— 全系统唯一入口。
   *
   * 顺序固定，任何一步都**不允许**退回"随便取一张"：
   *   1. 调用方显式指定；
   *   2. 后台「全局配置 → 默认运费模板」；
   *   3. 没有默认模板时，仅当全库只有一张生效模板才用它。
   *
   * 2026-11-07 之前这里用的是 findActive()（无排序取第一张）。库里当时同时
   * 存在首重 23 元与 12 元两张生效模板，同一道菜每 100g 能差约 9%，
   * 而且参考价与真实订单会一起漂。配置错就大声报错，比静默算错便宜。
   */
  private async resolveTemplate(
    explicitTemplateId?: string | null,
  ): Promise<ShippingTemplate> {
    if (explicitTemplateId) {
      const template =
        await this.shippingTemplateRepository.findById(explicitTemplateId);
      if (!template) {
        throw new NotFoundException(
          `Shipping template not found: ${explicitTemplateId}`,
        );
      }
      this.assertActive(template);
      return template;
    }

    const globalConfig = await this.globalConfigService.getGlobalConfig();

    if (globalConfig.defaultShippingTemplateId) {
      const template = await this.shippingTemplateRepository.findById(
        globalConfig.defaultShippingTemplateId,
      );

      if (!template) {
        // 默认模板被删掉了（运营清理模板时把默认那张一起删了）。
        // 只要全库只剩一张生效模板，用它就没有歧义；多于一张仍然报错，绝不猜。
        const activeTemplates = (
          await this.shippingTemplateRepository.findAll()
        ).filter((candidate) => candidate.isActive);

        if (activeTemplates.length === 1) {
          this.logger.warn(
            `默认运费模板不存在：${globalConfig.defaultShippingTemplateId}，暂时退回唯一生效模板「${activeTemplates[0].name}」；请到「全局配置」重新指定`,
          );
          return activeTemplates[0];
        }

        this.logger.error(
          `默认运费模板不存在：${globalConfig.defaultShippingTemplateId}，生效模板 ${activeTemplates.length} 张，无法唯一确定`,
        );
        throw new InternalServerErrorException(
          '运费模板配置异常，请稍后重试或联系客服',
        );
      }

      this.assertActive(template);
      return template;
    }

    const activeTemplates = (
      await this.shippingTemplateRepository.findAll()
    ).filter((template) => template.isActive);

    if (activeTemplates.length === 1) {
      this.logger.warn(
        `未配置默认运费模板，暂用唯一生效模板「${activeTemplates[0].name}」；建议到「全局配置」指定默认模板`,
      );
      return activeTemplates[0];
    }

    if (activeTemplates.length === 0) {
      throw new NotFoundException('No active shipping template found');
    }

    this.logger.error(
      `存在 ${activeTemplates.length} 张生效的运费模板且未配置默认模板：${activeTemplates
        .map((template) => template.name)
        .join('、')}`,
    );
    throw new InternalServerErrorException(
      '存在多张生效的运费模板，请到后台指定默认模板',
    );
  }

  private assertActive(template: ShippingTemplate): void {
    if (template.isActive) {
      return;
    }

    this.logger.error(`运费模板「${template.name}」已停用，无法用于算价`);
    throw new InternalServerErrorException(
      '运费模板配置异常，请稍后重试或联系客服',
    );
  }
}
