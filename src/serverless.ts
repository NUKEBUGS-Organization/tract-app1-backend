import './dns-preset';
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

let cached: INestApplication | undefined;

export async function getCachedExpressApp() {
  if (!cached) {
    cached = await NestFactory.create(AppModule, { bufferLogs: true });
    await configureApp(cached);
    await cached.init();
  }
  return cached.getHttpAdapter().getInstance();
}
