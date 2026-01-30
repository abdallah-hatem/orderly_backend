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
    const restaurant = dto.restaurantId ? await this.restaurantsRepository.findById(dto.restaurantId) : null;

    const order = await this.repository.create({
      groupId: dto.groupId,
      restaurantId: dto.restaurantId as string | undefined,
      customRestaurantName: dto.customRestaurantName as string | undefined,
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

      if (pushTokens.length > 0) {
        const restaurantName = restaurant?.name || dto.customRestaurantName || 'a restaurant';
        await this.notificationsService.sendPushNotification(
          pushTokens,
          'New Order Started!',
          `${group.name} is ordering from ${restaurantName}. Join now!`,
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

    const restaurant = order.restaurantId ? await this.restaurantsRepository.findById(order.restaurantId) : null;

    // Flatten menu items for easy lookup if we have a restaurant
    const menuItemsMap = new Map();
    if (restaurant) {
        restaurant.categories.forEach(cat => {
            cat.items.forEach(item => {
                menuItemsMap.set(item.id, item);
            });
        });
    }

    const preparedItems = dto.items.map(itemDto => {
        if (!itemDto.menuItemId) {
            // Manual item entry
            return {
                ...itemDto,
                priceAtOrder: itemDto.priceAtOrder || 0,
                customItemName: itemDto.customItemName || 'Unnamed Item',
                addons: [] // Custom items don't support predefined addons yet
            };
        }

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

    // Get unique user IDs who have items in the order
    const memberIds = [...new Set(order.items.map((item: any) => item.userId))];
    
    // Get push tokens for members (excluding initiator)
    const pushTokens: string[] = [];
    for (const item of order.items) {
      const user = (item as any).user;
      if (user?.id !== userId && user?.expoPushToken && !pushTokens.includes(user.expoPushToken)) {
        pushTokens.push(user.expoPushToken);
      }
    }

    // Send notifications
    try {
      if (pushTokens.length > 0) {
        console.log(`[CloseOrder] Sending ORDER_SPLIT notifications to ${pushTokens.length} members`);
        console.log('[CloseOrder] Push tokens:', pushTokens);
        await this.notificationsService.sendPushNotification(
          pushTokens,
          'Bill Split Ready! 💰',
          'The bill has been split. Check your share!',
          { 
            type: 'ORDER_SPLIT',
            orderId: id,
            navigateTo: 'History'
          }
        );
        console.log('[CloseOrder] Notifications sent successfully');
      } else {
        console.log('[CloseOrder] No push tokens found, no notifications sent');
      }
    } catch (error) {
      console.error('Failed to send split notifications', error);
    }


    return this.repository.updateStatus(id, OrderStatus.SPLITTING);
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

  async finalizeOrder(id: string, userId: string) {
    const order = await this.findById(id);
    
    // Only initiator can finalize
    if (order.initiatorId !== userId) {
      throw new BadRequestException('Only order creator can finalize');
    }
    
    if (order.status !== OrderStatus.SPLITTING) {
      throw new BadRequestException('Order must be in SPLITTING status');
    }
    
    return this.repository.updateStatus(id, OrderStatus.CLOSED);
  }
}
