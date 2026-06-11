import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    console.log(`Socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-room')
  async joinRoom(
    @MessageBody()
    data: {
      roomId: string;
    },

    @ConnectedSocket()
    client: Socket,
  ) {
    client.join(data.roomId);

    return {
      success: true,
      roomId: data.roomId,
    };
  }

  @SubscribeMessage('leave-room')
  async leaveRoom(
    @MessageBody()
    data: {
      roomId: string;
    },

    @ConnectedSocket()
    client: Socket,
  ) {
    client.leave(data.roomId);

    return {
      success: true,
    };
  }

  @SubscribeMessage('typing')
  async typing(
    @MessageBody()
    data: {
      roomId: string;
      userId: string;
    },
  ) {
    this.server.to(data.roomId).emit('typing', {
      userId: data.userId,
    });
  }

  @SubscribeMessage('message-read')
  async messageRead(
    @MessageBody()
    data: {
      messageId: string;
      userId: string;
    },
  ) {
    const message = await this.chatService.markAsRead(
      data.messageId,
      data.userId,
    );

    this.server.to(message.room_id.toString()).emit('message-read', message);

    return message;
  }

  @SubscribeMessage('send-message')
  async sendMessage(
    @MessageBody()
    data: {
      roomId: string;
      senderId: string;
      content: string;
    },
  ) {
    const message = await this.chatService.sendMessage(
      data.roomId,
      data.senderId,
      data.content,
    );

    this.server.to(data.roomId).emit('new-message', message);

    return message;
  }
}
