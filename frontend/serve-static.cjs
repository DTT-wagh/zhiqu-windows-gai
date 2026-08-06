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
const keyboardAvoidanceScript = '<script src="/zhiqu-keyboard-avoidance.js"></script>';
const friendsNavigationScript = '<script src="/zhiqu-friends-navigation.js"></script>';
const friendsAuthGuardScript = '<script src="/zhiqu-friends-auth-guard.js"></script>';
const socialChatScript = '<script src="/zhiqu-social-chat.js"></script>';
const videoControlsScript = '<script src="/zhiqu-video-controls.js"></script>';
const videoNextScript = '<script src="/zhiqu-video-next.js"></script>';
const recommendationsScript = '<script src="/zhiqu-recommendations.js"></script>';
const apiBaseUrl = String(process.env.ZHIQU_API_BASE_URL || '').trim().replace(/\/+$/, '');
const apiConfigScript = `<script>globalThis.__ZHIQU_API_BASE_URL=${JSON.stringify(apiBaseUrl).replace(/</g, '\\u003c')};</script>`;
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
const logoutSource = "_e.logout=async function(){const e=l?.refreshToken;if(e)try{await T('/api/auth/logout',{method:'POST',body:{refreshToken:e},auth:'none'})}finally{await h(null)}else await h(null)}";
const logoutPatched = "_e.logout=async function(){const e=l?.refreshToken;await h(null);if(e){T('/api/auth/logout',{method:'POST',body:{refreshToken:e},auth:'none'}).catch(()=>{})}}";
const settingsLogoutSource = "async function J(){if(!o){n(!0);try{await e(),t.router.replace('/login')}finally{n(!1)}}}";
const settingsLogoutPatched = "async function J(){if(!o){n(!0);try{const logoutPromise=e();t.router.replace('/login');await logoutPromise}finally{n(!1)}}}";
const settingsBackSource = 'accessibilityLabel:"\\u8fd4\\u56de\\u6211\\u7684",accessibilityRole:"button",onPress:()=>t.router.back()';
const settingsBackPatched = 'accessibilityLabel:"\\u8fd4\\u56de\\u6211\\u7684",accessibilityRole:"button",onPress:()=>{const e=t.router.canGoBack?.();e?t.router.back():t.router.replace("/")}';
const friendsImportSource = 'q=r(_d[31]);function w()';
const friendsImportPatched = 'q=r(_d[31]),AvatarKit=r(_d[32]),ChatIcon=e(r(_d[33])),SearchIcon=e(r(_d[34]));function w()';
const friendsDependencySource = '},1485,[1578,1181,1461,81,1251,1469,1276,1473,1246,1177,1457,1474,1475,810,1256,39,166,291,29,298,100,245,173,1249,1238,1146,1179,1230,1270,1266,1180,2]);';
const friendsDependencyPatched = '},1485,[1578,1181,1461,81,1251,1469,1276,1473,1246,1177,1457,1474,1475,810,1256,39,166,291,29,298,100,245,173,1249,1238,1146,1179,1230,1270,1266,1180,2,1257,809,1237]);';
const friendAvatarSource = 'S=(0,q.jsx)(E.default,{style:ee.avatar,children:(0,q.jsx)(x.default,{size:21,color:B.JournalColors.indigo})})';
const friendAvatarPatched = 'S=(0,q.jsx)(AvatarKit.StudentAvatar,{avatarKey:n.student.avatarKey,size:44})';
const requestAvatarSource = 'c=(0,q.jsx)(E.default,{style:ee.avatar,children:(0,q.jsx)(x.default,{size:21,color:B.JournalColors.indigo})})';
const requestAvatarPatched = 'c=(0,q.jsx)(AvatarKit.StudentAvatar,{avatarKey:n.student.avatarKey,size:44})';
const friendRowSource = 'const T=`\\u7ba1\\u7406${n.student.nickname}`;let A,N,w,M,P;return';
const friendRowPatched = 'const T=`\\u7ba1\\u7406${n.student.nickname}`;const chatLabel=`\\u4e0e${n.student.nickname}\\u804a\\u5929`;const chatButton=(0,q.jsx)(R.default,{accessibilityLabel:chatLabel,accessibilityRole:"button",onPress:()=>globalThis.__zqOpenSocialChatForProfile?.(n.student.publicProfileId,n.student.nickname),style:ee.iconButton,children:(0,q.jsx)(ChatIcon.default,{size:20,color:B.JournalColors.indigo})});let A,N,w,M,P;return';
const friendRowChildrenSource = 'children:[S,I,J,N]}';
const friendRowChildrenPatched = 'children:[S,I,J,chatButton,N]}';
const friendsAddButtonSource = '(0,q.jsx)(k.AppButton,{label:"\\u6dfb\\u52a0\\u7b14\\u53cb",icon:f.default,onPress:P})';
const friendsAddButtonPatched = '(0,q.jsxs)(E.default,{style:{width:"100%",flexDirection:"row",gap:12},children:[(0,q.jsx)(E.default,{style:{flex:1},children:(0,q.jsx)(k.AppButton,{label:"\\u6dfb\\u52a0\\u7b14\\u53cb",icon:f.default,onPress:P})}),(0,q.jsx)(E.default,{style:{flex:1},children:(0,q.jsx)(k.AppButton,{label:"\\u5bfb\\u627e\\u7b14\\u53cb",icon:SearchIcon.default,onPress:()=>globalThis.__zqOpenSocialSearch?.(),variant:"secondary"})})]})';

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
      source = source.replace(logoutSource, logoutPatched);
      source = source.replace(settingsLogoutSource, settingsLogoutPatched);
      source = source.replace(settingsBackSource, settingsBackPatched);
      source = source.replace(friendsImportSource, friendsImportPatched);
      source = source.replace(friendsDependencySource, friendsDependencyPatched);
      source = source.replace(friendAvatarSource, friendAvatarPatched);
      source = source.replace(requestAvatarSource, requestAvatarPatched);
      source = source.replace(friendRowSource, friendRowPatched);
      source = source.replace(friendRowChildrenSource, friendRowChildrenPatched);
      source = source.replace(friendsAddButtonSource, friendsAddButtonPatched);
      body = Buffer.from(source);
    }
    if (path.extname(file).toLowerCase() === '.html') {
      const scripts = [apiConfigScript, avatarPreviewScript, birthdayWheelScript, profileEditFeedbackScript, gamesPlaceholderScript, askBodyScript, askNavigationScript, answerComposerScript, keyboardAvoidanceScript, friendsNavigationScript, friendsAuthGuardScript, socialChatScript, videoControlsScript, videoNextScript];
      let html = body.toString('utf8');
      if (!html.includes('src="/zhiqu-recommendations.js"')) html = html.replace('</head>', `${recommendationsScript}</head>`);
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
