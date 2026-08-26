// scripts/validate-js.cjs
// JavaScript syntax validator for Vercel build gate
// Uses only Node.js standard modules

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const JS_EXTENSIONS = ['.js'];

// Directories/files to exclude
const EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'backup_',
  'temp_',
  'backup_pre_',
  'backup_pre_rc',
];

const EXCLUDE_FILES = [
  'temp_',
  'backup_',
];

function isExcluded(filePath) {
  const relativePath = path.relative(ROOT_DIR, filePath);
  const parts = relativePath.split(path.sep);
  
  // Check if any part of the path matches excluded directories
  for (const part of parts) {
    for (const excludeDir of EXCLUDE_DIRS) {
      if (part.startsWith(excludeDir)) {
        return true;
      }
    }
    
    // Check excluded file patterns
    for (const excludeFile of EXCLUDE_FILES) {
      if (path.basename(filePath).startsWith(excludeFile)) {
        return true;
      }
    }
  }
  
  return false;
}

function findJsFiles(dir) {
  const files = [];
  
  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!isExcluded(fullPath)) {
          scan(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (JS_EXTENSIONS.includes(ext) && !isExcluded(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  scan(dir);
  return files;
}

function validateFile(filePath) {
  const result = spawnSync('node', ['--check', filePath], {
    encoding: 'utf8',
    timeout: 10000,
  });
  
  return {
    file: path.relative(ROOT_DIR, filePath),
    success: result.status === 0,
    error: result.stderr ? result.stderr.trim() : null,
  };
}

function main() {
  console.log('=== JavaScript Syntax Validation ===');
  console.log(`Scanning: ${ROOT_DIR}`);
  console.log('');
  
  const jsFiles = findJsFiles(ROOT_DIR);
  console.log(`Found ${jsFiles.length} JavaScript file(s) to validate`);
  console.log('');
  
  if (jsFiles.length === 0) {
    console.log('No JavaScript files to validate');
    process.exit(0);
  }
  
  const results = [];
  let hasErrors = false;
  
  for (const file of jsFiles) {
    process.stdout.write(`Checking ${path.relative(ROOT_DIR, file)}... `);
    const result = validateFile(file);
    results.push(result);
    
    if (result.success) {
      console.log('OK');
    } else {
      console.log('FAIL');
      console.log(`  Error: ${result.error}`);
      hasErrors = true;
    }
  }
  
  console.log('');
  console.log('=== Validation Summary ===');
  console.log(`Total files: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  
  if (hasErrors) {
    console.log('');
    console.log('=== Syntax Errors ===');
    for (const result of results) {
      if (!result.success) {
        console.log(`${result.file}:`);
        console.log(`  ${result.error}`);
      }
    }
    console.log('');
    console.log('Validation FAILED');
    process.exit(1);
  } else {
    console.log('');
    console.log('Validation PASSED');
    process.exit(0);
  }
}

main();