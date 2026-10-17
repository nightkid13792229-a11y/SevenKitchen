/**
 * 站内消息中心（小程序 · 顾客端）· 2026-10-18
 *
 * 三个接口：列表 / 未读数 / 标记已读。
 *
 * ## 为什么"未读数"要单独一个接口
 *
 * 首页铃铛和「我的」里的红点**每次进页面都要刷新**，
 * 但列表可能有几十条 —— 为了一个数字去拉整个列表是浪费。
 *
 * ## 为什么所有接口都从 token 取 customerId，不接受前端传
 *
 * 消息是私密的。如果接受 `customerId` 参数，
 * 改一个数字就能看别人的消息 —— 这类越权是最常见的低级漏洞。
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerMessageService } from '../../application/message/customer-message.service';
import { AuthGuard } from '../auth/auth.guard';
import { ApiResponseDto } from '../dto/common/response.dto';

@ApiTags('customer-message')
@Controller('api/v1/messages')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class CustomerMessageController {
  constructor(private readonly messages: CustomerMessageService) {}

  /** token 里的用户 id —— 唯一可信来源 */
  private customerId(req: any): string {
    return String(req.user?.id || req.user?.userId || '');
  }

  @Get()
  @ApiOperation({ summary: '消息列表（category 为空表示全部）' })
  async list(
    @Req() req: any,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const customerId = this.customerId(req);
    const data = await this.messages.list({
      customerId,
      // 只接受四种已知分类；其它值一律当"全部"，不猜
      category: ['DELIVERY', 'AFTERSALE', 'SHIPPING', 'SYSTEM'].includes(
        String(category || ''),
      )
        ? String(category)
        : null,
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    });
    return ApiResponseDto.success(data);
  }

  @Get('unread-count')
  @ApiOperation({ summary: '未读数（首页铃铛 / 我的红点）' })
  async unreadCount(@Req() req: any) {
    const count = await this.messages.unreadCount(this.customerId(req));
    return ApiResponseDto.success({ count });
  }

  @Post(':id/read')
  @ApiOperation({ summary: '标记一条已读' })
  async markRead(@Req() req: any, @Param('id') id: string) {
    const ok = await this.messages.markRead(this.customerId(req), id);
    return ApiResponseDto.success({ changed: ok });
  }

  @Post('read-all')
  @ApiOperation({ summary: '全部已读' })
  async markAllRead(@Req() req: any) {
    const count = await this.messages.markAllRead(this.customerId(req));
    return ApiResponseDto.success({ changed: count });
  }
}
