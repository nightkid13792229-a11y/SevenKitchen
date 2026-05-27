import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiRecipeResultStatus } from '../../domain/ai-recipe/enums';
import { PrismaService } from '../../infrastructure/prisma.service';

@Injectable()
export class RecipeDesignSessionService {
  constructor(private readonly prisma: PrismaService) {}

  createSession(input: { assessmentId: string; createdBy: string }) {
    return this.prisma.agentRecipeDesignSession.create({
      data: {
        assessmentId: input.assessmentId,
        createdBy: input.createdBy,
        status: 'OPEN',
      },
    });
  }

  addMessage(input: {
    sessionId: string;
    role: 'ADMIN' | 'AGENT' | 'SYSTEM';
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.agentRecipeDesignMessage.create({
      data: {
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonObject,
      },
    });
  }

  createCandidate(input: {
    sessionId: string;
    label: string;
    recipeDraft: Record<string, unknown>;
    calculation: Record<string, unknown>;
    resultStatus: AiRecipeResultStatus;
    changeSummary: Record<string, unknown>;
  }) {
    return this.prisma.agentRecipeDesignCandidate.create({
      data: {
        sessionId: input.sessionId,
        label: input.label,
        recipeDraft: input.recipeDraft as Prisma.InputJsonObject,
        calculation: input.calculation as Prisma.InputJsonObject,
        resultStatus: input.resultStatus,
        changeSummary: input.changeSummary as Prisma.InputJsonObject,
      },
    });
  }
}
