import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ChatRoom, ChatRoomSchema } from './schemas/chat-room.schema';

import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';

import { Deal, DealSchema } from '../deals/schemas/deal.schema';

import { User, UserSchema } from '../users/schemas/user.schema';

import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { DealsModule } from 'src/deals/deals.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ChatRoom.name,
        schema: ChatRoomSchema,
      },
      {
        name: ChatMessage.name,
        schema: ChatMessageSchema,
      },
      {
        name: Deal.name,
        schema: DealSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
    NotificationsModule,
    forwardRef(() => DealsModule)
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
