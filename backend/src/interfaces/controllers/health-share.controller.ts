import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { HealthShareService } from '../../application/health/health-share.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

/**
 * 健康信息分享 · 顾客侧（2026-10-01，第三期）。
 *
 * 老板需求：分享给换新医生为主、兼顾家人朋友；内容三选一（摘要 / 报告原件 /
 * 合并）；**不设有效期**（所以必须能主动"停止分享"）；医疗信息默认全给、
 * 顾客可逐项取消；形式只要小程序分享卡片。
 */
@ApiTags('Health Share')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class HealthShareController {
  constructor(private readonly shareService: HealthShareService) {}

  @Post(':dogId/health/shares')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create a health share (snapshot + token)' })
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
        contentMode: {
          type: 'string',
          enum: ['SUMMARY', 'FILES', 'BOTH'],
          description: '摘要 / 报告原件 / 合并，缺省为合并',
        },
        sections: {
          type: 'array',
          items: { type: 'string' },
          description: '要包含的分区；不传 = 全部（默认全给）',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Share created successfully' })
  async createShare(
    @Param('dogId') dogId: string,
    @Body() body: { contentMode?: string; sections?: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.shareService.createShare(user.customerId, dogId, {
      contentMode: body?.contentMode,
      sections: body?.sections,
    });
    return ApiResponseDto.success(data);
  }

  @Get(':dogId/health/shares')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List active health shares of a dog' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({ status: 200, description: 'Shares retrieved successfully' })
  async listShares(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.shareService.listShares(user.customerId, dogId);
    return ApiResponseDto.success({ total: data.length, shares: data });
  }

  @Delete(':dogId/health/shares/:token')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Stop sharing (revoke a health share)' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiParam({ name: 'token', description: 'Share token' })
  @ApiResponse({ status: 200, description: 'Share revoked successfully' })
  async revokeShare(
    @Param('dogId') dogId: string,
    @Param('token') token: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.shareService.revokeShare(
      user.customerId,
      dogId,
      token,
    );
    return ApiResponseDto.success(data);
  }
}
