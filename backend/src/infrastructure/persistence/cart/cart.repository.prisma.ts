/**
 * Prisma Implementation of CartRepository
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Cart, CartItem } from '../../../domain/cart';
import type { CartRepository } from '../../../domain/cart';

@Injectable()
export class PrismaCartRepository implements CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCustomerId(customerId: string): Promise<Cart> {
    // Find or create cart
    let cart = await this.prisma.cart.findUnique({
      where: { customerId },
      include: { items: true },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          customerId,
        },
        include: { items: true },
      });
    }

    return new Cart(
      cart.id,
      cart.customerId,
      cart.items.map(item => this.mapToEntity(item)),
      cart.createdAt,
      cart.updatedAt,
    );
  }

  async findItemById(itemId: string): Promise<CartItem | null> {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return null;
    }

    return this.mapToEntity(item);
  }

  async addItem(
    customerId: string,
    itemData: Omit<CartItem, 'id' | 'cartId' | 'createdAt'>,
  ): Promise<CartItem> {
    // Get cart
    const cart = await this.prisma.cart.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });

    // Check if item with same dog+recipe+cycle exists
    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_dogId_recipeId_cycleDays: {
          cartId: cart.id,
          dogId: itemData.dogId,
          recipeId: itemData.recipeId,
          cycleDays: itemData.cycleDays,
        },
      },
    });

    if (existingItem) {
      // Update existing item
      const updated = await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          dailyIntakeG: itemData.dailyIntakeG,
          totalGrams: itemData.totalGrams,
          packageCount: itemData.packageCount,
          packageSpecG: itemData.packageSpecG,
          unitPrice: itemData.unitPrice,
          totalPrice: itemData.totalPrice,
          preparationMethod: itemData.preparationMethod,
          cookingMethod: itemData.cookingMethod,
        },
      });

      return this.mapToEntity(updated);
    }

    // Create new item
    const created = await this.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        dogId: itemData.dogId,
        recipeId: itemData.recipeId,
        cycleDays: itemData.cycleDays,
        dailyIntakeG: itemData.dailyIntakeG,
        totalGrams: itemData.totalGrams,
        packageCount: itemData.packageCount,
        packageSpecG: itemData.packageSpecG,
        unitPrice: itemData.unitPrice,
        totalPrice: itemData.totalPrice,
        preparationMethod: itemData.preparationMethod,
        cookingMethod: itemData.cookingMethod,
      },
    });

    return this.mapToEntity(created);
  }

  async removeItem(itemId: string): Promise<void> {
    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });
  }

  async clearCart(customerId: string): Promise<void> {
    const cart = await this.prisma.cart.findUnique({
      where: { customerId },
    });

    if (cart) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }
  }

  async findItemsByIds(itemIds: string[]): Promise<CartItem[]> {
    const items = await this.prisma.cartItem.findMany({
      where: {
        id: { in: itemIds },
      },
    });

    return items.map(item => this.mapToEntity(item));
  }

  private mapToEntity(prismaItem: any): CartItem {
    return new CartItem(
      prismaItem.id,
      prismaItem.cartId,
      prismaItem.dogId,
      prismaItem.recipeId,
      prismaItem.cycleDays,
      prismaItem.dailyIntakeG,
      prismaItem.totalGrams,
      prismaItem.packageCount,
      prismaItem.packageSpecG,
      prismaItem.unitPrice.toNumber(),
      prismaItem.totalPrice.toNumber(),
      prismaItem.preparationMethod,
      prismaItem.cookingMethod,
      prismaItem.createdAt,
    );
  }
}
