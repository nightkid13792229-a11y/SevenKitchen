/**
 * Unauthorized Exception Filter
 * Converts UnauthorizedException to ApiResponseDto format
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponseDto } from '../dto/common/response.dto';

@Catch(UnauthorizedException)
export class UnauthorizedExceptionFilter implements ExceptionFilter {
  catch(exception: UnauthorizedException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const message = exception.message || 'Unauthorized';

    const apiResponse = ApiResponseDto.error(status, message);

    response.status(HttpStatus.OK).json(apiResponse);
  }
}
