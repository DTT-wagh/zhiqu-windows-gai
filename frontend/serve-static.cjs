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
  '.webp': 'image/webp',
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
const guestAccessScript = '<script src="/zhiqu-guest-access.js"></script>';
const aiAssistantScript = '<script src="/zhiqu-ai-assistant.js"></script>';
const navBackgroundScript = '<script src="/zhiqu-nav-background.js"></script>';
const rewardsBackScript = '<script src="/zhiqu-rewards-back.js"></script>';
const magicReferenceScript = '<script src="/magic-reference.js"></script>';
const magicLandscapeScript = `<style id="zq-magic-landscape">
  @media (orientation: portrait) {
    html, body { overflow: hidden; }
    body[data-zq-magic-landscape] #root {
      position: fixed;
      top: 50%;
      left: 50%;
      width: 100vw;
      height: 100vh;
      max-width: none;
      max-height: none;
      transform: translate(-50%, -50%) rotate(90deg);
      transform-origin: center center;
    }
    body[data-zq-magic-lobby][data-zq-magic-landscape] #root {
      width: 100vh;
      height: 100vw;
    }
  }
</style><script>(() => {
  const lockLandscape = () => {
    try {
      const orientation = globalThis.screen?.orientation;
      if (typeof orientation?.lock === 'function') {
        Promise.resolve(orientation.lock('landscape')).catch(() => {});
      }
    } catch {}
  };
  const syncMagicLandscape = () => {
    const pathname = globalThis.location?.pathname || '';
    const pathParts = pathname.split('/').filter(Boolean);
    const isMagicRoute = pathname === '/magic' || (pathParts.length === 2 && pathParts[0] === 'magic');
    const isMagicLobby = pathname === '/magic';
    document.body?.toggleAttribute('data-zq-magic-landscape', isMagicRoute);
    document.body?.toggleAttribute('data-zq-magic-lobby', isMagicLobby);
    if (isMagicRoute) lockLandscape();
  };
  syncMagicLandscape();
  globalThis.setInterval(syncMagicLandscape, 200);
  globalThis.addEventListener('pointerdown', () => {
    if (document.body?.hasAttribute('data-zq-magic-landscape')) lockLandscape();
  }, { passive: true });
})();</script>`;
const apiBaseUrl = String(process.env.ZHIQU_API_BASE_URL || 'http://127.0.0.1:8080').trim().replace(/\/+$/, '');
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
const settingsLogoutPatched = "async function J(){if(!o){n(!0);try{await e();globalThis.location.replace('/')}finally{n(!1)}}}";
const apiGuestAccessSource = ",'required'===n&&!l)throw new c(401,{code:'UNAUTHORIZED',message:'\\u8bf7\\u5148\\u767b\\u5f55'});";
const apiGuestAccessPatched = ",'required'===n&&!l){const r=globalThis.__zqGuestApiRequest?.(e,t);if(r)return r;if('GET'!==String(t.method||'GET').toUpperCase())globalThis.__zqRequireLogin?.();throw new c(401,{code:'UNAUTHORIZED',message:'\\u8bf7\\u5148\\u767b\\u5f55'});}";
const magicImageFrameSource = "imageFrame:{overflow:'hidden',aspectRatio:1,borderRadius:8,borderWidth:4";
const magicImageFramePatched = "imageFrame:{overflow:'hidden',width:'48%',flexShrink:0,aspectRatio:1.7777777777777777,borderRadius:8,borderWidth:4";
const magicImageFrameCompactSource = "imageFrameCompact:{width:'100%',aspectRatio:1,borderWidth:2}";
const magicImageFrameCompactPatched = "imageFrameCompact:{width:'100%',aspectRatio:1.7777777777777777,borderWidth:2}";
const magicImageFallbackSource = "imageFallback:{minHeight:280,alignItems:'center',justifyContent:'center'";
const magicImageFallbackPatched = "imageFallback:{width:'48%',flexShrink:0,minHeight:180,aspectRatio:1.7777777777777777,alignItems:'center',justifyContent:'center'";
const magicImageFallbackCompactSource = "imageFallbackCompact:{minHeight:130,borderWidth:2}";
const magicImageFallbackCompactPatched = "imageFallbackCompact:{width:'100%',minHeight:96,aspectRatio:1.7777777777777777,borderWidth:2}";
const magicPlayScrollSource = "scroll:{flexGrow:1,width:'100%',maxWidth:720,alignSelf:'center',padding:16,paddingBottom:44,gap:20}";
const magicPlayScrollPatched = "scroll:{flexGrow:1,width:'100%',maxWidth:1200,alignSelf:'center',padding:24,paddingBottom:56,gap:18}";
const magicGameGapSource = "gameGap:{gap:18}";
const magicGameGapPatched = "gameGap:{flexDirection:'row',alignItems:'flex-start',gap:18}";
const magicSpellBookSource = "spellBook:{position:'relative',gap:17,padding:18";
const magicSpellBookPatched = "spellBook:{flex:1,minWidth:0,position:'relative',gap:17,padding:18";
const magicSafeSource = "safe:{flex:1,backgroundColor:'#2B164D'}";
const magicSafePatched = "safe:{flex:1,backgroundColor:'#2B164D',backgroundImage:\"url('/assets/assets/images/bag1.png')\",backgroundSize:'cover',backgroundPosition:'center'}";
const gameCancelNavigationPatches = [
  [
    'M=e=>{w(e),n.router.replace("/blind-box")}',
    'M=e=>{w(e),globalThis.location.replace("/community?section=games")}',
  ],
  [
    'onSuccess:e=>{me(e),n.router.replace("/jailbreak-game")}',
    'onSuccess:e=>{me(e),globalThis.location.replace("/community?section=games")}',
  ],
  [
    'me=e=>{ce(h,c,e),l.router.replace("/magic")}',
    'me=e=>{ce(h,c,e),globalThis.location.replace("/community?section=games")}',
  ],
  [
    'rt=e=>{pe(e),l.router.replace("/truth-game")}',
    'rt=e=>{pe(e),globalThis.location.replace("/community?section=games")}',
  ],
];
const rootSessionRedirectSource = 'const b=f?"/(tabs)":"/login"';
const rootSessionRedirectPatched = 'const b="/(tabs)"';
const tabsSessionGuardSource = 'if(!s){let t;return e[1]===Symbol.for("react.memo_cache_sentinel")?(t=(0,k.jsx)(n.Redirect,{href:"/login"}),e[1]=t):t=e[1],t}';
const tabsSessionGuardPatched = '';
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
const guestHomeSource = 'function M(){return(0,I.apiRequest)("/api/learning")}function H(){return(0,I.apiRequest)("/api/home")}';
const guestHomePatched = 'function M(){return globalThis.__zqIsGuestSession?.()?globalThis.__zqGuestLearning("/api/learning"):(0,I.apiRequest)("/api/learning")}function H(){return globalThis.__zqIsGuestSession?.()?globalThis.__zqGuestHome():(0,I.apiRequest)("/api/home")}';
const homeContinueTitleSource = 'title:"\\u7ee7\\u7eed\\u89c2\\u5bdf"';
const homeContinueTitlePatched = 'title:"\\u7ee7\\u7eed\\u5b66\\u4e60"';
const homeContinueHintSource = 'children:"\\u89c2\\u5bdf\\u5df2\\u8bb0\\u5f55 \\xb7 \\u63a5\\u4e0b\\u6765\\u62c6\\u89e3\\u8bfe\\u7a0b\\u91cc\\u7684\\u6570\\u636e\\u4e0e\\u7b97\\u6cd5"';
const homeContinueHintPatched = 'children:"\\u5b66\\u4e60\\u8fdb\\u5ea6\\u5df2\\u540c\\u6b65 \\xb7 \\u70b9\\u51fb\\u5361\\u7247\\u7ee7\\u7eed\\u8bfe\\u7a0b"';
const homeFeaturedWidthSource = 'l=Math.min(290,Math.max(248,.72*t))';
const homeFeaturedWidthPatched = 'l=Math.min(248,Math.max(216,.62*t))';
const homeFeaturedCardSource = "featuredCard:{overflow:'hidden',borderWidth:1,borderColor:k.JournalColors.line,borderRadius:6,backgroundColor:'rgba(255, 253, 250, 0.94)'}";
const homeFeaturedCardPatched = "featuredCard:{overflow:'hidden',flexDirection:'row',borderWidth:1,borderColor:k.JournalColors.line,borderRadius:6,backgroundColor:'rgba(255, 253, 250, 0.94)'}";
const homeFeaturedCoverSource = "featuredCover:{width:'100%',aspectRatio:1.7777777777777777,backgroundColor:k.JournalColors.paperDeep},featuredCoverFallback:{width:'100%',aspectRatio:1.7777777777777777,";
const homeFeaturedCoverPatched = "featuredCover:{width:96,height:96,flexShrink:0,backgroundColor:k.JournalColors.paperDeep},featuredCoverFallback:{width:96,height:96,flexShrink:0,";
const homeFeaturedCopySource = 'featuredCopy:{gap:k.Space.sm,padding:k.Space.md}';
const homeFeaturedCopyPatched = 'featuredCopy:{flex:1,minWidth:0,gap:4,padding:12}';
const homeFeaturedTitleSource = 'featuredTitle:{minHeight:42,';
const homeFeaturedTitlePatched = 'featuredTitle:{minHeight:21,';
const homeFeaturedFooterSource = 'featuredFooter:{minHeight:24,';
const homeFeaturedFooterPatched = 'featuredFooter:{minHeight:20,';
const guestProfileUserSource = 'function Z(){return(0,I.apiRequest)("/api/users/me")}';
const guestProfileUserPatched = 'function Z(){return globalThis.__zqIsGuestSession?.()?Promise.resolve(globalThis.__zqGuestProfile()):(0,I.apiRequest)("/api/users/me")}';
const guestProfileHistorySource = 'function Q(){return(0,I.apiRequest)("/api/history")}';
const guestProfileHistoryPatched = 'function Q(){return globalThis.__zqIsGuestSession?.()?Promise.resolve([]):(0,I.apiRequest)("/api/history")}';
const guestProfileFavoritesSource = 'function V(){return(0,I.apiRequest)("/api/favorites")}';
const guestProfileFavoritesPatched = 'function V(){return globalThis.__zqIsGuestSession?.()?Promise.resolve([]):(0,I.apiRequest)("/api/favorites")}';
const guestProfileLearningSource = 'function U(){return(0,I.apiRequest)("/api/learning")}';
const guestProfileLearningPatched = 'function U(){return globalThis.__zqIsGuestSession?.()?globalThis.__zqGuestLearning("/api/learning"):(0,I.apiRequest)("/api/learning")}';
const guestProfileHomeSource = 'function G(){return(0,I.apiRequest)("/api/home")}';
const guestProfileHomePatched = 'function G(){return globalThis.__zqIsGuestSession?.()?globalThis.__zqGuestHome():(0,I.apiRequest)("/api/home")}';
const guestProfileLedgerSource = 'function Y(){return(0,I.listRewardLedger)(8)}';
const guestProfileLedgerPatched = 'function Y(){return globalThis.__zqIsGuestSession?.()?Promise.resolve([]):(0,I.listRewardLedger)(8)}';
const guestProfileRewardsSource = 'queryFn:I.getRewardSummary';
const guestProfileRewardsPatched = 'queryFn:()=>globalThis.__zqIsGuestSession?.()?Promise.resolve(globalThis.__zqGuestRewardSummary()):I.getRewardSummary()';
const guestProfileSocialSource = 'queryFn:q.getSocialMe';
const guestProfileSocialPatched = 'queryFn:()=>globalThis.__zqIsGuestSession?.()?Promise.resolve({friendCount:0,incomingRequestCount:0}):q.getSocialMe()';
const guestProfileEditSource = 'function K(){return n.router.push("/profile/edit")}';
const guestProfileEditPatched = 'function K(){return n.router.push(globalThis.__zqIsGuestSession?.()?"/login":"/profile/edit")}';

function routeDocumentFor(pathname, resolved) {
  const directDocument = `${resolved}.html`;
  if (directDocument.startsWith(root) && fs.existsSync(directDocument)) return directDocument;

  const segments = pathname.split('/').filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    for (const parameter of ['[id]', '[section]']) {
      const candidateSegments = segments.slice();
      candidateSegments[index] = parameter;
      const candidate = path.resolve(root, `./${candidateSegments.join('/')}.html`);
      if (candidate.startsWith(root) && fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function safePath(urlPath) {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  const resolved = path.resolve(root, `.${pathname}`);
  if (!resolved.startsWith(root)) return null;

  // Expo exports route documents as `/route.html` and `/route/[id].html`,
  // while the browser uses extensionless URLs. Resolve the matching artifact
  // before falling back to the SPA shell; otherwise the root loading document
  // is hydrated against every route and React reports a mismatch.
  const unresolvedOrDirectory = !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory();
  if (!path.extname(pathname) && unresolvedOrDirectory) {
    const routeDocument = routeDocumentFor(pathname, resolved);
    if (routeDocument) return routeDocument;
  }
  return resolved;
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
      source = source.replace(apiGuestAccessSource, apiGuestAccessPatched);
      source = source.replace(rootSessionRedirectSource, rootSessionRedirectPatched);
      source = source.replace(tabsSessionGuardSource, tabsSessionGuardPatched);
      source = source.replace(settingsBackSource, settingsBackPatched);
      source = source.replace(friendsImportSource, friendsImportPatched);
      source = source.replace(friendsDependencySource, friendsDependencyPatched);
      source = source.replace(friendAvatarSource, friendAvatarPatched);
      source = source.replace(requestAvatarSource, requestAvatarPatched);
      source = source.replace(friendRowSource, friendRowPatched);
      source = source.replace(friendRowChildrenSource, friendRowChildrenPatched);
      source = source.replace(friendsAddButtonSource, friendsAddButtonPatched);
      source = source.replace(guestHomeSource, guestHomePatched);
      source = source.replace(homeContinueTitleSource, homeContinueTitlePatched);
      source = source.replace(homeContinueHintSource, homeContinueHintPatched);
      source = source.replace(homeFeaturedWidthSource, homeFeaturedWidthPatched);
      source = source.replace(homeFeaturedCardSource, homeFeaturedCardPatched);
      source = source.replace(homeFeaturedCoverSource, homeFeaturedCoverPatched);
      source = source.replace(homeFeaturedCopySource, homeFeaturedCopyPatched);
      source = source.replace(homeFeaturedTitleSource, homeFeaturedTitlePatched);
      source = source.replace(homeFeaturedFooterSource, homeFeaturedFooterPatched);
      source = source.replace(guestProfileUserSource, guestProfileUserPatched);
      source = source.replace(guestProfileHistorySource, guestProfileHistoryPatched);
      source = source.replace(guestProfileFavoritesSource, guestProfileFavoritesPatched);
      source = source.replace(guestProfileLearningSource, guestProfileLearningPatched);
      source = source.replace(guestProfileHomeSource, guestProfileHomePatched);
      source = source.replace(guestProfileLedgerSource, guestProfileLedgerPatched);
      source = source.replace(guestProfileRewardsSource, guestProfileRewardsPatched);
      source = source.replace(guestProfileSocialSource, guestProfileSocialPatched);
      source = source.replace(guestProfileEditSource, guestProfileEditPatched);
      source = source.replace(magicImageFrameSource, magicImageFramePatched);
      source = source.replace(magicImageFrameCompactSource, magicImageFrameCompactPatched);
      source = source.replace(magicImageFallbackSource, magicImageFallbackPatched);
      source = source.replace(magicImageFallbackCompactSource, magicImageFallbackCompactPatched);
      source = source.replace(magicPlayScrollSource, magicPlayScrollPatched);
      source = source.replace(magicGameGapSource, magicGameGapPatched);
      source = source.replace(magicSpellBookSource, magicSpellBookPatched);
      source = source.replaceAll(magicSafeSource, magicSafePatched);
      for (const [cancelSource, cancelPatched] of gameCancelNavigationPatches) {
        source = source.replace(cancelSource, cancelPatched);
      }
      body = Buffer.from(source);
    }
    if (path.extname(file).toLowerCase() === '.html') {
      const standaloneAssistant = path.basename(file) === 'ai-assistant.html';
      const standaloneSinglePlayer = path.basename(file) === 'single-player-game.html';
      const scripts = standaloneAssistant
        ? [apiConfigScript, aiAssistantScript]
        : standaloneSinglePlayer
          ? []
        : [apiConfigScript, guestAccessScript, avatarPreviewScript, birthdayWheelScript, profileEditFeedbackScript, gamesPlaceholderScript, askBodyScript, askNavigationScript, answerComposerScript, keyboardAvoidanceScript, friendsNavigationScript, friendsAuthGuardScript, socialChatScript, videoControlsScript, videoNextScript, aiAssistantScript];
      let html = body.toString('utf8');
      if (standaloneSinglePlayer) {
        html = html.replace('</head>', `${apiConfigScript}</head>`);
      }
      if (!standaloneAssistant && !standaloneSinglePlayer && !html.includes('src="/zhiqu-recommendations.js"')) {
        html = html.replace('</head>', `${recommendationsScript}</head>`);
      }
      const tailScripts = standaloneSinglePlayer ? '' : `${rewardsBackScript}${navBackgroundScript}`;
      const requestPathname = decodeURIComponent((request.url || '/').split('?')[0]);
      const magicRouteScript = standaloneAssistant || standaloneSinglePlayer ? '' : magicLandscapeScript;
      const magicLobbyScript = standaloneAssistant || standaloneSinglePlayer ? '' : magicReferenceScript;
      body = Buffer.from(html.replace('</body>', `${scripts.join('')}${magicRouteScript}${magicLobbyScript}${tailScripts}</body>`));
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
