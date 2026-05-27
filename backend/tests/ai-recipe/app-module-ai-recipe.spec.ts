import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('AppModule AI recipe conditional metadata registration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  function loadAppModuleWithRepoModes(mode: 'memory' | 'prisma') {
    jest.doMock('uuid', () => ({
      v4: () => '00000000-0000-4000-8000-000000000000',
    }));

    process.env = {
      ...originalEnv,
      ORDER_REPO: 'memory',
      ADDRESS_REPO: 'memory',
      DOG_REPO: 'memory',
      RECIPE_REPO: 'memory',
      SHIPPING_REPO: 'memory',
      PRODUCTION_REPO: mode,
      INVENTORY_REPO: mode,
      DATABASE_URL:
        mode === 'prisma'
          ? 'postgresql://postgres:postgres@localhost:5432/sevenkitchen'
          : '',
    };

    const { AppModule } = require('../../src/app.module');
    const {
      AiRecipeController,
    } = require('../../src/interfaces/controllers/ai-recipe.controller');
    const {
      KnowledgeBaseService,
    } = require('../../src/application/ai-recipe/knowledge-base.service');
    const {
      RecipeDesignSessionService,
    } = require('../../src/application/ai-recipe/recipe-design-session.service');
    const {
      EvidenceService,
    } = require('../../src/application/ai-recipe/evidence.service');
    const {
      NutritionAssessmentService,
    } = require('../../src/application/ai-recipe/nutrition-assessment.service');
    const {
      ConstraintSynthesisService,
    } = require('../../src/application/ai-recipe/constraint-synthesis.service');
    const {
      AdminGuard,
    } = require('../../src/interfaces/guards/role.guard');

    return {
      AppModule,
      AiRecipeController,
      KnowledgeBaseService,
      RecipeDesignSessionService,
      EvidenceService,
      NutritionAssessmentService,
      ConstraintSynthesisService,
      AdminGuard,
    };
  }

  // Metadata-level coverage only: full non-Prisma AppModule bootstrap is
  // affected by unrelated production/inventory providers.
  it('omits Prisma-backed AI recipe metadata and keeps pure providers when Prisma is disabled', () => {
    const {
      AppModule,
      AiRecipeController,
      KnowledgeBaseService,
      RecipeDesignSessionService,
      EvidenceService,
      NutritionAssessmentService,
      ConstraintSynthesisService,
      AdminGuard,
    } = loadAppModuleWithRepoModes('memory');

    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppModule,
    );
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule);

    expect(controllers).not.toContain(AiRecipeController);
    expect(providers).not.toContain(KnowledgeBaseService);
    expect(providers).not.toContain(RecipeDesignSessionService);
    expect(providers).toEqual(
      expect.arrayContaining([
        AdminGuard,
        EvidenceService,
        NutritionAssessmentService,
        ConstraintSynthesisService,
      ]),
    );
  });

  it('includes Prisma-backed AI recipe metadata when Prisma is enabled', () => {
    const {
      AppModule,
      AiRecipeController,
      KnowledgeBaseService,
      RecipeDesignSessionService,
    } = loadAppModuleWithRepoModes('prisma');

    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppModule,
    );
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule);

    expect(controllers).toContain(AiRecipeController);
    expect(providers).toContain(KnowledgeBaseService);
    expect(providers).toContain(RecipeDesignSessionService);
  });
});
