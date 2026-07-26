import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, StandardResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((res) => {
        // Arrays must pass through as data — object destructure would turn them into {0,1,...}
        if (Array.isArray(res)) {
          return {
            success: true,
            statusCode: response.statusCode,
            message: 'Success',
            data: res,
          };
        }

        // If service returns { message, ...data }, extract message
        const { message, ...data } = res ?? {};

        return {
          success: true,
          statusCode: response.statusCode,
          message: message ?? 'Success',
          data: Object.keys(data).length ? data : null,
        };
      }),
    );
  }
}
