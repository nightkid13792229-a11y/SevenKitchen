/**
 * Cart Controller
 * REST API endpoints for cart operations
 */

import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CartService } from '../../application/cart/cart.service';
import type { AddToCartDto } from '../../application/cart/cart.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user.interface';
import { ApiResponseDto } from '../dto/common/response.dto';

@Controller('api/v1/cart')
@UseGuards(AuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * Get customer's cart
   * GET /api/v1/cart
   */
  @Get()
  async getCart(@CurrentUser() user: RequestUser) {
    const cart = await this.cartService.getCart(user.userId);
    return ApiResponseDto.success(cart);
  }

  /**
   * Add item to cart
   * POST /api/v1/cart/items
   */
  @Post('items')
  async addToCart(@CurrentUser() user: RequestUser, @Body() dto: AddToCartDto) {
    const item = await this.cartService.addToCart(user.userId, dto);
    return ApiResponseDto.success(item);
  }

  /**
   * Remove item from cart
   * DELETE /api/v1/cart/items/:itemId
   */
  @Delete('items/:itemId')
  async removeFromCart(@CurrentUser() user: RequestUser, @Param('itemId') itemId: string) {
    await this.cartService.removeFromCart(user.userId, itemId);
    return ApiResponseDto.success(null);
  }
}
