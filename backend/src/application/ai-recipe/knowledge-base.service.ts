import { Injectable } from '@nestjs/common';
import {
  KnowledgeSourceStatus,
  NutritionRulePackageStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveSources() {
    return this.prisma.knowledgeSource.findMany({
      where: { status: KnowledgeSourceStatus.ACTIVE },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });
  }

  async listActiveRulePackages() {
    return this.prisma.nutritionRulePackage.findMany({
      where: {
        status: NutritionRulePackageStatus.ACTIVE,
        versions: { some: { isActive: true } },
      },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { version: 'desc' },
        },
        sources: { include: { knowledgeSource: true } },
      },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });
  }
}
