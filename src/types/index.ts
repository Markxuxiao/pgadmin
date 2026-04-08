// =====================================================
// 核心类型定义
// =====================================================

export interface Tenant {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive' | 'deleted';
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  tenant_id: string;
  username: string;
  email: string;
  password_hash: string;
  full_name?: string;
  status: 'active' | 'inactive' | 'deleted';
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description?: string;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Permission {
  id: string;
  name: string;
  code: string;
  resource: string;
  action: string;
  description?: string;
  created_at: Date;
}

export interface Menu {
  id: string;
  tenant_id: string;
  parent_id?: string;
  name: string;
  path?: string;
  icon?: string;
  sort_order: number;
  status: 'active' | 'inactive' | 'deleted';
  created_at: Date;
  updated_at: Date;
}

export interface OrgDepartment {
  id: string;
  tenant_id: string;
  parent_id?: string;
  name: string;
  code?: string;
  sort_order: number;
  status: 'active' | 'inactive' | 'deleted';
  created_at: Date;
  updated_at: Date;
}

export interface OperationLog {
  id: string;
  tenant_id: string;
  user_id: string;
  action: string;
  resource?: string;
  resource_id?: string;
  detail?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

// =====================================================
// JWT 和认证类型
// =====================================================

export interface JwtPayload {
  sub: string;        // user id
  tid: string;        // tenant id
  username: string;
  roles: string[];    // role codes
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  username: string;
  roles: string[];
}

// =====================================================
// 请求上下文（Fastify 扩展）
// =====================================================

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

// =====================================================
// 查询参数类型
// =====================================================

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}
