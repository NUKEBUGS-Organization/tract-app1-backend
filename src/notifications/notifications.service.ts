import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';
import { MailService } from '../mail/mail.service';

export interface CreateNotificationPayload {
  recipient_id: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  action_url?: string;
  metadata?: Record<string, any>;
  /** When true, also fires the corresponding email */
  send_email?: boolean;
  /** Email data forwarded to MailService */
  email_data?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly mailService: MailService,
  ) {}

  // ─── Core dispatch ─────────────────────────────────────────────────────────

  async dispatch(payload: CreateNotificationPayload): Promise<Notification> {
    const notification = await this.notificationModel.create({
      recipient_id: new Types.ObjectId(payload.recipient_id.toString()),
      type: payload.type,
      title: payload.title,
      body: payload.body,
      action_url: payload.action_url ?? null,
      metadata: payload.metadata ?? {},
    });

    if (payload.send_email && payload.email_data) {
      try {
        await this.mailService.sendNotificationEmail(
          payload.type,
          payload.email_data,
        );
      } catch (err) {
        // Email failure must never break the in-app notification
        this.logger.error(
          `Email dispatch failed for ${payload.type}: ${err.message}`,
          err.stack,
        );
      }
    }

    return notification;
  }

  /** Fire the same notification to multiple recipients at once */
  async dispatchMany(payloads: CreateNotificationPayload[]): Promise<void> {
    await Promise.all(payloads.map((p) => this.dispatch(p)));
  }

  // ─── Domain helpers ────────────────────────────────────────────────────────

  async notifyListingLive(params: {
    seller_id: string;
    seller_email: string;
    seller_name: string;
    listing_id: string;
    address: string;
  }) {
    await this.dispatch({
      recipient_id: params.seller_id,
      type: NotificationType.LISTING_LIVE,
      title: 'Your listing is now live!',
      body: `${params.address} has been approved and is now visible to buyers.`,
      action_url: `/listings/${params.listing_id}`,
      metadata: { listing_id: params.listing_id },
      send_email: true,
      email_data: {
        to: params.seller_email,
        seller_name: params.seller_name,
        address: params.address,
        listing_id: params.listing_id,
      },
    });
  }

  async notifyListingNeedsInfo(params: {
    seller_id: string;
    seller_email: string;
    seller_name: string;
    listing_id: string;
    address: string;
    reason?: string;
  }) {
    await this.dispatch({
      recipient_id: params.seller_id,
      type: NotificationType.LISTING_NEEDS_INFO,
      title: 'Action required on your listing',
      body: params.reason
        ? `Your listing at ${params.address} requires additional information: ${params.reason}`
        : `Your listing at ${params.address} requires additional information before it can go live.`,
      action_url: `/listings/${params.listing_id}/edit`,
      metadata: { listing_id: params.listing_id },
      send_email: true,
      email_data: {
        to: params.seller_email,
        seller_name: params.seller_name,
        address: params.address,
        listing_id: params.listing_id,
        reason: params.reason ?? null,
      },
    });
  }

  async notifyBidReceived(params: {
    seller_id: string;
    seller_email: string;
    seller_name: string;
    listing_id: string;
    address: string;
    bid_id: string;
    bid_price: number;
    bidder_name: string;
    bid_count: number;
  }) {
    await this.dispatch({
      recipient_id: params.seller_id,
      type: NotificationType.LISTING_BID_RECEIVED,
      title: 'New offer received!',
      body: `${params.bidder_name} submitted an offer of $${params.bid_price.toLocaleString()} on ${params.address}.`,
      action_url: `/listings/${params.listing_id}/bids`,
      metadata: {
        listing_id: params.listing_id,
        bid_id: params.bid_id,
        bid_price: params.bid_price,
      },
      send_email: true,
      email_data: {
        to: params.seller_email,
        seller_name: params.seller_name,
        address: params.address,
        listing_id: params.listing_id,
        bid_id: params.bid_id,
        bid_price: params.bid_price,
        bidder_name: params.bidder_name,
        bid_count: params.bid_count,
      },
    });
  }

  async notifyBidCapReached(params: {
    seller_id: string;
    seller_email: string;
    seller_name: string;
    listing_id: string;
    address: string;
  }) {
    await this.dispatch({
      recipient_id: params.seller_id,
      type: NotificationType.LISTING_BID_CAP_REACHED,
      title: 'Maximum offers reached — listing paused',
      body: `Your listing at ${params.address} has received 10 offers and has been paused. Review and select your preferred offer.`,
      action_url: `/listings/${params.listing_id}/bids`,
      metadata: { listing_id: params.listing_id },
      send_email: true,
      email_data: {
        to: params.seller_email,
        seller_name: params.seller_name,
        address: params.address,
        listing_id: params.listing_id,
      },
    });
  }

  async notifyBidSelected(params: {
    buyer_id: string;
    buyer_email: string;
    buyer_name: string;
    seller_name: string;
    listing_id: string;
    bid_id: string;
    address: string;
    bid_price: number;
  }) {
    await this.dispatch({
      recipient_id: params.buyer_id,
      type: NotificationType.BID_SELECTED,
      title: 'Your offer was accepted!',
      body: `Congratulations! Your offer of $${params.bid_price.toLocaleString()} on ${params.address} has been selected by the seller.`,
      action_url: `/bids/${params.bid_id}`,
      metadata: { listing_id: params.listing_id, bid_id: params.bid_id },
      send_email: true,
      email_data: {
        to: params.buyer_email,
        buyer_name: params.buyer_name,
        seller_name: params.seller_name,
        address: params.address,
        listing_id: params.listing_id,
        bid_price: params.bid_price,
      },
    });
  }

  async notifyBidRejected(params: {
    buyer_id: string;
    buyer_email: string;
    buyer_name: string;
    listing_id: string;
    bid_id: string;
    address: string;
    bid_price: number;
  }) {
    await this.dispatch({
      recipient_id: params.buyer_id,
      type: NotificationType.BID_REJECTED,
      title: 'Your offer was not selected',
      body: `Your offer of $${params.bid_price.toLocaleString()} on ${params.address} was not selected by the seller.`,
      action_url: `/listings/${params.listing_id}`,
      metadata: { listing_id: params.listing_id, bid_id: params.bid_id },
      send_email: true,
      email_data: {
        to: params.buyer_email,
        buyer_name: params.buyer_name,
        address: params.address,
        listing_id: params.listing_id,
        bid_price: params.bid_price,
      },
    });
  }

  async notifyContractReady(params: {
    seller_id: string;
    seller_email: string;
    seller_name: string;
    buyer_id: string;
    buyer_email: string;
    buyer_name: string;
    contract_id: string;
    listing_id: string;
    address: string;
  }) {
    await this.dispatchMany([
      {
        recipient_id: params.seller_id,
        type: NotificationType.CONTRACT_READY,
        title: 'Contract ready for your signature',
        body: `A purchase contract for ${params.address} is ready and awaiting your signature.`,
        action_url: `/contracts/${params.contract_id}`,
        metadata: {
          contract_id: params.contract_id,
          listing_id: params.listing_id,
        },
        send_email: true,
        email_data: {
          to: params.seller_email,
          recipient_name: params.seller_name,
          counterparty_name: params.buyer_name,
          role: 'seller',
          address: params.address,
          contract_id: params.contract_id,
        },
      },
      {
        recipient_id: params.buyer_id,
        type: NotificationType.CONTRACT_READY,
        title: 'Contract ready for your signature',
        body: `A purchase contract for ${params.address} is ready and awaiting your signature.`,
        action_url: `/contracts/${params.contract_id}`,
        metadata: {
          contract_id: params.contract_id,
          listing_id: params.listing_id,
        },
        send_email: true,
        email_data: {
          to: params.buyer_email,
          recipient_name: params.buyer_name,
          counterparty_name: params.seller_name,
          role: 'buyer',
          address: params.address,
          contract_id: params.contract_id,
        },
      },
    ]);
  }

  async notifyContractExecuted(params: {
    seller_id: string;
    seller_email: string;
    seller_name: string;
    buyer_id: string;
    buyer_email: string;
    buyer_name: string;
    contract_id: string;
    listing_id: string;
    address: string;
  }) {
    await this.dispatchMany([
      {
        recipient_id: params.seller_id,
        type: NotificationType.CONTRACT_EXECUTED,
        title: 'Contract fully executed',
        body: `The purchase contract for ${params.address} has been signed by both parties. Your deal is now active.`,
        action_url: `/contracts/${params.contract_id}`,
        metadata: {
          contract_id: params.contract_id,
          listing_id: params.listing_id,
        },
        send_email: true,
        email_data: {
          to: params.seller_email,
          recipient_name: params.seller_name,
          counterparty_name: params.buyer_name,
          address: params.address,
          contract_id: params.contract_id,
        },
      },
      {
        recipient_id: params.buyer_id,
        type: NotificationType.CONTRACT_EXECUTED,
        title: 'Contract fully executed',
        body: `The purchase contract for ${params.address} has been signed by both parties. Your deal is now active.`,
        action_url: `/contracts/${params.contract_id}`,
        metadata: {
          contract_id: params.contract_id,
          listing_id: params.listing_id,
        },
        send_email: true,
        email_data: {
          to: params.buyer_email,
          recipient_name: params.buyer_name,
          counterparty_name: params.seller_name,
          address: params.address,
          contract_id: params.contract_id,
        },
      },
    ]);
  }

  async notifyDealMilestone(params: {
    seller_id: string;
    seller_email: string;
    seller_name: string;
    buyer_id: string;
    buyer_email: string;
    buyer_name: string;
    deal_id: string;
    listing_id: string;
    address: string;
    type: NotificationType;
    title: string;
    body: string;
    send_email?: boolean;
  }) {
    await this.dispatchMany([
      {
        recipient_id: params.seller_id,
        type: params.type,
        title: params.title,
        body: params.body,
        action_url: `/deals/${params.deal_id}`,
        metadata: { deal_id: params.deal_id, listing_id: params.listing_id },
        send_email: params.send_email ?? false,
        email_data: {
          to: params.seller_email,
          recipient_name: params.seller_name,
          address: params.address,
          deal_id: params.deal_id,
          milestone_title: params.title,
          milestone_body: params.body,
        },
      },
      {
        recipient_id: params.buyer_id,
        type: params.type,
        title: params.title,
        body: params.body,
        action_url: `/deals/${params.deal_id}`,
        metadata: { deal_id: params.deal_id, listing_id: params.listing_id },
        send_email: params.send_email ?? false,
        email_data: {
          to: params.buyer_email,
          recipient_name: params.buyer_name,
          address: params.address,
          deal_id: params.deal_id,
          milestone_title: params.title,
          milestone_body: params.body,
        },
      },
    ]);
  }

  async notifyDealClosed(params: {
    seller_id: string;
    seller_email: string;
    seller_name: string;
    buyer_id: string;
    buyer_email: string;
    buyer_name: string;
    deal_id: string;
    listing_id: string;
    address: string;
    final_price: number;
  }) {
    // Seller: closed + fee processing notice
    await this.dispatch({
      recipient_id: params.seller_id,
      type: NotificationType.DEAL_CLOSED,
      title: 'Deal closed successfully!',
      body: `Congratulations! The deal for ${params.address} at $${params.final_price.toLocaleString()} has closed. Your success-based marketing fee is being processed.`,
      action_url: `/deals/${params.deal_id}`,
      metadata: { deal_id: params.deal_id, listing_id: params.listing_id },
      send_email: true,
      email_data: {
        to: params.seller_email,
        recipient_name: params.seller_name,
        address: params.address,
        deal_id: params.deal_id,
        final_price: params.final_price,
        is_seller: true,
      },
    });

    // Seller: fee processing in-app nudge
    await this.dispatch({
      recipient_id: params.seller_id,
      type: NotificationType.DEAL_FEE_PROCESSING,
      title: 'Marketing fee processing',
      body: `Your success-based marketing fee for the sale of ${params.address} is now being processed.`,
      action_url: `/deals/${params.deal_id}`,
      metadata: { deal_id: params.deal_id },
    });

    // Buyer: closed notice
    await this.dispatch({
      recipient_id: params.buyer_id,
      type: NotificationType.DEAL_CLOSED,
      title: 'Deal closed successfully!',
      body: `Congratulations! The deal for ${params.address} at $${params.final_price.toLocaleString()} has closed.`,
      action_url: `/deals/${params.deal_id}`,
      metadata: { deal_id: params.deal_id, listing_id: params.listing_id },
      send_email: true,
      email_data: {
        to: params.buyer_email,
        recipient_name: params.buyer_name,
        address: params.address,
        deal_id: params.deal_id,
        final_price: params.final_price,
        is_seller: false,
      },
    });
  }

  async notifyNewChatMessage(params: {
    recipient_id: string;
    recipient_email: string;
    recipient_name: string;
    sender_name: string;
    deal_id: string;
    room_id: string;
    message_preview: string;
    address: string;
  }) {
    await this.dispatch({
      recipient_id: params.recipient_id,
      type: NotificationType.CHAT_NEW_MESSAGE,
      title: `New message from ${params.sender_name}`,
      body: params.message_preview,
      action_url: `/deals/${params.deal_id}/chat`,
      metadata: { room_id: params.room_id, deal_id: params.deal_id }
    });
  }

  async notifyScorePenalty(params: {
    user_id: string;
    score_type: string;
    event_type: string;
    delta: number;
    score_after: number;
    note?: string | null;
  }) {
    await this.dispatch({
      recipient_id: params.user_id,
      type: NotificationType.SCORE_PENALTY_APPLIED,
      title: `${params.score_type === 'reliability' ? 'Reliability' : 'Professional'} score penalty applied`,
      body: params.note
        ? `${params.note} (${params.delta} points). Your score is now ${params.score_after}.`
        : `A ${params.delta} point penalty (${params.event_type.replace(/_/g, ' ')}) was applied. Your score is now ${params.score_after}.`,
      metadata: {
        score_type: params.score_type,
        event_type: params.event_type,
        delta: params.delta,
        score_after: params.score_after,
      },
    });
  }

  async notifyScoreRestriction(params: {
    user_id: string;
    restrictionStatus: string;
    score: number;
  }) {
    await this.dispatch({
      recipient_id: params.user_id,
      type: NotificationType.SCORE_RESTRICTION_APPLIED,
      title: 'Account access restricted',
      body: `Your score has dropped to ${params.score}, and your account status is now "${params.restrictionStatus.replace(/_/g, ' ')}".`,
      metadata: {
        restrictionStatus: params.restrictionStatus,
        score: params.score,
      },
    });
  }

  // ─── Query methods (in-app feed) ───────────────────────────────────────────

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total, unread_count] = await Promise.all([
      this.notificationModel
        .find({ recipient_id: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments({
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
      }),
      this.notificationModel.countDocuments({
        recipient_id: new Types.ObjectId(userId),
        is_read: false,
        deleted_at: null,
      }),
    ]);

    return {
      data: notifications,
      unread_count,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
        has_next: page < Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.notificationModel.findById(notificationId);

    if (!notification) throw new NotFoundException('Notification not found');

    if (notification.recipient_id.toString() !== userId) {
      throw new ForbiddenException('Access denied');
    }

    notification.is_read = true;
    notification.read_at = new Date();
    await notification.save();

    return { success: true };
  }

  async markAllAsRead(userId: string) {
    await this.notificationModel.updateMany(
      { recipient_id: new Types.ObjectId(userId), is_read: false },
      { $set: { is_read: true, read_at: new Date() } },
    );

    return { success: true };
  }

  async deleteNotification(notificationId: string, userId: string) {
    const notification = await this.notificationModel.findById(notificationId);

    if (!notification) throw new NotFoundException('Notification not found');

    if (notification.recipient_id.toString() !== userId) {
      throw new ForbiddenException('Access denied');
    }

    notification.deleted_at = new Date();
    await notification.save();

    return { success: true };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationModel.countDocuments({
      recipient_id: new Types.ObjectId(userId),
      is_read: false,
      deleted_at: null,
    });

    return { count };
  }
}
