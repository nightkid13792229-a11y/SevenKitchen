import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CustomerServiceService } from '../../application/customer-service/customer-service.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user.interface';
import { AdminGuard } from '../guards/role.guard';

@ApiTags('customer-service')
@Controller('api/v1/customer-service')
export class CustomerServiceController {
  constructor(private readonly customerServiceService: CustomerServiceService) {}

  @Post('context')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Record miniapp customer service context' })
  async recordContext(
    @Body()
    body: {
      sourceType?: string;
      sourceTitle?: string;
      sourcePath?: string;
      orderId?: string;
      productId?: string;
      metadata?: Record<string, unknown>;
    },
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.customerServiceService.recordCustomerContext(
      body || {},
      user.userId || user.customerId,
    );
    return ApiResponseDto.success(data);
  }

  @Get('wechat/callback')
  @ApiOperation({ summary: 'WeChat customer service callback verification' })
  async verifyWechatCallback(
    @Query() query: Record<string, string>,
    @Res() response: Response,
  ) {
    const result = await this.customerServiceService.verifyWechatCallback(query);
    if (!result.ok) {
      return response.status(403).send('forbidden');
    }
    return response.status(200).send(result.echo);
  }

  @Post('wechat/callback')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive WeChat customer service callback events' })
  async receiveWechatCallback(
    @Query() query: Record<string, string>,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const result = await this.customerServiceService.ingestWechatCallback(
      query,
      body ?? (request as any).body,
    );
    if (!result.ok) {
      return response.status(403).send('forbidden');
    }
    return response.status(200).send('success');
  }
}

@ApiTags('admin-customer-service')
@Controller('api/v1/admin/customer-service')
@UseGuards(AuthGuard, AdminGuard)
export class AdminCustomerServiceController {
  constructor(private readonly customerServiceService: CustomerServiceService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List customer service conversations' })
  async listConversations(
    @Query('status') status?: string,
    @Query('orderId') orderId?: string,
    @Query('sourceType') sourceType?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.customerServiceService.listConversations({
      status,
      orderId,
      sourceType,
      page: Number(page || 1),
      pageSize: Number(pageSize || 20),
    });
    return ApiResponseDto.success(data);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get customer service conversation detail' })
  async getConversation(@Param('id') id: string) {
    const data = await this.customerServiceService.getConversation(id);
    if (!data) {
      return ApiResponseDto.error(404, '客服会话不存在');
    }
    return ApiResponseDto.success(data);
  }

  @Patch('conversations/:id/status')
  @ApiOperation({ summary: 'Update customer service conversation status' })
  async updateConversationStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const data = await this.customerServiceService.updateConversationStatus(
        id,
        status,
        user.userId,
      );
      return ApiResponseDto.success(data);
    } catch (error: any) {
      return ApiResponseDto.error(400, error.message || '更新客服会话状态失败');
    }
  }
}
