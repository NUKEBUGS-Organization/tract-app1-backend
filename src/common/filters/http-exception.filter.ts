import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // ValidationPipe errors come as an array in exceptionResponse.message
    const message =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in (exceptionResponse as object)
        ? (exceptionResponse as { message: unknown }).message
        : exceptionResponse;

    const code =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'code' in (exceptionResponse as object)
        ? (exceptionResponse as { code?: string }).code
        : undefined;

    response.status(status).json({
      success: false,
      statusCode: status,
      message, // string or string[] for validation errors
      ...(code ? { code } : {}),
      data: null,
    });
  }
}
