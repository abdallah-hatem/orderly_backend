import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

@Injectable()
export class NotificationsService {
  private expo = new Expo();
  private readonly logger = new Logger(NotificationsService.name);

  async sendPushNotification(pushTokens: string[], title: string, body: string, data?: any) {
    const validTokens = pushTokens.filter(token => Expo.isExpoPushToken(token));
    
    if (validTokens.length === 0) {
      this.logger.warn('No valid push tokens provided for notification');
      return;
    }

    const messages: ExpoPushMessage[] = validTokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    
    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        this.logger.log(`Sent ${chunk.length} notifications`);
        // Note: You can inspect ticketChunk to see if there were errors 
        // sending specific notifications (e.g. DeviceNotRegistered)
      } catch (error) {
        this.logger.error('Error sending push notifications', error);
      }
    }
  }
}
