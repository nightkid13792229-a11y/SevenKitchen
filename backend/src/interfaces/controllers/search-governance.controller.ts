import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchGovernanceService } from '../../application/search-governance/search-governance.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  GenerateSearchAliasSuggestionsDto,
  ListSearchAliasGroupsQueryDto,
  ListSearchAliasSuggestionsQueryDto,
  SearchInsightsQueryDto,
  UpsertSearchAliasGroupDto,
} from '../dto/search-governance/search-governance.dto';
import { AdminGuard } from '../guards/role.guard';

@ApiTags('Admin Search Governance')
@ApiBearerAuth()
@Controller('api/v1/admin/search-governance')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SearchGovernanceController {
  constructor(private readonly searchGovernanceService: SearchGovernanceService) {}

  @Get('overview')
  @ApiOperation({ summary: '获取搜索治理概览' })
  async getOverview(): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.getOverview();
    return new ApiResponseDto(0, 'Success', result);
  }

  @Get('alias-groups')
  @ApiOperation({ summary: '获取搜索别名组列表' })
  async listAliasGroups(
    @Query() query: ListSearchAliasGroupsQueryDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.listAliasGroups(query);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('alias-groups')
  @ApiOperation({ summary: '创建搜索别名组' })
  async createAliasGroup(
    @Body() dto: UpsertSearchAliasGroupDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.createAliasGroup(
      dto,
      user.userId,
    );
    return new ApiResponseDto(0, '别名组已创建', result);
  }

  @Put('alias-groups/:id')
  @ApiOperation({ summary: '更新搜索别名组' })
  async updateAliasGroup(
    @Param('id') id: string,
    @Body() dto: UpsertSearchAliasGroupDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.updateAliasGroup(
      id,
      dto,
      user.userId,
    );
    return new ApiResponseDto(0, '别名组已更新', result);
  }

  @Post('alias-groups/:id/disable')
  @ApiOperation({ summary: '停用搜索别名组' })
  async disableAliasGroup(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.disableAliasGroup(
      id,
      user.userId,
    );
    return new ApiResponseDto(0, '别名组已停用', result);
  }

  @Get('query-insights')
  @ApiOperation({ summary: '获取搜索查询洞察' })
  async getQueryInsights(
    @Query() query: SearchInsightsQueryDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.getQueryInsights(query);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Get('suggestions')
  @ApiOperation({ summary: '获取搜索别名建议列表' })
  async listSuggestions(
    @Query() query: ListSearchAliasSuggestionsQueryDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.listSuggestions(query);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('suggestions/generate')
  @ApiOperation({ summary: '生成搜索别名建议' })
  async generateSuggestions(
    @Body() dto: GenerateSearchAliasSuggestionsDto,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.generateSuggestions(dto);
    return new ApiResponseDto(0, 'Agent 建议已生成', result);
  }

  @Post('suggestions/:id/approve')
  @ApiOperation({ summary: '审批搜索别名建议' })
  async approveSuggestion(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.approveSuggestion(
      id,
      user.userId,
    );
    return new ApiResponseDto(0, '建议已应用', result);
  }

  @Post('suggestions/:id/reject')
  @ApiOperation({ summary: '拒绝搜索别名建议' })
  async rejectSuggestion(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.rejectSuggestion(
      id,
      user.userId,
    );
    return new ApiResponseDto(0, '建议已拒绝', result);
  }
}
