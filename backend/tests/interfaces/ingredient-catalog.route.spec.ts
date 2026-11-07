import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { FeedAdditiveCatalogService } from '../../src/domain/ingredient/feed-additive-catalog.service';
import { IngredientCatalogController } from '../../src/interfaces/controllers/ingredient-catalog.controller';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../src/interfaces/auth/jwt.service';
import { AdminGuard } from '../../src/interfaces/guards/role.guard';

/**
 * 目录查询接口：不登录进不来，带着关键词能查到真实条目。
 * 这一层钉的是"路由接上了、守卫生效了"，查得准不准由 service 的单测负责。
 */
describe('目录查询接口', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IngredientCatalogController],
      providers: [
        FeedAdditiveCatalogService,
        {
          provide: JwtAuthService,
          useValue: {
            validateToken: jest.fn().mockReturnValue({
              userId: 'admin-1',
              customerId: 'admin-1',
              role: 'ADMIN',
            }),
          },
        },
        AuthGuard,
        AdminGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('不登录查不了', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/ingredient-catalog/feed-additives?q=锌')
      .expect(401);
  });

  it('登录后能查到真实条目，并带回数据出处', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/ingredient-catalog/feed-additives?q=甘氨酸锌')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(res.body.data.matches[0].name).toBe('甘氨酸锌');
    expect(res.body.data.matches[0].dogAllowed).toBe(true);
    expect(res.body.data.summary.sourceUrl).toContain('nahs.org.cn');
  });

  it('目录里没有的品种返回空列表，不是报错', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/ingredient-catalog/feed-additives?q=吡啶甲酸锌')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(res.body.data.matches).toEqual([]);
  });
});
