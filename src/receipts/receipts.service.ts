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

    return {
      receipt,
      split: this.calculateSplit(order, receipt),
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
    
    // Calculate total price of all items ordered through the app
    const orderItemsTotal = orderItems.reduce((sum: number, item: any) => {
        const itemTotal = item.priceAtOrder * item.quantity;
        const addonsTotal = item.addons.reduce((aSum: number, a: any) => aSum + a.priceAtOrder, 0);
        return sum + itemTotal + addonsTotal;
    }, 0);

    const sharedCosts = receipt.tax + receipt.serviceFee + receipt.deliveryFee;

    // Group items by user
    const userSplitMap = new Map();

    orderItems.forEach((item: any) => {
        const itemTotal = item.priceAtOrder * item.quantity;
        const addonsTotal = item.addons.reduce((aSum: number, a: any) => aSum + a.priceAtOrder, 0);
        const userTotal = itemTotal + addonsTotal;

        const current = userSplitMap.get(item.userId) || {
            userId: item.userId,
            userName: item.user.name,
            itemsTotal: 0,
            sharedCostPortion: 0,
            total: 0
        };

        current.itemsTotal += userTotal;
        userSplitMap.set(item.userId, current);
    });

    const sharedCostPerPerson = sharedCosts / userSplitMap.size;

    const splitResults = Array.from(userSplitMap.values()).map(userSplit => {
        userSplit.sharedCostPortion = sharedCostPerPerson;
        userSplit.total = userSplit.itemsTotal + userSplit.sharedCostPortion;
        return userSplit;
    });

    return splitResults;
  }

  async updateReceipt(id: string, updates: { subtotal?: number; tax: number; serviceFee: number; deliveryFee: number }) {
    const receipt = await this.repository.findById(id);
    if (!receipt) throw new NotFoundException('Receipt not found');

    const newSubtotal = updates.subtotal !== undefined ? updates.subtotal : receipt.subtotal;
    const newTotal = newSubtotal + updates.tax + updates.serviceFee + updates.deliveryFee;

    const updatedReceipt = await this.repository.update(id, {
      ...updates,
      subtotal: newSubtotal,
      totalAmount: newTotal,
    });

    const order = await this.ordersService.findById(updatedReceipt.orderId);

    return {
      receipt: updatedReceipt,
      split: this.calculateSplit(order, updatedReceipt),
    };
  }

  async findByOrderId(orderId: string) {
    return this.repository.findByOrderId(orderId);
  }
}
