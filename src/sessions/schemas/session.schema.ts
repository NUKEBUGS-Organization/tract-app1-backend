import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SessionDocument = Session & Document;

@Schema({ timestamps: true })
export class Session {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  session_id: string; // UUID

  @Prop({ required: true })
  refresh_token_hash: string; 

  @Prop({ default: false })
  is_blacklisted: boolean;

  @Prop({ required: true })
  expires_at: Date;

  @Prop({ default: null })
  deleted_at: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
// TTL — MongoDB auto-purges expired sessions
SessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
