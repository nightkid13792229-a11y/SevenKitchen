import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { SupplementChatController } from '../../src/interfaces/controllers/supplement-chat.controller';
import { SupplementChatAgentService } from '../../src/application/ingredient-creation/supplement-chat-agent.service';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../src/interfaces/auth/jwt.service';
import { AdminGuard } from '../../src/interfaces/guards/role.guard';

describe('补剂对话接口', () => {
  let app: INestApplication;
  const model = { respond: jest.fn() };

  beforeEach(async () => {
    model.respond.mockReset();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SupplementChatController],
      providers: [
        { provide: SupplementChatAgentService, useValue: model },
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
    model.respond.mockResolvedValueOnce({
      reply: '我去找锌的候选，找到就摆出来',
      actions: [{ type: 'SEARCH_CANDIDATES', keyword: '锌' }]
    });

    const res = await post({
      message: '为什么这么选',
      draft: { name: '', servingUnitsPerDose: null, candidateNames: [] }
    }).expect(201);

    expect(res.body.data.source).toBe('MODEL');
    expect(res.body.data.reply).toContain('摆出来');
    expect(model.respond).toHaveBeenCalled();
  });

  it('模型挂了就回退到规则，并如实标明来源', async () => {
    model.respond.mockRejectedValueOnce(new Error('模型返回 500'));

    const res = await post({
      message: '为什么这么选',
      draft: { name: '', servingUnitsPerDose: null, candidateNames: [] }
    }).expect(201);

    expect(res.body.data.source).toBe('RULES');
    // 回退用的是规则版对「为什么」的回答
    expect(res.body.data.reply).toContain('形态');
  });

  it('无歧义的命令不劳模型：直接走规则，并标明 RULES_FAST', async () => {
    const res = await post({
      message: '每份 2 粒',
      draft: { name: '', servingUnitsPerDose: null, candidateNames: [] }
    }).expect(201);

    expect(res.body.data.source).toBe('RULES_FAST');
    expect(res.body.data.actions).toEqual([
      { type: 'SET_FIELD', field: 'servingUnitsPerDose', value: 2 }
    ]);
    expect(model.respond).not.toHaveBeenCalled();
  });

  it('「加个锌」→ 回一句 + 一个搜索动作', async () => {
    model.respond.mockResolvedValueOnce({
      reply: '我去找「锌」的候选',
      actions: [{ type: 'SEARCH_CANDIDATES', keyword: '锌' }]
    });
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
