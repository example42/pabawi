import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { expertModeMiddleware } from '../../src/middleware/expertMode';

describe('expertModeMiddleware', () => {
  // Helper to create mock request, response, and next function
  const createMocks = (headers: Record<string, string> = {}) => {
    const req = {
      headers,
    } as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;
    return { req, res, next };
  };

  describe('expert mode detection', () => {
    it('should set expertMode to true when X-Expert-Mode header is "true"', () => {
      const { req, res, next } = createMocks({ 'x-expert-mode': 'true' });

      expertModeMiddleware(req, res, next);

      expect(req.expertMode).toBe(true);
      expect(next).toHaveBeenCalledOnce();
    });

    it('should set expertMode to true when X-Expert-Mode header is "1"', () => {
      const { req, res, next } = createMocks({ 'x-expert-mode': '1' });

      expertModeMiddleware(req, res, next);

      expect(req.expertMode).toBe(true);
      expect(next).toHaveBeenCalledOnce();
    });

    it('should set expertMode to true when X-Expert-Mode header is "yes"', () => {
      const { req, res, next } = createMocks({ 'x-expert-mode': 'yes' });

      expertModeMiddleware(req, res, next);

      expect(req.expertMode).toBe(true);
      expect(next).toHaveBeenCalledOnce();
    });

    it('should handle case-insensitive header values', () => {
      const testCases = ['TRUE', 'True', 'YES', 'Yes'];

      testCases.forEach((value) => {
        const { req, res, next } = createMocks({ 'x-expert-mode': value });
        expertModeMiddleware(req, res, next);
        expect(req.expertMode).toBe(true);
      });
    });

    it('should set expertMode to false when X-Expert-Mode header is "false"', () => {
      const { req, res, next } = createMocks({ 'x-expert-mode': 'false' });

      expertModeMiddleware(req, res, next);

      expect(req.expertMode).toBe(false);
      expect(next).toHaveBeenCalledOnce();
    });

    it('should set expertMode to false when X-Expert-Mode header is "0"', () => {
      const { req, res, next } = createMocks({ 'x-expert-mode': '0' });

      expertModeMiddleware(req, res, next);

      expect(req.expertMode).toBe(false);
      expect(next).toHaveBeenCalledOnce();
    });

    it('should set expertMode to false when X-Expert-Mode header is missing', () => {
      const { req, res, next } = createMocks({});

      expertModeMiddleware(req, res, next);

      expect(req.expertMode).toBe(false);
      expect(next).toHaveBeenCalledOnce();
    });

    it('should set expertMode to false for invalid header values', () => {
      const invalidValues = ['invalid', 'maybe', '2', 'on', 'off'];

      invalidValues.forEach((value) => {
        const { req, res, next } = createMocks({ 'x-expert-mode': value });
        expertModeMiddleware(req, res, next);
        expect(req.expertMode).toBe(false);
      });
    });
  });

  describe('middleware chain', () => {
    it('should call next() to continue middleware chain', () => {
      const { req, res, next } = createMocks({ 'x-expert-mode': 'true' });

      expertModeMiddleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledWith();
    });

    it('should call next() even when expert mode is disabled', () => {
      const { req, res, next } = createMocks({});

      expertModeMiddleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should not throw errors for malformed requests', () => {
      const { req, res, next } = createMocks();

      expect(() => {
        expertModeMiddleware(req, res, next);
      }).not.toThrow();

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('request object modification', () => {
    it('should attach expertMode property to request object', () => {
      const { req, res, next } = createMocks({ 'x-expert-mode': 'true' });

      expect(req.expertMode).toBeUndefined();

      expertModeMiddleware(req, res, next);

      expect(req.expertMode).toBeDefined();
      expect(typeof req.expertMode).toBe('boolean');
    });

    it('should not modify other request properties', () => {
      const { req, res, next } = createMocks({ 'x-expert-mode': 'true' });
      const originalHeaders = req.headers;

      expertModeMiddleware(req, res, next);

      expect(req.headers).toBe(originalHeaders);
    });
  });

  describe('integration with ExpertModeService', () => {
    it('should use ExpertModeService for expert mode detection', () => {
      // Test that the middleware correctly delegates to ExpertModeService
      // by verifying behavior matches ExpertModeService.isExpertModeEnabled()

      const trueCases = [
        { 'x-expert-mode': 'true' },
        { 'x-expert-mode': '1' },
        { 'x-expert-mode': 'yes' },
      ];

      trueCases.forEach((headers) => {
        const { req, res, next } = createMocks(headers);
        expertModeMiddleware(req, res, next);
        expect(req.expertMode).toBe(true);
      });

      const falseCases = [
        {},
        { 'x-expert-mode': 'false' },
        { 'x-expert-mode': '0' },
        { 'x-expert-mode': 'no' },
      ];

      falseCases.forEach((headers) => {
        const { req, res, next } = createMocks(headers);
        expertModeMiddleware(req, res, next);
        expect(req.expertMode).toBe(false);
      });
    });
  });
});
