import { Request } from '@nestjs/common';

export interface JwtUser {
  _id: string;
  email: string;
  role: string;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: JwtUser;
}