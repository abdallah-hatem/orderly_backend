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
    const order = await this.ordersService.findById(orderId);
    const receipt = await this.receiptsService.findByOrderId(orderId);
    
    if (!receipt) return { settlement: [] };

    // Get the target split (what everyone SHOULD pay)
    const split = this.receiptsService.calculateSplit(order, receipt); // [{ userId, userName, total }]
    
    // Get what everyone ACTUALLY paid
    const payments = await this.repository.findByOrderId(orderId); // [{ userId, amount }]
    
    // Calculate Balance
    // Balance = Paid - Owed
    // Positive = Creditor (paid too much)
    // Negative = Debtor (paid too little)
    
    const balances = split.map(s => {
        const paid = payments.find(p => p.userId === s.userId)?.amount || 0;
        return {
            userId: s.userId,
            userName: s.userName,
            owed: s.total,
            paid: paid,
            balance: paid - s.total
        };
    });

    const debtors = balances.filter(b => b.balance < -0.01).sort((a, b) => a.balance - b.balance); // Ascending (most negative first)
    const creditors = balances.filter(b => b.balance > 0.01).sort((a, b) => b.balance - a.balance); // Descending (most positive first)

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

    return {
        overall: balances,
        settlements
    };
  }
}
