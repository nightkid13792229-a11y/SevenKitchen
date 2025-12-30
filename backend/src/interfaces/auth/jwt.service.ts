/**
 * JWT Service
 * Handles JWT token generation and validation
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';

export interface JwtPayload {
  userId: string;
  customerId: string;
  role: string;
}

@Injectable()
export class JwtAuthService {
  constructor(private readonly jwtService: NestJwtService) {}

  /**
   * Generate JWT token for a customer
   * @deprecated Use generateTokenForUser instead
   */
  generateToken(customerId: string): string {
    const payload: JwtPayload = { userId: customerId, customerId, role: 'CUSTOMER' };
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const secret = this.getSecret();

    return this.jwtService.sign(payload, {
      secret,
      expiresIn,
    } as any);
  }

  /**
   * Generate JWT token for a user with role
   */
  generateTokenForUser(userId: string, role: string): string {
    const payload: JwtPayload = {
      userId,
      customerId: userId, // For backward compatibility
      role,
    };
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const secret = this.getSecret();

    return this.jwtService.sign(payload, {
      secret,
      expiresIn,
    } as any);
  }

  /**
   * Validate and decode JWT token
   * @throws UnauthorizedException if token is invalid or expired
   */
  validateToken(token: string): JwtPayload {
    try {
      const secret = this.getSecret();
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret,
      });

      if (!payload.userId || typeof payload.userId !== 'string') {
        throw new UnauthorizedException('Invalid token payload');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Get JWT secret from environment or use fallback for dev
   */
  private getSecret(): string {
    return process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
  }
}
