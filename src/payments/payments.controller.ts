import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('orders/:orderId/payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  recordPayments(@Param('orderId') orderId: string, @Body() body: { payments: { userId: string; amount: number }[] }) {
    return this.paymentsService.recordPayments(orderId, body.payments);
  }

  @Get('settlement')
  getSettlement(@Param('orderId') orderId: string) {
    return this.paymentsService.calculateSettlement(orderId);
  }
}
