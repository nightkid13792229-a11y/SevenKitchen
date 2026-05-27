import { BadRequestException, Injectable } from '@nestjs/common';
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

  async addMessage(input: {
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
        metadata: this.normalizeJsonObject(input.metadata ?? {}, 'metadata'),
      },
    });
  }

  async createCandidate(input: {
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
        recipeDraft: this.normalizeJsonObject(input.recipeDraft, 'recipeDraft'),
        calculation: this.normalizeJsonObject(input.calculation, 'calculation'),
        resultStatus: input.resultStatus,
        changeSummary: this.normalizeJsonObject(
          input.changeSummary,
          'changeSummary',
        ),
      },
    });
  }

  private normalizeJsonObject(
    value: Record<string, unknown>,
    fieldName: string,
  ): Prisma.InputJsonObject {
    if (!this.isPlainObject(value)) {
      throw new BadRequestException(
        `Invalid JSON payload at ${fieldName}: expected object`,
      );
    }

    return this.normalizeJsonValue(value, fieldName) as Prisma.InputJsonObject;
  }

  private normalizeJsonValue(
    value: unknown,
    path: string,
  ): Prisma.InputJsonValue | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException(
          `Invalid JSON payload at ${path}: non-finite numbers are not supported`,
        );
      }

      return value;
    }

    if (
      typeof value === 'bigint' ||
      typeof value === 'function' ||
      typeof value === 'symbol'
    ) {
      throw new BadRequestException(
        `Invalid JSON payload at ${path}: ${typeof value} is not supported`,
      );
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => {
        const normalized = this.normalizeJsonValue(item, `${path}[${index}]`);
        if (normalized === undefined) {
          throw new BadRequestException(
            `Invalid JSON payload at ${path}[${index}]: undefined is not supported in arrays`,
          );
        }

        return normalized;
      }) as Prisma.InputJsonArray;
    }

    if (!this.isPlainObject(value)) {
      throw new BadRequestException(
        `Invalid JSON payload at ${path}: non-plain objects are not supported`,
      );
    }

    const normalizedObject: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, childValue] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      const normalized = this.normalizeJsonValue(childValue, childPath);
      if (normalized !== undefined) {
        normalizedObject[key] = normalized;
      }
    }

    return normalizedObject as Prisma.InputJsonObject;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
}
