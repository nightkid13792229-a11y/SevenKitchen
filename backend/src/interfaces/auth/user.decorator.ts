/**
 * User Decorator
 * 从Request中提取当前用户信息的装饰器
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from './request-user.interface';

/**
 * 获取当前登录用户
 * @usage
 * @Get()
 * async getData(@User() user: RequestUser) {
 *   console.log(user.userId);
 * }
 */
export const User = createParamDecorator(
  (
    data: keyof RequestUser | undefined,
    ctx: ExecutionContext,
  ): RequestUser | any => {
    const request = ctx.switchToHttp().getRequest<{
      user?: RequestUser;
    }>();

    const user = request.user;

    if (!user) {
      throw new Error(
        'User not found in request. Make sure AuthGuard is applied.',
      );
    }

    // 如果指定了字段名，返回具体字段值
    if (data) {
      return user[data];
    }

    // 否则返回整个用户对象
    return user;
  },
);

/**
 * 获取当前用户ID的快捷装饰器
 * @usage
 * @Get()
 * async getData(@UserId() userId: string) {
 *   console.log(userId);
 * }
 */
export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{
      user?: RequestUser;
    }>();

    const user = request.user;

    if (!user) {
      throw new Error(
        'User not found in request. Make sure AuthGuard is applied.',
      );
    }

    return user.userId;
  },
);

/**
 * 获取当前用户角色的快捷装饰器
 * @usage
 * @Get()
 * async getData(@UserRole() role: string) {
 *   console.log(role);
 * }
 */
export const UserRole = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{
      user?: RequestUser;
    }>();

    const user = request.user;

    if (!user) {
      throw new Error(
        'User not found in request. Make sure AuthGuard is applied.',
      );
    }

    return user.role;
  },
);
