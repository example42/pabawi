import { describe, it, expect } from 'vitest';
import { validatePassword } from '../src/utils/passwordValidation';

describe('Password Validation', () => {
  describe('Valid passwords', () => {
    it('should accept password with all requirements', () => {
      const result = validatePassword('SecurePass123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept password with multiple special characters', () => {
      const result = validatePassword('P@ssw0rd!#$');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept password with minimum length and all character types', () => {
      const result = validatePassword('Abcd123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Invalid passwords - length', () => {
    it('should reject password shorter than 8 characters', () => {
      const result = validatePassword('Abc12!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject empty password', () => {
      const result = validatePassword('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });
  });

  describe('Invalid passwords - missing uppercase', () => {
    it('should reject password without uppercase letter', () => {
      const result = validatePassword('password123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });
  });

  describe('Invalid passwords - missing lowercase', () => {
    it('should reject password without lowercase letter', () => {
      const result = validatePassword('PASSWORD123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });
  });

  describe('Invalid passwords - missing number', () => {
    it('should reject password without number', () => {
      const result = validatePassword('Password!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });
  });

  describe('Invalid passwords - missing special character', () => {
    it('should reject password without special character', () => {
      const result = validatePassword('Password123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('Invalid passwords - multiple violations', () => {
    it('should return all validation errors for password with multiple issues', () => {
      const result = validatePassword('pass');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors).toContain('Password must be at least 8 characters long');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one number');
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should return multiple errors for password missing several requirements', () => {
      const result = validatePassword('password');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one number');
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('Edge cases', () => {
    it('should accept password with various special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{};\':"|,.<>/?';
      for (const char of specialChars) {
        const result = validatePassword(`Password1${char}`);
        expect(result.valid).toBe(true);
      }
    });

    it('should accept password exactly 8 characters', () => {
      const result = validatePassword('Abcd123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept very long password', () => {
      const result = validatePassword('VeryLongPassword123!WithManyCharacters');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
