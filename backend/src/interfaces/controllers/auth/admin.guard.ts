/**
 * Admin Guard
 * Ensures only users with ADMIN role can access the route
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('未登录');
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('需要管理员权限');
    }

    return true;
  }
}
