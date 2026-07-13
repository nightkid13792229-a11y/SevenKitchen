import { readFileSync } from 'fs';
import { join } from 'path';

describe('phase orders closed-loop verification', () => {
  it('sends custom requirements as text when creating an order', () => {
    const script = readFileSync(
      join(__dirname, '../../scripts/phase_orders_closed_loop_verify.sh'),
      'utf8',
    );
    const field = script.match(
      /^\s*\\"customRequirements\\":\s*(?<value>.+?)(?:,)?$/m,
    )?.groups?.value;

    expect(field).toBeDefined();
    const request = JSON.parse(
      `{\"customRequirements\": ${field!.replaceAll('\\"', '"')}}`,
    );

    expect(typeof request.customRequirements).toBe('string');
  });
});
