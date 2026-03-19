/**
 * Auth Controller
 * Handles authentication endpoints
 */

import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiProperty,
} from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthService } from '../auth/jwt.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { PrismaService } from '../../infrastructure/prisma.service';
import { WechatService } from '../../infrastructure/wechat/wechat.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { WechatLoginRequestDto } from '../dto/auth/wechat-login.dto';
import {
  PhoneLoginRequestDto,
  SendSmsRequestDto,
  SendSmsResponseDto,
} from '../dto/auth/phone-login.dto';
import * as bcrypt from 'bcrypt';

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
      const wechatUser = await this.wechatService.code2Session(dto.code);
      console.log('[WeChat Login] WeChat openid:', wechatUser.openid);
      console.log('[WeChat Login] WeChat unionid:', wechatUser.unionid);

      // Find or create user
      let user = await this.prisma.user.findUnique({
        where: { wechatOpenid: wechatUser.openid },
      });

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
        },
      });
    } catch (error: any) {
      console.log('[WeChat Login] ERROR:', error.message);
      console.log('[WeChat Login] ERROR stack:', error.stack);
      return ApiResponseDto.error(500, error.message || 'WeChat login failed');
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
}
