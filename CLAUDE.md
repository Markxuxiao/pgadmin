# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Universal backend admin management API built with Fastify + TypeScript + PostgreSQL. Implements multi-tenancy via PostgreSQL Row-Level Security (RLS) and JWT-based RBAC.

## Commands

```bash
pnpm dev          # Start dev server with hot-reload (tsx watch)
pnpm build        # Compile TypeScript to dist/
pnpm start        # Run production server
pnpm test         # Run tests once (vitest run)
pnpm test:watch   # Run tests in watch mode
pnpm knex          # Run Knex CLI
pnpm knex:migrate  # Run database migrations
```

## Architecture

### Tech Stack
- **Fastify 5.x** - Web framework
- **Knex 3.x** - Query builder / migrations
- **PostgreSQL** - Database with RLS for tenant isolation
- **Zod** - Schema validation
- **Vitest 3.x** - Testing

### Directory Structure
```
src/
├── app.ts              # Main entry, Fastify server setup
├── config.ts           # Zod-validated environment config
├── plugins/
│   ├── auth.ts         # JWT authentication plugin
│   ├── tenant.ts       # Multi-tenant context (sets PostgreSQL session var)
│   └── postgrest.ts    # PostgREST-style query builder (camelCase↔snake_case)
├── routes/
│   ├── auth/login.ts   # Public: POST /api/auth/login, /register
│   └── admin/          # Protected: /api/admin/{users,roles,permissions,menus}
└── services/           # Complex queries (user.service.ts, report.service.ts)
db/
├── knexfile.ts
└── migrations/          # SQL migrations for schema + RLS policies
```

### Multi-Tenancy

Tenant isolation is enforced at the database level via PostgreSQL RLS. The `tenant.ts` plugin sets `app.tenant_id` PostgreSQL session variable on each request. All tenant-scoped tables have RLS policies restricting access to rows where `tenant_id = current_setting('app.tenant_id')`.

### API Routes

**Public** (no auth):
- `POST /api/auth/login`
- `POST /api/auth/register`

**Protected** (JWT required, `/api/admin/*`):
- `/api/admin/users` - User CRUD
- `/api/admin/roles` - Role management
- `/api/admin/permissions` - Permission management
- `/api/admin/menus` - Menu management

### Database Schema

Core tables: `tenants`, `users`, `org_departments`
RBAC tables: `roles`, `permissions`, `role_permissions`, `user_roles`, `menus`, `role_menus`
Audit: `operation_logs`

## Environment Variables

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pgadmin
JWT_SECRET=your-secret-key
PORT=3000
NODE_ENV=development
```

## Notes

- Users use soft deletes (status = 'deleted') rather than hard deletes
- PostgREST plugin handles camelCase↔snake_case conversion automatically
- All protected routes require valid JWT with `tenant_id` claim
