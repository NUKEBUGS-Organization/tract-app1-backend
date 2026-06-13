import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Query, Types } from 'mongoose';

export type ChatMessageDocument = ChatMessage & Document;

export enum MessageType {
  TEXT = 'text',
  SYSTEM = 'system',
}

@Schema({
  timestamps: true,
})
export class ChatMessage {
  @Prop({
    type: Types.ObjectId,
    ref: 'ChatRoom',
    required: true,
  })
  room_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  sender_id: Types.ObjectId;

  @Prop({
    required: true,
  })
  content: string;

  @Prop({
    type: String,
    enum: MessageType,
    default: MessageType.TEXT,
  })
  type: MessageType;

  @Prop({
    default: false,
  })
  flagged: boolean;

  @Prop({
    default: null,
  })
  flag_reason: string;

  @Prop({
    default: false,
  })
  is_read: boolean;

  @Prop({
    default: null,
  })
  read_at: Date;

  @Prop({
    default: null,
  })
  deleted_at: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

ChatMessageSchema.pre(/^find/, function (this: Query<any, any>) {
  this.where({
    deleted_at: null,
  });
});
