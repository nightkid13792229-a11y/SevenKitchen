import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AllergyTrialService } from '../../application/health/allergy-trial.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

/**
 * 过敏原排查计划（2026-10-04，过敏重构第三期）
 *
 * 老板第 2 条："对于很多需要做过敏排查的用户来说，
 * 可以创建过敏原的排查计划。"
 *
 * 规则表（建议时长 / 必守清单 / 再挑战窗口 / 兽医边界提示）
 * 由 `GET active` 一并下发 —— 这些数字都带出处，
 * 不该散落在客户端，知识库更新时也只改一处。
 */

export class CreateAllergyTrialDto {
  @IsOptional()
  @IsIn(['SKIN', 'GI', 'BOTH', 'OTITIS'])
  direction?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  focusAllergens?: string[];

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(365)
  plannedDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  currentFoodNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateAllergyTrialDto extends CreateAllergyTrialDto {
  @IsOptional()
  @IsIn(['DRAFT', 'ELIMINATION', 'CHALLENGE', 'COMPLETED', 'ABANDONED'])
  status?: string;

  /** 必守清单的勾选状态 */
  @IsOptional()
  @IsObject()
  strictRules?: Record<string, boolean>;
}

export class LogAllergyTrialDayDto {
  @IsOptional()
  @IsString()
  logDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  itchScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  stoolScore?: number;

  @IsOptional()
  @IsBoolean()
  brokeStrict?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ConcludeChallengeDto {
  @IsIn(['PENDING', 'REACTED', 'NO_REACTION', 'UNCERTAIN'])
  outcome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reactionNote?: string;
}

export class ConcludeTrialDto {
  @IsOptional()
  @IsBoolean()
  abandoned?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

@ApiTags('Allergy Trials')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AllergyTrialController {
  constructor(private readonly trialService: AllergyTrialService) {}

  @Get(':dogId/allergy-trial')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Get the active elimination-diet trial plus the rule table',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({ status: 200, description: 'Trial retrieved successfully' })
  async getActive(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.trialService.getActive(user.customerId, dogId);
    return ApiResponseDto.success(data);
  }

  @Get(':dogId/allergy-trials/history')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List finished allergy trials for a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  async listHistory(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.trialService.listHistory(user.customerId, dogId);
    return ApiResponseDto.success(data);
  }

  @Post(':dogId/allergy-trials')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create an allergy elimination trial' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({ type: CreateAllergyTrialDto })
  @ApiResponse({ status: 201, description: 'Trial created successfully' })
  async create(
    @Param('dogId') dogId: string,
    @Body() dto: CreateAllergyTrialDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.trialService.create(user.customerId, dogId, dto);
    return ApiResponseDto.success(data);
  }

  @Put(':dogId/allergy-trials/:trialId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update an allergy elimination trial' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({ type: UpdateAllergyTrialDto })
  async update(
    @Param('dogId') dogId: string,
    @Param('trialId') trialId: string,
    @Body() dto: UpdateAllergyTrialDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.trialService.update(
      user.customerId,
      dogId,
      trialId,
      dto,
    );
    return ApiResponseDto.success(data);
  }

  @Post(':dogId/allergy-trials/:trialId/logs')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Log one day of the trial (upsert by date)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({ type: LogAllergyTrialDayDto })
  async logDay(
    @Param('dogId') dogId: string,
    @Param('trialId') trialId: string,
    @Body() dto: LogAllergyTrialDayDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.trialService.logDay(
      user.customerId,
      dogId,
      trialId,
      dto,
    );
    return ApiResponseDto.success(data);
  }

  @Post(':dogId/allergy-trials/:trialId/challenges')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Start the re-challenge phase' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  async startChallenge(
    @Param('dogId') dogId: string,
    @Param('trialId') trialId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.trialService.startChallenge(
      user.customerId,
      dogId,
      trialId,
    );
    return ApiResponseDto.success(data);
  }

  @Put(':dogId/allergy-trials/:trialId/challenges/:allergen')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Record a challenge outcome and write it back to the allergy record',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({ type: ConcludeChallengeDto })
  async concludeChallenge(
    @Param('dogId') dogId: string,
    @Param('trialId') trialId: string,
    @Param('allergen') allergen: string,
    @Body() dto: ConcludeChallengeDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.trialService.concludeChallenge(
      user.customerId,
      dogId,
      trialId,
      decodeURIComponent(allergen),
      dto,
    );
    return ApiResponseDto.success(data);
  }

  @Post(':dogId/allergy-trials/:trialId/conclude')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Finish (or abandon) the trial' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiBody({ type: ConcludeTrialDto })
  async conclude(
    @Param('dogId') dogId: string,
    @Param('trialId') trialId: string,
    @Body() dto: ConcludeTrialDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.trialService.conclude(
      user.customerId,
      dogId,
      trialId,
      dto,
    );
    return ApiResponseDto.success(data);
  }
}
