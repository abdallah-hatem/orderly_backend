import { Injectable, NotFoundException } from '@nestjs/common';
import { ReceiptsRepository } from './repositories/receipts.repository';
import { OrdersService } from '../orders/orders.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReceiptsService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(
    private repository: ReceiptsRepository,
    private ordersService: OrdersService,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    }
  }

  async uploadAndParse(orderId: string, imageUrl: string) {
    const order = await this.ordersService.findById(orderId);
    
    let parsedResult;
    if (this.model) {
      try {
        parsedResult = await this.callGemini(imageUrl);
      } catch (error) {
        console.error('Gemini parsing failed, falling back to stub:', error);
        parsedResult = await this.callGeminiStub(imageUrl);
      }
    } else {
      console.warn('GEMINI_API_KEY not found, using stub');
      parsedResult = await this.callGeminiStub(imageUrl);
    }

    const receiptData = {
      orderId,
      imageUrl,
      rawParsedData: parsedResult as any,
      subtotal: Number(parsedResult.subtotal) || 0,
      tax: Number(parsedResult.tax) || 0,
      serviceFee: Number(parsedResult.serviceFee) || 0,
      deliveryFee: Number(parsedResult.deliveryFee) || 0,
      totalAmount: Number(parsedResult.total) || 0,
    };

    let receipt = await this.repository.findByOrderId(orderId);

    if (receipt) {
        receipt = await this.repository.update(receipt.id, receiptData);
    } else {
        receipt = await this.repository.create(receiptData);
    }

    const { splitResults } = this.calculateSplit(order, receipt);

    return {
      receipt,
      split: splitResults,
    };
  }

  private async callGemini(imageUrl: string) {
    const prompt = `
      Analyze this receipt image and return a JSON object with the following structure:
      {
        "subtotal": number,
        "tax": number,
        "serviceFee": number,
        "deliveryFee": number,
        "total": number,
        "items": [
          { "name": string, "price": number, "quantity": number }
        ]
      }
      Rules:
      1. If a field is missing, set it to 0.
      2. Return ONLY the raw JSON object, no markdown formatting (no \`\`\`json blocks).
      3. Ensure all numbers are valid floats.
    `;

    try {
      let imageParts: any;

      if (imageUrl.startsWith('data:')) {
        const [mime, base64] = imageUrl.split(';base64,');
        imageParts = {
          inlineData: {
            data: base64,
            mimeType: mime.split(':')[1],
          },
        };
      } else {
        // Fetch remote image
        const response = await fetch(imageUrl);
        const buffer = await response.arrayBuffer();
        imageParts = {
          inlineData: {
            data: Buffer.from(buffer).toString('base64'),
            mimeType: response.headers.get('content-type') || 'image/jpeg',
          },
        };
      }

      const result = await this.model.generateContent([prompt, imageParts]);
      const response = await result.response;
      const text = response.text().trim();
      
      // Clean potential markdown if it slipped through
      const jsonStr = text.startsWith('{') ? text : text.match(/\{[\s\S]*\}/)?.[0];
      if (!jsonStr) throw new Error('No valid JSON found in Gemini response');
      
      return JSON.parse(jsonStr);
    } catch (error) {
      throw error;
    }
  }

  private async callGeminiStub(imageUrl: string) {
    // This is a stub for the actual Gemini API call
    return {
      subtotal: 100,
      tax: 10,
      serviceFee: 5,
      deliveryFee: 5,
      total: 120,
      items: [
        { name: 'Burger', price: 50, quantity: 2 },
      ]
    };
  }

  calculateSplit(order: any, receipt: any) {
    const orderItems = order.items;
    
    // Check if we have manual overrides for individual item prices
    const itemOverrides = (receipt.rawParsedData as any)?.individualItemOverrides || {};

    // Group items by user
    const userSplitMap = new Map();

    // Initialize map with all users who have items
    orderItems.forEach((item: any) => {
        if (!userSplitMap.has(item.userId)) {
            userSplitMap.set(item.userId, {
                userId: item.userId,
                userName: item.user.name,
                items: [],
                itemsTotal: 0,
                sharedCostPortion: 0,
                total: 0
            });
        }
        
        // Use override if exists, otherwise use original price
        const originalItemPrice = (item.priceAtOrder * item.quantity) + 
                                  item.addons.reduce((aSum: number, a: any) => aSum + a.priceAtOrder, 0);
        
        const priceToUse = itemOverrides[item.id] !== undefined ? Number(itemOverrides[item.id]) : originalItemPrice;
        
        userSplitMap.get(item.userId).items.push({
            id: item.id,
            name: item.menuItem?.name || item.customItemName || 'Unnamed Item',
            quantity: item.quantity,
            originalPrice: originalItemPrice,
            currentPrice: priceToUse
        });

        userSplitMap.get(item.userId).itemsTotal += priceToUse;
    });

    // If orderItems is empty, include all group members to allow splitting fees equally
    if (userSplitMap.size === 0 && order.group?.members) {
        order.group.members.forEach((m: any) => {
            userSplitMap.set(m.user.id, {
                userId: m.user.id,
                userName: m.user.name,
                items: [],
                itemsTotal: 0,
                sharedCostPortion: 0,
                total: 0
            });
        });
    }

    // Subtotal should be the sum of all item prices after overrides
    const newSubtotal = Array.from(userSplitMap.values()).reduce((sum: number, u: any) => sum + u.itemsTotal, 0);

    const sharedCosts = receipt.tax + receipt.serviceFee + receipt.deliveryFee;
    const sharedCostPerPerson = sharedCosts / (userSplitMap.size || 1);

    const splitResults = Array.from(userSplitMap.values()).map((userSplit: any) => {
        userSplit.sharedCostPortion = sharedCostPerPerson;
        userSplit.total = userSplit.itemsTotal + userSplit.sharedCostPortion;
        return userSplit;
    });

    return {
        splitResults,
        calculatedSubtotal: newSubtotal
    };
  }

  async updateReceipt(id: string, updates: { subtotal?: number; tax: number; serviceFee: number; deliveryFee: number; individualItemOverrides?: Record<string, number> }) {
    const receipt = await this.repository.findById(id);
    if (!receipt) throw new NotFoundException('Receipt not found');

    // Merge or set item overrides into rawParsedData
    const currentData = (receipt.rawParsedData as any) || {};
    const newData = {
        ...currentData,
        individualItemOverrides: updates.individualItemOverrides || currentData.individualItemOverrides || {}
    };

    // Calculate subtotal from overrides if provided, otherwise use existing
    const order = await this.ordersService.findById(receipt.orderId);
    
    // Temporarily update receipt object for calculation
    const calcReceipt = { ...receipt, rawParsedData: newData, tax: updates.tax, serviceFee: updates.serviceFee, deliveryFee: updates.deliveryFee };
    const { splitResults, calculatedSubtotal } = this.calculateSplit(order, calcReceipt);

    const finalSubtotal = updates.subtotal !== undefined ? updates.subtotal : calculatedSubtotal;
    const newTotal = finalSubtotal + updates.tax + updates.serviceFee + updates.deliveryFee;

    const updatedReceipt = await this.repository.update(id, {
      tax: updates.tax,
      serviceFee: updates.serviceFee,
      deliveryFee: updates.deliveryFee,
      subtotal: finalSubtotal,
      totalAmount: newTotal,
      rawParsedData: newData as any
    });

    return {
      receipt: updatedReceipt,
      split: splitResults,
    };
  }

  async findByOrderId(orderId: string) {
    return this.repository.findByOrderId(orderId);
  }

  async createManual(orderId: string) {
    const order = await this.ordersService.findById(orderId);
    
    // Calculate current subtotal from order items
    const subtotal = order.items.reduce((sum: number, item: any) => {
        const itemTotal = item.priceAtOrder * item.quantity;
        const addonsTotal = item.addons.reduce((aSum: number, a: any) => aSum + a.priceAtOrder, 0);
        return sum + itemTotal + addonsTotal;
    }, 0);

    const receiptData = {
      orderId,
      imageUrl: '', // Blank for manual
      subtotal,
      tax: 0,
      serviceFee: 0,
      deliveryFee: 0,
      totalAmount: subtotal,
    };

    let receipt = await this.repository.findByOrderId(orderId);
    if (receipt) {
        receipt = await this.repository.update(receipt.id, receiptData);
    } else {
        receipt = await this.repository.create(receiptData);
    }

    const { splitResults } = this.calculateSplit(order, receipt);

    return {
      receipt,
      split: splitResults,
    };
  }
}
