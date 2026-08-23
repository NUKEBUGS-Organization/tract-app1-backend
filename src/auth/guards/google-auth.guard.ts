import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Google remembers the last account picked for this OAuth client and skips
// the chooser on subsequent logins unless explicitly told not to.
// prompt=select_account forces Google to show the account picker every
// single time GET /auth/google is hit.
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions() {
    return { prompt: 'select_account' };
  }
}
