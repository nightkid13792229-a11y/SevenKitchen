import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestUser } from '../auth/request-user.interface';

/**
 * 角色守卫装饰器 - 标记接口需要的角色
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => {
  return (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata(ROLES_KEY, roles, descriptor.value);
    return descriptor;
  };
};

/**
 * Staff角色守卫
 * 允许STAFF和ADMIN角色访问
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 获取装饰器指定的角色（如果有）
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 如果没有指定角色，默认检查是否为STAFF或ADMIN
    const allowedRoles = requiredRoles || ['STAFF', 'ADMIN'];

    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    if (!user) {
      throw new ForbiddenException('未登录');
    }

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('需要员工权限');
    }

    return true;
  }
}

/**
 * Admin角色守卫
 * 仅允许ADMIN角色访问
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    if (!user) {
      throw new ForbiddenException('未登录');
    }

    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('需要管理员权限');
    }

    return true;
  }
}
