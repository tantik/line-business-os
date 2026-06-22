import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { serverEnv } from '@line-os/config/env';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const env = serverEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Capture the RAW body for LINE webhook signature verification.
  app.use(
    json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );

  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  await app.listen(env.API_PORT);
   
  console.log(`API listening on :${env.API_PORT}`);
}

void bootstrap();
