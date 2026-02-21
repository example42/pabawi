import { describe, it, expect } from 'vitest';
import {
  passwordSchema,
  usernameSchema,
  emailSchema,
  nameSchema,
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  groupNameSchema,
  descriptionSchema,
  createGroupSchema,
  updateGroupSchema,
  roleNameSchema,
  createRoleSchema,
  updateRoleSchema,
  resourceSchema,
  actionSchema,
  createPermissionSchema,
  loginSchema,
  refreshTokenSchema,
  uuidSchema,
} from '../../src/validation/rbacSchemas';

describe('RBAC Validation Schemas', () => {
  describe('passwordSchema', () => {
    it('should accept valid password with all requirements', () => {
      const result = passwordSchema.safeParse('ValidPass123!');
      expect(result.success).toBe(true);
    });

    it('should reject password shorter than 8 characters', () => {
      const result = passwordSchema.safeParse('Pass1!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 8 characters');
      }
    });

    it('should reject password without uppercase letter', () => {
      const result = passwordSchema.safeParse('password123!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('uppercase letter');
      }
    });

    it('should reject password without lowercase letter', () => {
      const result = passwordSchema.safeParse('PASSWORD123!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('lowercase letter');
      }
    });

    it('should reject password without number', () => {
      const result = passwordSchema.safeParse('Password!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('number');
      }
    });

    it('should reject password without special character', () => {
      const result = passwordSchema.safeParse('Password123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('special character');
      }
    });

    it('should accept password with various special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{};\':"|,.<>/?';
      for (const char of specialChars) {
        const result = passwordSchema.safeParse(`ValidPass123${char}`);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('usernameSchema', () => {
    it('should accept valid username', () => {
      const result = usernameSchema.safeParse('john_doe');
      expect(result.success).toBe(true);
    });

    it('should accept username with numbers', () => {
      const result = usernameSchema.safeParse('user123');
      expect(result.success).toBe(true);
    });

    it('should reject username shorter than 3 characters', () => {
      const result = usernameSchema.safeParse('ab');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 3 characters');
      }
    });

    it('should reject username longer than 50 characters', () => {
      const result = usernameSchema.safeParse('a'.repeat(51));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('not exceed 50 characters');
      }
    });

    it('should reject username with special characters', () => {
      const result = usernameSchema.safeParse('john-doe');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('alphanumeric');
      }
    });

    it('should reject username with spaces', () => {
      const result = usernameSchema.safeParse('john doe');
      expect(result.success).toBe(false);
    });
  });

  describe('emailSchema', () => {
    it('should accept valid email', () => {
      const result = emailSchema.safeParse('user@example.com');
      expect(result.success).toBe(true);
    });

    it('should accept email with subdomain', () => {
      const result = emailSchema.safeParse('user@mail.example.com');
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const result = emailSchema.safeParse('invalid-email');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid email');
      }
    });

    it('should reject email without domain', () => {
      const result = emailSchema.safeParse('user@');
      expect(result.success).toBe(false);
    });

    it('should reject email longer than 255 characters', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = emailSchema.safeParse(longEmail);
      expect(result.success).toBe(false);
    });
  });

  describe('nameSchema', () => {
    it('should accept valid name', () => {
      const result = nameSchema.safeParse('John');
      expect(result.success).toBe(true);
    });

    it('should trim whitespace', () => {
      const result = nameSchema.safeParse('  John  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('John');
      }
    });

    it('should reject empty name', () => {
      const result = nameSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject name longer than 100 characters', () => {
      const result = nameSchema.safeParse('a'.repeat(101));
      expect(result.success).toBe(false);
    });
  });

  describe('createUserSchema', () => {
    it('should accept valid user data', () => {
      const result = createUserSchema.safeParse({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'ValidPass123!',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result.success).toBe(true);
    });

    it('should accept user data with isAdmin flag', () => {
      const result = createUserSchema.safeParse({
        username: 'admin_user',
        email: 'admin@example.com',
        password: 'AdminPass123!',
        firstName: 'Admin',
        lastName: 'User',
        isAdmin: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isAdmin).toBe(true);
      }
    });

    it('should default isAdmin to false', () => {
      const result = createUserSchema.safeParse({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'ValidPass123!',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isAdmin).toBe(false);
      }
    });

    it('should reject user data with invalid username', () => {
      const result = createUserSchema.safeParse({
        username: 'ab',
        email: 'john@example.com',
        password: 'ValidPass123!',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result.success).toBe(false);
    });

    it('should reject user data with invalid email', () => {
      const result = createUserSchema.safeParse({
        username: 'john_doe',
        email: 'invalid-email',
        password: 'ValidPass123!',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result.success).toBe(false);
    });

    it('should reject user data with invalid password', () => {
      const result = createUserSchema.safeParse({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'weak',
        firstName: 'John',
        lastName: 'Doe',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateUserSchema', () => {
    it('should accept partial user data', () => {
      const result = updateUserSchema.safeParse({
        email: 'newemail@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty object', () => {
      const result = updateUserSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept isActive flag', () => {
      const result = updateUserSchema.safeParse({
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email in update', () => {
      const result = updateUserSchema.safeParse({
        email: 'invalid-email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid password in update', () => {
      const result = updateUserSchema.safeParse({
        password: 'weak',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    it('should accept valid password change data', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass123!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing current password', () => {
      const result = changePasswordSchema.safeParse({
        newPassword: 'NewPass123!',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid new password', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'OldPass123!',
        newPassword: 'weak',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('groupNameSchema', () => {
    it('should accept valid group name', () => {
      const result = groupNameSchema.safeParse('Developers');
      expect(result.success).toBe(true);
    });

    it('should trim whitespace', () => {
      const result = groupNameSchema.safeParse('  Developers  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('Developers');
      }
    });

    it('should reject group name shorter than 3 characters', () => {
      const result = groupNameSchema.safeParse('ab');
      expect(result.success).toBe(false);
    });

    it('should reject group name longer than 100 characters', () => {
      const result = groupNameSchema.safeParse('a'.repeat(101));
      expect(result.success).toBe(false);
    });
  });

  describe('descriptionSchema', () => {
    it('should accept valid description', () => {
      const result = descriptionSchema.safeParse('This is a description');
      expect(result.success).toBe(true);
    });

    it('should accept empty description', () => {
      const result = descriptionSchema.safeParse('');
      expect(result.success).toBe(true);
    });

    it('should default to empty string', () => {
      const result = descriptionSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('');
      }
    });

    it('should reject description longer than 500 characters', () => {
      const result = descriptionSchema.safeParse('a'.repeat(501));
      expect(result.success).toBe(false);
    });

    it('should trim whitespace', () => {
      const result = descriptionSchema.safeParse('  Description  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('Description');
      }
    });
  });

  describe('createGroupSchema', () => {
    it('should accept valid group data', () => {
      const result = createGroupSchema.safeParse({
        name: 'Developers',
        description: 'Development team',
      });
      expect(result.success).toBe(true);
    });

    it('should accept group with empty description', () => {
      const result = createGroupSchema.safeParse({
        name: 'Developers',
        description: '',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid group name', () => {
      const result = createGroupSchema.safeParse({
        name: 'ab',
        description: 'Description',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createRoleSchema', () => {
    it('should accept valid role data', () => {
      const result = createRoleSchema.safeParse({
        name: 'Developer',
        description: 'Developer role',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid role name', () => {
      const result = createRoleSchema.safeParse({
        name: 'ab',
        description: 'Description',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('resourceSchema', () => {
    it('should accept valid resource name', () => {
      const result = resourceSchema.safeParse('ansible');
      expect(result.success).toBe(true);
    });

    it('should accept resource with underscores', () => {
      const result = resourceSchema.safeParse('puppet_db');
      expect(result.success).toBe(true);
    });

    it('should accept resource with numbers', () => {
      const result = resourceSchema.safeParse('resource123');
      expect(result.success).toBe(true);
    });

    it('should reject resource with uppercase letters', () => {
      const result = resourceSchema.safeParse('Ansible');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('lowercase');
      }
    });

    it('should reject resource with hyphens', () => {
      const result = resourceSchema.safeParse('puppet-db');
      expect(result.success).toBe(false);
    });

    it('should reject resource shorter than 3 characters', () => {
      const result = resourceSchema.safeParse('ab');
      expect(result.success).toBe(false);
    });

    it('should reject resource longer than 100 characters', () => {
      const result = resourceSchema.safeParse('a'.repeat(101));
      expect(result.success).toBe(false);
    });
  });

  describe('actionSchema', () => {
    it('should accept valid action name', () => {
      const result = actionSchema.safeParse('read');
      expect(result.success).toBe(true);
    });

    it('should accept action with underscores', () => {
      const result = actionSchema.safeParse('read_write');
      expect(result.success).toBe(true);
    });

    it('should reject action with uppercase letters', () => {
      const result = actionSchema.safeParse('Read');
      expect(result.success).toBe(false);
    });

    it('should reject action shorter than 3 characters', () => {
      const result = actionSchema.safeParse('ab');
      expect(result.success).toBe(false);
    });

    it('should reject action longer than 50 characters', () => {
      const result = actionSchema.safeParse('a'.repeat(51));
      expect(result.success).toBe(false);
    });
  });

  describe('createPermissionSchema', () => {
    it('should accept valid permission data', () => {
      const result = createPermissionSchema.safeParse({
        resource: 'ansible',
        action: 'read',
        description: 'Read Ansible resources',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid resource', () => {
      const result = createPermissionSchema.safeParse({
        resource: 'Ansible',
        action: 'read',
        description: 'Description',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid action', () => {
      const result = createPermissionSchema.safeParse({
        resource: 'ansible',
        action: 'Read',
        description: 'Description',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('should accept valid login data', () => {
      const result = loginSchema.safeParse({
        username: 'john_doe',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing username', () => {
      const result = loginSchema.safeParse({
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing password', () => {
      const result = loginSchema.safeParse({
        username: 'john_doe',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty username', () => {
      const result = loginSchema.safeParse({
        username: '',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('refreshTokenSchema', () => {
    it('should accept valid refresh token', () => {
      const result = refreshTokenSchema.safeParse({
        refreshToken: 'valid-token-string',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing refresh token', () => {
      const result = refreshTokenSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject empty refresh token', () => {
      const result = refreshTokenSchema.safeParse({
        refreshToken: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('uuidSchema', () => {
    it('should accept valid UUID v4', () => {
      const result = uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID format', () => {
      const result = uuidSchema.safeParse('invalid-uuid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid ID format');
      }
    });

    it('should reject non-UUID string', () => {
      const result = uuidSchema.safeParse('12345');
      expect(result.success).toBe(false);
    });
  });
});
