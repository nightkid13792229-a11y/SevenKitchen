import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { SupplementChatController } from '../../src/interfaces/controllers/supplement-chat.controller';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../src/interfaces/auth/jwt.service';
import { AdminGuard } from '../../src/interfaces/guards/role.guard';

describe('补剂对话接口', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SupplementChatController],
      providers: [
        {
          provide: JwtAuthService,
          useValue: {
            validateToken: jest.fn().mockReturnValue({
              userId: 'admin-1',
              customerId: 'admin-1',
              role: 'ADMIN'
            })
          }
        },
        AuthGuard,
        AdminGuard
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/admin/ingredient-supplement-chat/respond')
      .set('Authorization', 'Bearer token')
      .send(body);

  it('不登录不能对话', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/ingredient-supplement-chat/respond')
      .send({ message: '加个锌', draft: { name: '', servingUnitsPerDose: null, candidateNames: [] } })
      .expect(401);
  });

  it('「加个锌」→ 回一句 + 一个搜索动作', async () => {
    const res = await post({
      message: '给狗狗加个锌',
      draft: { name: '', servingUnitsPerDose: null, candidateNames: [] }
    }).expect(201);

    expect(res.body.data.reply).toContain('锌');
    expect(res.body.data.actions).toEqual([{ type: 'SEARCH_CANDIDATES', keyword: '锌' }]);
  });

  it('没有 message 时 400', async () => {
    await post({ draft: { name: '', servingUnitsPerDose: null, candidateNames: [] } }).expect(400);
  });
});
