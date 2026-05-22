import { SearchGovernanceController } from '../../../src/interfaces/controllers/search-governance.controller';

describe('SearchGovernanceController', () => {
  const service = {
    getOverview: jest.fn(),
    listAliasGroups: jest.fn(),
    createAliasGroup: jest.fn(),
    updateAliasGroup: jest.fn(),
    disableAliasGroup: jest.fn(),
    getQueryInsights: jest.fn(),
    listSuggestions: jest.fn(),
    generateSuggestions: jest.fn(),
    approveSuggestion: jest.fn(),
    rejectSuggestion: jest.fn(),
  } as any;

  const currentUser = { userId: 'admin-1', role: 'ADMIN' } as any;
  let controller: SearchGovernanceController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new SearchGovernanceController(service);
  });

  it('creates alias groups with CurrentUser id', async () => {
    service.createAliasGroup.mockResolvedValue({ id: 'group-1' });

    await expect(
      controller.createAliasGroup(
        {
          domain: 'INGREDIENT',
          canonicalTerm: '鸡胸',
          aliases: ['鸡胸肉'],
          riskLevel: 'LOW',
        },
        currentUser,
      ),
    ).resolves.toMatchObject({ code: 0, data: { id: 'group-1' } });

    expect(service.createAliasGroup).toHaveBeenCalledWith(
      {
        domain: 'INGREDIENT',
        canonicalTerm: '鸡胸',
        aliases: ['鸡胸肉'],
        riskLevel: 'LOW',
      },
      'admin-1',
    );
  });

  it('approves suggestions with CurrentUser id', async () => {
    service.approveSuggestion.mockResolvedValue({
      id: 'suggestion-1',
      status: 'APPLIED',
    });

    await controller.approveSuggestion('suggestion-1', currentUser);

    expect(service.approveSuggestion).toHaveBeenCalledWith(
      'suggestion-1',
      'admin-1',
    );
  });

  it('lists alias groups with query filters', async () => {
    service.listAliasGroups.mockResolvedValue([{ id: 'group-1' }]);

    await expect(
      controller.listAliasGroups({ domain: 'INGREDIENT', status: 'ACTIVE' }),
    ).resolves.toMatchObject({ code: 0, data: [{ id: 'group-1' }] });

    expect(service.listAliasGroups).toHaveBeenCalledWith({
      domain: 'INGREDIENT',
      status: 'ACTIVE',
    });
  });

  it('updates alias groups with CurrentUser id', async () => {
    const payload = {
      domain: 'INGREDIENT' as const,
      canonicalTerm: '鸡胸',
      aliases: ['鸡胸肉', '鸡肉胸'],
      riskLevel: 'MEDIUM' as const,
    };
    service.updateAliasGroup.mockResolvedValue({ id: 'group-1' });

    await expect(
      controller.updateAliasGroup('group-1', payload, currentUser),
    ).resolves.toMatchObject({ code: 0, data: { id: 'group-1' } });

    expect(service.updateAliasGroup).toHaveBeenCalledWith(
      'group-1',
      payload,
      'admin-1',
    );
  });

  it('disables alias groups with CurrentUser id', async () => {
    service.disableAliasGroup.mockResolvedValue({
      id: 'group-1',
      status: 'DISABLED',
    });

    await controller.disableAliasGroup('group-1', currentUser);

    expect(service.disableAliasGroup).toHaveBeenCalledWith(
      'group-1',
      'admin-1',
    );
  });

  it('generates suggestions from request body', async () => {
    service.generateSuggestions.mockResolvedValue([{ id: 'suggestion-1' }]);

    await expect(
      controller.generateSuggestions({ domain: 'INGREDIENT', days: 7 }),
    ).resolves.toMatchObject({
      code: 0,
      data: [{ id: 'suggestion-1' }],
    });

    expect(service.generateSuggestions).toHaveBeenCalledWith({
      domain: 'INGREDIENT',
      days: 7,
    });
  });

  it('rejects suggestions with CurrentUser id', async () => {
    service.rejectSuggestion.mockResolvedValue({
      id: 'suggestion-1',
      status: 'REJECTED',
    });

    await controller.rejectSuggestion('suggestion-1', currentUser);

    expect(service.rejectSuggestion).toHaveBeenCalledWith(
      'suggestion-1',
      'admin-1',
    );
  });
});
