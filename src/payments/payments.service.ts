import { Injectable } from '@nestjs/common';
import { PaymentsRepository } from './repositories/payments.repository';
import { ReceiptsService } from '../receipts/receipts.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class PaymentsService {
  constructor(
    private repository: PaymentsRepository,
    private receiptsService: ReceiptsService,
    private ordersService: OrdersService,
  ) {}

  async recordPayments(orderId: string, payments: { userId: string; amount: number }[]) {
    // Delete existing payments for this order to allow re-submission (simple override)
    await this.repository.deleteByOrderId(orderId);
    return this.repository.createMany(orderId, payments);
  }

  async calculateSettlement(orderId: string) {
    console.log(`[PaymentsService] calculateSettlement start for ${orderId}`);
    const order = await this.ordersService.findById(orderId);
    console.log(`[PaymentsService] Order found: ${order.id}`);
    
    const receipt = await this.receiptsService.findByOrderId(orderId);
    if (!receipt) {
        console.log(`[PaymentsService] No receipt found for order ${orderId}`);
        return { overall: [], settlements: [] };
    }
    console.log(`[PaymentsService] Receipt found: ${receipt.id}`);

    // Get the target split (what everyone SHOULD pay)
    console.log(`[PaymentsService] Calculating split...`);
    const { splitResults } = this.receiptsService.calculateSplit(order, receipt); // [{ userId, userName, total }]
    console.log(`[PaymentsService] Split calculated. Users: ${splitResults.length}`);
    
    // Get what everyone ACTUALLY paid
    const payments = await this.repository.findByOrderId(orderId); // [{ userId, amount }]
    console.log(`[PaymentsService] Payments fetched. Count: ${payments.length}`);
    
    // Calculate Balance
    // Balance = Paid - Owed
    // Positive = Creditor (paid too much)
    // Negative = Debtor (paid too little)
    
    const balances = splitResults.map((s: any) => {
        const paid = payments.find(p => p.userId === s.userId)?.amount || 0;
        return {
            userId: s.userId,
            userName: s.userName,
            owed: s.total,
            paid: paid,
            balance: paid - s.total
        };
    });

    const debtors = balances.filter((b: any) => b.balance < -0.01).sort((a: any, b: any) => a.balance - b.balance); // Ascending (most negative first)
    const creditors = balances.filter((b: any) => b.balance > 0.01).sort((a: any, b: any) => b.balance - a.balance); // Descending (most positive first)

    const settlements = [];

    let i = 0; // debtor index
    let j = 0; // creditor index

    while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];

        const amount = Math.min(Math.abs(debtor.balance), creditor.balance);

        settlements.push({
            from: debtor.userName,
            to: creditor.userName,
            amount: Number(amount.toFixed(2))
        });

        debtor.balance += amount;
        creditor.balance -= amount;

        if (Math.abs(debtor.balance) < 0.01) i++;
        if (Math.abs(creditor.balance) < 0.01) j++;
    }

    console.log(`[PaymentsService] Settlement calculation done. Settlements: ${settlements.length}`);
    return {
        overall: balances,
        settlements
    };
  }
}
