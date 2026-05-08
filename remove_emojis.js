const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src/i18n/locales');
const locales = fs.readdirSync(localesDir);

locales.forEach(locale => {
  const optionsPath = path.join(localesDir, locale, 'options.json');
  if (fs.existsSync(optionsPath)) {
    let content = fs.readFileSync(optionsPath, 'utf8');
    content = content.replace(/"title": "🧠 /g, '"title": "');
    content = content.replace(/"notion": "📝 /g, '"notion": "');
    content = content.replace(/"llm": "🤖 /g, '"llm": "');
    content = content.replace(/"mcp": "🔌 /g, '"mcp": "');
    content = content.replace(/"title": "📝 /g, '"title": "');
    fs.writeFileSync(optionsPath, content, 'utf8');
  }
});
console.log('Emojis removed from locales');
