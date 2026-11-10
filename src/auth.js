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
});