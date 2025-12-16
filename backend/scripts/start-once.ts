/**
 * Non-blocking startup script for Cursor/CI
 * Boots NestJS app, waits for it to be ready, then exits.
 * Exits with code 0 on success, 1 on failure.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { UnauthorizedExceptionFilter } from '../src/interfaces/common/unauthorized-exception.filter';

async function bootstrapOnce() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new UnauthorizedExceptionFilter());

  // Swagger setup (minimal for startup check)
  const config = new DocumentBuilder()
    .setTitle('SevenKitchen API')
    .setDescription('Dog Fresh Food SaaS API')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  console.log(`[start:once] Application booted successfully on port ${port}`);

  // Give it a moment to fully initialize, then close
  await new Promise((resolve) => setTimeout(resolve, 500));
  await app.close();
  console.log('[start:once] Application closed gracefully');
}

bootstrapOnce()
  .then(() => {
    console.log('[start:once] Startup check passed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[start:once] Startup check failed:', error);
    process.exit(1);
  });

