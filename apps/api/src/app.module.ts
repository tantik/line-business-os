import { Module } from '@nestjs/common';
import { LineWebhookController } from './line/line-webhook.controller.js';
import { HealthController } from './health.controller.js';
import { AuthBoundaryTestController } from './auth-boundary/auth-boundary.controller.js';

@Module({
  controllers: [HealthController, LineWebhookController, AuthBoundaryTestController],
})
export class AppModule {}
