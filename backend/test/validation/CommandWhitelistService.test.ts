import { describe, it, expect, beforeEach } from 'vitest';
import { CommandWhitelistService, CommandNotAllowedError } from '../../src/validation/CommandWhitelistService';
import type { WhitelistConfig } from '../../src/config/schema';

describe('CommandWhitelistService - allowAll mode', () => {
  let service: CommandWhitelistService;

  beforeEach(() => {
    const config: WhitelistConfig = {
      allowAll: true,
      whitelist: [],
      matchMode: 'exact',
    };
    service = new CommandWhitelistService(config);
  });

  it('should allow any command when allowAll is true', () => {
    expect(service.isCommandAllowed('ls -la')).toBe(true);
    expect(service.isCommandAllowed('rm -rf /')).toBe(true);
    expect(service.isCommandAllowed('echo "test"')).toBe(true);
    expect(service.isCommandAllowed('any arbitrary command')).toBe(true);
  });

  it('should return true for isAllowAllEnabled', () => {
    expect(service.isAllowAllEnabled()).toBe(true);
  });

  it('should not throw error when validating any command', () => {
    expect(() => service.validateCommand('any command')).not.toThrow();
  });
});

describe('CommandWhitelistService - empty whitelist with allowAll disabled', () => {
  let service: CommandWhitelistService;

  beforeEach(() => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: [],
      matchMode: 'exact',
    };
    service = new CommandWhitelistService(config);
  });

  it('should reject all commands when whitelist is empty', () => {
    expect(service.isCommandAllowed('ls')).toBe(false);
    expect(service.isCommandAllowed('pwd')).toBe(false);
    expect(service.isCommandAllowed('whoami')).toBe(false);
  });

  it('should return false for isAllowAllEnabled', () => {
    expect(service.isAllowAllEnabled()).toBe(false);
  });

  it('should throw CommandNotAllowedError when validating any command', () => {
    expect(() => service.validateCommand('ls')).toThrow(CommandNotAllowedError);
  });

  it('should include appropriate error message', () => {
    try {
      service.validateCommand('ls');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(CommandNotAllowedError);
      const cmdError = error as CommandNotAllowedError;
      expect(cmdError.command).toBe('ls');
      expect(cmdError.reason).toContain('whitelist is empty');
      expect(cmdError.reason).toContain('allowAll is disabled');
    }
  });
});

describe('CommandWhitelistService - exact match mode', () => {
  let service: CommandWhitelistService;

  beforeEach(() => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls', 'pwd', 'whoami', 'echo test'],
      matchMode: 'exact',
    };
    service = new CommandWhitelistService(config);
  });

  it('should allow commands that exactly match whitelist entries', () => {
    expect(service.isCommandAllowed('ls')).toBe(true);
    expect(service.isCommandAllowed('pwd')).toBe(true);
    expect(service.isCommandAllowed('whoami')).toBe(true);
    expect(service.isCommandAllowed('echo test')).toBe(true);
  });

  it('should reject commands that do not exactly match', () => {
    expect(service.isCommandAllowed('ls -la')).toBe(false);
    expect(service.isCommandAllowed('ls -l')).toBe(false);
    expect(service.isCommandAllowed('echo')).toBe(false);
    expect(service.isCommandAllowed('echo test2')).toBe(false);
  });

  it('should reject commands not in whitelist', () => {
    expect(service.isCommandAllowed('rm')).toBe(false);
    expect(service.isCommandAllowed('cat')).toBe(false);
    expect(service.isCommandAllowed('grep')).toBe(false);
  });

  it('should trim commands before matching', () => {
    expect(service.isCommandAllowed('  ls  ')).toBe(true);
    expect(service.isCommandAllowed('  pwd  ')).toBe(true);
  });

  it('should return exact match mode', () => {
    expect(service.getMatchMode()).toBe('exact');
  });

  it('should return whitelist array', () => {
    const whitelist = service.getWhitelist();
    expect(whitelist).toEqual(['ls', 'pwd', 'whoami', 'echo test']);
  });

  it('should throw error with appropriate message for non-whitelisted command', () => {
    try {
      service.validateCommand('rm -rf /');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(CommandNotAllowedError);
      const cmdError = error as CommandNotAllowedError;
      expect(cmdError.command).toBe('rm -rf /');
      expect(cmdError.reason).toContain('exact match mode');
      expect(cmdError.reason).toContain('ls, pwd, whoami, echo test');
    }
  });
});

describe('CommandWhitelistService - prefix match mode', () => {
  let service: CommandWhitelistService;

  beforeEach(() => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls', 'echo', 'systemctl status'],
      matchMode: 'prefix',
    };
    service = new CommandWhitelistService(config);
  });

  it('should allow commands that start with whitelist entries', () => {
    expect(service.isCommandAllowed('ls')).toBe(true);
    expect(service.isCommandAllowed('ls -la')).toBe(true);
    expect(service.isCommandAllowed('ls -l /home')).toBe(true);
    expect(service.isCommandAllowed('echo test')).toBe(true);
    expect(service.isCommandAllowed('echo "hello world"')).toBe(true);
    expect(service.isCommandAllowed('systemctl status nginx')).toBe(true);
  });

  it('should reject commands that do not start with any whitelist entry', () => {
    expect(service.isCommandAllowed('pwd')).toBe(false);
    expect(service.isCommandAllowed('cat file.txt')).toBe(false);
    expect(service.isCommandAllowed('systemctl restart nginx')).toBe(false);
  });

  it('should handle partial prefix matches correctly', () => {
    expect(service.isCommandAllowed('l')).toBe(false);
    expect(service.isCommandAllowed('ec')).toBe(false);
    expect(service.isCommandAllowed('systemctl')).toBe(false);
  });

  it('should trim commands before matching', () => {
    expect(service.isCommandAllowed('  ls -la  ')).toBe(true);
    expect(service.isCommandAllowed('  echo test  ')).toBe(true);
  });

  it('should return prefix match mode', () => {
    expect(service.getMatchMode()).toBe('prefix');
  });

  it('should throw error with appropriate message for non-whitelisted command', () => {
    try {
      service.validateCommand('rm -rf /');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(CommandNotAllowedError);
      const cmdError = error as CommandNotAllowedError;
      expect(cmdError.command).toBe('rm -rf /');
      expect(cmdError.reason).toContain('prefix match mode');
      expect(cmdError.reason).toContain('ls, echo, systemctl status');
    }
  });
});

describe('CommandWhitelistService - edge cases', () => {
  it('should handle empty command string in exact mode', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls', 'pwd'],
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    
    expect(service.isCommandAllowed('')).toBe(false);
  });

  it('should handle empty command string in prefix mode', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls', 'pwd'],
      matchMode: 'prefix',
    };
    const service = new CommandWhitelistService(config);
    
    expect(service.isCommandAllowed('')).toBe(false);
  });

  it('should handle whitespace-only command', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls'],
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    
    expect(service.isCommandAllowed('   ')).toBe(false);
  });

  it('should handle special characters in commands', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['echo "test"', 'grep -E "^[0-9]+"'],
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    
    expect(service.isCommandAllowed('echo "test"')).toBe(true);
    expect(service.isCommandAllowed('grep -E "^[0-9]+"')).toBe(true);
  });

  it('should handle case-sensitive matching', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls', 'Echo'],
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    
    expect(service.isCommandAllowed('ls')).toBe(true);
    expect(service.isCommandAllowed('LS')).toBe(false);
    expect(service.isCommandAllowed('Echo')).toBe(true);
    expect(service.isCommandAllowed('echo')).toBe(false);
  });

  it('should return a copy of whitelist array', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls', 'pwd'],
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    
    const whitelist1 = service.getWhitelist();
    const whitelist2 = service.getWhitelist();
    
    expect(whitelist1).toEqual(whitelist2);
    expect(whitelist1).not.toBe(whitelist2);
    
    whitelist1.push('new-command');
    expect(service.getWhitelist()).toEqual(['ls', 'pwd']);
  });

  it('should handle commands with multiple spaces', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['echo  test'],
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    
    expect(service.isCommandAllowed('echo  test')).toBe(true);
    expect(service.isCommandAllowed('echo test')).toBe(false);
  });

  it('should handle prefix matching with overlapping prefixes', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['systemctl', 'systemctl status'],
      matchMode: 'prefix',
    };
    const service = new CommandWhitelistService(config);
    
    expect(service.isCommandAllowed('systemctl restart nginx')).toBe(true);
    expect(service.isCommandAllowed('systemctl status nginx')).toBe(true);
  });
});

describe('CommandWhitelistService - validateCommand method', () => {
  it('should not throw for allowed command', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls', 'pwd'],
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    
    expect(() => service.validateCommand('ls')).not.toThrow();
    expect(() => service.validateCommand('pwd')).not.toThrow();
  });

  it('should throw CommandNotAllowedError for disallowed command', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls'],
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    
    expect(() => service.validateCommand('rm')).toThrow(CommandNotAllowedError);
  });

  it('should include command in error', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls'],
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    
    try {
      service.validateCommand('dangerous-command');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error).toBeInstanceOf(CommandNotAllowedError);
      const cmdError = error as CommandNotAllowedError;
      expect(cmdError.message).toContain('dangerous-command');
      expect(cmdError.command).toBe('dangerous-command');
    }
  });
});
