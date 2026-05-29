import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { IngredientCreationService } from '../../../src/application/ingredient-creation/ingredient-creation.service';
import { IngredientCreationAgentService } from '../../../src/application/ingredient-creation/ingredient-creation-agent.service';
import { AuthGuard } from '../../../src/interfaces/auth';
import { IngredientCreationController } from '../../../src/interfaces/controllers/ingredient-creation.controller';
import { UpdateIngredientCreationDraftProfileDto } from '../../../src/interfaces/dto/ingredient-creation.dto';
import { StaffGuard } from '../../../src/interfaces/guards/role.guard';

describe('IngredientCreationController metadata', () => {
  it('uses the admin ingredient creation route and staff guards', () => {
    expect(Reflect.getMetadata(PATH_METADATA, IngredientCreationController)).toBe(
      'api/v1/admin/ingredient-creation',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, IngredientCreationController),
    ).toEqual([AuthGuard, StaffGuard]);
  });
});

describe('UpdateIngredientCreationDraftProfileDto validation', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const transformProfile = (payload: Record<string, unknown>) =>
    pipe.transform(payload, {
      type: 'body',
      metatype: UpdateIngredientCreationDraftProfileDto,
    });

  it('accepts a non-negative integer sortOrder as a number', async () => {
    const result = await transformProfile({ sortOrder: 2 });

    expect(result).toBeInstanceOf(UpdateIngredientCreationDraftProfileDto);
    expect(result.sortOrder).toBe(2);
    expect(typeof result.sortOrder).toBe('number');
  });

  it('rejects nullable sortOrder values', async () => {
    await expect(transformProfile({ sortOrder: null })).rejects.toThrow();
  });

  it('rejects empty string sortOrder values', async () => {
    await expect(transformProfile({ sortOrder: '' })).rejects.toThrow();
  });

  it('rejects negative sortOrder values', async () => {
    await expect(transformProfile({ sortOrder: -1 })).rejects.toThrow();
  });
});

describe('IngredientCreationController', () => {
  const staffUser = {
    userId: 'staff-1',
    customerId: 'staff-1',
    role: 'STAFF',
  };
  const adminUser = {
    userId: 'admin-1',
    customerId: 'admin-1',
    role: 'ADMIN',
  };

  const service = {
    createJob: jest.fn(),
    listJobs: jest.fn(),
    getJobDetail: jest.fn(),
    addUserMessage: jest.fn(),
    answerQuestion: jest.fn(),
    rerunDraft: jest.fn(),
    updateDraft: jest.fn(),
    updateDraftProfile: jest.fn(),
    confirmDraft: jest.fn(),
  };

  let controller: IngredientCreationController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new IngredientCreationController(service as any);
  });

  it('creates ingredient creation jobs for the current staff user', async () => {
    service.createJob.mockResolvedValue({ id: 'job-1' });

    const result = await controller.createJob(
      { requestText: '新增鸭胸肉' },
      staffUser,
    );

    expect(service.createJob).toHaveBeenCalledWith({
      requestText: '新增鸭胸肉',
      userId: 'staff-1',
    });
    expect(result).toMatchObject({ code: 0, data: { id: 'job-1' } });
  });

  it('delegates job read and conversation routes with the current user context', async () => {
    const userContext = { userId: 'staff-1', role: 'STAFF' };
    service.listJobs.mockResolvedValue([{ id: 'job-1' }]);
    service.getJobDetail.mockResolvedValue({ id: 'job-1', messages: [] });
    service.addUserMessage.mockResolvedValue({ id: 'job-1', messages: ['m1'] });
    service.answerQuestion.mockResolvedValue({ id: 'job-1', status: 'DRAFTING' });
    service.rerunDraft.mockResolvedValue({ id: 'job-1', status: 'SEARCHING' });

    await expect(controller.listJobs(staffUser)).resolves.toMatchObject({
      code: 0,
      data: [{ id: 'job-1' }],
    });
    await expect(
      controller.getJobDetail('job-1', staffUser),
    ).resolves.toMatchObject({
      code: 0,
      data: { id: 'job-1', messages: [] },
    });
    await expect(
      controller.addMessage('job-1', { content: '补充国产来源' }, staffUser),
    ).resolves.toMatchObject({
      code: 0,
      data: { id: 'job-1', messages: ['m1'] },
    });
    await expect(
      controller.answerQuestion('job-1', { content: '用去皮熟重' }, staffUser),
    ).resolves.toMatchObject({
      code: 0,
      data: { id: 'job-1', status: 'DRAFTING' },
    });
    await expect(controller.rerunDraft('job-1', staffUser)).resolves.toMatchObject(
      {
        code: 0,
        data: { id: 'job-1', status: 'SEARCHING' },
      },
    );

    expect(service.listJobs).toHaveBeenCalledWith(userContext);
    expect(service.getJobDetail).toHaveBeenCalledWith('job-1', userContext);
    expect(service.addUserMessage).toHaveBeenCalledWith(
      'job-1',
      { content: '补充国产来源' },
      userContext,
    );
    expect(service.answerQuestion).toHaveBeenCalledWith(
      'job-1',
      { content: '用去皮熟重' },
      userContext,
    );
    expect(service.rerunDraft).toHaveBeenCalledWith('job-1', userContext);
  });

  it('delegates draft edits with the current admin user context', async () => {
    const userContext = { userId: 'admin-1', role: 'ADMIN' };
    const draftUpdate = {
      suggestedName: '鸭胸肉',
      unitDisplayLabel: 'g',
      procurementStrategy: 'DAILY_PURCHASE' as const,
      diyEnabled: true,
      procurementEnabled: false,
      notes: '优先国产',
    };
    const profileUpdate = {
      role: 'PRIMARY' as const,
      suggestedDisplayNameZh: '鸭胸肉 生',
      preparationState: 'RAW',
      preparationStateLabel: '生',
      ediblePortionLabel: '去皮',
      processingLabel: '修整',
      agentRationale: '最贴近标准档案',
      sortOrder: 1,
    };
    service.updateDraft.mockResolvedValue({ id: 'draft-1', ...draftUpdate });
    service.updateDraftProfile.mockResolvedValue({
      id: 'profile-1',
      ...profileUpdate,
    });

    await expect(
      controller.updateDraft('draft-1', draftUpdate, adminUser),
    ).resolves.toMatchObject({
      code: 0,
      data: { id: 'draft-1', suggestedName: '鸭胸肉' },
    });
    await expect(
      controller.updateDraftProfile('profile-1', profileUpdate, adminUser),
    ).resolves.toMatchObject({
      code: 0,
      data: { id: 'profile-1', role: 'PRIMARY' },
    });

    expect(service.updateDraft).toHaveBeenCalledWith(
      'draft-1',
      draftUpdate,
      userContext,
    );
    expect(service.updateDraftProfile).toHaveBeenCalledWith(
      'profile-1',
      profileUpdate,
      userContext,
    );
  });

  it('passes the current role when confirming a draft', async () => {
    service.confirmDraft.mockResolvedValue({
      id: 'draft-1',
      status: 'CONFIRMED',
    });

    const result = await controller.confirmDraft('draft-1', adminUser);

    expect(service.confirmDraft).toHaveBeenCalledWith('draft-1', {
      userId: 'admin-1',
      role: 'ADMIN',
    });
    expect(result).toMatchObject({
      code: 0,
      data: { id: 'draft-1', status: 'CONFIRMED' },
    });
  });
});

describe('AppModule ingredient creation registration', () => {
  const source = readFileSync(
    join(__dirname, '../../../src/app.module.ts'),
    'utf8',
  );

  it('registers the ingredient creation controller and services', () => {
    expect(source).toContain(
      "import { IngredientCreationController } from './interfaces/controllers/ingredient-creation.controller';",
    );
    expect(source).toContain(
      "import { IngredientCreationService } from './application/ingredient-creation/ingredient-creation.service';",
    );
    expect(source).toContain(
      "import { IngredientCreationAgentService } from './application/ingredient-creation/ingredient-creation-agent.service';",
    );
    expect(source).toMatch(/controllers:\s*\[[\s\S]*IngredientCreationController/);
    expect(source).toMatch(/providers:\s*\[[\s\S]*IngredientCreationService/);
    expect(source).toMatch(
      /providers:\s*\[[\s\S]*IngredientCreationAgentService/,
    );
  });

  it('keeps app module wired to the real injectable classes', () => {
    expect(IngredientCreationService).toBeDefined();
    expect(IngredientCreationAgentService).toBeDefined();
  });
});
