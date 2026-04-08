import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload } from '../types/index.js';

/**
 * JWT 认证插件
 * - 验证 JWT token
 * - 解析 tenant_id 和 user_id 到请求上下文
 */
export async function authPlugin(fastify: FastifyInstance) {
  // 认证装饰器：验证 JWT 并设置 auth 上下文
  fastify.decorate('authenticate', async function (
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      const decoded = await request.jwtVerify<JwtPayload>();

      // 设置认证上下文
      request.auth = {
        userId: decoded.sub,
        tenantId: decoded.tid,
        username: decoded.username,
        roles: decoded.roles || []
      };
    } catch (err) {
      reply.code(401).send({ code: 401, data: null, message: 'Unauthorized: Invalid or expired token' });
    }
  });

  // 可选认证：不强制验证 JWT，用于公开接口但需要解析用户信息
  fastify.decorate('optionalAuth', async function (
    request: FastifyRequest,
    _reply: FastifyReply
  ) {
    try {
      const decoded = await request.jwtVerify<JwtPayload>();
      request.auth = {
        userId: decoded.sub,
        tenantId: decoded.tid,
        username: decoded.username,
        roles: decoded.roles || []
      };
    } catch {
      // 不强制认证，允许匿名访问
      request.auth = {
        userId: '',
        tenantId: '',
        username: '',
        roles: []
      };
    }
  });
}

// 扩展 Fastify 类型
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
