import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
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

    // Extract unique ordered item names for Gemini context
    const orderedItemNames = Array.from(new Set(
      order.items.map((item: any) => item.menuItem?.name || item.customItemName || '')
    )).filter(name => name !== '');

    let parsedResult;
    if (this.model) {
      try {
        parsedResult = await this.callGemini(imageUrl, orderedItemNames);
      } catch (error) {
        console.error('Gemini parsing failed:', error);
        throw new InternalServerErrorException(`Failed to parse receipt: ${error.message || 'Unknown error'}`);
      }
    } else {
      throw new BadRequestException('Gemini API key not configured. Please check your environment variables.');
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

    // Auto-map prices from Gemini matches to specific order item IDs
    const currentOverrides: Record<string, number> = {};
    let hasNewOverrides = false;

    if (parsedResult.items && parsedResult.items.length > 0) {
      order.items.forEach((orderItem: any) => {
        const orderItemName = (orderItem.menuItem?.name || orderItem.customItemName || '').trim();

        // Find if Gemini matched this specific item name
        const match = parsedResult.items.find((gi: any) => gi.matchedName === orderItemName);

        if (match && match.totalPrice !== undefined) {
          currentOverrides[orderItem.id] = match.totalPrice;
          hasNewOverrides = true;
        }
      });
    }

    if (hasNewOverrides) {
      receipt = await this.repository.update(receipt.id, {
        rawParsedData: {
          ...receipt.rawParsedData as any,
          individualItemOverrides: currentOverrides
        } as any
      });
    }

    const { splitResults } = this.calculateSplit(order, receipt);

    return {
      receipt,
      split: splitResults,
    };
  }

  private async callGemini(imageUrl: string, orderedItems: string[]) {
    const itemsContext = orderedItems.length > 0
      ? `Here are the items that were actually ordered: [${orderedItems.join(', ')}].`
      : '';

    const prompt = `
      Analyze this receipt image and return a JSON object.
      ${itemsContext}

      Structure:
      {
        "subtotal": number,
        "tax": number,
        "serviceFee": number,
        "deliveryFee": number,
        "total": number,
        "items": [
          { 
            "matchedName": "EXACT item name from the ordered list OR null if no match",
            "totalPrice": number, 
            "quantity": number,
            "originalReceiptName": "The name as it appears on the physical receipt"
          }
        ]
      }

      Rules:
      1. If a field is missing, set it to 0.
      2. Return ONLY raw JSON, no markdown formatting.
      3. Match whatever you find on the receipt to the closest item in the ordered list provided. 
      4. Handle cross-language matching (e.g., if "Batates" is ordered and "بطاطس" is on the receipt, they match).
      5. For "totalPrice", return the TOTAL sum for that line item on the receipt (unit price * quantity).
      6. Match "matchedName" EXACTLY to one of the names in the provided ordered items list.
      7. If an item on the receipt DOES NOT match any ordered item, return it with "matchedName": null.
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

    // --- ADDED: Handle manual extra items from rawParsedData ---
    const manualExtraItems = (receipt.rawParsedData as any)?.manualExtraItems || [];
    manualExtraItems.forEach((extra: any) => {
      if (!userSplitMap.has(extra.userId)) {
        userSplitMap.set(extra.userId, {
          userId: extra.userId,
          userName: extra.userName || 'Unknown Member',
          items: [],
          itemsTotal: 0,
          sharedCostPortion: 0,
          total: 0
        });
      }

      const price = Number(extra.price) || 0;
      userSplitMap.get(extra.userId).items.push({
        id: `manual-${Date.now()}-${Math.random()}`,
        name: extra.name,
        quantity: 1,
        originalPrice: price,
        currentPrice: price,
        isManual: true
      });
      userSplitMap.get(extra.userId).itemsTotal += price;
    });

    // If orderItems is empty and no extra items, include all group members
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

    // Separate delivery fee (equal split) from tax + service (proportional split)
    const proportionalSharedCosts = receipt.tax + receipt.serviceFee;
    const equalSplitDelivery = receipt.deliveryFee;

    const splitResults = Array.from(userSplitMap.values()).map((userSplit: any) => {
        let proportionalPortion = 0;
        let equalDeliveryPortion = 0;

        if (newSubtotal > 0) {
            // Proportional split of tax and service fee based on order value
            proportionalPortion = (userSplit.itemsTotal / newSubtotal) * proportionalSharedCosts;
        } else if (userSplitMap.size > 0) {
            // Equal split if subtotal is 0
            proportionalPortion = proportionalSharedCosts / userSplitMap.size;
        }

        // Equal split of delivery fee among all members
        if (userSplitMap.size > 0) {
            equalDeliveryPortion = equalSplitDelivery / userSplitMap.size;
        }
        
        userSplit.sharedCostPortion = proportionalPortion + equalDeliveryPortion;
        userSplit.total = userSplit.itemsTotal + userSplit.sharedCostPortion;
        return userSplit;
    });

    return {
      splitResults,
      calculatedSubtotal: newSubtotal
    };
  }

  async updateReceipt(id: string, updates: { subtotal?: number; tax: number; serviceFee: number; deliveryFee: number; individualItemOverrides?: Record<string, number>; manualExtraItems?: any[] }) {
    const receipt = await this.repository.findById(id);
    if (!receipt) throw new NotFoundException('Receipt not found');

    // Merge or set item overrides into rawParsedData
    const currentData = (receipt.rawParsedData as any) || {};
    const newData = {
      ...currentData,
      individualItemOverrides: updates.individualItemOverrides || currentData.individualItemOverrides || {},
      manualExtraItems: updates.manualExtraItems !== undefined ? updates.manualExtraItems : (currentData.manualExtraItems || [])
    };

    // Calculate subtotal from overrides if provided, otherwise use existing
    const order = await this.ordersService.findById(receipt.orderId);

    const finalTax = updates.tax !== undefined ? updates.tax : receipt.tax;
    const finalServiceFee = updates.serviceFee !== undefined ? updates.serviceFee : receipt.serviceFee;
    const finalDeliveryFee = updates.deliveryFee !== undefined ? updates.deliveryFee : receipt.deliveryFee;

    // Temporarily update receipt object for calculation
    const calcReceipt = { ...receipt, rawParsedData: newData, tax: finalTax, serviceFee: finalServiceFee, deliveryFee: finalDeliveryFee };
    const { splitResults, calculatedSubtotal } = this.calculateSplit(order, calcReceipt);

    const finalSubtotal = updates.subtotal !== undefined ? updates.subtotal : calculatedSubtotal;
    const newTotal = finalSubtotal + finalTax + finalServiceFee + finalDeliveryFee;

    const updatedReceipt = await this.repository.update(id, {
      tax: finalTax,
      serviceFee: finalServiceFee,
      deliveryFee: finalDeliveryFee,
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
    const receipt = await this.repository.findByOrderId(orderId);
    if (!receipt) return null;

    const order = await this.ordersService.findById(orderId);
    const { splitResults } = this.calculateSplit(order, receipt);

    return {
      receipt,
      split: splitResults
    };
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
