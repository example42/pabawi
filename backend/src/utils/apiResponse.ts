/**
 * API Response Utilities
 *
 * Consolidates duplicate API response patterns across route handlers.
 * Provides consistent response formatting and pagination.
 */

import type { Response } from "express";

/**
 * Standard success response structure
 */
export interface SuccessResponse<T = unknown> {
  data?: T;
  message?: string;
  [key: string]: unknown;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Send success response
 *
 * @param res - Express response object
 * @param data - Response data
 * @param status - HTTP status code (default: 200)
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  status: number = 200
): void {
  res.status(status).json(data);
}

/**
 * Send success response with message
 *
 * @param res - Express response object
 * @param message - Success message
 * @param data - Optional response data
 * @param status - HTTP status code (default: 200)
 */
export function sendSuccessMessage(
  res: Response,
  message: string,
  data?: unknown,
  status: number = 200
): void {
  const response: Record<string, unknown> = { message };
  if (data !== undefined) {
    response.data = data;
  }
  res.status(status).json(response);
}

/**
 * Send paginated response
 *
 * @param res - Express response object
 * @param data - Array of items
 * @param page - Current page number
 * @param pageSize - Items per page
 * @param totalItems - Total number of items
 */
export function sendPaginatedResponse<T>(
  res: Response,
  data: T[],
  page: number,
  pageSize: number,
  totalItems: number
): void {
  const totalPages = Math.ceil(totalItems / pageSize);

  res.json({
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  });
}

/**
 * Calculate pagination values
 *
 * @param page - Current page number (1-indexed)
 * @param pageSize - Items per page
 * @returns Object with offset and limit for database queries
 */
export function calculatePagination(
  page: number,
  pageSize: number
): { offset: number; limit: number } {
  const offset = (page - 1) * pageSize;
  return { offset, limit: pageSize };
}

/**
 * Paginate an array of items
 *
 * @param items - Array of items to paginate
 * @param page - Current page number (1-indexed)
 * @param pageSize - Items per page
 * @returns Paginated result with metadata
 */
export function paginateArray<T>(
  items: T[],
  page: number,
  pageSize: number
): PaginatedResponse<T> {
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const { offset, limit } = calculatePagination(page, pageSize);

  const data = items.slice(offset, offset + limit);

  return {
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}

/**
 * Validate pagination parameters
 *
 * @param page - Page number
 * @param pageSize - Items per page
 * @param maxPageSize - Maximum allowed page size
 * @returns Validated pagination parameters
 */
export function validatePagination(
  page: number,
  pageSize: number,
  maxPageSize: number = 100
): { page: number; pageSize: number } {
  // Ensure page is at least 1
  const validPage = Math.max(1, Math.floor(page));

  // Ensure pageSize is between 1 and maxPageSize
  const validPageSize = Math.max(1, Math.min(maxPageSize, Math.floor(pageSize)));

  return {
    page: validPage,
    pageSize: validPageSize,
  };
}

/**
 * Create a standard response object
 *
 * @param data - Response data
 * @param message - Optional message
 * @returns Response object
 */
export function createResponse<T>(
  data: T,
  message?: string
): SuccessResponse<T> {
  const response: SuccessResponse<T> = { data };
  if (message !== undefined) {
    response.message = message;
  }
  return response;
}

/**
 * Send not found response
 *
 * @param res - Express response object
 * @param resource - Resource type that was not found
 * @param identifier - Resource identifier
 */
export function sendNotFound(
  res: Response,
  resource: string,
  identifier?: string
): void {
  const message = identifier
    ? `${resource} '${identifier}' not found`
    : `${resource} not found`;

  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message,
    },
  });
}

/**
 * Send created response
 *
 * @param res - Express response object
 * @param data - Created resource data
 * @param message - Optional success message
 */
export function sendCreated<T>(
  res: Response,
  data: T,
  message?: string
): void {
  const response: Record<string, unknown> = { data };
  if (message !== undefined) {
    response.message = message;
  }
  res.status(201).json(response);
}

/**
 * Send no content response
 *
 * @param res - Express response object
 */
export function sendNoContent(res: Response): void {
  res.status(204).send();
}
