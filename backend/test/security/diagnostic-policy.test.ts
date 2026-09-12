import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { redactDiagnostics } from '../../src/shared/diagnosticRedaction';
import { ApiLogger } from '../../src/integrations/ApiLogger';
import { LoggerService } from '../../src/services/LoggerService';
import { LogBufferService } from '../../src/services/LogBufferService';
import { ExpertModeService } from '../../src/services/ExpertModeService';
import { DIAGNOSTIC_LIMITS, readDiagnosticFile, retainedDiagnosticFiles, writeDiagnosticFile } from '../../src/utils/diagnosticFiles';
import { createCrashDumpsRouter } from '../../src/routes/crashDumps';
import { DIContainer } from '../../src/container/DIContainer';
import { ConfigService } from '../../src/config/ConfigService';

const canary = 'CANARY_DO_NOT_EXPORT_12345';
const payload = { nested: [{ client_secret: canary, privateKey: canary }],
  url: `https://user:${canary}@host/path?access_token=${canary}&code=${canary}`,
  message: `Authorization: Bearer ${canary}`,
  serialized: JSON.stringify({ nested: { password: canary } }),
  environmentVariables: { ANY_NAME: canary }, safe: 'keep this' };
afterEach(() => vi.restoreAllMocks());

describe('diagnostic boundaries', () => {
  it('recursively redacts arrays, serialized JSON, URLs, headers and environment without mutation', () => {
    const output = JSON.stringify(redactDiagnostics(payload));
    expect(output).not.toContain(canary);
    expect(output).toContain('keep this');
    expect(payload.nested[0].client_secret).toBe(canary);
    const circular: Record<string, unknown> = {}; circular.self = circular;
    expect(JSON.stringify(redactDiagnostics(circular))).toContain('Circular');
    expect(JSON.stringify(redactDiagnostics({ text: canary.repeat(10000) }))).not.toContain(canary);
  });

  it('keeps repeated redaction stable and recognizes encoded query keys', () => {
    const input = { message: `password=${canary}`, url: `https://host/?access%5ftoken=${canary}` };
    const once = redactDiagnostics(input);
    expect(JSON.stringify(once)).not.toContain(canary);
    expect(redactDiagnostics(once)).toEqual(once);
  });

  it('redacts actual API request/response/error logs, including previews before truncation', () => {
    const output: unknown[] = [];
    for (const method of ['log', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation((...args) => { output.push(args); });
    const logger = new ApiLogger('test', 'debug');
    logger.logRequest('id', 'POST', '/test', payload.url, { body: payload, queryParams: payload, headers: { 'X-Authentication-Token': canary } });
    logger.logResponse('id', 'POST', '/test', payload.url, { status: 200, statusText: 'OK', body: payload }, 1);
    logger.logResponse('id', 'POST', '/test', payload.url, { status: 500, statusText: 'Failed', body: payload }, 1);
    logger.logError('id', 'POST', '/test', payload.url, { message: payload.message, type: 'Error', details: payload }, 1);
    expect(JSON.stringify(output)).not.toContain(canary);
  });

  it('redacts buffered metadata, stacks and expert response diagnostics', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new LoggerService('debug'); const buffer = new LogBufferService(); logger.setLogBuffer(buffer);
    logger.error(payload.message, { component: 'test', metadata: payload }, new Error(`password=${canary}`));
    expect(JSON.stringify([buffer.query(), output.mock.calls])).not.toContain(canary);
    const expert = new ExpertModeService();
    expect(JSON.stringify(expert.attachDebugInfo({}, { timestamp: '', requestId: '', operation: '', duration: 1, metadata: payload }))).not.toContain(canary);
  });

  it('writes private bounded files, prunes expired files and redacts legacy view/download routes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pabawi-a20-'));
    try {
      writeDiagnosticFile(dir, 'crash-new.json', payload);
      expect(fs.readFileSync(path.join(dir, 'crash-new.json'), 'utf8')).not.toContain(canary);
      expect(fs.statSync(path.join(dir, 'crash-new.json')).mode & 0o777).toBe(0o600);
      for (let i = 0; i < 25; i++) writeDiagnosticFile(dir, `report-${i}.json`, { index: i });
      expect(retainedDiagnosticFiles(dir)).toHaveLength(DIAGNOSTIC_LIMITS.files);
      fs.writeFileSync(path.join(dir, 'crash-expired.json'), '{}');
      const old = new Date(Date.now() - DIAGNOSTIC_LIMITS.ageMs - 1000);
      fs.utimesSync(path.join(dir, 'crash-expired.json'), old, old);
      retainedDiagnosticFiles(dir);
      expect(fs.existsSync(path.join(dir, 'crash-expired.json'))).toBe(false);
      for (let i = 0; i < 6; i++) {
        const file = path.join(dir, `report-large-${i}.json`);
        fs.writeFileSync(file, ''); fs.truncateSync(file, DIAGNOSTIC_LIMITS.fileBytes);
      }
      const retained = retainedDiagnosticFiles(dir);
      expect(retained.reduce((size, name) => size + fs.statSync(path.join(dir, name)).size, 0)).toBeLessThanOrEqual(DIAGNOSTIC_LIMITS.totalBytes);
      const oversized = path.join(dir, 'report-oversized.json');
      fs.writeFileSync(oversized, ''); fs.truncateSync(oversized, DIAGNOSTIC_LIMITS.fileBytes + 1);
      expect(retainedDiagnosticFiles(dir)).not.toContain('report-oversized.json');
      fs.writeFileSync(path.join(dir, 'crash-legacy.json'), JSON.stringify(payload));
      expect(JSON.stringify(readDiagnosticFile(dir, 'crash-legacy.json'))).not.toContain(canary);
      const container = new DIContainer();
      container.register('logger', new LoggerService('error'));
      const config = Object.create(ConfigService.prototype) as ConfigService;
      vi.spyOn(config, 'getCrashDumpDir').mockReturnValue(dir);
      container.register('config', config);
      const app = express(); app.use('/api/crash-dumps', createCrashDumpsRouter(container));
      for (const endpoint of ['', '/crash-legacy.json', '/crash-legacy.json/download']) {
        const response = await request(app).get(`/api/crash-dumps${endpoint}`).expect(200);
        expect(response.text).not.toContain(canary);
      }
      fs.symlinkSync(path.join(dir, 'crash-legacy.json'), path.join(dir, 'report-link.json'));
      await request(app).get('/api/crash-dumps/report-link.json/download').expect(404);
    } finally { fs.rmSync(dir, { recursive: true }); }
  });
});


it('native and custom crash artifacts exclude canary environment values in a real child process', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pabawi-a20-crash-'));
  try {
    const script = `
      const { installCrashHandlers } = require('./src/utils/crashHandler.ts');
      const { LoggerService } = require('./src/services/LoggerService.ts');
      installCrashHandlers(new LoggerService('error'), process.argv[1]);
      setInterval(() => {}, 100);
      setTimeout(() => { throw new Error('password=' + process.env.DIAGNOSTIC_CANARY); }, 0);
    `;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script, dir], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
      env: { ...process.env, DIAGNOSTIC_CANARY: canary },
    });
    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).not.toContain(canary);
    const files = fs.readdirSync(dir);
    expect(files.some(name => name.startsWith('report-'))).toBe(true);
    expect(files.some(name => name.startsWith('crash-'))).toBe(true);
    for (const file of files) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(text).not.toContain(canary);
      expect(text).not.toContain('DIAGNOSTIC_CANARY');
      expect(fs.statSync(path.join(dir, file)).mode & 0o777).toBe(0o600);
    }
  } finally { fs.rmSync(dir, { recursive: true }); }
});
