/**
 * Auth Guard
 * Validates JWT Bearer token or X-Customer-Id header and attaches user to request
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

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtAuthService: JwtAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: { [key: string]: string | string[] | undefined };
      user?: RequestUser;
    }>();

    let customerId: string | undefined;

    // Priority 1: Check Authorization Bearer token
    const authHeader = request.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (bearerMatch && bearerMatch[1]) {
        try {
          const payload = this.jwtAuthService.validateToken(bearerMatch[1]);
          customerId = payload.customerId;
        } catch (error) {
          throw new UnauthorizedException('Invalid token');
        }
      }
    }

    // Priority 2: Fallback to X-Customer-Id header (backward compatibility)
    if (!customerId) {
      const headerCustomerId = request.headers['x-customer-id'];
      if (
        headerCustomerId &&
        typeof headerCustomerId === 'string' &&
        headerCustomerId.trim() !== ''
      ) {
        customerId = headerCustomerId.trim();
      }
    }

    // If neither method provided valid customerId, throw error
    if (!customerId) {
      throw new UnauthorizedException('Unauthorized');
    }

    // Attach user to request
    const user: RequestUser = {
      customerId,
    };
    request.user = user;

    return true;
  }
}
