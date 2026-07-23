import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Session,
  SessionDocument,
} from '../../sessions/schemas/session.schema';
import {
  User,
  UserDocument,
  APP1_ALLOWED_ROLES,
  Role,
} from '../../users/schemas/user.schema';

// Only write lastActiveAt if it's gone stale by this much — avoids a DB
// write on every single authenticated request while keeping the ghosting /
// slow-response inactivity checks (see DealsAutomationService) meaningful.
const ACTIVITY_UPDATE_THROTTLE_MS = 10 * 60 * 1000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: any) {
    const session = await this.sessionModel.findOne({
      sessionId: payload.sessionId,
      isBlacklisted: false,
    });

    if (!session) {
      throw new UnauthorizedException(
        'Session expired. You may have logged in from another device.',
      );
    }

    const user = await this.userModel.findById(payload.sub).lean();
    if (!user || user.isBanned) {
      throw new UnauthorizedException();
    }
    if (!APP1_ALLOWED_ROLES.includes(user.role as Role)) {
      throw new UnauthorizedException();
    }

    this.userModel
      .updateOne(
        {
          _id: payload.sub,
          $or: [
            { lastActiveAt: null },
            {
              lastActiveAt: {
                $lt: new Date(Date.now() - ACTIVITY_UPDATE_THROTTLE_MS),
              },
            },
          ],
        },
        { $set: { lastActiveAt: new Date() } },
      )
      .exec()
      .catch(() => null);

    return { ...user, sessionId: payload.sessionId };
  }
}
