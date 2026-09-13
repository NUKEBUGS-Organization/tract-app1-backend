import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Preflight OPTIONS must not be throttled — browsers send it before POST with credentials. */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ method?: string }>();
    if (req.method === 'OPTIONS') {
      return Promise.resolve(true);
    }
    return super.canActivate(context) as Promise<boolean>;
  }
}
