/**
 * Bad Request Exception Filter
 * Converts BadRequestException to ApiResponseDto format
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponseDto } from '../dto/common/response.dto';

@Catch(BadRequestException)
export class BadRequestExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const message = exception.message || 'Bad Request';

    // Extract validation error message if available
    const exceptionResponse = exception.getResponse();
    let errorMessage = message;
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      const messages = (exceptionResponse as { message: string | string[] })
        .message;
      if (Array.isArray(messages)) {
        errorMessage = messages.join(', ');
      } else {
        errorMessage = messages;
      }
    }

    const apiResponse = ApiResponseDto.error(400, errorMessage);

    response.status(HttpStatus.OK).json(apiResponse);
  }
}
