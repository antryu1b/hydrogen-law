/**
 * Alert/subscription domain types — target for H6
 * MVP: Discord delivery only
 */

export type DeliveryChannel = 'discord';

export interface Subscription {
  id: string;
  userId: string;
  lawIds: string[];        // which laws to monitor
  channel: DeliveryChannel;
  channelConfig: {
    discord?: {
      webhookUrl: string;
    };
  };
  createdAt: string;       // ISO datetime
  active: boolean;
}

export interface Alert {
  id: string;
  subscriptionId: string;
  lawId: string;
  triggeredAt: string;     // ISO datetime
  changeType: 'amendment' | 'new_enforcement' | 'repeal';
  description: string;
  delivered: boolean;
}
