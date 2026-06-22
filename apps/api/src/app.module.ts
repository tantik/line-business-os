import { Module } from '@nestjs/common';
import { LineWebhookController } from './line/line-webhook.controller.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController, LineWebhookController],
})
export class AppModule {}
