const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  for (const [from, to] of replacements) {
    // Handle both single and double quotes
    // But be careful not to replace partial strings if not intended
    // For internal replacements, we look for start of string or import path
    // For global replacements, we look for package name
    
    // We use split/join which replaces all occurrences
    content = content.split(from).join(to);
  }
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
}

function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'static' && file !== 'dist' && file !== '.git') {
        walk(filePath, callback);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      callback(filePath);
    }
  }
}

const internalReplacements = {
  'src/core': [["'@/", "'@/core/"], ['"@/', '"@/core/']],
  'src/driver': [["'@/", "'@/driver/"], ['"@/', '"@/driver/']],
  'src/web': [["'@/", "'@/web/"], ['"@/', '"@/web/']],
  'src/playground-lib': [["'@/", "'@/playground-lib/"], ['"@/', '"@/playground-lib/']],
  'src/vision': [["'@/", "'@/vision/"], ['"@/', '"@/vision/']],
  'src/shared': [["'@/", "'@/shared/"], ['"@/', '"@/shared/']],
  'src/visualizer': [["'@/", "'@/visualizer/"], ['"@/', '"@/visualizer/']],
  'src/harmony': [["'@/", "'@/harmony/"], ['"@/', '"@/harmony/']],
  'src/ios': [["'@/", "'@/ios/"], ['"@/', '"@/ios/']],
};

console.log('Step 1: Updating internal imports...');
for (const [dir, repls] of Object.entries(internalReplacements)) {
  const fullDir = path.join(process.cwd(), dir);
  walk(fullDir, (filePath) => {
    replaceInFile(filePath, repls);
  });
}

console.log('Step 2: Updating cross-package imports...');
const globalRepls = [
  ['@cotabor/core', '@/core'],
  ['@cotabor/driver', '@/driver'],
  ['@cotabor/web', '@/web'],
  ['@cotabor/playground', '@/playground-lib'],
  ['@cotabor/vision', '@/vision'],
  ['@cotabor/shared', '@/shared'],
  ['@cotabor/visualizer', '@/visualizer'],
  ['@cotabor/report', '@/report'],
  
  // Handle @midscene legacy imports
  ['@midscene/core', '@/core'],
  ['@midscene/driver', '@/driver'],
  ['@midscene/web', '@/web'],
  ['@midscene/playground', '@/playground-lib'],
  ['@midscene/vision', '@/vision'],
  ['@midscene/shared', '@/shared'],
  ['@midscene/visualizer', '@/visualizer'],
  ['@midscene/report', '@/report'],
];

walk(path.join(process.cwd(), 'src'), (filePath) => {
  replaceInFile(filePath, globalRepls);
});

walk(path.join(process.cwd(), 'apps/playground'), (filePath) => {
  replaceInFile(filePath, globalRepls);
});

walk(path.join(process.cwd(), 'apps/extension'), (filePath) => {
  replaceInFile(filePath, globalRepls);
});
