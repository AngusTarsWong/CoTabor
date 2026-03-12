
const fs = require('fs');
const path = require('path');

const modules = [
  'core',
  'driver',
  'web',
  'playground-lib',
  'vision',
  'shared',
  'visualizer',
  'report',
  'harmony',
  'ios'
];

function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== 'static') {
        walk(filePath, callback);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      callback(filePath);
    }
  }
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  modules.forEach(mod => {
    // Replace @/mod/mod/ with @/mod/
    // We need to be careful with regex
    const doublePrefix = `@/${mod}/${mod}/`;
    const singlePrefix = `@/${mod}/`;
    
    if (content.includes(doublePrefix)) {
      console.log(`Fixing ${mod} double import in ${filePath}`);
      // Use split/join for simple replacement
      content = content.split(doublePrefix).join(singlePrefix);
      changed = true;
    }

    // Also check for triple? No, hopefully not.
    // But check for @/mod/mod (without trailing slash, e.g. import from index)
    // import ... from '@/web/web/index' -> '@/web/index'
    // But usually imports are directory based or file based.
    // If it is '@/web/web', it implies '@/web/web/index'.
    
    // Also fix cases like '@/web/web' (exact match)
    const doubleExact = `'@/${mod}/${mod}'`;
    const singleExact = `'@/${mod}'`;
    if (content.includes(doubleExact)) {
        content = content.split(doubleExact).join(singleExact);
        changed = true;
    }
    const doubleExactDoubleQuote = `"@/${mod}/${mod}"`;
    const singleExactDoubleQuote = `"@/${mod}"`;
    if (content.includes(doubleExactDoubleQuote)) {
        content = content.split(doubleExactDoubleQuote).join(singleExactDoubleQuote);
        changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

console.log('Fixing double imports...');
walk(path.join(__dirname, 'src'), fixFile);
walk(path.join(__dirname, 'apps/playground/src'), fixFile);
walk(path.join(__dirname, 'apps/playground/demo'), fixFile);
console.log('Done.');
