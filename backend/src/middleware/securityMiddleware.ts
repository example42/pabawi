import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

/**
 * Configure helmet middleware for security headers
 *
 * Helmet helps secure Express apps by setting various HTTP headers:
 * - Content-Security-Policy: Prevents XSS attacks
 * - X-DNS-Prefetch-Control: Controls browser DNS prefetching
 * - X-Frame-Options: Prevents clickjacking
 * - X-Content-Type-Options: Prevents MIME type sniffing
 * - Strict-Transport-Security: Enforces HTTPS
 * - X-Download-Options: Prevents IE from executing downloads
 * - X-Permitted-Cross-Domain-Policies: Controls cross-domain policies
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for UI frameworks
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for development
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin requests
});

/**
 * Create rate limiting middleware for authenticated users
 *
 * Limits requests to 100 per minute per user to prevent abuse
 * Uses user ID from authenticated request as the key
 *
 * @returns Express middleware function
 */
export function createRateLimitMiddleware() {
  // Skip rate limiting in test environment
  if (process.env.NODE_ENV === 'test') {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  return rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 100, // Limit each user to 100 requests per window
    message: {
      error: "Too many requests from this user, please try again later.",
      retryAfter: 60,
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers

    // Use user ID as the key for rate limiting
    keyGenerator: (req: Request): string => {
      // If user is authenticated, use their user ID
      if (req.user?.userId) {
        return `user:${req.user.userId}`;
      }

      // For unauthenticated requests, use IP address
      return req.ip || req.socket.remoteAddress || "unknown";
    },

    // Skip rate limiting for health check and public endpoints
    skip: (req: Request): boolean => {
      const publicPaths = ["/api/health", "/api/config"];
      return publicPaths.includes(req.path);
    },

    // Custom handler for rate limit exceeded
    handler: (_req: Request, res: Response): void => {
      res.status(429).json({
        error: "Too many requests",
        message: "You have exceeded the rate limit of 100 requests per minute.",
        retryAfter: 60,
      });
    },
  });
}

/**
 * Create stricter rate limiting for authentication endpoints
 *
 * Limits login attempts to prevent brute force attacks
 * 10 attempts per 15 minutes per IP address
 *
 * @returns Express middleware function
 */
export function createAuthRateLimitMiddleware() {
  // Skip rate limiting in test environment
  if (process.env.NODE_ENV === 'test') {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minute window
    max: 10, // Limit each IP to 10 requests per window
    message: {
      error: "Too many authentication attempts, please try again later.",
      retryAfter: 900, // 15 minutes in seconds
    },
    standardHeaders: true,
    legacyHeaders: false,

    // Use IP address as the key
    keyGenerator: (req: Request): string => {
      return req.ip || req.socket.remoteAddress || "unknown";
    },

    // Custom handler for rate limit exceeded
    handler: (_req: Request, res: Response): void => {
      res.status(429).json({
        error: "Too many authentication attempts",
        message: "You have exceeded the rate limit for authentication. Please try again in 15 minutes.",
        retryAfter: 900,
      });
    },
  });
}

/**
 * Input sanitization middleware
 *
 * Sanitizes user input to prevent injection attacks:
 * - Removes null bytes
 * - Trims excessive whitespace
 * - Validates string lengths
 * - Prevents prototype pollution
 */
export function inputSanitizationMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeObject(req.body) as typeof req.body;
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === "object") {
      req.query = sanitizeObject(req.query) as typeof req.query;
    }

    // Sanitize URL parameters
    if (req.params && typeof req.params === "object") {
      req.params = sanitizeObject(req.params) as typeof req.params;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Recursively sanitize an object
 *
 * @param obj - Object to sanitize
 * @param depth - Current recursion depth (prevents deep nesting attacks)
 * @returns Sanitized object
 */
function sanitizeObject(obj: unknown, depth = 0): unknown {
  // Prevent deep nesting attacks
  if (depth > 10) {
    return obj;
  }

  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  // Handle objects
  if (typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Prevent prototype pollution
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }

      // Sanitize the key
      const sanitizedKey = sanitizeString(key);

      // Recursively sanitize the value
      sanitized[sanitizedKey] = sanitizeObject(value, depth + 1);
    }

    return sanitized;
  }

  // Handle strings
  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  // Return other types as-is (numbers, booleans, etc.)
  return obj;
}

/**
 * Sanitize a string value
 *
 * @param str - String to sanitize
 * @returns Sanitized string
 */
function sanitizeString(str: string): string {
  // Remove null bytes
  let sanitized = str.replace(/\0/g, "");

  // Trim excessive whitespace
  sanitized = sanitized.trim();

  // Limit string length to prevent memory exhaustion
  const MAX_STRING_LENGTH = 10000;
  if (sanitized.length > MAX_STRING_LENGTH) {
    sanitized = sanitized.substring(0, MAX_STRING_LENGTH);
  }

  return sanitized;
}

/**
 * Additional security headers middleware
 *
 * Adds extra security headers not covered by helmet
 */
export function additionalSecurityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Prevent browsers from performing MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking attacks
  res.setHeader("X-Frame-Options", "DENY");

  // Enable XSS protection in older browsers
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy - only send referrer for same-origin requests
  res.setHeader("Referrer-Policy", "same-origin");

  // Permissions policy - restrict access to browser features
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=()",
  );

  next();
}
