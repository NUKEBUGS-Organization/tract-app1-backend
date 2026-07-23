import './dns-preset';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

function assertJwtSecrets(): void {
  if (!process.env.JWT_SECRET?.trim()) {
    throw new Error('JWT_SECRET is required');
  }
  if (!process.env.JWT_REFRESH_SECRET?.trim()) {
    throw new Error('JWT_REFRESH_SECRET is required');
  }
}

function assertApiPublicUrlInProduction(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.API_PUBLIC_URL?.trim()) {
    throw new Error('API_PUBLIC_URL is required in production');
  }
}

async function bootstrap() {
  assertJwtSecrets();
  assertApiPublicUrlInProduction();

  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  await configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port);
}
bootstrap();
