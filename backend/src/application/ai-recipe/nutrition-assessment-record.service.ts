import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AgentRecipeResultStatus as PrismaAgentRecipeResultStatus,
  NutritionAssessmentStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { ConstraintSynthesisService } from './constraint-synthesis.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { NutritionAssessmentService } from './nutrition-assessment.service';
import { PrismaService } from '../../infrastructure/prisma.service';

type CreateAssessmentInput = {
  dogId: string;
  createdBy: string;
  prompt?: string;
  confirmedInputs?: Record<string, unknown>;
};

@Injectable()
export class NutritionAssessmentRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly nutritionAssessmentService: NutritionAssessmentService,
    private readonly constraintSynthesisService: ConstraintSynthesisService,
  ) {}

  async createAssessment(input: CreateAssessmentInput) {
    const dog = await this.prisma.dog.findUnique({
      where: { id: input.dogId },
      select: {
        id: true,
        currentWeightKg: true,
        bcsScore: true,
        activityLevel: true,
      },
    });

    if (!dog) {
      throw new NotFoundException(`Dog not found: ${input.dogId}`);
    }

    const activeRulePackages =
      await this.knowledgeBaseService.listActiveRulePackages();
    const rulePackageInputs = activeRulePackages.map((rulePackage) => ({
      code: rulePackage.code,
      requiredFields: rulePackage.versions[0]?.requiredFields ?? [],
    }));
    const confirmedInputs = input.confirmedInputs ?? {};
    const managementPlan = this.nutritionAssessmentService.buildPlan({
      dog: {
        id: dog.id,
        currentWeightKg: dog.currentWeightKg,
        bcsScore: dog.bcsScore,
        activityLevel: String(dog.activityLevel),
      },
      evidence: [],
      confirmedInputs,
      activeRulePackages: rulePackageInputs,
    });
    const assessmentId = randomUUID();
    const constraintSet = this.constraintSynthesisService.synthesize({
      dogId: dog.id,
      assessmentId,
      rulePackages: managementPlan.enabledRulePackages,
      hardConstraints: [],
      softConstraints: [],
    });

    return this.prisma.dogNutritionAssessment.create({
      data: {
        id: assessmentId,
        dogId: dog.id,
        createdBy: input.createdBy,
        status: NutritionAssessmentStatus.DRAFT,
        inputSummary: this.toJsonObject({
          ...managementPlan.inputSummary,
          prompt: input.prompt,
          confirmedInputs,
        }),
        completeness: this.toJsonObject({
          missingInfo: managementPlan.missingInfo,
        }),
        managementPlan: this.toJsonObject(managementPlan),
        constraintSet: this.toJsonObject(constraintSet),
        resultStatus: this.toPrismaResultStatus(managementPlan.resultStatus),
      },
    });
  }

  async getAssessment(id: string) {
    const assessment = await this.prisma.dogNutritionAssessment.findUnique({
      where: { id },
      include: {
        evidenceItems: { orderBy: { createdAt: 'asc' } },
        sessions: {
          select: {
            id: true,
            status: true,
            resultStatus: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException(`Nutrition assessment not found: ${id}`);
    }

    return assessment;
  }

  private toPrismaResultStatus(status: string): PrismaAgentRecipeResultStatus {
    return PrismaAgentRecipeResultStatus[
      status as keyof typeof PrismaAgentRecipeResultStatus
    ];
  }

  private toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
  }
}
