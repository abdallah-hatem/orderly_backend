import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { OrdersRepository } from './repositories/orders.repository';
import { CreateOrderDto, AddItemsToOrderDto } from './dto/orders.dto';
import { RestaurantsRepository } from '../restaurants/repositories/restaurants.repository';
import { OrderStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { GroupsService } from '../groups/groups.service';

@Injectable()
export class OrdersService {
  constructor(
    private repository: OrdersRepository,
    private restaurantsRepository: RestaurantsRepository,
    private notificationsService: NotificationsService,
    private groupsService: GroupsService,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const activeOrder = await this.repository.findActiveGroupByOrder(dto.groupId);
    if (activeOrder) {
      throw new BadRequestException('Group already has an active order');
    }
    
    // Fetch group to get name and members
    const group = await this.groupsService.findById(dto.groupId);
    const restaurant = await this.restaurantsRepository.findById(dto.restaurantId);

    const order = await this.repository.create({
      groupId: dto.groupId,
      restaurantId: dto.restaurantId,
      initiatorId: userId,
      status: OrderStatus.OPEN,
    });

    // Send notifications to all group members except the initiator
    try {
      // Need to fetch members with user info. GroupsService.findById already includes members?
      // Yes, repository inclusion: include: { members: { include: { user: ... } } }
      
      const pushTokens: string[] = [];
      const members = (group as any).members || [];
      
      for (const member of members) {
        if (member.user?.id !== userId && member.user?.expoPushToken) {
          pushTokens.push(member.user.expoPushToken);
        }
      }

      if (pushTokens.length > 0 && restaurant) {
        await this.notificationsService.sendPushNotification(
          pushTokens,
          'New Order Started!',
          `${group.name} is ordering from ${restaurant.name}. Join now!`,
          { orderId: order.id, groupId: dto.groupId, type: 'NEW_ORDER' }
        );
      }
    } catch (error) {
      console.error('Failed to send order notifications', error);
    }

    return order;
  }

  async findById(id: string) {
    const order = await this.repository.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async addItems(orderId: string, userId: string, dto: AddItemsToOrderDto) {
    const order = await this.findById(orderId);
    if (order.status !== OrderStatus.OPEN) {
      throw new BadRequestException('Order is no longer open');
    }

    const restaurant = await this.restaurantsRepository.findById(order.restaurantId);
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    // Flatten menu items for easy lookup
    const menuItemsMap = new Map();
    restaurant.categories.forEach(cat => {
        cat.items.forEach(item => {
            menuItemsMap.set(item.id, item);
        });
    });

    const preparedItems = dto.items.map(itemDto => {
        const menuItem = menuItemsMap.get(itemDto.menuItemId);
        if (!menuItem) throw new BadRequestException(`Menu item ${itemDto.menuItemId} not found`);

        let price = menuItem.basePrice;
        if (itemDto.variantId) {
            const variant = menuItem.variants.find((v: any) => v.id === itemDto.variantId);
            if (!variant) throw new BadRequestException(`Variant ${itemDto.variantId} not found`);
            price += variant.priceDiff;
        }

        const preparedAddons = (itemDto.addons || []).map(addonDto => {
            const addon = menuItem.addons.find((a: any) => a.id === addonDto.addonId);
            if (!addon) throw new BadRequestException(`Addon ${addonDto.addonId} not found`);
            return {
                addonId: addon.id,
                priceAtOrder: addon.price
            };
        });

        return {
            ...itemDto,
            priceAtOrder: price,
            addons: preparedAddons
        };
    });

    return this.repository.addItems(orderId, userId, preparedItems);
  }

  async closeOrder(id: string, userId: string) {
    const order = await this.findById(id);
    if (order.initiatorId !== userId) {
      throw new BadRequestException('Only the initiator can close the order');
    }
    return this.repository.updateStatus(id, OrderStatus.CLOSED);
  }

  async cancelOrder(id: string, userId: string) {
    const order = await this.findById(id);
    if (order.initiatorId !== userId) {
      throw new BadRequestException('Only the initiator can cancel the order');
    }
    return this.repository.updateStatus(id, OrderStatus.CANCELLED);
  }

  async removeItem(orderId: string, itemId: string, userId: string) {
    const order = await this.findById(orderId);
    if (order.status !== OrderStatus.OPEN) {
      throw new BadRequestException('Order is no longer open');
    }

    const item = order.items.find((i: any) => i.id === itemId);
    if (!item) {
      throw new NotFoundException('Item not found in this order');
    }

    if (item.userId !== userId && order.initiatorId !== userId) {
      throw new BadRequestException('Not authorized to remove this item');
    }

    console.log(`[OrderService] Removing item ${itemId} (User: ${item.userId}) from order ${orderId}`);
    return this.repository.removeItem(itemId);
  }

  async findUserOrders(userId: string) {
    return this.repository.findUserOrders(userId);
  }
}
