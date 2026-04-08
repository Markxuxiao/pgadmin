/**
 * 统一响应格式
 * { code: number, data: any, message: string }
 */

export function success<T>(data?: T, message = 'OK') {
  return {
    code: 0,
    data,
    message
  };
}

export function error(message: string, code = 400) {
  return {
    code,
    data: null,
    message
  };
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return {
    code: 0,
    data: {
      list: data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    },
    message: 'OK'
  };
}
