import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { UnauthorizedExceptionFilter } from './interfaces/common/unauthorized-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global exception filter for UnauthorizedException
  app.useGlobalFilters(new UnauthorizedExceptionFilter());

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('SevenKitchen API')
    .setDescription('Dog Fresh Food SaaS API')
    .setVersion('1.0')
    .addTag('Dogs', 'Dog profile management')
    .addTag('Recipes', 'Recipe management')
    .addTag('Health', 'Health check')
    .addTag('Addresses', 'Address management')
    .addTag('Orders', 'Order management')
    .addTag('Auth', 'Authentication')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'JWT',
    )
    .addApiKey(
      { type: 'apiKey', name: 'X-Customer-Id', in: 'header' },
      'X-Customer-Id',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
  console.log(
    `Application is running on: http://localhost:${process.env.PORT ?? 3000}`,
  );
  console.log(
    `Swagger UI is available at: http://localhost:${process.env.PORT ?? 3000}/api/docs`,
  );
}
bootstrap().catch((error) => {
  console.error('Error starting the application:', error);
  process.exit(1);
});
