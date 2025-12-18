#!/usr/bin/env node

/**
 * Script to update version across all project files
 * Usage: node scripts/update-version.js <new-version>
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function validateVersion(version) {
  const semverRegex = /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$/;
  return semverRegex.test(version);
}

function updatePackageJson(filePath, newVersion) {
  try {
    if (!fs.existsSync(filePath)) {
      log(`✗ File not found: ${filePath}`, 'red');
      return false;
    }

    log(`Updating ${filePath}`, 'yellow');
    
    const content = fs.readFileSync(filePath, 'utf8');
    const packageJson = JSON.parse(content);
    
    packageJson.version = newVersion;
    
    fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n');
    log(`✓ Updated ${filePath}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Error updating ${filePath}: ${error.message}`, 'red');
    return false;
  }
}

function updateReadme(newVersion) {
  const filePath = 'README.md';
  
  try {
    if (!fs.existsSync(filePath)) {
      log(`✗ File not found: ${filePath}`, 'red');
      return false;
    }

    log(`Updating ${filePath}`, 'yellow');
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Update version line
    content = content.replace(/^Version \d+\.\d+\.\d+/m, `Version ${newVersion}`);
    
    // Update docker image tags in examples
    content = content.replace(/example42\/padawi:\d+\.\d+\.\d+/g, `example42/padawi:${newVersion}`);
    
    fs.writeFileSync(filePath, content);
    log(`✓ Updated ${filePath}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Error updating ${filePath}: ${error.message}`, 'red');
    return false;
  }
}

function showGitStatus() {
  try {
    const status = execSync('git status --short', { encoding: 'utf8' });
    if (status.trim()) {
      log('Git status:', 'yellow');
      console.log(status);
    } else {
      log('No changes detected in git status', 'yellow');
    }
  } catch (error) {
    log('Could not get git status', 'yellow');
  }
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    log('Error: Version number required', 'red');
    console.log('Usage: node scripts/update-version.js <version>');
    console.log('Example: node scripts/update-version.js 0.3.0');
    process.exit(1);
  }

  const newVersion = args[0];

  if (!validateVersion(newVersion)) {
    log('Error: Invalid version format', 'red');
    console.log('Version must follow semantic versioning (e.g., 0.3.0 or 0.3.0-beta.1)');
    process.exit(1);
  }

  log(`Updating project to version ${newVersion}`, 'green');
  console.log();

  // Update all package.json files
  const packageFiles = [
    'package.json',
    'backend/package.json',
    'frontend/package.json'
  ];

  let allSuccess = true;
  
  for (const file of packageFiles) {
    if (!updatePackageJson(file, newVersion)) {
      allSuccess = false;
    }
  }

  // Update README.md
  if (!updateReadme(newVersion)) {
    allSuccess = false;
  }

  console.log();
  
  if (allSuccess) {
    log('Version update complete!', 'green');
    log(`Files updated to version ${newVersion}`, 'yellow');
  } else {
    log('Version update completed with some errors', 'yellow');
  }

  console.log();
  showGitStatus();

  console.log();
  log('Next steps:', 'yellow');
  console.log('1. Review the changes: git diff');
  console.log('2. Run tests: npm test');
  console.log(`3. Commit changes: git add . && git commit -m "chore: bump version to ${newVersion}"`);
  console.log(`4. Create git tag: git tag v${newVersion}`);
  console.log('5. Push changes: git push && git push --tags');
}

main();