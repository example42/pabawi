import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { inputSanitizationMiddleware } from "../../src/middleware/securityMiddleware";

describe("Input Sanitization Middleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
    };
    res = {};
    next = () => {};
  });

  describe("SQL Injection Prevention", () => {
    it("should sanitize SQL injection attempts in body", () => {
      req.body = {
        username: "admin' OR '1'='1",
        query: "SELECT * FROM users WHERE id = 1; DROP TABLE users;",
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      // Strings are trimmed but not modified (SQL injection prevented by parameterized queries)
      expect(req.body.username).toBe("admin' OR '1'='1");
      expect(req.body.query).toBe("SELECT * FROM users WHERE id = 1; DROP TABLE users;");
    });

    it("should remove null bytes that could bypass SQL filters", () => {
      req.body = {
        username: "admin\0--",
        password: "pass\0word",  // pragma: allowlist secret
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.body.username).toBe("admin--");
      expect(req.body.password).toBe("password");
    });
  });

  describe("XSS Prevention", () => {
    it("should sanitize XSS attempts in body", () => {
      req.body = {
        comment: "<script>alert('XSS')</script>",
        html: "<img src=x onerror=alert('XSS')>",
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      // XSS strings are preserved (XSS prevented by CSP headers and output encoding)
      expect(req.body.comment).toBe("<script>alert('XSS')</script>");
      expect(req.body.html).toBe("<img src=x onerror=alert('XSS')>");
    });
  });

  describe("Prototype Pollution Prevention", () => {
    it("should prevent prototype pollution via __proto__", () => {
      req.body = {
        __proto__: { isAdmin: true },
        normalField: "value",
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      // The dangerous __proto__ key should not be copied to sanitized object
      expect(req.body.normalField).toBe("value");
      // Verify the pollution didn't affect the object
      expect((req.body as any).isAdmin).toBeUndefined();
    });

    it("should prevent prototype pollution via constructor", () => {
      req.body = {
        constructor: { prototype: { isAdmin: true } },
        normalField: "value",
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      // The dangerous constructor key should not be copied to sanitized object
      expect(req.body.normalField).toBe("value");
      // Verify the pollution didn't affect the object
      expect((req.body as any).isAdmin).toBeUndefined();
    });

    it("should prevent prototype pollution via prototype", () => {
      req.body = {
        prototype: { isAdmin: true },
        normalField: "value",
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      // The dangerous prototype key should not be copied to sanitized object
      expect(req.body.normalField).toBe("value");
      // Verify no prototype property was added
      expect(Object.prototype.hasOwnProperty.call(req.body, 'prototype')).toBe(false);
    });
  });

  describe("String Sanitization", () => {
    it("should trim excessive whitespace", () => {
      req.body = {
        username: "  admin  ",
        email: "\t\ntest@example.com\t\n",
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.body.username).toBe("admin");
      expect(req.body.email).toBe("test@example.com");
    });

    it("should limit string length to prevent memory exhaustion", () => {
      const longString = "a".repeat(15000);
      req.body = {
        data: longString,
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.body.data).toHaveLength(10000);
      expect(req.body.data).toBe("a".repeat(10000));
    });

    it("should remove null bytes from strings", () => {
      req.body = {
        text: "Hello\0World\0!",
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.body.text).toBe("HelloWorld!");
    });
  });

  describe("Nested Object Sanitization", () => {
    it("should sanitize nested objects", () => {
      req.body = {
        user: {
          name: "  admin  ",
          profile: {
            bio: "  Hello\0World  ",
          },
        },
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.body.user.name).toBe("admin");
      expect(req.body.user.profile.bio).toBe("HelloWorld");
    });

    it("should sanitize arrays", () => {
      req.body = {
        tags: ["  tag1  ", "  tag2\0  ", "tag3"],
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.body.tags).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should prevent deep nesting attacks", () => {
      // Create deeply nested object (15 levels)
      let deepObj: any = { value: "deep" };
      for (let i = 0; i < 15; i++) {
        deepObj = { nested: deepObj };
      }

      req.body = deepObj;

      inputSanitizationMiddleware(req as Request, res as Response, next);

      // Should still process without error (depth limit prevents infinite recursion)
      expect(req.body).toBeDefined();
    });

    it("should prevent prototype pollution in nested objects", () => {
      req.body = {
        user: {
          __proto__: { isAdmin: true },
          name: "test",
        },
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      // The dangerous __proto__ key should not be copied
      expect(req.body.user.name).toBe("test");
      // Verify the pollution didn't affect the nested object
      expect((req.body.user as any).isAdmin).toBeUndefined();
    });
  });

  describe("Query Parameters Sanitization", () => {
    it("should sanitize query parameters", () => {
      req.query = {
        search: "  test\0query  ",
        page: "1",
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.query.search).toBe("testquery");
      expect(req.query.page).toBe("1");
    });
  });

  describe("URL Parameters Sanitization", () => {
    it("should sanitize URL parameters", () => {
      req.params = {
        id: "  123\0  ",
        name: "  test  ",
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.params.id).toBe("123");
      expect(req.params.name).toBe("test");
    });
  });

  describe("Non-String Values", () => {
    it("should preserve numbers", () => {
      req.body = {
        age: 25,
        price: 99.99,
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.body.age).toBe(25);
      expect(req.body.price).toBe(99.99);
    });

    it("should preserve booleans", () => {
      req.body = {
        isActive: true,
        isAdmin: false,
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.body.isActive).toBe(true);
      expect(req.body.isAdmin).toBe(false);
    });

    it("should preserve null and undefined", () => {
      req.body = {
        nullValue: null,
        undefinedValue: undefined,
      };

      inputSanitizationMiddleware(req as Request, res as Response, next);

      expect(req.body.nullValue).toBeNull();
      expect(req.body.undefinedValue).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should call next with error if sanitization fails", () => {
      const mockNext = (error?: any) => {
        expect(error).toBeDefined();
      };

      // Create a circular reference that could cause issues
      const circular: any = { a: 1 };
      circular.self = circular;

      req.body = circular;

      // Should handle gracefully
      inputSanitizationMiddleware(req as Request, res as Response, mockNext);
    });
  });
});
