import dns from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const dnsFromEnv = process.env.NODE_DNS_SERVERS?.split(/[\s,]+/).filter(Boolean);
dns.setServers(dnsFromEnv?.length ? dnsFromEnv : ['1.1.1.1', '8.8.8.8']);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: configService.get<string>('app.allowedOrigins')?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('TractApp API')
    .setDescription('TractApp REST API documentation')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT access token',
        in: 'header',
      },
      'access-token', 
    )
    .addTag('Auth', 'Authentication & Onboarding')
    .addTag('Users', 'User management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, 
    },
  });

  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port);
}
bootstrap();
