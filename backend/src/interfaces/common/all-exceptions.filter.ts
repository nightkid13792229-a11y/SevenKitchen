/**
 * Global Exception Filter
 * Logs all unhandled exceptions for debugging
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponseDto } from '../dto/common/response.dto';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const status =
      exception instanceof Error && 'status' in exception
        ? (exception as any).status
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';

    // Log the full error details
    this.logger.error(
      `[AllExceptionsFilter] Unhandled exception: ${message}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    this.logger.error(
      `[AllExceptionsFilter] Request: ${request.method} ${request.url}`,
    );
    // Only log exception details for non-BadRequestException to avoid noise
    if (!(exception instanceof BadRequestException)) {
      this.logger.error(
        `[AllExceptionsFilter] Exception details:`,
        JSON.stringify(exception, Object.getOwnPropertyNames(exception), 2),
      );
    }

    const apiResponse = ApiResponseDto.error(status, message);

    response.status(status).json(apiResponse);
  }
}
