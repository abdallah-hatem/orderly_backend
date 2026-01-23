import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './repositories/orders.repository';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsRepository } from '../restaurants/repositories/restaurants.repository';

@Module({
  imports: [RestaurantsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, PrismaService, RestaurantsRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
