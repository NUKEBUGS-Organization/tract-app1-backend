import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

export async function configureApp(app: INestApplication): Promise<void> {
  const configService = app.get(ConfigService);

  const allowedRaw = configService.get<string[]>('app.origins') ?? [];
  const allowedOrigins = new Set(
    allowedRaw.map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
  );

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: (
      reqOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean | string | RegExp) => void,
    ) => {
      if (!reqOrigin) {
        callback(null, true);
        return;
      }
      const normalized = reqOrigin.trim().replace(/\/$/, '');
      if (allowedOrigins.has(normalized)) {
        callback(null, reqOrigin.trim());
        return;
      }
      callback(null, false);
    },
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
}
