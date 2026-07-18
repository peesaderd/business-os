const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  port: parseInt(process.env.PORT || '8122'),
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder',
  },
  db: { path: process.env.DB_PATH || './data/payment.db' },
  erpMcp: {
    url: process.env.ERP_MCP_URL || 'http://localhost:18789',
  },
  wpilot: {
    apiUrl: process.env.WPILOT_API_URL || 'http://localhost:8118/api/wpilot',
  },
  adminApiKey: process.env.ADMIN_API_KEY || 'bos_payment_admin_2026',
  promptpayNumber: process.env.PROMPTPAY_NUMBER || '0993946144',

  // Product plans (sync with Stripe)
  plans: [
    {
      id: 'solo',
      name: 'Solo',
      price: 19,
      currency: 'usd',
      interval: 'month',
      stripePriceId: 'price_solo_monthly',
      features: ['1 site', 'AI auto-update', '20 content/mo', '50 images/mo'],
    },
    {
      id: 'business',
      name: 'Business',
      price: 79,
      currency: 'usd',
      interval: 'month',
      stripePriceId: 'price_business_monthly',
      features: ['5 sites', 'Auto rollback', '200 content/mo', '500 images/mo', '20 videos/mo', 'ERP sync', 'Priority support'],
    },
    {
      id: 'agency',
      name: 'Agency',
      price: 199,
      currency: 'usd',
      interval: 'month',
      stripePriceId: 'price_agency_monthly',
      features: ['25 sites', 'Unlimited', 'White-label', 'API access', 'Multi-user', 'Dedicated support'],
    },
  ],
};
