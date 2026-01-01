/**
 * Health Notification Controller
 * Handles subscription message notifications for health reminders
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger'
import { HealthService } from '../../application/health/health.service'
import { ApiResponseDto } from '../dto/common/response.dto'
import { AuthGuard, CurrentUser } from '../auth'
import type { RequestUser } from '../auth'

@ApiTags('Health Notifications')
@Controller('api/v1/dogs')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class HealthNotificationController {
  constructor(private readonly healthService: HealthService) {}

  @Post(':dogId/vaccines/subscribe-reminder')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Subscribe to vaccine expiration reminders' })
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
        vaccineIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Vaccine record IDs to subscribe for reminders',
        },
        daysBefore: {
          type: 'number',
          description: 'Days before expiration to send reminder (default: 7)',
          default: 7,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully subscribed to vaccine reminders',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Subscription successful' },
        data: {
          type: 'object',
          properties: {
            subscribedCount: { type: 'number' },
          },
        },
      },
    },
  })
  async subscribeVaccineReminder(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
    @Body('vaccineIds') vaccineIds: string[],
    @Body('daysBefore') daysBefore?: number,
  ): Promise<ApiResponseDto<{ subscribedCount: number }>> {
    // TODO: Implement WeChat subscription message logic
    // 1. Validate vaccine IDs belong to this dog
    // 2. Request subscription message permission from user
    // 3. Store subscription preferences
    // 4. Schedule background job to check and send reminders

    return ApiResponseDto.success({
      subscribedCount: vaccineIds?.length || 0,
    })
  }

  @Get(':dogId/vaccines/upcoming/notify')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get upcoming vaccines and send subscription message' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({
    status: 200,
    description: 'Subscription messages sent successfully',
  })
  async notifyUpcomingVaccines(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<{ notifiedCount: number }>> {
    // TODO: Implement WeChat subscription message sending
    // 1. Get upcoming vaccines within specified days
    // 2. Send subscription message to user
    // 3. Return count of notifications sent

    const records = await this.healthService.getUpcomingVaccines(dogId, user.customerId, 30)

    // TODO: Send WeChat subscription messages
    // const notificationPromises = records.data.records.map(vaccine =>
    //   this.wechatService.sendSubscriptionMessage({
    //     touser: user.wechatOpenid,
    //     template_id: 'VACCINE_REMINDER_TEMPLATE_ID',
    //     page: `pages/health-management/vaccines/detail?id=${vaccine.id}`,
    //     data: {
    //       thing1: { value: vaccine.vaccineName },
    //       date2: { value: vaccine.nextDueDate },
    //       thing3: { value: '请及时接种' },
    //     },
    //   })
    // )

    return ApiResponseDto.success({
      notifiedCount: records.total,
    })
  }

  @Get(':dogId/health/export')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Export health data for sharing with veterinarian' })
  @ApiSecurity('X-Customer-Id')
  @ApiHeader({
    name: 'X-Customer-Id',
    description: 'Customer ID for authentication',
    required: true,
  })
  @ApiParam({ name: 'dogId', description: 'Dog ID' })
  @ApiResponse({
    status: 200,
    description: 'Health data exported successfully',
  })
  async exportHealthData(
    @Param('dogId') dogId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    // Fetch all health records
    const [vaccinesRes, checkupsRes, medicalRecordsRes, allergiesRes] = await Promise.all([
      this.healthService.getVaccineRecords(dogId, user.customerId),
      this.healthService.getCheckupRecords(dogId, user.customerId),
      this.healthService.getMedicalRecords(dogId, user.customerId),
      this.healthService.getAllergyRecords(dogId, user.customerId),
    ])

    // Return comprehensive health data
    return ApiResponseDto.success({
      vaccines: vaccinesRes.records,
      checkups: checkupsRes.records,
      medicalRecords: medicalRecordsRes.records,
      allergies: allergiesRes.records,
      exportDate: new Date().toISOString(),
    })
  }
}
