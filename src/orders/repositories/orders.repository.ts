import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Order, OrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class OrdersRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.OrderUncheckedCreateInput): Promise<Order> {
    return this.prisma.order.create({ data });
  }

  async findById(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            user: { select: { id: true, name: true, expoPushToken: true } },
            menuItem: true,
            variant: true,
            addons: {
              include: { addon: true }
            },
          },
        },
        group: {
          include: {
            members: {
              include: { user: { select: { id: true, name: true } } }
            }
          }
        },
        restaurant: true,
        receipt: true,
        payments: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async addItems(orderId: string, userId: string, items: any[]) {
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.orderItem.create({
          data: {
            orderId,
            userId,
            menuItemId: item.menuItemId,
            customItemName: item.customItemName,
            variantId: item.variantId,
            quantity: item.quantity,
            priceAtOrder: item.priceAtOrder,
            addons: {
              create: item.addons.map((a: any) => ({
                addonId: a.addonId,
                priceAtOrder: a.priceAtOrder,
              })),
            },
          },
        }),
      ),
    );
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return this.prisma.order.update({
      where: { id },
      data: { status },
    });
  }

  async findActiveGroupByOrder(groupId: string): Promise<Order | null> {
    return this.prisma.order.findFirst({
      where: {
        groupId,
        status: OrderStatus.OPEN,
      },
    });
  }

  async removeItem(itemId: string) {
    return this.prisma.orderItem.delete({
      where: { id: itemId },
    });
  }

  async findUserOrders(userId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        OR: [
          { initiatorId: userId },
          { items: { some: { userId } } },
          {
            group: {
              members: {
                some: {
                  userId,
                  status: 'ACCEPTED',
                },
              },
            },
          },
        ],
      },
      include: {
        restaurant: true,
        group: true,
        items: {
          where: { userId },
          include: {
            menuItem: true,
          }
        },
        receipt: true, // Useful for showing total cost context if needed
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
