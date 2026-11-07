/**
 * Prisma Shipping Template Repository Implementation
 * Database-backed implementation for shipping templates
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { ShippingTemplateRepository } from '../../domain/shipping/shipping-template.repository';
import type { ShippingTemplate } from '../../domain/shipping/shipping-fee.service';

@Injectable()
export class PrismaShippingTemplateRepository implements ShippingTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ShippingTemplate | null> {
    const template = await this.prisma.shippingTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return null;
    }

    return this.toDomain(template);
  }

  async findActive(): Promise<ShippingTemplate | null> {
    const template = await this.prisma.shippingTemplate.findFirst({
      where: { isActive: true },
    });

    if (!template) {
      return null;
    }

    return this.toDomain(template);
  }

  async findAll(): Promise<ShippingTemplate[]> {
    const templates = await this.prisma.shippingTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return templates.map((t) => this.toDomain(t));
  }

  async save(template: ShippingTemplate): Promise<ShippingTemplate> {
    const data = {
      name: template.name,
      baseWeightKg: template.baseWeightKg,
      baseFee: template.baseFee,
      stepWeightKg: template.stepWeightKg,
      stepFee: template.stepFee,
      vasFeePerOrder: template.vasFeePerOrder,
      isActive: template.isActive,
    };

    // If it's a new template (doesn't exist in DB), create it
    const existing = await this.prisma.shippingTemplate.findUnique({
      where: { id: template.id },
    });

    if (existing) {
      // Update existing template
      const updated = await this.prisma.shippingTemplate.update({
        where: { id: template.id },
        data,
      });
      return this.toDomain(updated);
    } else {
      // Create new template
      const created = await this.prisma.shippingTemplate.create({
        data: {
          id: template.id,
          ...data,
        },
      });
      return this.toDomain(created);
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.shippingTemplate.delete({
      where: { id },
    });
  }

  /**
   * 激活某张模板，并在同一个事务里把它设成「默认运费模板」。
   *
   * 为什么必须原子：activate 会把其他模板全部停用 —— 如果被停用的正好是
   * 默认模板，而配置又没同步过去，算价会读到一张已停用的默认模板、直接报错。
   * 拆成两次写就有"激活成功、配置没写成"的窗口，顾客会在这几秒内下不了单。
   */
  async activateAndSetDefault(id: string): Promise<ShippingTemplate> {
    const [, activated] = await this.prisma.$transaction([
      this.prisma.shippingTemplate.updateMany({ data: { isActive: false } }),
      this.prisma.shippingTemplate.update({
        where: { id },
        data: { isActive: true },
      }),
      this.prisma.globalConfig.updateMany({
        data: { defaultShippingTemplateId: id },
      }),
    ]);

    return this.toDomain(activated);
  }

  async activate(id: string): Promise<ShippingTemplate> {
    // Deactivate all templates first (only one can be active)
    await this.prisma.shippingTemplate.updateMany({
      data: { isActive: false },
    });

    // Activate the specified template
    const updated = await this.prisma.shippingTemplate.update({
      where: { id },
      data: { isActive: true },
    });

    return this.toDomain(updated);
  }

  private toDomain(raw: any): ShippingTemplate {
    return {
      id: raw.id,
      name: raw.name,
      baseWeightKg: parseFloat(raw.baseWeightKg.toString()),
      baseFee: parseFloat(raw.baseFee.toString()),
      stepWeightKg: parseFloat(raw.stepWeightKg.toString()),
      stepFee: parseFloat(raw.stepFee.toString()),
      vasFeePerOrder: parseFloat(raw.vasFeePerOrder.toString()),
      isActive: raw.isActive,
    };
  }
}
