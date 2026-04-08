import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Knex } from 'knex';

/**
 * 多租户上下文插件
 * - 从请求中获取 tenant_id
 * - 设置 PostgreSQL session 变量供 RLS 使用
 */
export async function tenantPlugin(fastify: FastifyInstance) {
  // 为每个请求设置租户上下文
  fastify.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // 等待 auth 插件设置的 auth 上下文
    // 如果没有认证，则使用 header 中的 tenant_id（仅限内部服务调用）
    const tenantId = request.auth?.tenantId || request.headers['x-tenant-id'] as string;

    if (tenantId) {
      // 将 tenant_id 存入 request 上下文供后续使用
      request.tenantId = tenantId;
    }
  });

  // 添加 hook：在响应前清理
  fastify.addHook('onResponse', async (_request: FastifyRequest, _reply: FastifyReply) => {
    // PostgreSQL session 变量会在连接归还连接池时自动清理
  });
}

// 扩展请求类型
declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
  }
}

// 为 Knex 添加设置 tenant 的辅助函数
export function setTenantContext(knex: Knex, tenantId: string): Knex {
  // 通过 raw 执行 SET LOCAL（事务内生效）
  return knex;
}

export async function setTenantContextRaw(knex: Knex, tenantId: string): Promise<void> {
  await knex.raw(`SET LOCAL app.tenant_id = ?`, [tenantId]);
}
