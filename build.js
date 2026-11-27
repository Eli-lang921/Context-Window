/* Concatenates src/ into dist/context-window.html: one self-contained page for the claude.ai Artifact tool
   (which adds the outer <html>/<head>/<body> skeleton itself). Run: node build.js */
const fs = require('fs'), path = require('path');
const root = __dirname, read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const JS = ['logic.js', 'prompts.js', 'store.js', 'ai.js', 'voice.js', 'connectors.js', 'views/ui.js', 'views/cards.js', 'views/course.js', 'views/add.js', 'views/study.js', 'views/extra.js', 'views/main.js'];
const js = JS.map(f => `/* ===== ${f} ===== */\n` + read(f)).join('\n');
if (/<\/script/i.test(js)) throw new Error('A source file contains a closing script tag; the page would break.');
const html = `<title>Context Window</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap">
<style>
${read('style.css')}</style>
${read('shell.html')}<script>
${js}
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'context-window.html'), html);
console.log('Built dist/context-window.html: ' + Math.round(html.length / 1024) + ' KB');
