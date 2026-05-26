import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AgentConfigService } from '../../application/agent/agent-config.service';
import { CurrentUser, AuthGuard } from '../auth';
import type { RequestUser } from '../auth';
import { AdminGuard } from '../guards/role.guard';
import { UpdateSupplementImportAgentConfigDto } from '../dto/agent-config.dto';
import { ApiResponseDto } from '../dto/common/response.dto';

@ApiTags('AgentConfig')
@Controller('api/v1/admin/agent-configs/supplement-import')
@UseGuards(AuthGuard, AdminGuard)
export class AgentConfigController {
  constructor(private readonly agentConfigService: AgentConfigService) {}

  @Get()
  async get() {
    const config = await this.agentConfigService.getSupplementImportConfig();
    return ApiResponseDto.success(config);
  }

  @Put()
  async update(
    @Body() dto: UpdateSupplementImportAgentConfigDto,
    @CurrentUser() user: RequestUser,
  ) {
    const config = await this.agentConfigService.updateSupplementImportConfig(
      dto,
      user.userId,
    );
    return ApiResponseDto.success(config);
  }

  @Post('test')
  async test(@CurrentUser() user: RequestUser) {
    const result = await this.agentConfigService.testSupplementImportConfig(
      user.userId,
    );
    return ApiResponseDto.success(result);
  }
}
