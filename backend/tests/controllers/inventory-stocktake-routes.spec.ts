import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) =>
  readFileSync(resolve(__dirname, '../..', path), 'utf8');

describe('inventory stocktake routes', () => {
  it('no longer exposes create-and-apply or the old apply route', () => {
    const staff = read('src/interfaces/controllers/staff-inventory.controller.ts');
    const admin = read('src/interfaces/controllers/admin.controller.ts');

    expect(staff).not.toContain("stocktakes/:id/apply");
    expect(admin).not.toContain("stocktakes/:id/apply");
    expect(staff).not.toContain('applyImmediately');
    expect(admin).not.toContain('applyImmediately');
  });

  it('staff can start, preview, submit and cancel a draft', () => {
    const staff = read('src/interfaces/controllers/staff-inventory.controller.ts');

    expect(staff).toContain("@Get('stocktakes/draft')");
    expect(staff).toContain("@Patch('stocktakes/:id/lines')");
    expect(staff).toContain("@Get('stocktakes/:id/preview')");
    expect(staff).toContain("@Post('stocktakes/:id/submit')");
    expect(staff).toContain("@Delete('stocktakes/:id')");
  });

  it('admin review is guarded by AdminGuard', () => {
    const admin = read('src/interfaces/controllers/admin.controller.ts');
    const review = admin.slice(admin.indexOf("inventory/stocktakes/:id/review"));

    expect(review.slice(0, 200)).toContain('AdminGuard');
  });
});
