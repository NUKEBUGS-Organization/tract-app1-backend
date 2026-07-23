import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import { ChatRoom, ChatRoomDocument } from './schemas/chat-room.schema';

import {
  ChatMessage,
  ChatMessageDocument,
  MessageType,
} from './schemas/chat-message.schema';

import { Deal, DealDocument } from '../deals/schemas/deal.schema';

import { User, UserDocument, Role } from '../users/schemas/user.schema';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  
  constructor(
    @InjectModel(ChatRoom.name)
    private readonly roomModel: Model<ChatRoomDocument>,

    @InjectModel(ChatMessage.name)
    private readonly messageModel: Model<ChatMessageDocument>,

    @InjectModel(Deal.name)
    private readonly dealModel: Model<DealDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly notificationsService: NotificationsService, 
  ) {}

  /**
   * Auto create room after deal creation
   */
  async createRoomForDeal(dealId: string) {
    const deal = await this.dealModel.findById(dealId);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const existingRoom = await this.roomModel.findOne({
      deal_id: deal._id,
    });

    if (existingRoom) {
      return existingRoom;
    }

    return this.roomModel.create({
      deal_id: deal._id,
      seller_id: deal.seller_id,
      buyer_id: deal.buyer_id,
      is_active: true,
      is_locked: false,
      last_message_at: new Date(),
    });
  }

  /**
   * Get all rooms for user
   */
  async getMyRooms(userId: string) {
    return this.roomModel
      .find({
        $or: [
          {
            seller_id: new Types.ObjectId(userId),
          },
          {
            buyer_id: new Types.ObjectId(userId),
          },
        ],
      })
      .populate('seller_id', 'fullName email')
      .populate('buyer_id', 'fullName email')
      .populate('deal_id')
      .sort({
        updatedAt: -1,
      });
  }

  /**
   * Single room
   */
  async getRoom(roomId: string, userId: string) {
    const room = await this.roomModel.findById(roomId).populate('deal_id');

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    await this.validateRoomAccess(room, userId);

    return room;
  }

  /**
   * Room messages
   */
  async getRoomMessages(roomId: string, userId: string) {
    const room = await this.roomModel.findById(roomId);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    await this.validateRoomAccess(room, userId);

    return this.messageModel
      .find({
        room_id: room._id,
      })
      .populate('sender_id', 'fullName')
      .sort({
        createdAt: 1,
      });
  }

  /**
   * Send message
   */
  async sendMessage(roomId: string, senderId: string, content: string) {
    const room = await this.roomModel.findById(roomId);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    await this.validateRoomAccess(room, senderId);

    if (room.is_locked) {
      throw new ForbiddenException('Chat is locked');
    }

    const moderation = this.detectViolation(content);

    const message = (await this.messageModel.create({
      room_id: room._id,
      sender_id: new Types.ObjectId(senderId),
      content,
      type: MessageType.TEXT,
      flagged: moderation.flagged,
      flag_reason: moderation.reason,
    })) as ChatMessageDocument;

    room.last_message_at = new Date();
    await room.save();

    // 🔔 Send in-app notification to the other party
    this.sendChatNotification(room, senderId, content).catch((err) => {
      this.logger.error(`Failed to send chat notification: ${err.message}`);
    });

    return this.messageModel
      .findById(message._id)
      .populate('sender_id', 'fullName');
  }

  /**
   * Send in-app notification for new chat message
   */
  private async sendChatNotification(
    room: ChatRoomDocument,
    senderId: string,
    content: string,
  ) {
    // Determine recipient (the other party)
    const recipientId =
      room.seller_id.toString() === senderId
        ? room.buyer_id.toString()
        : room.seller_id.toString();

    // Get sender and recipient info
    const [sender, recipient, deal] = await Promise.all([
      this.userModel.findById(senderId).select('fullName').lean(),
      this.userModel.findById(recipientId).select('fullName email').lean(),
      this.dealModel
        .findById(room.deal_id)
        .select('listing_id')
        .populate({
          path: 'listing_id',
          select: 'address',
        })
        .lean(),
    ]);

    if (!sender || !recipient) return;

    // Create message preview (truncate if too long)
    const messagePreview =
      content.length > 100 ? content.substring(0, 97) + '...' : content;

    const address = (deal?.listing_id as any)?.address || 'property';

    await this.notificationsService.notifyNewChatMessage({
      recipient_id: recipientId,
      recipient_email: recipient.email,
      recipient_name: recipient.fullName,
      sender_name: sender.fullName,
      deal_id: room.deal_id.toString(),
      room_id: room._id.toString(),
      message_preview: messagePreview,
      address: address,
    });
  }

  /**
   * Mark as read
   */
  async markAsRead(messageId: string, userId: string) {
    const message = await this.messageModel.findById(messageId);

    if (!message) {
      throw new NotFoundException();
    }

    const room = await this.roomModel.findById(message.room_id);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    await this.validateRoomAccess(room, userId);

    message.is_read = true;
    message.read_at = new Date();

    await message.save();

    return message;
  }

  /**
   * Admin flagged messages
   */
  async getFlaggedMessages() {
    return this.messageModel
      .find({
        flagged: true,
      })
      .populate('sender_id', 'fullName email')
      .populate('room_id')
      .sort({
        createdAt: -1,
      });
  }

  /**
   * Ownership check
   */
  private async validateRoomAccess(room: ChatRoomDocument, userId: string) {
    const user = await this.userModel.findById(userId);

    const isParticipant =
      room.seller_id.toString() === userId ||
      room.buyer_id.toString() === userId;

    const isAdmin = user?.role === Role.ADMIN;

    if (!isParticipant && !isAdmin) {
      throw new ForbiddenException('Access denied');
    }
  }

  async markRoomAsRead(roomId: string, userId: string) {
    const room = await this.roomModel.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    await this.validateRoomAccess(room, userId);

    await this.messageModel.updateMany(
      {
        room_id: room!._id,
        sender_id: {
          $ne: userId,
        },
        is_read: false,
      },
      {
        $set: {
          is_read: true,
          read_at: new Date(),
        },
      },
    );

    return {
      success: true,
    };
  }

  /**
   * Anti Circumvention
   */
  private detectViolation(message: string): {
    flagged: boolean;
    reason?: string;
  } {
    const phoneRegex = /(\+?\d[\d\s-]{7,})/g;

    const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

    const urlRegex = /(https?:\/\/[^\s]+)/i;

    const whatsappRegex = /(wa\.me|whatsapp\.com)/i;

    if (phoneRegex.test(message)) {
      return {
        flagged: true,
        reason: 'Phone number detected',
      };
    }

    if (emailRegex.test(message)) {
      return {
        flagged: true,
        reason: 'Email detected',
      };
    }

    if (whatsappRegex.test(message)) {
      return {
        flagged: true,
        reason: 'WhatsApp link detected',
      };
    }

    if (urlRegex.test(message)) {
      return {
        flagged: true,
        reason: 'External URL detected',
      };
    }

    return {
      flagged: false,
    };
  }
}
