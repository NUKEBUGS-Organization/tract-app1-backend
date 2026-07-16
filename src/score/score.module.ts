import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ScoreEvent, ScoreEventSchema } from './schemas/score-event.schema';
import { ScoreRule, ScoreRuleSchema } from './schemas/score-rule.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

import { ScoreService } from './score.service';
import { ScoreController } from './score.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScoreEvent.name, schema: ScoreEventSchema },
      { name: ScoreRule.name, schema: ScoreRuleSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [ScoreController],
  providers: [ScoreService],
  exports: [ScoreService, MongooseModule],
})
export class ScoreModule {}
