import { Controller, Post, Req, Headers, HttpCode, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { serverEnv } from '@line-os/config/env';
import { verifyLineSignature, parseWebhookBody } from '@line-os/line/webhook';

/**
 * LINE webhook endpoint.
 *
 * SECURITY: The signature is verified against the RAW request body BEFORE any
 * processing. Invalid signatures are rejected with 403.
 *
 * NOTE: For multi-tenant channels, resolve the channel secret per destination
 * from core.line_channels (decrypted server-side) instead of the global env
 * secret used here for the platform's default channel.
 */
@Controller('line/webhook')
export class LineWebhookController {
  @Post()
  @HttpCode(200)
  handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-line-signature') signature?: string,
  ) {
    const env = serverEnv();
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));

    const ok = verifyLineSignature({
      channelSecret: env.LINE_CHANNEL_SECRET,
      rawBody,
      signature,
    });
    if (!ok) {
      throw new ForbiddenException('Invalid LINE signature');
    }

    const body = parseWebhookBody(rawBody);
    // TODO: enqueue events for processing (apps/worker). Keep handler fast.
    for (const _event of body.events) {
      // route by event.type; resolve tenant from channel/line_account.
    }
    return { received: body.events.length };
  }
}
