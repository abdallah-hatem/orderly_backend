import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsRepository } from './repositories/restaurants.repository';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsService, RestaurantsRepository, PrismaService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
