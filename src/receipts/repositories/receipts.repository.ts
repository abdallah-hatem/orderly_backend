import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Receipt, Prisma } from '@prisma/client';

@Injectable()
export class ReceiptsRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.ReceiptUncheckedCreateInput): Promise<Receipt> {
    return this.prisma.receipt.create({ data });
  }

  async findByOrderId(orderId: string): Promise<Receipt | null> {
    return this.prisma.receipt.findUnique({ where: { orderId } });
  }

  async findById(id: string): Promise<Receipt | null> {
    return this.prisma.receipt.findUnique({ where: { id } });
  }

  async update(id: string, data: Prisma.ReceiptUpdateInput): Promise<Receipt> {
    return this.prisma.receipt.update({
      where: { id },
      data,
    });
  }
}
