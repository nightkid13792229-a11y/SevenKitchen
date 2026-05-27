import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveSources() {
    return this.prisma.knowledgeSource.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }

  async listActiveRulePackages() {
    return this.prisma.nutritionRulePackage.findMany({
      where: { status: 'ACTIVE' },
      include: {
        versions: { where: { isActive: true } },
        sources: { include: { knowledgeSource: true } },
      },
      orderBy: { name: 'asc' },
    });
  }
}
