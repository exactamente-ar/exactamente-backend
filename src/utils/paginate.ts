import type { PaginatedResponse } from '@/types';

export function getPaginationParams(page: number | undefined, limit: number | undefined) {
  const safePage = Math.max(1, page ?? 1);
  const safeLimit = Math.min(100, Math.max(1, limit ?? 20));
  return {
    offset: (safePage - 1) * safeLimit,
    limit: safeLimit,
    page: safePage,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
