import { Body, Controller, Get, Param, Post, Put, Delete, UseGuards, Request } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, AddItemsToOrderDto } from './dto/orders.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(req.user.userId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @Post(':id/items')
  addItems(@Param('id') id: string, @Request() req: any, @Body() dto: AddItemsToOrderDto) {
    return this.ordersService.addItems(id, req.user.userId, dto);
  }

  @Put(':id/close')
  close(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.closeOrder(id, req.user.userId);
  }

  @Put(':id/cancel')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.cancelOrder(id, req.user.userId);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req: any) {
    return this.ordersService.removeItem(id, itemId, req.user.userId);
  }

  @Put(':id/finalize')
  finalize(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.finalizeOrder(id, req.user.userId);
  }
}
