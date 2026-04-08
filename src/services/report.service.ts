import type { Knex } from 'knex';

export interface SalesReportRow {
  day: Date;
  product_id: string;
  product_name: string;
  total_amount: string;
  total_quantity: string;
  running_total: string;
  growth_rate: string | null;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalRoles: number;
  totalPermissions: number;
}

/**
 * 报务服务 - 处理复杂报表和数据分析
 *
 * 场景示例：
 * - 销售报表（多表聚合、窗口函数）
 * - 用户行为分析
 * - 数据统计面板
 */
export class ReportService {
  constructor(private knex: Knex) {}

  /**
   * 销售日报表（带累计和增长率）
   */
  async getSalesReport(
    tenantId: string,
    dateRange: { from: Date; to: Date },
    groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<SalesReportRow[]> {
    const dateTrunc = groupBy === 'day' ? 'day' : groupBy === 'week' ? 'week' : 'month';

    const result = await this.knex.raw(`
      SELECT
        date_trunc('${dateTrunc}', s.created_at) as day,
        s.product_id,
        p.name as product_name,
        SUM(s.amount) as total_amount,
        SUM(s.quantity) as total_quantity,
        SUM(s.amount) OVER (
          PARTITION BY s.product_id
          ORDER BY date_trunc('${dateTrunc}', s.created_at)
        ) as running_total,
        CASE
          WHEN LAG(SUM(s.amount)) OVER (PARTITION BY s.product_id ORDER BY date_trunc('${dateTrunc}', s.created_at)) = 0
          THEN NULL
          ELSE ROUND(
            (SUM(s.amount) - LAG(SUM(s.amount)) OVER (PARTITION BY s.product_id ORDER BY date_trunc('${dateTrunc}', s.created_at)))
            / NULLIF(LAG(SUM(s.amount)) OVER (PARTITION BY s.product_id ORDER BY date_trunc('${dateTrunc}', s.created_at)), 0)
            * 100, 2
          )
        END as growth_rate
      FROM sales s
      JOIN products p ON s.product_id = p.id
      WHERE s.tenant_id = ?
        AND s.created_at BETWEEN ? AND ?
      GROUP BY day, s.product_id, p.name
      ORDER BY day DESC, total_amount DESC
    `, [tenantId, dateRange.from, dateRange.to]);

    return result.rows;
  }

  /**
   * 用户活跃度统计
   */
  async getUserActivityReport(tenantId: string, days: number = 30) {
    const result = await this.knex.raw(`
      WITH daily_logins AS (
        SELECT
          date_trunc('day', created_at) as login_date,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(*) as total_actions
        FROM operation_logs
        WHERE tenant_id = ?
          AND created_at >= NOW() - INTERVAL '1 day' * ?
        GROUP BY login_date
      ),
      stats AS (
        SELECT
          MIN(login_date) as first_day,
          MAX(login_date) as last_day,
          SUM(unique_users) as total_unique_users,
          SUM(total_actions) as total_actions,
          AVG(unique_users)::int as avg_daily_users,
          MAX(unique_users) as peak_users,
          MIN(unique_users) as min_users
        FROM daily_logins
      )
      SELECT
        to_char(first_day, 'YYYY-MM-DD') as first_day,
        to_char(last_day, 'YYYY-MM-DD') as last_day,
        total_unique_users,
        total_actions,
        avg_daily_users,
        peak_users,
        min_users,
        CASE
          WHEN total_unique_users > 0
          THEN ROUND((peak_users::numeric / total_unique_users) * 100, 2)
          ELSE 0
        END as retention_rate_pct
      FROM stats
    `, [tenantId, days]);

    return result.rows[0];
  }

  /**
   * 仪表盘统计数据（一次查询获取所有统计）
   */
  async getDashboardStats(tenantId: string): Promise<DashboardStats> {
    const result = await this.knex.raw(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id = ?) as total_users,
        (SELECT COUNT(*) FROM users WHERE tenant_id = ? AND status = 'active') as active_users,
        (SELECT COUNT(*) FROM roles WHERE tenant_id = ? AND status = 'active') as total_roles,
        (SELECT COUNT(*) FROM permissions) as total_permissions
    `, [tenantId, tenantId, tenantId]);

    const row = result.rows[0];
    return {
      totalUsers: Number(row.total_users),
      activeUsers: Number(row.active_users),
      totalRoles: Number(row.total_roles),
      totalPermissions: Number(row.total_permissions)
    };
  }

  /**
   * 角色使用统计（哪些角色被分配最多）
   */
  async getRoleUsageStats(tenantId: string) {
    const result = await this.knex.raw(`
      SELECT
        r.id,
        r.name,
        r.code,
        r.is_system,
        COUNT(ur.id)::int as user_count,
        AVG(user_stats.login_count)::int as avg_user_actions
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as login_count
        FROM operation_logs ol
        WHERE ol.user_id = ur.user_id
      ) user_stats ON true
      WHERE r.tenant_id = ?
      GROUP BY r.id, r.name, r.code, r.is_system
      ORDER BY user_count DESC
    `, [tenantId]);

    return result.rows;
  }

  /**
   * 操作日志聚合（按操作类型和资源分组）
   */
  async getOperationSummary(tenantId: string, days: number = 7) {
    const result = await this.knex.raw(`
      SELECT
        action,
        resource,
        COUNT(*)::int as total_count,
        COUNT(DISTINCT user_id)::int as unique_users,
        COUNT(DISTINCT date_trunc('day', created_at))::int as active_days,
        MAX(created_at) as last_occurrence
      FROM operation_logs
      WHERE tenant_id = ?
        AND created_at >= NOW() - INTERVAL '1 day' * ?
      GROUP BY action, resource
      ORDER BY total_count DESC
      LIMIT 50
    `, [tenantId, days]);

    return result.rows;
  }
}
