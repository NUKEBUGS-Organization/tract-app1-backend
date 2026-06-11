import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Query, Types } from 'mongoose';

export type ChatRoomDocument = ChatRoom & Document;

@Schema({
  timestamps: true,
})
export class ChatRoom {
  @Prop({
    type: Types.ObjectId,
    ref: 'Deal',
    required: true,
    unique: true,
  })
  deal_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  seller_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  buyer_id: Types.ObjectId;

  @Prop({
    default: true,
  })
  is_active: boolean;

  @Prop({
    default: false,
  })
  is_locked: boolean;

  @Prop({
    default: null,
  })
  last_message_at: Date;

  @Prop({
    default: null,
  })
  deleted_at: Date;
}

export const ChatRoomSchema = SchemaFactory.createForClass(ChatRoom);

ChatRoomSchema.pre(/^find/, function (this: Query<any, any>) {
  this.where({
    deleted_at: null,
  });
});
