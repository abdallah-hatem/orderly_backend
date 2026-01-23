import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrdersService } from '../orders/orders.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private ordersService: OrdersService,
  ) {}

  @Get('search')
  search(@Query('q') query: string) {
    if (!query || query.length < 2) return [];
    return this.usersService.search(query);
  }

  @Get('me/orders')
  async findMyOrders(@Request() req: any) {
    return this.ordersService.findUserOrders(req.user.userId);
  }
}
