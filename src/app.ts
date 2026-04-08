import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { tenantPlugin } from './plugins/tenant.js';
import { postgrestPlugin } from './plugins/postgrest.js';
import { registerRoutes } from './routes/index.js';

async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.app.env === 'production' ? 'info' : 'debug'
    }
  });

  // 注册插件
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(sensible);
  await app.register(jwt, {
    secret: config.jwt.secret
  });

  // 自定义插件
  await app.register(authPlugin);
  await app.register(tenantPlugin);
  await app.register(postgrestPlugin);

  // 注册路由
  await registerRoutes(app);

  // 健康检查
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return app;
}

async function start() {
  try {
    const app = await buildApp();
    await app.listen({ port: config.app.port, host: '0.0.0.0' });
    app.log.info(`Server running on http://localhost:${config.app.port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// 导出用于测试
export { buildApp };

// 启动
start();
