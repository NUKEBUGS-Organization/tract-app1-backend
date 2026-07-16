import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Session,
  SessionDocument,
} from '../../sessions/schemas/session.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';

// Only write last_active_at if it's gone stale by this much — avoids a DB
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
    // Every request checks if this session is still valid
    const session = await this.sessionModel.findOne({
      session_id: payload.sessionId,
      is_blacklisted: false,
    });

    if (!session) {
      throw new UnauthorizedException(
        'Session expired. You may have logged in from another device.',
      );
    }

    // Non-blocking, throttled activity heartbeat
    this.userModel
      .updateOne(
        {
          _id: payload.sub,
          $or: [
            { last_active_at: null },
            {
              last_active_at: {
                $lt: new Date(Date.now() - ACTIVITY_UPDATE_THROTTLE_MS),
              },
            },
          ],
        },
        { $set: { last_active_at: new Date() } },
      )
      .exec()
      .catch(() => null);

    return {
      _id: payload.sub,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
    };
  }
}
