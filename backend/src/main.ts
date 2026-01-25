import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { UnauthorizedExceptionFilter } from './interfaces/common/unauthorized-exception.filter';
import { AllExceptionsFilter } from './interfaces/common/all-exceptions.filter';
import { BadRequestExceptionFilter } from './interfaces/common/bad-request-exception.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as dotenv from 'dotenv';

// 加载.env文件
dotenv.config();

// Phase 8.18: Boot logging to prove Prisma mode
function logBootSummary() {
  const isPrismaEnabled = (): boolean => {
    if (
      process.env.ORDER_REPO === 'prisma' ||
      process.env.ADDRESS_REPO === 'prisma' ||
      process.env.DOG_REPO === 'prisma' ||
      process.env.RECIPE_REPO === 'prisma' ||
      process.env.SHIPPING_REPO === 'prisma' ||
      process.env.PRODUCTION_REPO === 'prisma' ||
      process.env.INVENTORY_REPO === 'prisma'
    ) {
      return true;
    }
    const productionMode = process.env.PRODUCTION_REPO ?? 'prisma';
    const inventoryMode = process.env.INVENTORY_REPO ?? 'prisma';
    return productionMode === 'prisma' || inventoryMode === 'prisma';
  };

  const prismaEnabled = isPrismaEnabled();
  const repos = {
    ORDER_REPO: process.env.ORDER_REPO ?? 'memory',
    ADDRESS_REPO: process.env.ADDRESS_REPO ?? 'memory',
    DOG_REPO: process.env.DOG_REPO ?? 'memory',
    RECIPE_REPO: process.env.RECIPE_REPO ?? 'memory',
    SHIPPING_REPO: process.env.SHIPPING_REPO ?? 'memory',
    PRODUCTION_REPO: process.env.PRODUCTION_REPO ?? 'prisma',
    INVENTORY_REPO: process.env.INVENTORY_REPO ?? 'prisma',
  };

  const repoSummary = Object.entries(repos)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');

  console.log(
    `[BOOT] prismaEnabled=${prismaEnabled} DATABASE_URL=${process.env.DATABASE_URL ? 'SET' : 'MISSING'} repos=[${repoSummary}]`,
  );

  if (prismaEnabled && !process.env.DATABASE_URL) {
    console.error('[BOOT] ERROR: prismaEnabled=true but DATABASE_URL is missing');
    process.exit(1);
  }
}

async function bootstrap() {
  logBootSummary();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 配置静态文件服务（使用项目根目录）
  app.useStaticAssets(join(process.cwd(), 'public'));

  // Enable CORS for cross-origin requests
  app.enableCors({
    origin: [
      'http://localhost:5173',           // Local admin web development
      'http://localhost:5174',           // Local admin web development (fallback port)
      'http://localhost:3000',           // Local backend
      'http://1.14.3.2:5173',            // Cloud server admin web (if needed)
      // Add your domain here when you get one
      // 'https://yourdomain.com',
    ],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Customer-Id',
  });

  // Global validation pipe with detailed error messages
  app.useGlobalPipes(
    new ValidationPipe({
      transform: false,  // Disable transform to avoid class-transformer issues
      whitelist: false,
      forbidNonWhitelisted: false,  // 暂时关闭以允许查询参数通过
      exceptionFactory: (errors) => {
        // Format validation errors into a readable message with nested field paths
        const formatError = (error: any, prefix = ''): string[] => {
          const messages: string[] = [];
          const propertyPath = prefix ? `${prefix}.${error.property}` : error.property;
          
          const constraints = error.constraints || {};
          const constraintMessages = Object.values(constraints);
          if (constraintMessages.length > 0) {
            messages.push(`${propertyPath}: ${constraintMessages.join(', ')}`);
          }
          
          // Handle nested validation errors (including array items)
          if (error.children && error.children.length > 0) {
            error.children.forEach((child: any, index: number) => {
              // For ValidateNested with { each: true }, children represent array items
              // Each child represents one array item's validation errors
              // Check if parent is an array by looking at error.value or error.target[error.property]
              const parentIsArray = Array.isArray(error.value) || 
                                    (error.target && Array.isArray(error.target[error.property]));
              
              const childPrefix = parentIsArray 
                ? `${propertyPath}[${index}]`
                : propertyPath;
              
              const childMessages = formatError(child, childPrefix);
              messages.push(...childMessages);
            });
          }
          
          
          // Only add generic "validation failed" if we have no constraints and no children with messages
          // This prevents "items: validation failed" when children exist but have no messages
          // But if children exist and we still have no messages, it means children had no constraints
          // In that case, we should still show the generic message to indicate validation failed
          if (constraintMessages.length === 0 && messages.length === 0) {
            // Only add generic message if there are no children, or if children exist but have no constraints
            if (!error.children || error.children.length === 0) {
              messages.push(`${propertyPath}: validation failed`);
            } else {
              // Children exist but no messages - this shouldn't happen, but if it does, try to extract from children directly
              const hasChildConstraints = error.children.some((child: any) => 
                child.constraints && Object.keys(child.constraints).length > 0
              );
              if (!hasChildConstraints) {
                messages.push(`${propertyPath}: validation failed`);
              }
            }
          }
          
          return messages;
        };
        
        const allMessages = errors.flatMap((error) => formatError(error));
        const finalMessage = allMessages.length > 0 ? allMessages.join('; ') : 'Validation failed';
        return new BadRequestException(finalMessage);
      },
    }),
  );

  // Global exception filters
  // Order matters: more specific filters should be registered first
  // BadRequestExceptionFilter -> UnauthorizedExceptionFilter -> AllExceptionsFilter
  app.useGlobalFilters(
    new BadRequestExceptionFilter(),
    new UnauthorizedExceptionFilter(),
    new AllExceptionsFilter(),
  );

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

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0'); // Listen on all network interfaces for LAN access
  console.log(
    `Application is running on: http://localhost:${port}`,
  );
  console.log(
    `LAN access available at: http://192.168.31.43:${port} (or your local IP)`,
  );
  console.log(
    `Swagger UI is available at: http://localhost:${port}/api/docs`,
  );
}
// Only execute bootstrap if this file is the entry point
// This prevents double execution when the file is imported as a module
if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Error starting the application:', error);
    process.exit(1);
  });
}
