import 'dotenv/config';
import { betterAuth } from 'better-auth';
import pool from './db.js';

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    disableSignUp: true,
  },
  rateLimit: {
    enabled: true,
  },

  advanced: {
    ipAddress: {
      ipAddressHeaders: ['x-nf-client-connection-ip', 'x-forwarded-for'],
    },
  },

  trustedOrigins: (process.env.TRUSTED_ORIGINS || '')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean),
});