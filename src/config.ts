import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/pgadmin'),
  JWT_SECRET: z.string().default('dev-secret-change-in-production'),
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});

const env = envSchema.parse(process.env);

export const config = {
  database: {
    url: env.DATABASE_URL
  },
  jwt: {
    secret: env.JWT_SECRET
  },
  app: {
    port: parseInt(env.PORT, 10),
    env: env.NODE_ENV
  }
} as const;

export type Config = typeof config;
