import { Module } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsRepository } from './repositories/receipts.repository';
import { OrdersModule } from '../orders/orders.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [OrdersModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptsRepository, PrismaService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
