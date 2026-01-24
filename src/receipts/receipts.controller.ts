import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('receipts')
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  constructor(private receiptsService: ReceiptsService) {}

  @Get('order/:orderId')
  findByOrderId(@Param('orderId') orderId: string) {
    return this.receiptsService.findByOrderId(orderId);
  }

  @Post(':orderId')
  upload(@Param('orderId') orderId: string, @Body('imageUrl') imageUrl: string) {
    return this.receiptsService.uploadAndParse(orderId, imageUrl);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { subtotal?: number; tax: number; serviceFee: number; deliveryFee: number; individualItemOverrides?: Record<string, number> }) {
    return this.receiptsService.updateReceipt(id, body);
  }

  @Post(':orderId/manual')
  createManual(@Param('orderId') orderId: string) {
    return this.receiptsService.createManual(orderId);
  }
}
