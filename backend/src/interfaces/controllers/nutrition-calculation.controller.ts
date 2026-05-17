import {
  Controller,
  Get,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { FediafTargetSelectorService } from '../../application/nutrition-calculation/fediaf-target-selector.service';
import { IngredientReadinessService } from '../../application/nutrition-calculation/ingredient-readiness.service';
import { NutrientMappingAuditService } from '../../application/nutrition-calculation/nutrient-mapping-audit.service';
import { AuthGuard } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import { FediafTargetQueryDto } from '../dto/nutrition-calculation/nutrition-calculation.dto';
import { AdminGuard } from '../guards/role.guard';

@ApiTags('Nutrition Calculation')
@ApiBearerAuth()
@ApiSecurity('wechat-auth')
@Controller('api/v1/admin/nutrition-calculation')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NutritionCalculationController {
  constructor(
    private readonly mappingAuditService: NutrientMappingAuditService,
    private readonly ingredientReadinessService: IngredientReadinessService,
    private readonly targetSelectorService: FediafTargetSelectorService,
  ) {}

  @Get('fediaf-2025-dog/mapping-audit')
  @ApiOperation({ summary: 'Audit FEDIAF 2025 dog nutrient mappings' })
  async getMappingAudit(): Promise<ApiResponseDto<any>> {
    const result =
      await this.mappingAuditService.auditFediaf2025DogMappings();

    return ApiResponseDto.success(result);
  }

  @Get('ingredients/readiness')
  @ApiOperation({ summary: 'List ingredient nutrition calculation readiness' })
  async listIngredientReadiness(): Promise<ApiResponseDto<any>> {
    const result =
      await this.ingredientReadinessService.listIngredientReadiness();

    return ApiResponseDto.success(result);
  }

  @Get('fediaf-2025-dog/target')
  @ApiOperation({ summary: 'Preview selected FEDIAF 2025 dog target' })
  async previewFediafTarget(
    @Query() query: FediafTargetQueryDto,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.targetSelectorService.selectFediaf2025DogTarget({
      lifeStage: query.lifeStage,
    });

    return ApiResponseDto.success(result);
  }
}
