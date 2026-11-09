// 나뉜 파일을 한 파일로 합치기 (배포·공유용). 개발은 나뉜 파일로 하고, 보낼 때만 실행한다.
//   node tools/bundle.js                 → dist/index.html
//   node tools/bundle.js 다른경로.html
// index.html 의 <link rel="stylesheet" href="..."> 와 <script src="..."></script> 를 파일 내용으로 바꿔 넣는다.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist', 'index.html');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => `<style>\n${read(href)}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const code = read(src);
  if (code.includes('</script')) throw new Error(`${src} 안에 </script 문자열이 있어 합칠 수 없습니다`);
  return `<script data-src="${src}">\n${code}</script>`;
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`합친 파일: ${out} (${html.split('\n').length}줄, ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB)`);
