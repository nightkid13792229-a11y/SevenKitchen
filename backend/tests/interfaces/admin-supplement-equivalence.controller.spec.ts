import { AdminSupplementEquivalenceController } from '../../src/interfaces/controllers/admin-supplement-equivalence.controller';
import { AdminGuard, StaffGuard } from '../../src/interfaces/guards/role.guard';
import { AuthGuard } from '../../src/interfaces/auth';

function buildServiceMock() {
  return {
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    create: jest.fn().mockResolvedValue({ id: 'g1' }),
    getById: jest.fn().mockResolvedValue({ id: 'g1' }),
    update: jest.fn().mockResolvedValue({ id: 'g1' }),
    changeStatus: jest.fn().mockResolvedValue({ id: 'g1' }),
    addMembers: jest.fn().mockResolvedValue({ id: 'g1' }),
    removeMember: jest.fn().mockResolvedValue({ id: 'g1' }),
    removeGroup: jest.fn().mockResolvedValue(undefined),
    listUngrouped: jest.fn().mockResolvedValue([]),
    assign: jest.fn().mockResolvedValue({ moved: 1, skipped: 0 }),
    summary: jest.fn().mockResolvedValue({ total: 0 }),
  };
}

describe('AdminSupplementEquivalenceController', () => {
  const user = { userId: 'admin-1', customerId: 'admin-1', role: 'ADMIN' };
  let service: ReturnType<typeof buildServiceMock>;
  let controller: AdminSupplementEquivalenceController;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new AdminSupplementEquivalenceController(service as any);
  });

  it('uses the current user as the audit operator', async () => {
    await controller.create(
      {
        code: 'CALCIUM_MINERAL_SALT',
        name: '钙 · 矿物盐',
        nutrientKey: 'minerals.calcium',
        nutrientLabel: '钙',
        nutrientUnit: 'mg',
      },
      user,
    );

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CALCIUM_MINERAL_SALT' }),
      { id: 'admin-1', name: 'admin-1' },
    );
  });

  it('submits for review and records the reviewer action', async () => {
    await controller.submit('g1', user);
    expect(service.changeStatus).toHaveBeenCalledWith(
      'g1',
      'PENDING_REVIEW',
      { id: 'admin-1', name: 'admin-1' },
    );

    await controller.review('g1', { status: 'APPROVED', reviewNote: '通过' }, user);
    expect(service.changeStatus).toHaveBeenCalledWith(
      'g1',
      'APPROVED',
      { id: 'admin-1', name: 'admin-1' },
      '通过',
    );
  });

  it('guards review/delete with AdminGuard and the rest with StaffGuard', () => {
    const classGuards =
      Reflect.getMetadata('__guards__', AdminSupplementEquivalenceController) ?? [];
    expect(classGuards).toEqual(expect.arrayContaining([AuthGuard, StaffGuard]));

    const reviewGuards =
      Reflect.getMetadata(
        '__guards__',
        AdminSupplementEquivalenceController.prototype.review,
      ) ?? [];
    expect(reviewGuards).toContain(AdminGuard);

    const deleteGuards =
      Reflect.getMetadata(
        '__guards__',
        AdminSupplementEquivalenceController.prototype.remove,
      ) ?? [];
    expect(deleteGuards).toContain(AdminGuard);
  });
});
