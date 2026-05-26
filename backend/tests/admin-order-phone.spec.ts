import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('admin order phone visibility', () => {
  it('uses full staff-visible phone data when an order snapshot contains a masked phone', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/interfaces/controllers/admin.controller.ts'),
      'utf8',
    );

    expect(source).toContain('isMaskedPhone(addressSource.phone)');
    expect(source).toContain('currentAddress?.phone');
    expect(source).toContain('phone: addressPhone ?? addressSource.phone');
    expect(source).toContain('select: {');
    expect(source).toContain('phone: true');
  });
});
