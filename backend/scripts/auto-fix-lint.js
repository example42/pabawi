#!/usr/bin/env node
/**
 * Automatically fix common TypeScript lint errors
 */
const fs = require('fs');
const path = require('path');

// Files and their line numbers with template literal errors
const fixes = {
  'src/routes/hiera.ts': [
    { line: 525, pattern: /\$\{([^}]*\.length[^}]*)\}/g },
    { line: 664, pattern: /\$\{([^}]*\.length[^}]*)\}/g },
    { line: 821, pattern: /\$\{([^}]*\.length[^}]*)\}/g },
    { line: 1015, pattern: /\$\{([^}]*\.length[^}]*)\}/g },
    { line: 1206, pattern: /\$\{([^}]*\.length[^}]*)\}/g },
    { line: 1544, pattern: /\$\{([^}]*\.length[^}]*)\}/g },
    { line: 1828, pattern: /\$\{([^}]*\.length[^}]*)\}/g },
    { line: 1972, pattern: /\$\{([^}]*\.length[^}]*)\}/g },
    { line: 2112, pattern: /\$\{([^}]*\.length[^}]*)\}/g },
  ],
};

function wrapInString(match, content) {
  // Don't wrap if already wrapped
  if (content.trim().startsWith('String(')) {
    return match;
  }
  return `\${String(${content})}`;
}

function fixFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${fullPath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  
  const fileFixes = fixes[filePath];
  if (!fileFixes) return;

  let modified = false;

  for (const fix of fileFixes) {
    const lineIndex = fix.line - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) continue;

    const originalLine = lines[lineIndex];
    const newLine = originalLine.replace(fix.pattern, wrapInString);

    if (newLine !== originalLine) {
      lines[lineIndex] = newLine;
      modified = true;
      console.log(`Fixed line ${fix.line} in ${filePath}`);
    }
  }

  if (modified) {
    fs.writeFileSync(fullPath, lines.join('\n'), 'utf8');
    console.log(`✓ Updated ${filePath}`);
  }
}

// Process all files
for (const filePath of Object.keys(fixes)) {
  fixFile(filePath);
}

console.log('\nDone! Run npm run lint to check remaining issues.');
