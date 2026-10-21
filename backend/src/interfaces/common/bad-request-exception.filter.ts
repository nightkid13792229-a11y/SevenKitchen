/**
 * Bad Request Exception Filter
 * Converts BadRequestException to ApiResponseDto format with detailed validation errors
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ValidationError } from '../../domain/common/errors';
import { ApiResponseDto } from '../dto/common/response.dto';

@Catch(BadRequestException, ValidationError)
export class BadRequestExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException | ValidationError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const message = exception.message || 'Bad Request';

    // Extract validation error message if available
    const exceptionResponse =
      exception instanceof BadRequestException ? exception.getResponse() : null;
    let errorMessage = message;

    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      const messages = (exceptionResponse as { message: string | string[] })
        .message;
      if (Array.isArray(messages)) {
        // Join array of validation errors into a readable string
        errorMessage = messages.join('; ');
      } else if (typeof messages === 'string') {
        errorMessage = messages;
      }
    }

    // If the message contains validation details (from our custom exceptionFactory),
    // use it directly; otherwise format it
    const apiResponse = ApiResponseDto.error(400, errorMessage);

    response.status(HttpStatus.OK).json(apiResponse);
  }
}
