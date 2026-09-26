import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  const userId = '507f1f77bcf86cd799439011';

  const users = {
    findById: () => ({
      select: () => ({
        lean: () => ({ exec: async () => ({ role: 'wholesaler' }) }),
      }),
    }),
  };

  it('re-reads the draft subscription when the upsert does not return a row', async () => {
    const draft = {
      _id: 'subscription-id',
      userId,
      amount: 50,
      planId: 'P-50',
      requestId: 'request-id',
      paypalSubscriptionId: null,
      status: 'CREATING',
      paidUntil: null,
      approvalUrl: null,
    };
    const model = {
      findOne: jest
        .fn()
        .mockReturnValueOnce({ exec: async () => null })
        .mockReturnValueOnce({ exec: async () => draft }),
      findOneAndUpdate: jest.fn(() => ({ exec: async () => null })),
      updateOne: jest.fn(() => ({ exec: async () => ({}) })),
    };
    const paypal = {
      subscriptionRequest: jest.fn().mockResolvedValue({
        id: 'I-TEST',
        status: 'APPROVAL_PENDING',
        links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/approval' }],
      }),
    };
    const service = new SubscriptionsService(
      model as never,
      users as never,
      paypal as never,
      new ConfigService({
        SUBSCRIPTION_MODE: 'paypal',
        APP_URL: 'https://seller.tractcorp.com',
        paypal: { wholesalerPlanId: 'P-50' },
      }),
    );

    await expect(service.create(userId, '2026-09-07')).resolves.toMatchObject({
      approvalUrl: 'https://www.sandbox.paypal.com/approval',
    });
    expect(model.findOne).toHaveBeenLastCalledWith({ userId: expect.anything() });
    expect(paypal.subscriptionRequest).toHaveBeenCalledWith(
      'POST',
      '/v1/billing/subscriptions',
      expect.objectContaining({ plan_id: 'P-50', custom_id: userId }),
      'request-id',
    );
  });
});
