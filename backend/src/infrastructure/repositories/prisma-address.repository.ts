import { Injectable } from '@nestjs/common';
import { Prisma, Address as PrismaAddress } from '@prisma/client';
import type { AddressRepository } from '../../domain/address/address.repository';
import { Address, AddressRegion } from '../../domain/address/address.entity';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaAddressRepository implements AddressRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Address | null> {
    const record = await this.prisma.address.findUnique({
      where: { id },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async findByUserId(userId: string): Promise<Address[]> {
    const records = await this.prisma.address.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async save(address: Address): Promise<Address> {
    const existing = await this.prisma.address.findUnique({
      where: { id: address.id },
      select: { id: true },
    });

    const data: Prisma.AddressUncheckedCreateInput = {
      id: address.id,
      userId: address.userId,
      recipientName: address.recipientName,
      phone: address.phone,
      region: address.region as unknown as Prisma.InputJsonValue,
      detail: address.detail,
      isDefault: address.isDefault,
    };

    if (!existing) {
      await this.prisma.address.create({ data });
    } else {
      await this.prisma.address.update({
        where: { id: address.id },
        data,
      });
    }

    const saved = await this.prisma.address.findUnique({
      where: { id: address.id },
    });
    return saved ? this.mapToDomain(saved) : address;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.address.delete({ where: { id } });
  }

  private mapToDomain(record: PrismaAddress): Address {
    return new Address(
      record.id,
      record.userId,
      record.recipientName,
      record.phone,
      record.region as unknown as AddressRegion,
      record.detail,
      record.isDefault ?? false,
    );
  }
}


