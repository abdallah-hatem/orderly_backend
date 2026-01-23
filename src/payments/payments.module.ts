import { Module } from '@nestjs/common';
import { PaymentsRepository } from './repositories/payments.repository';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptsModule } from '../receipts/receipts.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [ReceiptsModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsRepository, PaymentsService, PrismaService],
  exports: [PaymentsRepository], // Maybe export service too if needed elsewhere?
})
export class PaymentsModule {}
