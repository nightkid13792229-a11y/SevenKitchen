/**
 * Health check script for Cursor/CI
 * Attempts to check if the app is healthy by:
 * 1. First trying to hit the health endpoint of a running server
 * 2. If that fails, booting the app briefly and checking health via HTTP
 */

import * as http from 'http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { UnauthorizedExceptionFilter } from '../src/interfaces/common/unauthorized-exception.filter';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HEALTH_URL = `http://localhost:${PORT}/api/v1/health`;
const TIMEOUT_MS = 2000;

function checkRunningServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            if (json.status === 'ok') {
              console.log('[start:check] Running server is healthy');
              resolve(true);
              return;
            }
          } catch {
            // Invalid JSON, continue
          }
        }
        resolve(false);
      });
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function checkByBooting(): Promise<boolean> {

  const app = await NestFactory.create(AppModule, {
    logger: false, // Suppress logs for check
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new UnauthorizedExceptionFilter());

  // Minimal Swagger setup
  const config = new DocumentBuilder()
    .setTitle('SevenKitchen API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(PORT);
  console.log(`[start:check] Booted app on port ${PORT} for health check`);

  // Wait for server to be ready, then check health endpoint
  await new Promise((resolve) => setTimeout(resolve, 500));

  const healthy = await new Promise<boolean>((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve(json.status === 'ok');
          } catch {
            resolve(false);
          }
        } else {
          resolve(false);
        }
      });
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });

  await app.close();

  if (healthy) {
    console.log('[start:check] App health check passed');
  } else {
    console.error('[start:check] App health check failed');
  }

  return healthy;
}

async function main() {
  // First, try to check if server is already running
  const runningServerHealthy = await checkRunningServer();
  if (runningServerHealthy) {
    process.exit(0);
    return;
  }

  // If no running server, boot briefly and check
  console.log('[start:check] No running server found, booting app for health check...');
  try {
    const healthy = await checkByBooting();
    process.exit(healthy ? 0 : 1);
  } catch (error) {
    console.error('[start:check] Health check failed:', error);
    process.exit(1);
  }
}

main();


