import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { SupplementChatController } from '../../src/interfaces/controllers/supplement-chat.controller';
import { SupplementAgentService } from '../../src/application/ingredient-creation/supplement-agent.service';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../src/interfaces/auth/jwt.service';
import { AdminGuard } from '../../src/interfaces/guards/role.guard';

describe('补剂对话接口', () => {
  let app: INestApplication;
  const model = { run: jest.fn() };

  beforeEach(async () => {
    model.run.mockReset();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SupplementChatController],
      providers: [
        { provide: SupplementAgentService, useValue: model },
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

  it('模型可用时用模型的答案，并标明来自模型', async () => {
    model.run.mockResolvedValueOnce({
      reply: '我去找锌的候选，找到就摆出来',
      draft: { name: '' },
      toolCalls: [],
      question: null
    });

    const res = await post({
      message: '为什么这么选',
      draft: { name: '', servingUnitsPerDose: null, candidateNames: [] }
    }).expect(201);

    expect(res.body.data.reply).toContain('摆出来');
    expect(res.body.data.draft).toEqual({ name: '' });
    expect(model.run).toHaveBeenCalled();
  });

  it('模型挂了就如实报错（这条路没有规则版可退）', async () => {
    model.run.mockRejectedValueOnce(new Error('模型返回 500'));

    const res = await post({
      message: '为什么这么选',
      draft: { name: '', servingUnitsPerDose: null, candidateNames: [] }
    }).expect(503);

    // 没有规则版兜底了：如实报错，不让页面以为"答了但没做事"
    expect(res.status).toBe(503);
  });

  it('模型自己调工具后给结论：回复、草稿、提问一起回来', async () => {
    model.run.mockResolvedValueOnce({
      reply: '根据 NRC，螯合与硫酸锌相当，建议甘氨酸锌。',
      draft: { brand: 'NOW Foods', servingUnitsPerDose: 1 },
      toolCalls: [{ name: 'search_knowledge', ok: true }],
      question: { question: '选哪个形态？', options: ['甘氨酸锌'] }
    });

    const res = await post({
      message: '加个锌',
      draft: { name: '', servingUnitsPerDose: null, candidateNames: [] }
    }).expect(201);

    expect(res.body.data.reply).toContain('甘氨酸锌');
    expect(res.body.data.draft).toEqual({ brand: 'NOW Foods', servingUnitsPerDose: 1 });
    expect(res.body.data.question.options).toEqual(['甘氨酸锌']);
  });

  it('没有 message 时 400', async () => {
    await post({ draft: { name: '', servingUnitsPerDose: null, candidateNames: [] } }).expect(400);
  });
});
