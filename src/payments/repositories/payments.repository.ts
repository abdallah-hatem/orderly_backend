import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Payment, Prisma } from '@prisma/client';

@Injectable()
export class PaymentsRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.PaymentUncheckedCreateInput): Promise<Payment> {
    return this.prisma.payment.create({ data });
  }

  async findByOrderId(orderId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({ where: { orderId } });
  }

  async deleteByOrderId(orderId: string) {
    return this.prisma.payment.deleteMany({ where: { orderId } });
  }

  async createMany(orderId: string, payments: { userId: string; amount: number }[]) {
    return this.prisma.$transaction(
      payments.map(p => this.prisma.payment.create({
        data: {
          orderId,
          userId: p.userId,
          amount: p.amount
        }
      }))
    );
  }
}
