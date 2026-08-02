const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, 'dist');
const port = Number(process.env.PORT || 8082);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
};

const gamesPlaceholderScript = '<script src="/zhiqu-placeholder-games.js"></script>';
const avatarPreviewScript = '<script src="/zhiqu-avatar-preview.js"></script>';
const birthdayWheelScript = '<script src="/zhiqu-birthday-wheel.js"></script>';
const profileEditFeedbackScript = '<script src="/zhiqu-profile-edit-feedback.js"></script>';
const askBodyScript = '<script src="/zhiqu-ask-body.js"></script>';
const askNavigationScript = '<script src="/zhiqu-ask-navigation.js"></script>';
const answerComposerScript = '<script src="/zhiqu-answer-composer.js"></script>';
const askThemeToggleSource = 'function(e){oe(()=>{s(e),B(""),Q([])})';
const askThemeTogglePatched = 'function(e){oe(()=>{s(n===e?"":e),B(""),Q([])})';
const askBodyValidationSource = 'P.trim().length<=1e3';
const askBodyValidationPatched = 'P.trim().length<=3e3';
const askBodyCreateLabelSource = 'const C=`\\u95ee\\u9898\\u6b63\\u6587 ${P.length}/1000`';
const askBodyCreateLabelPatched = 'const C=`\\u95ee\\u9898\\u6b63\\u6587 ${P.length}/3000`';
const askBodyCreateInputSource = 'maxLength:1e3,multiline:!0,onChangeText:j,placeholder:"\\u5199\\u4e0b\\u4f60\\u89c2\\u5bdf\\u5230\\u7684\\u73b0\\u8c61\\u3001\\u5df2\\u7ecf\\u60f3\\u5230\\u7684\\u89e3\\u91ca\\u548c\\u4ecd\\u7136\\u56f0\\u60d1\\u7684\\u5730\\u65b9"';
const askBodyCreateInputPatched = 'maxLength:3e3,multiline:!0,onChangeText:j,placeholder:"\\u5199\\u4e0b\\u4f60\\u89c2\\u5bdf\\u5230\\u7684\\u73b0\\u8c61\\u3001\\u5df2\\u7ecf\\u60f3\\u5230\\u7684\\u89e3\\u91ca\\u548c\\u4ecd\\u7136\\u56f0\\u60d1\\u7684\\u5730\\u65b9"';
const askBodyEditLabelSource = 'const oe=`\\u95ee\\u9898\\u6b63\\u6587 ${F.length}/1000`';
const askBodyEditLabelPatched = 'const oe=`\\u95ee\\u9898\\u6b63\\u6587 ${F.length}/3000`';
const askBodyEditInputSource = 'maxLength:1e3,multiline:!0,onChangeText:le,value:F';
const askBodyEditInputPatched = 'maxLength:3e3,multiline:!0,onChangeText:le,value:F';
const answerCreateSource = 're=()=>(0,H.createCommunityAnswer)(w,{requestId:(0,q.createRequestId)(),body:R.trim()})';
const answerCreatePatched = 're=()=>Promise.resolve(globalThis.__zqPrepareAnswerBody?globalThis.__zqPrepareAnswerBody(R.trim()):R.trim()).then(zqBody=>(0,H.createCommunityAnswer)(w,{requestId:(0,q.createRequestId)(),body:zqBody}))';
const answerSuccessSource = 'const ie=(0,n.useMutation)({mutationFn:re,onSuccess:()=>{T(""),be()}})';
const answerSuccessPatched = 'const ie=(0,n.useMutation)({mutationFn:re,onSuccess:()=>{T(""),globalThis.__zqAnswerSubmitSuccess?.(),be()}})';
const answerDisabledSource = 'disabled:!R.trim(),loading:ie.isPending,onPress:()=>ie.mutate()';
const answerDisabledPatched = 'disabled:!R.trim()&&!globalThis.__zqHasAnswerImages?.(),loading:ie.isPending,onPress:()=>ie.mutate()';

function safePath(urlPath) {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  const resolved = path.resolve(root, `.${pathname}`);
  return resolved.startsWith(root) ? resolved : null;
}

const server = http.createServer((request, response) => {
  let file = safePath(request.url);
  if (!file) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  try {
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'index.html');
    }
    let body = fs.readFileSync(file);
    if (path.extname(file).toLowerCase() === '.js') {
      let source = body.toString('utf8');
      source = source.replace(askThemeToggleSource, askThemeTogglePatched);
      source = source.replace(askBodyValidationSource, askBodyValidationPatched);
      source = source.replace(askBodyCreateLabelSource, askBodyCreateLabelPatched);
      source = source.replace(askBodyCreateInputSource, askBodyCreateInputPatched);
      source = source.replace(askBodyEditLabelSource, askBodyEditLabelPatched);
      source = source.replace(askBodyEditInputSource, askBodyEditInputPatched);
      source = source.replace(answerCreateSource, answerCreatePatched);
      source = source.replace(answerSuccessSource, answerSuccessPatched);
      source = source.replace(answerDisabledSource, answerDisabledPatched);
      body = Buffer.from(source);
    }
    if (path.extname(file).toLowerCase() === '.html') {
      const scripts = [avatarPreviewScript, birthdayWheelScript, profileEditFeedbackScript, gamesPlaceholderScript, askBodyScript, askNavigationScript, answerComposerScript];
      const html = body.toString('utf8');
      body = Buffer.from(html.replace('</body>', `${scripts.join('')}</body>`));
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500);
    response.end('Internal server error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Zhiqu web demo listening at http://localhost:${port}`);
});
