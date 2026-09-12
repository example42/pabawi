import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const ts = require('typescript');

export const root = path.resolve(import.meta.dirname, '../..');
export const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
const parse = file => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
export const canonical = route => route.replace(/:[A-Za-z0-9_]+|\{[^}]+\}/g, '{}').replace(/\/$/, '');

// Follow imported factories from the two production composition roots, including
// nested integration routers. Conditional mounts count as supported routes.
export function routes() {
  const result = new Map();
  function collect(file, prefix, receiver) {
    const source = parse(file);
    const imports = new Map();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
      const module = statement.moduleSpecifier.text;
      if (!module.startsWith('.')) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), `${module}.ts`));
      const clause = statement.importClause;
      if (clause.name) imports.set(clause.name.text, target);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const name of clause.namedBindings.elements) imports.set(name.name.text, target);
      }
    }
    walk(source, node => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
      if (node.expression.expression.getText(source) !== receiver) return;
      const method = node.expression.name.text;
      const first = node.arguments[0];
      if (!first || !ts.isStringLiteral(first)) return;
      const fullPath = `${prefix}${first.text}`.replace(/\/$/, '');
      if (methods.has(method) && fullPath.startsWith('/api/')) {
        result.set(`${method.toUpperCase()} ${canonical(fullPath)}`, { method, path: fullPath, file });
      }
      if (method !== 'use') return;
      for (const argument of node.arguments.slice(1)) {
        const name = ts.isCallExpression(argument) ? argument.expression.getText(source) : argument.getText(source);
        const target = imports.get(name);
        if (target?.includes('/routes/')) collect(target, fullPath, 'router');
      }
    });
  }
  collect('backend/src/server.ts', '', 'app');
  collect('backend/src/routes/mountInfrastructureRoutes.ts', '', 'app');
  return result;
}

export function environmentVariables() {
  const result = new Set();
  for (const file of ['backend/src/config/ConfigService.ts', 'backend/src/integrations/ssh/config.ts']) {
    const source = parse(file);
    walk(source, node => {
      if (ts.isPropertyAccessExpression(node) && ['process.env', 'env'].includes(node.expression.getText(source))) {
        if (/^[A-Z][A-Z0-9_]+$/.test(node.name.text)) result.add(node.name.text);
      }
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'parsePositiveInt') {
        const name = node.arguments[0];
        if (ts.isStringLiteral(name)) result.add(name.text);
      }
    });
  }
  return [...result].sort();
}
