import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session, SessionDocument } from './schemas/session.schema';

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
  ) {}

  async create(data: Partial<Session>): Promise<Session> {
    return this.sessionModel.create(data);
  }

  async findBySessionId(sessionId: string): Promise<Session | null> {
    return this.sessionModel.findOne({ sessionId, isBlacklisted: false });
  }

  // Blacklist ALL previous sessions for this user (single-session enforcement)
  async blacklistAllForUser(userId: string): Promise<void> {
    await this.sessionModel.updateMany(
      { userId, isBlacklisted: false },
      { isBlacklisted: true },
    );
  }

  async blacklistSession(sessionId: string): Promise<void> {
    await this.sessionModel.updateOne({ sessionId }, { isBlacklisted: true });
  }

  async findByRefreshToken(refreshToken: string): Promise<Session | null> {
    return this.sessionModel.findOne({ refreshToken, isBlacklisted: false });
  }
}
