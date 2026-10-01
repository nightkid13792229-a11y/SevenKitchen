import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { DietPreferenceService } from '../../application/health/diet-preference.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

/**
 * 饮食偏好（2026-10-01，第五期）。
 *
 * 老板第 9 条：饮食偏好的变化要能看到历史。
 *
 * 与旧的两个文本框并存：旧字段不动，配方设计继续合并使用；
 * 这里是结构化的一份，用于展示、历史与后续的按食材推荐。
 */
@ApiTags('Diet Preferences')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class DietPreferenceController {
  constructor(private readonly dietService: DietPreferenceService) {}

  @Get(':dogId/diet-preferences')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'List structured diet preferences with change history',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({ status: 200, description: 'Preferences retrieved successfully' })
  async list(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.dietService.list(user.customerId, dogId);
    return ApiResponseDto.success(data);
  }

  @Post(':dogId/diet-preferences')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Add one diet preference item' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['LIKED', 'DISLIKED'] },
        foodName: { type: 'string' },
      },
      required: ['kind', 'foodName'],
    },
  })
  @ApiResponse({ status: 201, description: 'Preference added successfully' })
  async add(
    @Param('dogId') dogId: string,
    @Body() body: { kind?: string; foodName?: string },
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.dietService.add(
      user.customerId,
      dogId,
      String(body?.kind || ''),
      String(body?.foodName || ''),
    );
    return ApiResponseDto.success(data);
  }

  @Delete(':dogId/diet-preferences')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Remove one diet preference item' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiQuery({ name: 'kind', enum: ['LIKED', 'DISLIKED'] })
  @ApiQuery({ name: 'foodName' })
  @ApiResponse({ status: 200, description: 'Preference removed successfully' })
  async remove(
    @Param('dogId') dogId: string,
    @Query('kind') kind: string,
    @Query('foodName') foodName: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.dietService.remove(
      user.customerId,
      dogId,
      kind,
      foodName,
    );
    return ApiResponseDto.success(data);
  }

  @Post(':dogId/diet-preferences/import-legacy')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Import preferences from the legacy free-text fields (owner confirmed)',
  })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        liked: { type: 'array', items: { type: 'string' } },
        disliked: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Imported successfully' })
  async importLegacy(
    @Param('dogId') dogId: string,
    @Body() body: { liked?: string[]; disliked?: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.dietService.importFromLegacy(
      user.customerId,
      dogId,
      body || {},
    );
    return ApiResponseDto.success(data);
  }
}
