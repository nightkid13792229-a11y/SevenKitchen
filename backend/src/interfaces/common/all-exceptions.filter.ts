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
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponseDto } from '../dto/common/response.dto';

/**
 * 允许原样透传到响应顶层的字段白名单。
 *
 * 只挑前端明确要用的两个：`reasons`（授权闸门逐条列出未满足条件）与
 * `blocking`（终检阻断项）。**不**整包展开 `getResponse()`：异常响应对象里
 * 可能有内部字段，展开等于把它们原样漏给客户端。
 */
const PASSTHROUGH_FIELDS = ['reasons', 'blocking'] as const;

/**
 * 从 HttpException 的响应对象里挑出白名单字段。
 *
 * 本过滤器是全局兜底（`@Catch()`），注册顺序又让它成为实际最先匹配的一个：
 * 不在这里透传，`new BadRequestException({ message, reasons })` 的 `reasons`
 * 到不了前端。
 */
function pickPassthroughFields(exception: unknown): Record<string, unknown> {
  if (!(exception instanceof HttpException)) {
    return {};
  }

  const payload: unknown = exception.getResponse();
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return {};
  }

  const source = payload as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const field of PASSTHROUGH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      picked[field] = source[field];
    }
  }

  return picked;
}

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

    response.status(status).json({
      ...apiResponse,
      ...pickPassthroughFields(exception),
    });
  }
}
