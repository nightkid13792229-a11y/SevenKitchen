/**
 * 后台 · 订单设计最终提交（2026-10-22 · Task 4）。
 *
 * 单独一个控制器而不是塞进 `AdminCustomRecipeController`：
 *   · 它只有一个动作，权限口径也只有一个（管理员）；
 *   · 老控制器已有 1600+ 行、9 个依赖，再加一个「最终提交」会让
 *     「交付食谱」和「交付订单设计」两种动作在同一个类里继续纠缠。
 *
 * 通知口径与 `deliver-batch` 完全一致：**只发一条**微信订阅消息，
 * 链接用第一份食谱的业务编号；通知失败不影响已完成的交付。
 */
import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderDesignSubmitService } from '../../../application/custom-recipe/order-design-submit.service';
import { CustomRecipeService } from '../../../application/custom-recipe/custom-recipe.service';
import { WechatService } from '../../../infrastructure/wechat/wechat.service';
import { ApiResponseDto } from '../../dto/common/response.dto';
import { AuthGuard } from '../../auth/auth.guard';
import { StaffGuard } from '../../guards/role.guard';
import { AdminGuard } from '../auth/admin.guard';

@ApiTags('admin/custom-recipe')
@ApiBearerAuth()
@Controller('api/v1/admin/custom-recipe')
@UseGuards(AuthGuard, StaffGuard)
export class OrderDesignSubmitController {
  constructor(
    private readonly orderDesignSubmitService: OrderDesignSubmitService,
    private readonly customRecipeService: CustomRecipeService,
    private readonly wechatService: WechatService,
  ) {}

  /** 取当前操作人标识，用于交付留痕（与老交付接口同口径）。 */
  private currentOperatorId(req: {
    user?: { userId?: string; staffId?: string; id?: string };
  }): string {
    const user = req?.user;
    return user?.userId || user?.staffId || user?.id || 'unknown';
  }

  /**
   * 把本单所有 READY 设计一次性交付（仅管理员）。
   *
   * 员工可以设计、可以「加入待提交」，但最终交付与通知必须由管理员触发。
   */
  @Post('orders/:orderId/submit-designs')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Submit all ready order designs and deliver them at once',
  })
  async submitOrderDesigns(@Req() req: any, @Param('orderId') orderId: string) {
    const result = await this.orderDesignSubmitService.submitOrderDesigns(
      orderId,
      this.currentOperatorId(req),
    );

    /**
     * 重复提交（订单与槽位都已 DELIVERED）没有新的交付动作，
     * 不再发第二条通知；首次提交与「补标槽位」的重试照常发一条。
     *
     * 整个通知块都兜住：交付已经成功，不能因为一条消息或一次查询失败
     * 就给后台回 500。
     */
    if (!result.replayed) {
      try {
        // 用 service 回的业务订单号查：路由也接受主键，主键查不到 openid
        const order = await this.customRecipeService.getOrderByOrderId(
          result.orderId,
        );
        const openid = order?.customer?.wechatOpenid;
        if (openid && this.wechatService) {
          await this.wechatService.sendCustomRecipeOrderNotification(
            openid,
            result.orderId,
            'DELIVERED',
            result.recipes[0]?.recipeId,
          );
        }
      } catch (error) {
        console.error('[CustomRecipe] 订单设计最终提交通知发送失败:', error);
      }
    }

    return ApiResponseDto.success({
      ...result,
      status: 'DELIVERED',
    });
  }
}
