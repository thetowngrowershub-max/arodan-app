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
};

if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
