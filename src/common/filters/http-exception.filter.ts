import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
  } from '@nestjs/common';
  import { Request, Response } from 'express';

  /** Mongoose errors that are really bad client input, not server faults. */
  function mapMongooseError(
    exception: unknown,
  ): { status: number; message: string } | null {
    const e = exception as { name?: string; path?: string; code?: number };
    if (e?.name === 'CastError') {
      return { status: HttpStatus.BAD_REQUEST, message: `Invalid ${e.path ?? 'id'}` };
    }
    if (e?.name === 'ValidationError') {
      return { status: HttpStatus.BAD_REQUEST, message: 'Validation failed' };
    }
    if (e?.code === 11000) {
      return { status: HttpStatus.CONFLICT, message: 'Duplicate value' };
    }
    return null;
  }

  @Catch()
  export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('HttpExceptionFilter');

    catch(exception: unknown, host: ArgumentsHost) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      const request = ctx.getRequest<Request>();

      const mongo = mapMongooseError(exception);

      const status = mongo
        ? mongo.status
        : exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;

      // Never swallow unexpected errors silently — log them with the route + stack
      // so 500s are debuggable in production.
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        const err = exception as Error;
        this.logger.error(
          `${request?.method} ${request?.url} → ${status}: ${err?.message ?? exception}`,
          err?.stack,
        );
      }
  
      const exceptionResponse = mongo
        ? mongo.message
        : exception instanceof HttpException
          ? exception.getResponse()
          : 'Internal server error';

      // ValidationPipe errors come as an array in exceptionResponse.message
      const message =
        typeof exceptionResponse === 'object' && 'message' in (exceptionResponse as object)
          ? (exceptionResponse as any).message
          : exceptionResponse;
  
      response.status(status).json({
        success: false,
        statusCode: status,
        message,   // string or string[] for validation errors
        data: null,
      });
    }
  }