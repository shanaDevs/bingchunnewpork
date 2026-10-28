import { describe, expect, it } from 'vitest';
import { IntegrationEventType } from '@bingchun/delivery-domain';

describe('integration event contract', () => {
  it('uses delivery.order_status for outbox relay', () => {
    expect(IntegrationEventType.DELIVERY_ORDER_STATUS).toBe('delivery.order_status');
  });
});
