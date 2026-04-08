/**
 * PostgREST-style query parser for Knex
 * Converts query params to Knex query builder
 *
 * Supported operators:
 * - eq: = (default)
 * - gt: >
 * - gte: >=
 * - lt: <
 * - lte: <=
 * - like: LIKE
 * - ilike: ILIKE
 *
 * Query format:
 * - select: comma-separated columns (e.g., "id,name,email")
 * - field.eq: exact match (e.g., "status.eq=active")
 * - field.like: LIKE search (e.g., "name.like=john")
 * - order: field.direction (e.g., "order=created_at.desc" or "order=created_at.asc")
 * - limit: number
 * - offset: number
 */
export function parseQueryToKnex(query: Record<string, any>, knexQuery: any) {
  const OPERATORS: Record<string, string> = {
    eq: '=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    like: 'like',
    ilike: 'ilike'
  };

  const SKIP_KEYS = ['select', 'order', 'limit', 'offset'];

  // 1. select
  if (query.select) {
    const columns = query.select.split(',').map((col: string) => col.trim());
    knexQuery.select(columns);
  }

  // 2. filter operators (eq/gt/like/...)
  Object.entries(query).forEach(([key, val]) => {
    if (SKIP_KEYS.includes(key)) return;
    if (val === undefined || val === null) return;

    const value = String(val);
    const dotIndex = value.indexOf('.');

    if (dotIndex === -1) {
      // No operator specified, use eq by default
      knexQuery.where(key, '=', value);
    } else {
      const op = value.substring(0, dotIndex);
      const actualValue = value.substring(dotIndex + 1);
      const operator = OPERATORS[op];

      if (operator) {
        knexQuery.where(key, operator, actualValue);
      } else {
        // Unknown operator, treat as eq
        knexQuery.where(key, '=', value);
      }
    }
  });

  // 3. order
  if (query.order) {
    const [field, dir] = query.order.split('.');
    knexQuery.orderBy(field, dir || 'asc');
  }

  // 4. pagination
  if (query.limit) {
    knexQuery.limit(+query.limit);
  }
  if (query.offset) {
    knexQuery.offset(+query.offset);
  }

  return knexQuery;
}
