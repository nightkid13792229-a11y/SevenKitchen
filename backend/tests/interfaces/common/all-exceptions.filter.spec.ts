import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../../../src/interfaces/common/all-exceptions.filter';
import { BadRequestExceptionFilter } from '../../../src/interfaces/common/bad-request-exception.filter';
import { UnauthorizedExceptionFilter } from '../../../src/interfaces/common/unauthorized-exception.filter';

const REFUSAL_REASONS = [
  {
    code: 'CHECK_MISSING',
    domain: 'INGREDIENT',
    detail: '原料域还没有核验报告，先跑一次核验',
  },
  {
    code: 'CHECK_BLOCKING',
    domain: 'NUTRITION',
    detail: '营养域还有 1 个拦死项：MACRO_SUM_OVER_100',
  },
];

@Controller('test/filter')
class ThrowingController {
  @Get('reasons')
  refuseWithReasons(): never {
    throw new BadRequestException({
      message: '授权前还有未满足的条件',
      reasons: REFUSAL_REASONS,
      // 白名单之外的字段不能被透传出去（内部信息泄露）。
      internalSecret: 'must-not-leak',
    });
  }

  @Get('blocking')
  refuseWithBlocking(): never {
    throw new BadRequestException({
      message: '终检存在阻断项，不能提交',
      blocking: [{ code: 'UNIT_NOT_ALLOWED', message: '单位不合法' }],
    });
  }

  @Get('boom')
  explode(): never {
    throw new Error('boom');
  }
}

describe('AllExceptionsFilter（全局过滤器链）', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ThrowingController],
    }).compile();

    app = moduleRef.createNestApplication();
    // 与 src/main.ts 完全相同的注册顺序。Nest 会把 filters 反转，所以最后注册的
    // AllExceptionsFilter 实际先匹配；这个测试必须走真实过滤器链才能抓住
    //「reasons 在兜底过滤器里被丢掉」。
    app.useGlobalFilters(
      new BadRequestExceptionFilter(),
      new UnauthorizedExceptionFilter(),
      new AllExceptionsFilter(),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('BadRequestException 的 reasons 原样出现在响应顶层', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/filter/reasons')
      .expect(400);

    const body = response.body as {
      code: number;
      message: string;
      data: unknown;
      reasons?: unknown;
    };
    expect(body).toMatchObject({
      code: 400,
      message: '授权前还有未满足的条件',
      data: null,
    });
    expect(body.reasons).toEqual(REFUSAL_REASONS);
  });

  it('blocking 也按同一白名单原样带出', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/filter/blocking')
      .expect(400);

    const body = response.body as {
      code: number;
      message: string;
      data: unknown;
      blocking?: unknown;
    };
    expect(body).toMatchObject({
      code: 400,
      message: '终检存在阻断项，不能提交',
      data: null,
    });
    expect(body.blocking).toEqual([
      { code: 'UNIT_NOT_ALLOWED', message: '单位不合法' },
    ]);
  });

  it('白名单之外的字段不展开（不泄露异常对象内部字段）', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/filter/reasons')
      .expect(400);

    const body = response.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('internalSecret');
    expect(body).not.toHaveProperty('error');
    expect(body).not.toHaveProperty('statusCode');
  });

  it('普通异常仍然是 500 + 统一信封，不带额外字段', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/filter/boom')
      .expect(500);

    expect(response.body).toEqual({
      code: 500,
      message: 'boom',
      data: null,
    });
  });
});
