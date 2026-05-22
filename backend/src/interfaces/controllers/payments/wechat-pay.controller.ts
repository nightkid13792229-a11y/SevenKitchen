import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WechatPaymentService } from '../../../application/payment/wechat-payment.service';
import { AuthGuard, CurrentUser } from '../../auth';
import { AdminGuard } from '../../guards/role.guard';
import type { RequestUser } from '../../auth';
import { ApiResponseDto } from '../../dto/common/response.dto';
import { CreateWechatRefundDto } from '../../dto/payments/wechat-refund.dto';

@ApiTags('Payments')
@Controller('api/v1/payments/wechat')
export class WechatPayController {
  constructor(private readonly wechatPaymentService: WechatPaymentService) {}

  @Post('notify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Wechat Pay API v3 payment notification callback' })
  async handleWechatNotify(@Body() payload: any) {
    await this.wechatPaymentService.handleWechatNotify(payload);

    return {
      code: 'SUCCESS',
      message: '成功',
    };
  }

  @Post('refund-notify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Wechat Pay API v3 refund notification callback' })
  async handleWechatRefundNotify(@Body() payload: any) {
    await this.wechatPaymentService.handleWechatRefundNotify(payload);

    return {
      code: 'SUCCESS',
      message: '成功',
    };
  }

}

@ApiTags('Payments')
@Controller('api/v1/admin/orders')
export class AdminWechatRefundController {
  constructor(private readonly wechatPaymentService: WechatPaymentService) {}

  @Post(':id/wechat-refund')
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a WeChat refund for an order' })
  async createOrderWechatRefund(
    @Param('id') orderId: string,
    @Body() dto: CreateWechatRefundDto,
    @CurrentUser() user: RequestUser,
  ) {
    try {
      const refund = await this.wechatPaymentService.createRefund({
        orderId,
        amount: dto.amount,
        reason: dto.reason,
        adminId: user.userId,
        source: 'ADMIN_RETRY',
      });
      return ApiResponseDto.success(refund);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ApiResponseDto.error(404, error.message);
      }
      if (error instanceof BadRequestException) {
        return ApiResponseDto.error(400, error.message);
      }
      throw error;
    }
  }
}
