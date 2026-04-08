import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * 操作日志钩子
 * 在 CRUD 操作后自动记录
 */
export async function auditLog(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  action: string,
  resource: string,
  resourceId?: string
) {
  try {
    await app.db('operation_logs').insert({
      tenant_id: request.auth.tenantId,
      user_id: request.auth.userId,
      action,
      resource,
      resource_id: resourceId || null,
      detail: {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
        ip_address: request.ip,
        user_agent: request.headers['user-agent']
      }
    });
  } catch (err) {
    // 日志记录失败不影响主流程
    app.log.error({ err }, 'Audit log failed');
  }
}

/**
 * 为 CRUD 操作生成审计动作名
 */
export function getAuditAction(method: string, resource: string): string {
  const actions: Record<string, string> = {
    GET: `list_${resource}`,
    GET_DETAIL: `get_${resource}`,
    POST: `create_${resource}`,
    PUT: `update_${resource}`,
    DELETE: `delete_${resource}`
  };
  return actions[method] || `${method.toLowerCase()}_${resource}`;
}
