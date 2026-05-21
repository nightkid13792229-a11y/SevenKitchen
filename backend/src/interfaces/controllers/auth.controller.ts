/**
 * Auth Controller
 * Handles authentication endpoints
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiProperty,
} from '@nestjs/swagger';
import { IsString } from 'class-validator';
import type { Prisma, User } from '@prisma/client';
import { JwtAuthService } from '../auth/jwt.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { WechatService } from '../../infrastructure/wechat/wechat.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import {
  BindWechatPhoneRequestDto,
  ConfirmPhoneMergeRequestDto,
  WechatLoginRequestDto,
} from '../dto/auth/wechat-login.dto';
import {
  PhoneLoginRequestDto,
  SendSmsRequestDto,
  SendSmsResponseDto,
} from '../dto/auth/phone-login.dto';
import * as bcrypt from 'bcrypt';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { AdminGuard } from '../guards/role.guard';

export class LoginRequestDto {
  @ApiProperty({
    description: 'Customer ID',
    example: 'customer-123',
  })
  @IsString()
  customerId!: string;
}

export class LoginResponseDto {
  token!: string;
  customerId!: string;
}

export class AdminLoginRequestDto {
  @ApiProperty({
    description: 'Admin username',
    example: 'admin',
  })
  @IsString()
  username!: string;

  @ApiProperty({
    description: 'Admin password',
    example: 'admin123',
  })
  @IsString()
  password!: string;
}

export class AdminChangePasswordRequestDto {
  @ApiProperty({
    description: 'Current admin password',
    example: 'admin123',
  })
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    description: 'New admin password',
    example: 'new-password-123',
  })
  @IsString()
  newPassword!: string;
}

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly prisma: PrismaService,
    private readonly wechatService: WechatService,
    private readonly smsService: SmsService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Login and receive JWT token (deprecated, use wechat-login or phone-login)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        customerId: {
          type: 'string',
          description: 'Customer ID',
          example: 'customer-123',
        },
      },
      required: ['customerId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Success' },
        data: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            customerId: { type: 'string', example: 'customer-123' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input - customerId is required',
  })
  async login(@Body() loginRequest: LoginRequestDto): Promise<any> {
    // Validate customerId
    if (
      !loginRequest.customerId ||
      typeof loginRequest.customerId !== 'string' ||
      loginRequest.customerId.trim() === ''
    ) {
      return ApiResponseDto.error(400, 'customerId is required');
    }

    const userId = loginRequest.customerId.trim();

    // Fetch user role using raw query to avoid enum issues
    const result = await this.prisma.$queryRaw<{ role: string }[]>`
      SELECT role::text as role
      FROM "user"
      WHERE id = ${userId}
    `;

    if (!result || result.length === 0) {
      return ApiResponseDto.error(404, 'User not found');
    }

    const role = result[0].role;

    // Generate JWT token with actual role
    const token = this.jwtAuthService.generateTokenForUser(userId, role);

    return ApiResponseDto.success({
      token,
      customerId: userId,
      role: role,
    });
  }

  @Post('wechat-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WeChat login for customers' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
  })
  async wechatLogin(@Body() dto: WechatLoginRequestDto): Promise<any> {
    try {
      console.log('=== [WeChat Login] START ===');
      console.log(
        '[WeChat Login] Received code:',
        dto.code?.substring(0, 10) + '...',
      );
      console.log('[WeChat Login] Received userInfo:', dto.userInfo);

      // Get WeChat user info
      const wechatUser = await this.wechatService.code2Session(
        dto.code,
        this.normalizeAppId(dto.appId),
      );
      const appId = wechatUser.appId || this.normalizeAppId(dto.appId) || '';
      console.log('[WeChat Login] Resolved AppID:', appId);
      console.log('[WeChat Login] WeChat openid:', wechatUser.openid);
      console.log('[WeChat Login] WeChat unionid:', wechatUser.unionid);

      // Find or create user
      let user = await this.findUserByWechatIdentity(
        appId,
        wechatUser.openid,
        wechatUser.unionid,
      );

      console.log('[WeChat Login] Found existing user:', !!user);
      if (user) {
        console.log('[WeChat Login] Existing user ID:', user.id);
        console.log('[WeChat Login] Existing user role:', user.role);
      }

      let isNewUser = false;

      if (!user) {
        console.log('[WeChat Login] Creating new user...');
        // Create new user
        // Handle both nickName (WeChat format) and nickname (standard format)
        const userNickname =
          dto.userInfo?.nickName || dto.userInfo?.nickname || '微信用户';
        const userAvatar = dto.userInfo?.avatarUrl;

        user = await this.prisma.user.create({
          data: {
            wechatOpenid: wechatUser.openid,
            wechatUnionid: wechatUser.unionid,
            nickname: userNickname,
            avatarUrl: userAvatar,
            role: 'CUSTOMER',
            status: 'ACTIVE',
            lastLoginAt: new Date(),
          },
        });
        isNewUser = true;
        console.log('[WeChat Login] Created new user ID:', user.id);
        console.log('[WeChat Login] Created new user role:', user.role);
      } else {
        console.log('[WeChat Login] Updating existing user...');
        // Update user info
        const userNickname = dto.userInfo?.nickName || dto.userInfo?.nickname;
        const userAvatar = dto.userInfo?.avatarUrl;

        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            nickname: userNickname || user.nickname,
            avatarUrl: userAvatar || user.avatarUrl,
            lastLoginAt: new Date(),
          },
        });
        console.log('[WeChat Login] Updated user ID:', user.id);
        console.log('[WeChat Login] Updated user nickname:', user.nickname);
        console.log('[WeChat Login] Updated user avatarUrl:', user.avatarUrl);
      }

      user = await this.attachWechatIdentity(user, {
        appId,
        openid: wechatUser.openid,
        unionid: wechatUser.unionid,
        sessionKey: wechatUser.sessionKey,
      });

      // Verify user is actually in database
      const verifyUser = await this.prisma.user.findUnique({
        where: { id: user.id },
      });
      console.log(
        '[WeChat Login] Verification - User exists in DB:',
        !!verifyUser,
      );

      // Check user status
      if (user.status !== 'ACTIVE') {
        console.log('[WeChat Login] User status is not ACTIVE:', user.status);
        return ApiResponseDto.error(403, 'User account is not active');
      }

      // Generate JWT token
      const token = this.jwtAuthService.generateTokenForUser(
        user.id,
        user.role,
      );

      console.log('[WeChat Login] Generated token for user:', user.id);
      console.log(
        '[WeChat Login] Returning - userId:',
        user.id,
        'role:',
        user.role,
        'isNewUser:',
        isNewUser,
      );
      console.log(
        '[WeChat Login] User object - nickname:',
        user.nickname,
        'avatarUrl:',
        user.avatarUrl,
      );
      console.log('=== [WeChat Login] END ===\n');

      return ApiResponseDto.success({
        token,
        userId: user.id,
        role: user.role,
        isNewUser,
        user: {
          id: user.id,
          nickname: user.nickname || '微信用户',
          avatarUrl: user.avatarUrl,
          role: user.role,
          phone: user.phone,
          phoneBound: !!user.phone,
        },
        appId,
        phoneBound: !!user.phone,
      });
    } catch (error: any) {
      console.log('[WeChat Login] ERROR:', error.message);
      console.log('[WeChat Login] ERROR stack:', error.stack);
      return ApiResponseDto.error(500, error.message || 'WeChat login failed');
    }
  }

  @Post('bind-phone')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Bind WeChat authorized phone number' })
  async bindWechatPhone(
    @CurrentUser() requestUser: RequestUser,
    @Body() dto: BindWechatPhoneRequestDto,
  ): Promise<any> {
    try {
      const phoneInfo = await this.wechatService.getPhoneNumber(
        dto.code,
        this.normalizeAppId(dto.appId),
      );
      const phone = phoneInfo.phoneNumber;
      const currentUser = await this.prisma.user.findUnique({
        where: { id: requestUser.userId },
        include: this.userSummaryInclude(),
      });

      if (!currentUser) {
        return ApiResponseDto.error(404, '当前用户不存在');
      }

      if (currentUser.role !== 'CUSTOMER') {
        return ApiResponseDto.error(400, '员工或管理员账号不参与客户资料合并');
      }

      if (currentUser.phone === phone) {
        return ApiResponseDto.success(this.buildBoundResponse(currentUser));
      }

      const existingUser = await this.prisma.user.findUnique({
        where: { phone },
        include: this.userSummaryInclude(),
      });

      if (existingUser && existingUser.id !== currentUser.id) {
        if (existingUser.role !== 'CUSTOMER') {
          return ApiResponseDto.error(
            400,
            '该手机号已绑定员工或管理员账号，请联系管理员处理',
          );
        }

        const mergeToken = this.jwtAuthService.generatePhoneMergeToken({
          sourceUserId: currentUser.id,
          targetUserId: existingUser.id,
          phone,
        });

        return ApiResponseDto.success({
          status: 'NEEDS_CONFIRMATION',
          phone: this.maskPhone(phone),
          mergeToken,
          targetUser: this.buildUserSummary(existingUser),
          message: '检测到该手机号已有历史资料，请确认是否同步到当前账号',
        });
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: currentUser.id },
        data: { phone },
        include: this.userSummaryInclude(),
      });

      return ApiResponseDto.success(this.buildBoundResponse(updatedUser));
    } catch (error: any) {
      console.error('[Bind Phone] ERROR:', error);
      return ApiResponseDto.error(500, error.message || '绑定手机号失败');
    }
  }

  @Post('confirm-phone-merge')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Confirm phone-based historical data merge' })
  async confirmPhoneMerge(
    @CurrentUser() requestUser: RequestUser,
    @Body() dto: ConfirmPhoneMergeRequestDto,
  ): Promise<any> {
    try {
      const payload = this.jwtAuthService.validatePhoneMergeToken(
        dto.mergeToken,
      );

      if (payload.sourceUserId !== requestUser.userId) {
        return ApiResponseDto.error(403, '合并确认已失效，请重新绑定手机号');
      }

      const mergedUser = await this.mergeCustomerUsers(
        payload.sourceUserId,
        payload.targetUserId,
        payload.phone,
      );
      const token = this.jwtAuthService.generateTokenForUser(
        mergedUser.id,
        mergedUser.role,
      );

      return ApiResponseDto.success({
        status: 'MERGED',
        token,
        userId: mergedUser.id,
        role: mergedUser.role,
        phoneBound: true,
        user: this.buildUserSummary(mergedUser),
      });
    } catch (error: any) {
      console.error('[Confirm Phone Merge] ERROR:', error);
      return ApiResponseDto.error(500, error.message || '同步历史资料失败');
    }
  }

  @Post('send-sms')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send SMS verification code' })
  @ApiResponse({
    status: 200,
    description: 'SMS sent successfully',
  })
  async sendSms(
    @Body() dto: SendSmsRequestDto,
  ): Promise<ApiResponseDto<SendSmsResponseDto | null>> {
    try {
      // 验证手机号格式
      if (!/^1[3-9]\d{9}$/.test(dto.phone)) {
        return ApiResponseDto.error(400, '手机号格式不正确');
      }

      // 发送验证码
      const expireIn = await this.smsService.sendVerificationCode(dto.phone);

      return ApiResponseDto.success({
        success: true,
        expireIn,
      });
    } catch (error: any) {
      return ApiResponseDto.error(500, error.message || '发送验证码失败');
    }
  }

  @Post('phone-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone and SMS code (for STAFF)' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
  })
  async phoneLogin(@Body() dto: PhoneLoginRequestDto): Promise<any> {
    try {
      // 验证手机号格式
      if (!/^1[3-9]\d{9}$/.test(dto.phone)) {
        return ApiResponseDto.error(400, '手机号格式不正确');
      }

      // 验证验证码
      await this.smsService.verifyCode(dto.phone, dto.code);

      // 查找用户
      const user = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });

      if (!user) {
        return ApiResponseDto.error(
          404,
          '该手机号未注册，请联系管理员创建账号',
        );
      }

      // 检查用户角色（只有STAFF和ADMIN可以通过手机号登录）
      if (user.role !== 'STAFF' && user.role !== 'ADMIN') {
        return ApiResponseDto.error(403, '普通用户请使用微信登录');
      }

      // 检查用户状态
      if (user.status !== 'ACTIVE') {
        return ApiResponseDto.error(403, '账号已被禁用');
      }

      // 更新最后登录时间
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // 生成JWT token
      const token = this.jwtAuthService.generateTokenForUser(
        user.id,
        user.role,
      );

      return ApiResponseDto.success({
        token,
        userId: user.id,
        role: user.role,
        user: {
          id: user.id,
          phone: user.phone!,
          nickname: user.nickname,
          role: user.role,
        },
      });
    } catch (error: any) {
      return ApiResponseDto.error(500, error.message || '登录失败');
    }
  }

  @Post('admin-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login with username and password' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'Success' },
        data: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            userId: { type: 'string' },
            username: { type: 'string' },
            role: { type: 'string' },
          },
        },
      },
    },
  })
  async adminLogin(@Body() dto: AdminLoginRequestDto): Promise<any> {
    try {
      // Validate input
      if (!dto.username || !dto.password) {
        return ApiResponseDto.error(400, '用户名和密码不能为空');
      }

      // Find user by username (nickname field)
      const user = await this.prisma.user.findFirst({
        where: {
          nickname: dto.username,
          role: { in: ['STAFF', 'ADMIN'] },
        },
      });

      if (!user) {
        return ApiResponseDto.error(401, '用户名或密码错误');
      }

      // Check if password exists
      if (!user.password) {
        return ApiResponseDto.error(401, '该账号未设置密码，请联系管理员');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(dto.password, user.password);
      if (!isPasswordValid) {
        return ApiResponseDto.error(401, '用户名或密码错误');
      }

      // Check user status
      if (user.status !== 'ACTIVE') {
        return ApiResponseDto.error(403, '账号已被禁用');
      }

      // Update last login time
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate JWT token
      const token = this.jwtAuthService.generateTokenForUser(
        user.id,
        user.role,
      );

      return ApiResponseDto.success({
        token,
        userId: user.id,
        username: user.nickname,
        role: user.role,
      });
    } catch (error: any) {
      return ApiResponseDto.error(500, error.message || '登录失败');
    }
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Change current admin password' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
  })
  async changeAdminPassword(
    @CurrentUser() currentUser: RequestUser,
    @Body() dto: AdminChangePasswordRequestDto,
  ): Promise<any> {
    try {
      const currentPassword = dto.currentPassword?.trim();
      const newPassword = dto.newPassword?.trim();

      if (!currentPassword || !newPassword) {
        return ApiResponseDto.error(400, '当前密码和新密码不能为空');
      }

      if (newPassword.length < 8 || newPassword.length > 64) {
        return ApiResponseDto.error(400, '新密码长度需为8-64位');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: currentUser.userId },
        select: {
          id: true,
          password: true,
          status: true,
        },
      });

      if (!user) {
        return ApiResponseDto.error(404, '账号不存在');
      }

      if (user.status !== 'ACTIVE') {
        return ApiResponseDto.error(403, '账号已被禁用');
      }

      if (!user.password) {
        return ApiResponseDto.error(
          400,
          '当前账号未设置密码，请先联系管理员初始化密码',
        );
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!isCurrentPasswordValid) {
        return ApiResponseDto.error(401, '当前密码错误');
      }

      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return ApiResponseDto.error(400, '新密码不能与当前密码相同');
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      return ApiResponseDto.success({ changed: true });
    } catch (error: any) {
      return ApiResponseDto.error(500, error.message || '修改密码失败');
    }
  }

  private normalizeAppId(appId?: string | null): string | undefined {
    const normalized = appId?.trim();
    return normalized || undefined;
  }

  private isPrimaryApp(appId: string): boolean {
    return appId === this.wechatService.getPrimaryAppId();
  }

  private async findUserByWechatIdentity(
    appId: string,
    openid: string,
    unionid?: string,
  ): Promise<User | null> {
    const identity = await this.prisma.userWechatIdentity.findUnique({
      where: {
        appId_openid: {
          appId,
          openid,
        },
      },
      include: { user: true },
    });

    if (identity?.user) {
      return identity.user;
    }

    const legacyOpenidUser = await this.prisma.user.findUnique({
      where: { wechatOpenid: openid },
    });
    if (legacyOpenidUser) {
      return legacyOpenidUser;
    }

    if (unionid) {
      return this.prisma.user.findUnique({
        where: { wechatUnionid: unionid },
      });
    }

    return null;
  }

  private async attachWechatIdentity(
    user: User,
    input: {
      appId: string;
      openid: string;
      unionid?: string;
      sessionKey?: string;
    },
  ): Promise<User> {
    await this.prisma.userWechatIdentity.upsert({
      where: {
        appId_openid: {
          appId: input.appId,
          openid: input.openid,
        },
      },
      create: {
        userId: user.id,
        appId: input.appId,
        openid: input.openid,
        unionid: input.unionid,
        sessionKey: input.sessionKey,
        lastLoginAt: new Date(),
      },
      update: {
        userId: user.id,
        unionid: input.unionid,
        sessionKey: input.sessionKey,
        lastLoginAt: new Date(),
      },
    });

    const shouldRefreshLegacyOpenid =
      this.isPrimaryApp(input.appId) || !user.wechatOpenid;
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(shouldRefreshLegacyOpenid && { wechatOpenid: input.openid }),
        ...(!user.wechatUnionid &&
          input.unionid && { wechatUnionid: input.unionid }),
        lastLoginAt: new Date(),
      },
    });
  }

  private userSummaryInclude() {
    return {
      _count: {
        select: {
          dogs: true,
          orders: true,
          addresses: true,
          diySheets: true,
          favoriteRecipes: true,
          customRecipeOrders: true,
        },
      },
    } as const;
  }

  private buildUserSummary(user: any) {
    return {
      id: user.id,
      nickname: user.nickname || '微信用户',
      avatarUrl: user.avatarUrl,
      role: user.role,
      phone: user.phone,
      phoneBound: !!user.phone,
      dogCount: user._count?.dogs || 0,
      orderCount: user._count?.orders || 0,
      addressCount: user._count?.addresses || 0,
      diySheetCount: user._count?.diySheets || 0,
      favoriteRecipeCount: user._count?.favoriteRecipes || 0,
      customRecipeOrderCount: user._count?.customRecipeOrders || 0,
    };
  }

  private buildBoundResponse(user: any) {
    const token = this.jwtAuthService.generateTokenForUser(user.id, user.role);
    return {
      status: 'BOUND',
      token,
      userId: user.id,
      role: user.role,
      phoneBound: true,
      user: this.buildUserSummary(user),
    };
  }

  private maskPhone(phone: string): string {
    if (phone.length !== 11) return phone;
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  }

  private async mergeCustomerUsers(
    sourceUserId: string,
    targetUserId: string,
    phone: string,
  ): Promise<any> {
    if (sourceUserId === targetUserId) {
      return this.prisma.user.update({
        where: { id: targetUserId },
        data: { phone },
        include: this.userSummaryInclude(),
      });
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const [sourceUser, targetUser] = await Promise.all([
        tx.user.findUnique({ where: { id: sourceUserId } }),
        tx.user.findUnique({ where: { id: targetUserId } }),
      ]);

      if (!sourceUser || !targetUser) {
        throw new Error('待同步账号不存在，请重新登录后再试');
      }
      if (sourceUser.role !== 'CUSTOMER' || targetUser.role !== 'CUSTOMER') {
        throw new Error('员工或管理员账号不参与客户资料合并');
      }

      const targetFavorites = await tx.favoriteRecipe.findMany({
        where: { userId: targetUserId },
        select: { recipeId: true },
      });
      const targetFavoriteIds = targetFavorites.map((item) => item.recipeId);
      if (targetFavoriteIds.length > 0) {
        await tx.favoriteRecipe.deleteMany({
          where: {
            userId: sourceUserId,
            recipeId: { in: targetFavoriteIds },
          },
        });
      }

      await Promise.all([
        tx.dog.updateMany({
          where: { ownerId: sourceUserId },
          data: { ownerId: targetUserId },
        }),
        tx.address.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.order.updateMany({
          where: { customerId: sourceUserId },
          data: { customerId: targetUserId },
        }),
        tx.orderPricingSnapshot.updateMany({
          where: { customerId: sourceUserId },
          data: { customerId: targetUserId },
        }),
        tx.dIYSheet.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.customRecipeOrder.updateMany({
          where: { customerId: sourceUserId },
          data: { customerId: targetUserId },
        }),
        tx.favoriteRecipe.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.recipeReview.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.feedback.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.feedbackReply.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
        tx.feedbackReply.updateMany({
          where: { replyToUserId: sourceUserId },
          data: { replyToUserId: targetUserId },
        }),
        tx.userWechatIdentity.updateMany({
          where: { userId: sourceUserId },
          data: { userId: targetUserId },
        }),
      ]);

      await tx.user.update({
        where: { id: sourceUserId },
        data: {
          phone: null,
          wechatOpenid: null,
          wechatUnionid: null,
          status: 'INACTIVE',
          nickname: sourceUser.nickname
            ? `${sourceUser.nickname}(已合并)`
            : '已合并账号',
        },
      });

      return tx.user.update({
        where: { id: targetUserId },
        data: {
          phone,
          wechatOpenid: sourceUser.wechatOpenid || targetUser.wechatOpenid,
          wechatUnionid: targetUser.wechatUnionid || sourceUser.wechatUnionid,
          lastLoginAt: new Date(),
        },
        include: this.userSummaryInclude(),
      });
    });
  }
}
