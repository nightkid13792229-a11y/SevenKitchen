/**
 * Auth Guard
 * Validates JWT Bearer token (or, in development only, X-Customer-Id header)
 * Priority: Authorization Bearer token > X-Customer-Id header
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestUser } from './request-user.interface';
import { JwtAuthService } from './jwt.service';
import { isDevAuthEnabled } from './dev-auth';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtAuthService: JwtAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: { [key: string]: string | string[] | undefined };
      user?: RequestUser;
    }>();

    let userId: string | undefined;
    let customerId: string | undefined;
    let role: string = 'CUSTOMER'; // Default role

    // Priority 1: Check Authorization Bearer token
    const authHeader = request.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (bearerMatch && bearerMatch[1]) {
        try {
          const payload = this.jwtAuthService.validateToken(bearerMatch[1]);
          userId = payload.userId;
          customerId = payload.customerId;
          role = payload.role;
        } catch (error) {
          throw new UnauthorizedException('Invalid token');
        }
      }
    }

    // Priority 2: X-Customer-Id 兜底 —— 仅开发环境可用。
    //
    // ⚠️ 这是一条身份后门：不需要任何令牌，只要把请求头填成某个用户的 ID 就能冒充他。
    // 角色固定为 CUSTOMER（不能提权到管理员），但足以读写该用户的订单、地址、狗狗等数据。
    // 因此只在显式开启 ALLOW_DEV_AUTH=true 时生效，默认关闭（详见 dev-auth.ts）。
    if (!userId && isDevAuthEnabled()) {
      const headerCustomerId = request.headers['x-customer-id'];
      if (
        headerCustomerId &&
        typeof headerCustomerId === 'string' &&
        headerCustomerId.trim() !== ''
      ) {
        userId = headerCustomerId.trim();
        customerId = headerCustomerId.trim();
      }
    }

    // If neither method provided valid ID, throw error
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    // Attach user to request
    const user: RequestUser = {
      userId,
      customerId: customerId || userId,
      role,
    };
    request.user = user;

    return true;
  }
}
