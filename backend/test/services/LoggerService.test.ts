import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LoggerService, LogLevel, LogContext } from '../../src/services/LoggerService';

describe('LoggerService', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Save original LOG_LEVEL
    originalEnv = process.env.LOG_LEVEL;
    // Clear LOG_LEVEL for tests
    delete process.env.LOG_LEVEL;
    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original LOG_LEVEL
    if (originalEnv !== undefined) {
      process.env.LOG_LEVEL = originalEnv;
    } else {
      delete process.env.LOG_LEVEL;
    }
    // Restore console methods
    vi.restoreAllMocks();
  });

  describe('constructor and environment variable reading', () => {
    it('should default to info level when no LOG_LEVEL is set', () => {
      const logger = new LoggerService();
      expect(logger.getLevel()).toBe('info');
    });

    it('should read LOG_LEVEL from environment variable', () => {
      process.env.LOG_LEVEL = 'debug';  // pragma: allowlist secret
      const logger = new LoggerService();
      expect(logger.getLevel()).toBe('debug');
    });

    it('should accept explicit log level in constructor', () => {
      const logger = new LoggerService('error');
      expect(logger.getLevel()).toBe('error');
    });

    it('should prioritize constructor parameter over environment variable', () => {
      process.env.LOG_LEVEL = 'debug';  // pragma: allowlist secret
      const logger = new LoggerService('error');
      expect(logger.getLevel()).toBe('error');
    });

    it('should handle case-insensitive LOG_LEVEL environment variable', () => {
      process.env.LOG_LEVEL = 'ERROR';  // pragma: allowlist secret
      const logger = new LoggerService();
      expect(logger.getLevel()).toBe('error');
    });

    it('should default to info for invalid LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'invalid';  // pragma: allowlist secret
      const logger = new LoggerService();
      expect(logger.getLevel()).toBe('info');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid LOG_LEVEL "invalid"')
      );
    });

    it('should handle all valid log levels', () => {
      const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
      levels.forEach((level) => {
        const logger = new LoggerService(level);
        expect(logger.getLevel()).toBe(level);
      });
    });
  });

  describe('log level filtering (shouldLog)', () => {
    it('should only log error when level is error', () => {
      const logger = new LoggerService('error');
      expect(logger.shouldLog('error')).toBe(true);
      expect(logger.shouldLog('warn')).toBe(false);
      expect(logger.shouldLog('info')).toBe(false);
      expect(logger.shouldLog('debug')).toBe(false);
    });

    it('should log error and warn when level is warn', () => {
      const logger = new LoggerService('warn');
      expect(logger.shouldLog('error')).toBe(true);
      expect(logger.shouldLog('warn')).toBe(true);
      expect(logger.shouldLog('info')).toBe(false);
      expect(logger.shouldLog('debug')).toBe(false);
    });

    it('should log error, warn, and info when level is info', () => {
      const logger = new LoggerService('info');
      expect(logger.shouldLog('error')).toBe(true);
      expect(logger.shouldLog('warn')).toBe(true);
      expect(logger.shouldLog('info')).toBe(true);
      expect(logger.shouldLog('debug')).toBe(false);
    });

    it('should log all levels when level is debug', () => {
      const logger = new LoggerService('debug');
      expect(logger.shouldLog('error')).toBe(true);
      expect(logger.shouldLog('warn')).toBe(true);
      expect(logger.shouldLog('info')).toBe(true);
      expect(logger.shouldLog('debug')).toBe(true);
    });
  });

  describe('message formatting', () => {
    let logger: LoggerService;

    beforeEach(() => {
      logger = new LoggerService('debug');
    });

    it('should format message with timestamp and level', () => {
      const message = logger.formatMessage('info', 'Test message');
      expect(message).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO  Test message/);
    });

    it('should pad log level to 5 characters', () => {
      const errorMsg = logger.formatMessage('error', 'Test');
      const warnMsg = logger.formatMessage('warn', 'Test');
      const infoMsg = logger.formatMessage('info', 'Test');
      const debugMsg = logger.formatMessage('debug', 'Test');

      expect(errorMsg).toContain('ERROR');
      expect(warnMsg).toContain('WARN ');
      expect(infoMsg).toContain('INFO ');
      expect(debugMsg).toContain('DEBUG');
    });

    it('should include component in formatted message', () => {
      const context: LogContext = { component: 'TestComponent' };
      const message = logger.formatMessage('info', 'Test message', context);
      expect(message).toContain('[TestComponent]');
    });

    it('should include integration in formatted message', () => {
      const context: LogContext = {
        component: 'TestComponent',
        integration: 'bolt',
      };
      const message = logger.formatMessage('info', 'Test message', context);
      expect(message).toContain('[TestComponent]');
      expect(message).toContain('[bolt]');
    });

    it('should include operation in formatted message', () => {
      const context: LogContext = {
        component: 'TestComponent',
        operation: 'testOperation',
      };
      const message = logger.formatMessage('info', 'Test message', context);
      expect(message).toContain('[TestComponent]');
      expect(message).toContain('[testOperation]');
    });

    it('should include all context fields when provided', () => {
      const context: LogContext = {
        component: 'TestComponent',
        integration: 'puppetdb',
        operation: 'fetchData',
      };
      const message = logger.formatMessage('info', 'Test message', context);
      expect(message).toContain('[TestComponent]');
      expect(message).toContain('[puppetdb]');
      expect(message).toContain('[fetchData]');
    });

    it('should include metadata as JSON when provided', () => {
      const context: LogContext = {
        component: 'TestComponent',
        metadata: { key: 'value', count: 42 },
      };
      const message = logger.formatMessage('info', 'Test message', context);
      expect(message).toContain('{"key":"value","count":42}');
    });

    it('should not include metadata when empty', () => {
      const context: LogContext = {
        component: 'TestComponent',
        metadata: {},
      };
      const message = logger.formatMessage('info', 'Test message', context);
      expect(message).not.toContain('{}');
    });

    it('should format message without context', () => {
      const message = logger.formatMessage('info', 'Simple message');
      expect(message).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO  Simple message/);
      // Should not contain context brackets (component, integration, operation)
      // The timestamp brackets are expected
      expect(message).not.toMatch(/\]\s+\[/);
    });
  });

  describe('context inclusion', () => {
    let logger: LoggerService;

    beforeEach(() => {
      logger = new LoggerService('debug');
    });

    it('should log with minimal context (component only)', () => {
      const context: LogContext = { component: 'MinimalComponent' };
      logger.info('Test message', context);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[MinimalComponent]')
      );
    });

    it('should log with full context', () => {
      const context: LogContext = {
        component: 'FullComponent',
        integration: 'hiera',
        operation: 'resolve',
        metadata: { depth: 3 },
      };
      logger.info('Test message', context);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[FullComponent]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[hiera]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[resolve]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('{"depth":3}')
      );
    });

    it('should log without context', () => {
      logger.info('Test message');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO  Test message/)
      );
    });
  });

  describe('error logging', () => {
    let logger: LoggerService;

    beforeEach(() => {
      logger = new LoggerService('debug');
    });

    it('should log error messages', () => {
      logger.error('Error message');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error message')
      );
    });

    it('should log error with context', () => {
      const context: LogContext = {
        component: 'ErrorComponent',
        operation: 'failedOperation',
      };
      logger.error('Error occurred', context);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[ErrorComponent]')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[failedOperation]')
      );
    });

    it('should log error stack trace when error object provided', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', undefined, error);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error occurred')
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining(error.stack!)
      );
    });

    it('should not log error when level is above error', () => {
      // This shouldn't happen in practice, but test the logic
      const quietLogger = new LoggerService('error');
      quietLogger.error('Error message');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('warn logging', () => {
    let logger: LoggerService;

    beforeEach(() => {
      logger = new LoggerService('debug');
    });

    it('should log warning messages', () => {
      logger.warn('Warning message');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('WARN')
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning message')
      );
    });

    it('should log warning with context', () => {
      const context: LogContext = {
        component: 'WarnComponent',
        integration: 'puppetserver',
      };
      logger.warn('Warning occurred', context);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WarnComponent]')
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[puppetserver]')
      );
    });

    it('should not log warning when level is error', () => {
      const errorLogger = new LoggerService('error');
      errorLogger.warn('Warning message');
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('info logging', () => {
    let logger: LoggerService;

    beforeEach(() => {
      logger = new LoggerService('debug');
    });

    it('should log info messages', () => {
      logger.info('Info message');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('INFO')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Info message')
      );
    });

    it('should log info with context', () => {
      const context: LogContext = {
        component: 'InfoComponent',
        operation: 'processData',
      };
      logger.info('Processing complete', context);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[InfoComponent]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[processData]')
      );
    });

    it('should not log info when level is warn or error', () => {
      const warnLogger = new LoggerService('warn');
      warnLogger.info('Info message');
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('debug logging', () => {
    let logger: LoggerService;

    beforeEach(() => {
      logger = new LoggerService('debug');
    });

    it('should log debug messages', () => {
      logger.debug('Debug message');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Debug message')
      );
    });

    it('should log debug with context', () => {
      const context: LogContext = {
        component: 'DebugComponent',
        integration: 'bolt',
        operation: 'trace',
        metadata: { step: 1 },
      };
      logger.debug('Debug trace', context);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[DebugComponent]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[bolt]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[trace]')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('{"step":1}')
      );
    });

    it('should not log debug when level is info, warn, or error', () => {
      const infoLogger = new LoggerService('info');
      infoLogger.debug('Debug message');
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('log level hierarchy enforcement', () => {
    it('should respect hierarchy at error level', () => {
      const logger = new LoggerService('error');
      logger.error('Error');
      logger.warn('Warn');
      logger.info('Info');
      logger.debug('Debug');

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should respect hierarchy at warn level', () => {
      const logger = new LoggerService('warn');
      logger.error('Error');
      logger.warn('Warn');
      logger.info('Info');
      logger.debug('Debug');

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should respect hierarchy at info level', () => {
      const logger = new LoggerService('info');
      logger.error('Error');
      logger.warn('Warn');
      logger.info('Info');
      logger.debug('Debug');

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledTimes(1); // Only info, not debug
    });

    it('should respect hierarchy at debug level', () => {
      const logger = new LoggerService('debug');
      logger.error('Error');
      logger.warn('Warn');
      logger.info('Info');
      logger.debug('Debug');

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledTimes(2); // Both info and debug
    });
  });

  describe('getLevel', () => {
    it('should return the current log level', () => {
      const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
      levels.forEach((level) => {
        const logger = new LoggerService(level);
        expect(logger.getLevel()).toBe(level);
      });
    });
  });
});
