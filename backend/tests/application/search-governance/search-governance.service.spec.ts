import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SearchGovernanceService } from '../../../src/application/search-governance/search-governance.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('SearchGovernanceService', () => {
  const prisma = {
    searchAliasGroup: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    searchQueryLog: {
      create: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    searchAliasSuggestion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    searchAliasAuditLog: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  } as any;

  let service: SearchGovernanceService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.$queryRaw.mockResolvedValue([]);
    service = new SearchGovernanceService(prisma as PrismaService);
  });

  it('expands query terms from active alias groups in the same domain only', async () => {
    prisma.searchAliasGroup.findMany.mockResolvedValue([
      {
        id: 'group-1',
        domain: 'INGREDIENT',
        canonicalTerm: '西兰花',
        aliases: ['西蓝花', 'broccoli'],
        status: 'ACTIVE',
      },
    ]);

    await expect(service.expandQuery('INGREDIENT', '西蓝花')).resolves.toEqual([
      '西蓝花',
      '西兰花',
      'broccoli',
    ]);

    expect(prisma.searchAliasGroup.findMany).toHaveBeenCalledWith({
      where: { domain: 'INGREDIENT', status: 'ACTIVE' },
      orderBy: { canonicalTerm: 'asc' },
    });
  });

  it('rejects alias conflicts inside the same active domain', async () => {
    prisma.searchAliasGroup.findMany.mockResolvedValue([
      {
        id: 'group-existing',
        domain: 'INGREDIENT',
        canonicalTerm: '三文鱼',
        aliases: ['salmon'],
        status: 'ACTIVE',
      },
    ]);

    await expect(
      service.createAliasGroup(
        {
          domain: 'INGREDIENT',
          canonicalTerm: '鲑鱼',
          aliases: ['salmon'],
          riskLevel: 'LOW',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects canonical term conflicts inside the same active domain', async () => {
    prisma.searchAliasGroup.findMany.mockResolvedValue([
      {
        id: 'group-existing',
        domain: 'INGREDIENT',
        canonicalTerm: '三文鱼',
        aliases: ['salmon'],
        status: 'ACTIVE',
      },
    ]);

    await expect(
      service.createAliasGroup(
        {
          domain: 'INGREDIENT',
          canonicalTerm: 'salmon',
          aliases: ['鲑鱼'],
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates alias groups inside a serializable transaction with a domain lock and JSON-safe audit log', async () => {
    const createdAt = new Date('2026-05-22T08:00:00.000Z');
    const group = {
      id: 'group-1',
      domain: 'INGREDIENT',
      canonicalTerm: '西兰花',
      aliases: ['西蓝花', 'broccoli'],
      status: 'ACTIVE',
      riskLevel: 'LOW',
      notes: null,
      createdAt,
      updatedAt: createdAt,
    };

    prisma.searchAliasGroup.findMany.mockResolvedValue([]);
    prisma.searchAliasGroup.create.mockResolvedValue(group);

    await expect(
      service.createAliasGroup(
        {
          domain: 'INGREDIENT',
          canonicalTerm: ' 西兰花 ',
          aliases: ['西蓝花', ' broccoli ', '西蓝花'],
        },
        'admin-1',
      ),
    ).resolves.toEqual(group);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.anything());
    expect(prisma.searchAliasGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domain: 'INGREDIENT',
        canonicalTerm: '西兰花',
        aliases: ['西蓝花', 'broccoli'],
        riskLevel: 'LOW',
        createdBy: 'admin-1',
        updatedBy: 'admin-1',
      }),
    });
    expect(prisma.searchAliasAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domain: 'INGREDIENT',
        action: 'CREATE_ALIAS_GROUP',
        before: Prisma.DbNull,
        after: expect.objectContaining({
          id: 'group-1',
          createdAt: '2026-05-22T08:00:00.000Z',
          updatedAt: '2026-05-22T08:00:00.000Z',
        }),
        operatorId: 'admin-1',
      }),
    });
  });

  it('uses an advisory lock query that does not return a PostgreSQL void column', async () => {
    const createdAt = new Date('2026-05-22T08:00:00.000Z');
    prisma.searchAliasGroup.findMany.mockResolvedValue([]);
    prisma.searchAliasGroup.create.mockResolvedValue({
      id: 'group-lock',
      domain: 'INGREDIENT',
      canonicalTerm: '胡萝卜',
      aliases: ['红萝卜', 'carrot'],
      status: 'ACTIVE',
      riskLevel: 'LOW',
      notes: null,
      createdAt,
      updatedAt: createdAt,
    });

    await service.createAliasGroup(
      {
        domain: 'INGREDIENT',
        canonicalTerm: '胡萝卜',
        aliases: ['红萝卜', 'carrot'],
      },
      'admin-1',
    );

    const lockQuery = prisma.$queryRaw.mock.calls[0]?.[0];
    expect(lockQuery?.text).toContain('WITH lock AS');
    expect(lockQuery?.text).toContain('SELECT true AS "locked" FROM lock');
    expect(lockQuery?.text).not.toMatch(/^SELECT pg_advisory_xact_lock/);
  });

  it('rejects canonical terms already used by disabled groups before create hits the unique constraint', async () => {
    prisma.searchAliasGroup.findMany.mockImplementation(async (args: any) => {
      if (args.where.status === undefined) {
        return [
          {
            id: 'group-disabled',
            domain: 'INGREDIENT',
            canonicalTerm: '三文鱼',
            aliases: [],
            status: 'DISABLED',
          },
        ];
      }
      return [];
    });

    await expect(
      service.createAliasGroup(
        {
          domain: 'INGREDIENT',
          canonicalTerm: '三文鱼',
          aliases: ['salmon'],
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.searchAliasGroup.create).not.toHaveBeenCalled();
  });

  it('records search events with normalized query text', async () => {
    prisma.searchQueryLog.create.mockResolvedValue({ id: 'log-1' });

    await service.recordSearchEvent({
      domain: 'ORDER',
      source: 'miniapp.staff-orders',
      rawQuery: '  待 支付 ',
      resultCount: 3,
      selectedEntityType: 'Order',
      selectedEntityId: 'order-1',
      selectedEntityName: 'NO20260522001',
      userId: 'staff-1',
    });

    expect(prisma.searchQueryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domain: 'ORDER',
        rawQuery: '  待 支付 ',
        normalizedQuery: '待支付',
        resultCount: 3,
      }),
    });
  });

  it('lists alias groups with enum status filters', async () => {
    prisma.searchAliasGroup.findMany.mockResolvedValue([]);

    await expect(
      service.listAliasGroups({
        domain: 'INGREDIENT',
        status: 'DISABLED',
      }),
    ).resolves.toEqual([]);

    expect(prisma.searchAliasGroup.findMany).toHaveBeenCalledWith({
      where: {
        domain: 'INGREDIENT',
        status: 'DISABLED',
      },
      orderBy: [{ domain: 'asc' }, { canonicalTerm: 'asc' }],
    });
  });

  it('returns search governance overview counts and recent no-result queries', async () => {
    const recentNoResultQueries = [
      {
        id: 'query-1',
        domain: 'INGREDIENT',
        rawQuery: '不存在',
        normalizedQuery: '不存在',
        resultCount: 0,
      },
    ];

    prisma.searchAliasGroup.findMany.mockResolvedValue([
      { id: 'group-1', domain: 'INGREDIENT' },
      { id: 'group-2', domain: 'ORDER' },
    ]);
    prisma.searchAliasSuggestion.findMany.mockResolvedValue([
      { id: 'suggestion-1', domain: 'INGREDIENT' },
    ]);
    prisma.searchQueryLog.findMany.mockResolvedValue(recentNoResultQueries);

    await expect(service.getOverview()).resolves.toEqual({
      activeAliasGroupCount: 2,
      pendingSuggestionCount: 1,
      recentNoResultQueries,
    });

    expect(prisma.searchAliasGroup.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      select: { domain: true, id: true },
    });
    expect(prisma.searchAliasSuggestion.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      select: { domain: true, id: true },
    });
    expect(prisma.searchQueryLog.findMany).toHaveBeenCalledWith({
      where: { resultCount: 0 },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  });

  it('applies approved ADD_ALIAS suggestions in a transaction', async () => {
    prisma.searchAliasSuggestion.findUnique.mockResolvedValue({
      id: 'suggestion-1',
      domain: 'INGREDIENT',
      action: 'ADD_ALIAS',
      status: 'PENDING',
      payload: { canonicalTerm: '鸡胸', aliases: ['鸡胸肉'] },
      riskLevel: 'LOW',
    });
    prisma.searchAliasGroup.findMany.mockResolvedValue([]);
    prisma.searchAliasGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      domain: 'INGREDIENT',
      canonicalTerm: '鸡胸',
      aliases: ['chicken breast'],
      status: 'ACTIVE',
    });
    prisma.searchAliasGroup.update.mockResolvedValue({
      id: 'group-1',
      aliases: ['chicken breast', '鸡胸肉'],
    });
    prisma.searchAliasSuggestion.update.mockResolvedValue({
      id: 'suggestion-1',
      status: 'APPLIED',
    });

    await service.approveSuggestion('suggestion-1', 'admin-1');

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.anything());
    expect(prisma.searchAliasGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: expect.objectContaining({
        aliases: ['chicken breast', '鸡胸肉'],
        updatedBy: 'admin-1',
      }),
    });
    expect(prisma.searchAliasAuditLog.create).toHaveBeenCalled();
  });

  it('applies approved CREATE_GROUP suggestions in a transaction', async () => {
    const createdGroup = {
      id: 'group-2',
      domain: 'INGREDIENT',
      canonicalTerm: '鸭胸',
      aliases: ['duck breast'],
      status: 'ACTIVE',
      riskLevel: 'MEDIUM',
    };

    prisma.searchAliasSuggestion.findUnique.mockResolvedValue({
      id: 'suggestion-2',
      domain: 'INGREDIENT',
      action: 'CREATE_GROUP',
      status: 'PENDING',
      payload: { canonicalTerm: '鸭胸', aliases: ['duck breast'] },
      riskLevel: 'MEDIUM',
    });
    prisma.searchAliasGroup.findMany.mockResolvedValue([]);
    prisma.searchAliasGroup.create.mockResolvedValue(createdGroup);
    prisma.searchAliasSuggestion.update.mockResolvedValue({
      id: 'suggestion-2',
      status: 'APPLIED',
    });

    await service.approveSuggestion('suggestion-2', 'admin-1');

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.anything());
    expect(prisma.searchAliasGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domain: 'INGREDIENT',
        canonicalTerm: '鸭胸',
        aliases: ['duck breast'],
        riskLevel: 'MEDIUM',
        createdBy: 'admin-1',
        updatedBy: 'admin-1',
      }),
    });
    expect(prisma.searchAliasAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domain: 'INGREDIENT',
        action: 'APPLY_SEARCH_ALIAS_SUGGESTION',
        before: Prisma.DbNull,
        after: expect.objectContaining({ id: 'group-2' }),
        suggestionId: 'suggestion-2',
        operatorId: 'admin-1',
      }),
    });
  });

  it('rejects stale approvals when a suggestion changes status after the domain lock', async () => {
    prisma.searchAliasSuggestion.findUnique
      .mockResolvedValueOnce({
        id: 'suggestion-stale',
        domain: 'INGREDIENT',
        action: 'ADD_ALIAS',
        status: 'PENDING',
        payload: { canonicalTerm: '鸡胸', aliases: ['鸡胸肉'] },
        riskLevel: 'LOW',
      })
      .mockResolvedValueOnce({
        id: 'suggestion-stale',
        domain: 'INGREDIENT',
        action: 'ADD_ALIAS',
        status: 'APPLIED',
        payload: { canonicalTerm: '鸡胸', aliases: ['鸡胸肉'] },
        riskLevel: 'LOW',
      });
    prisma.searchAliasGroup.findMany.mockResolvedValue([]);
    prisma.searchAliasGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      domain: 'INGREDIENT',
      canonicalTerm: '鸡胸',
      aliases: ['chicken breast'],
      status: 'ACTIVE',
    });
    prisma.searchAliasGroup.update.mockResolvedValue({
      id: 'group-1',
      aliases: ['chicken breast', '鸡胸肉'],
    });

    await expect(
      service.approveSuggestion('suggestion-stale', 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.searchAliasSuggestion.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.anything());
    expect(prisma.searchAliasGroup.create).not.toHaveBeenCalled();
    expect(prisma.searchAliasGroup.update).not.toHaveBeenCalled();
    expect(prisma.searchAliasAuditLog.create).not.toHaveBeenCalled();
  });

  it('marks malformed approval payloads as FAILED with an error message', async () => {
    prisma.searchAliasSuggestion.findUnique.mockResolvedValue({
      id: 'suggestion-bad-payload',
      domain: 'INGREDIENT',
      action: 'ADD_ALIAS',
      status: 'PENDING',
      payload: { canonicalTerm: '鸡胸', aliases: [{ label: '鸡胸肉' }] },
      riskLevel: 'LOW',
    });
    prisma.searchAliasSuggestion.update.mockResolvedValue({
      id: 'suggestion-bad-payload',
      status: 'FAILED',
      errorMessage: '搜索建议内容不完整',
    });

    await expect(
      service.approveSuggestion('suggestion-bad-payload', 'admin-1'),
    ).resolves.toEqual({
      id: 'suggestion-bad-payload',
      status: 'FAILED',
      errorMessage: '搜索建议内容不完整',
    });

    expect(prisma.searchAliasGroup.update).not.toHaveBeenCalled();
    expect(prisma.searchAliasSuggestion.update).toHaveBeenCalledWith({
      where: { id: 'suggestion-bad-payload' },
      data: expect.objectContaining({
        status: 'FAILED',
        reviewerId: 'admin-1',
        errorMessage: '搜索建议内容不完整',
      }),
    });
  });

  it('marks missing target groups as FAILED with an error message', async () => {
    prisma.searchAliasSuggestion.findUnique.mockResolvedValue({
      id: 'suggestion-missing-target',
      domain: 'INGREDIENT',
      action: 'ADD_ALIAS',
      status: 'PENDING',
      payload: { canonicalTerm: '鸡胸', aliases: ['鸡胸肉'] },
      riskLevel: 'LOW',
    });
    prisma.searchAliasGroup.findFirst.mockResolvedValue(null);
    prisma.searchAliasSuggestion.update.mockResolvedValue({
      id: 'suggestion-missing-target',
      status: 'FAILED',
      errorMessage: '目标别名组不存在',
    });

    await expect(
      service.approveSuggestion('suggestion-missing-target', 'admin-1'),
    ).resolves.toEqual({
      id: 'suggestion-missing-target',
      status: 'FAILED',
      errorMessage: '目标别名组不存在',
    });

    expect(prisma.searchAliasGroup.update).not.toHaveBeenCalled();
    expect(prisma.searchAliasSuggestion.update).toHaveBeenCalledWith({
      where: { id: 'suggestion-missing-target' },
      data: expect.objectContaining({
        status: 'FAILED',
        reviewerId: 'admin-1',
        errorMessage: '目标别名组不存在',
      }),
    });
  });

  it('rejects instead of marking FAILED when audit logging fails after ADD_ALIAS mutation', async () => {
    const auditError = new Error('audit insert failed');

    prisma.searchAliasSuggestion.findUnique.mockResolvedValue({
      id: 'suggestion-audit-failure',
      domain: 'INGREDIENT',
      action: 'ADD_ALIAS',
      status: 'PENDING',
      payload: { canonicalTerm: '鸡胸', aliases: ['鸡胸肉'] },
      riskLevel: 'LOW',
    });
    prisma.searchAliasGroup.findMany.mockResolvedValue([]);
    prisma.searchAliasGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      domain: 'INGREDIENT',
      canonicalTerm: '鸡胸',
      aliases: ['chicken breast'],
      status: 'ACTIVE',
    });
    prisma.searchAliasGroup.update.mockResolvedValue({
      id: 'group-1',
      aliases: ['chicken breast', '鸡胸肉'],
    });
    prisma.searchAliasAuditLog.create.mockRejectedValue(auditError);

    await expect(
      service.approveSuggestion('suggestion-audit-failure', 'admin-1'),
    ).rejects.toThrow('audit insert failed');

    expect(prisma.searchAliasGroup.update).toHaveBeenCalled();
    expect(prisma.searchAliasSuggestion.update).not.toHaveBeenCalledWith({
      where: { id: 'suggestion-audit-failure' },
      data: expect.objectContaining({
        status: 'FAILED',
      }),
    });
  });

  it('rejects instead of marking FAILED when final status update fails after CREATE_GROUP mutation', async () => {
    const statusError = new Error('status update failed');

    prisma.searchAliasSuggestion.findUnique.mockResolvedValue({
      id: 'suggestion-status-failure',
      domain: 'INGREDIENT',
      action: 'CREATE_GROUP',
      status: 'PENDING',
      payload: { canonicalTerm: '鸭胸', aliases: [] },
      riskLevel: 'MEDIUM',
    });
    prisma.searchAliasGroup.findMany.mockResolvedValue([]);
    prisma.searchAliasGroup.create.mockResolvedValue({
      id: 'group-created',
      domain: 'INGREDIENT',
      canonicalTerm: '鸭胸',
      aliases: [],
      status: 'ACTIVE',
      riskLevel: 'MEDIUM',
    });
    prisma.searchAliasAuditLog.create.mockResolvedValue({ id: 'audit-1' });
    prisma.searchAliasSuggestion.update.mockRejectedValue(statusError);

    await expect(
      service.approveSuggestion('suggestion-status-failure', 'admin-1'),
    ).rejects.toThrow('status update failed');

    expect(prisma.searchAliasGroup.create).toHaveBeenCalled();
    expect(prisma.searchAliasAuditLog.create).toHaveBeenCalled();
    expect(prisma.searchAliasSuggestion.update).toHaveBeenCalledTimes(1);
    expect(prisma.searchAliasSuggestion.update).not.toHaveBeenCalledWith({
      where: { id: 'suggestion-status-failure' },
      data: expect.objectContaining({
        status: 'FAILED',
      }),
    });
  });

  it('rejects suggestions without mutating alias groups', async () => {
    prisma.searchAliasSuggestion.findUnique.mockResolvedValue({
      id: 'suggestion-1',
      status: 'PENDING',
    });
    prisma.searchAliasSuggestion.update.mockResolvedValue({
      id: 'suggestion-1',
      status: 'REJECTED',
    });

    await service.rejectSuggestion('suggestion-1', 'admin-1');

    expect(prisma.searchAliasGroup.update).not.toHaveBeenCalled();
    expect(prisma.searchAliasSuggestion.update).toHaveBeenCalledWith({
      where: { id: 'suggestion-1' },
      data: expect.objectContaining({
        status: 'REJECTED',
        reviewerId: 'admin-1',
      }),
    });
  });

  it('refuses to reject non-PENDING suggestions', async () => {
    prisma.searchAliasSuggestion.findUnique.mockResolvedValue({
      id: 'suggestion-1',
      status: 'APPLIED',
    });

    await expect(
      service.rejectSuggestion('suggestion-1', 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.searchAliasSuggestion.update).not.toHaveBeenCalled();
  });

  it('generates deterministic suggestions from query logs', async () => {
    prisma.searchQueryLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        domain: 'INGREDIENT',
        rawQuery: '鸡胸肉',
        normalizedQuery: '鸡胸肉',
        resultCount: 4,
        selectedEntityName: '鸡胸',
      },
      {
        id: 'log-2',
        domain: 'INGREDIENT',
        rawQuery: '鸡胸肉',
        normalizedQuery: '鸡胸肉',
        resultCount: 8,
        selectedEntityName: '鸡胸',
      },
      {
        id: 'log-3',
        domain: 'INGREDIENT',
        rawQuery: '鸭胗',
        normalizedQuery: '鸭胗',
        resultCount: 0,
        selectedEntityName: null,
      },
      {
        id: 'log-4',
        domain: 'INGREDIENT',
        rawQuery: '鸭胗',
        normalizedQuery: '鸭胗',
        resultCount: 0,
        selectedEntityName: null,
      },
      {
        id: 'log-5',
        domain: 'INGREDIENT',
        rawQuery: '鸭胗',
        normalizedQuery: '鸭胗',
        resultCount: 0,
        selectedEntityName: null,
      },
    ]);
    prisma.searchAliasGroup.findMany.mockResolvedValue([]);
    prisma.searchAliasSuggestion.findMany.mockResolvedValue([]);
    prisma.searchAliasSuggestion.create
      .mockResolvedValueOnce({ id: 'suggestion-add' })
      .mockResolvedValueOnce({ id: 'suggestion-create' });

    await expect(
      service.generateSuggestions({ domain: 'INGREDIENT', days: 7 }),
    ).resolves.toEqual([{ id: 'suggestion-add' }, { id: 'suggestion-create' }]);

    expect(prisma.searchAliasSuggestion.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        domain: 'INGREDIENT',
        action: 'ADD_ALIAS',
        payload: { canonicalTerm: '鸡胸', aliases: ['鸡胸肉'] },
        riskLevel: 'LOW',
      }),
    });
    expect(prisma.searchAliasSuggestion.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        domain: 'INGREDIENT',
        action: 'CREATE_GROUP',
        payload: { canonicalTerm: '鸭胗', aliases: [] },
        riskLevel: 'MEDIUM',
      }),
    });
  });

  it('skips generated suggestions already represented by active groups or pending suggestions', async () => {
    prisma.searchQueryLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        domain: 'INGREDIENT',
        rawQuery: '鸡胸肉',
        normalizedQuery: '鸡胸肉',
        resultCount: 2,
        selectedEntityName: '鸡胸',
      },
      {
        id: 'log-2',
        domain: 'INGREDIENT',
        rawQuery: '鸭胗',
        normalizedQuery: '鸭胗',
        resultCount: 0,
        selectedEntityName: null,
      },
      {
        id: 'log-3',
        domain: 'INGREDIENT',
        rawQuery: '鸭胗',
        normalizedQuery: '鸭胗',
        resultCount: 0,
        selectedEntityName: null,
      },
      {
        id: 'log-4',
        domain: 'INGREDIENT',
        rawQuery: '鸭胗',
        normalizedQuery: '鸭胗',
        resultCount: 0,
        selectedEntityName: null,
      },
      {
        id: 'log-5',
        domain: 'INGREDIENT',
        rawQuery: '火鸡肝',
        normalizedQuery: '火鸡肝',
        resultCount: 0,
        selectedEntityName: null,
      },
      {
        id: 'log-6',
        domain: 'INGREDIENT',
        rawQuery: 'turkey liver',
        normalizedQuery: 'turkeyliver',
        resultCount: 0,
        selectedEntityName: null,
      },
      {
        id: 'log-7',
        domain: 'INGREDIENT',
        rawQuery: '火鸡肝',
        normalizedQuery: '火鸡肝',
        resultCount: 0,
        selectedEntityName: null,
      },
    ]);
    prisma.searchAliasGroup.findMany.mockResolvedValue([
      {
        id: 'group-1',
        domain: 'INGREDIENT',
        canonicalTerm: '鸡胸',
        aliases: ['鸡胸肉'],
        status: 'ACTIVE',
      },
    ]);
    prisma.searchAliasSuggestion.findMany.mockResolvedValue([
      {
        id: 'suggestion-existing',
        domain: 'INGREDIENT',
        action: 'CREATE_GROUP',
        status: 'PENDING',
        payload: { canonicalTerm: '鸭胗', aliases: [] },
      },
    ]);

    await expect(
      service.generateSuggestions({ domain: 'INGREDIENT', days: 7 }),
    ).resolves.toEqual([]);

    expect(prisma.searchAliasSuggestion.create).not.toHaveBeenCalled();
  });
});
