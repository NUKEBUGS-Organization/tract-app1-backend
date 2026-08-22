import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  StrategyOptions,
  Profile,
  VerifyCallback,
} from 'passport-google-oauth20';

export interface GoogleProfilePayload {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const options: StrategyOptions = {
      clientID: process.env.GOOGLE_CLIENT_ID ?? 'not-configured',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? 'not-configured',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ??
        `http://localhost:${process.env.PORT ?? 3000}/api/v1/auth/google/callback`,
      scope: ['email', 'profile'],
    };
    super(options);
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      done(new Error('Google account has no email address'), undefined);
      return;
    }

    const user: GoogleProfilePayload = {
      googleId: profile.id,
      email,
      fullName: profile.displayName?.trim() || email,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };

    done(null, user);
  }
}
