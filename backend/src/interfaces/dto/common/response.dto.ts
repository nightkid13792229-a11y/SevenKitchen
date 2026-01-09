/**
 * Common Response DTO
 * Unified response envelope structure per API specs
 */

import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({ description: 'Response code, 0 means success', example: 0 })
  code: number;

  @ApiProperty({ description: 'Response message', example: 'Success' })
  message: string;

  @ApiProperty({ description: 'Response data', nullable: true })
  data: T | null;

  constructor(code: number, message: string, data: T | null = null) {
    this.code = code;
    this.message = message;
    this.data = data;
  }

  static success<T>(
    data: T | null = null,
    message = 'Success',
  ): ApiResponseDto<T> {
    return new ApiResponseDto(0, message, data);
  }

  static error(code: number, message: string): ApiResponseDto<null> {
    return new ApiResponseDto(code, message, null);
  }
}

