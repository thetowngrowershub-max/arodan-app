// All settings come from environment variables (see .env.example).
const env = process.env;

function required(name) {
  const v = env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: env.DATABASE_SSL === 'true',
  jwtSecret: required('JWT_SECRET'),
  sessionDays: Number(env.SESSION_DAYS ?? 60),
  otpLength: Number(env.OTP_LENGTH ?? 6),
  otpTtlMin: Number(env.OTP_TTL_MIN ?? 10),
  otpMaxPerHour: Number(env.OTP_MAX_PER_HOUR ?? 5),
  // Who sends sign-in codes: 'termii' (we make the code, Termii texts it) or 'messagecentral'
  // (Message Central makes, sends and checks the code). Without credentials, codes go to the server log.
  smsProvider: (env.SMS_PROVIDER ?? 'termii').toLowerCase(),
  messageCentral: {
    customerId: env.MESSAGECENTRAL_CUSTOMER_ID ?? '',
    password: env.MESSAGECENTRAL_PASSWORD ?? '',
    flowType: (env.MESSAGECENTRAL_FLOW ?? 'SMS').toUpperCase(), // SMS or WHATSAPP
    baseUrl: (env.MESSAGECENTRAL_BASE_URL ?? 'https://cpaas.messagecentral.com').replace(/\/$/, ''),
  },
  termii: {
    apiKey: env.TERMII_API_KEY ?? '',
    baseUrl: (env.TERMII_BASE_URL ?? 'https://api.ng.termii.com').replace(/\/$/, ''),
    senderId: env.TERMII_SENDER_ID ?? 'Arodan',
    channel: env.TERMII_CHANNEL ?? 'dnd',
  },
  // "2348031234567:123456,2348039999999:111111" — fixed codes for testers, no SMS sent.
  testPhones: Object.fromEntries(
    (env.TEST_OTP_PHONES ?? '')
      .split(',')
      .map((x) => x.trim().split(':'))
      .filter((x) => x.length === 2 && x[0] && x[1]),
  ),
  corsOrigin: env.CORS_ORIGIN ?? '*',
  // Rider bank payouts by Paystack transfer (https://paystack.com). Without a key, payouts are off.
  paystack: {
    secretKey: env.PAYSTACK_SECRET_KEY ?? '',
    baseUrl: (env.PAYSTACK_BASE_URL ?? 'https://api.paystack.co').replace(/\/$/, ''),
  },
  // Push notifications through Expo's push service. The access token is only needed if you turn on
  // "enhanced security for push notifications" in your Expo account.
  push: {
    enabled: env.PUSH_ENABLED !== 'false',
    expoAccessToken: env.EXPO_ACCESS_TOKEN ?? '',
    expoUrl: env.EXPO_PUSH_URL ?? 'https://exp.host/--/api/v2/push/send',
  },
  // Background jobs (sending push notifications, the nightly payout run). Off in tests.
  workers: env.WORKERS !== 'false',
};

if (!['termii', 'messagecentral'].includes(config.smsProvider)) throw new Error('SMS_PROVIDER must be termii or messagecentral');
if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
