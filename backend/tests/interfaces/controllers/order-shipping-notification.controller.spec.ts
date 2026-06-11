import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('OrdersController shipping notification endpoints', () => {
  const controllerSource = readFileSync(
    resolve(process.cwd(), 'src/interfaces/controllers/orders.controller.ts'),
    'utf8',
  );
  const appModuleSource = readFileSync(
    resolve(process.cwd(), 'src/app.module.ts'),
    'utf8',
  );

  it('exposes customer endpoints for shipping notification preference, subscription choice, and notice page data', () => {
    expect(controllerSource).toContain("Get(':orderId/shipping-notification/preference')");
    expect(controllerSource).toContain("Post(':orderId/shipping-notification/subscription')");
    expect(controllerSource).toContain("Get(':orderId/shipping-notice')");
    expect(controllerSource).toContain('recordCustomerChoice');
    expect(controllerSource).toContain('getCustomerPreference');
    expect(controllerSource).toContain('getCustomerShippingNotice');
  });

  it('registers the shipping notification service in the Nest app module', () => {
    expect(appModuleSource).toContain('ShippingNotificationService');
    expect(appModuleSource).toContain('./application/shipping/shipping-notification.service');
  });
});
