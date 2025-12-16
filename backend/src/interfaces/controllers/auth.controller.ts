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

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly jwtAuthService: JwtAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login and receive JWT token' })
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
  login(
    @Body() loginRequest: LoginRequestDto,
  ): ApiResponseDto<LoginResponseDto> | ApiResponseDto<null> {
    // Validate customerId
    if (
      !loginRequest.customerId ||
      typeof loginRequest.customerId !== 'string' ||
      loginRequest.customerId.trim() === ''
    ) {
      return ApiResponseDto.error(400, 'customerId is required');
    }

    const customerId = loginRequest.customerId.trim();

    // Generate JWT token
    const token = this.jwtAuthService.generateToken(customerId);

    return ApiResponseDto.success({
      token,
      customerId,
    });
  }
}
