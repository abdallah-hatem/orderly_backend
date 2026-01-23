import { Injectable, NotFoundException } from '@nestjs/common';
import { RestaurantsRepository } from './repositories/restaurants.repository';

@Injectable()
export class RestaurantsService {
  constructor(private repository: RestaurantsRepository) {}

  async findAll() {
    return this.repository.findAll();
  }

  async findById(id: string) {
    const restaurant = await this.repository.findById(id);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }
}
