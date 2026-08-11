const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(frontendRoot, 'serve-static.cjs'), 'utf8');
const bundlePath = path.join(frontendRoot, 'dist', '_expo', 'static', 'js', 'web', 'entry-66a29e6e70d2ab8e5d2a64739bf1973a.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');

const titleSource = 'title:"\\u7ee7\\u7eed\\u89c2\\u5bdf"';
const titlePatched = 'title:"\\u7ee7\\u7eed\\u5b66\\u4e60"';
const hintSource = 'children:"\\u89c2\\u5bdf\\u5df2\\u8bb0\\u5f55 \\xb7 \\u63a5\\u4e0b\\u6765\\u62c6\\u89e3\\u8bfe\\u7a0b\\u91cc\\u7684\\u6570\\u636e\\u4e0e\\u7b97\\u6cd5"';
const hintPatched = 'children:"\\u5b66\\u4e60\\u8fdb\\u5ea6\\u5df2\\u540c\\u6b65 \\xb7 \\u70b9\\u51fb\\u5361\\u7247\\u7ee7\\u7eed\\u8bfe\\u7a0b"';
const featuredWidthSource = 'l=Math.min(290,Math.max(248,.72*t))';
const featuredWidthPatched = 'l=Math.min(248,Math.max(216,.62*t))';
const featuredCardSource = "featuredCard:{overflow:'hidden',borderWidth:1,borderColor:k.JournalColors.line,borderRadius:6,backgroundColor:'rgba(255, 253, 250, 0.94)'}";
const featuredCardPatched = "featuredCard:{overflow:'hidden',flexDirection:'row',borderWidth:1,borderColor:k.JournalColors.line,borderRadius:6,backgroundColor:'rgba(255, 253, 250, 0.94)'}";
const featuredCoverSource = "featuredCover:{width:'100%',aspectRatio:1.7777777777777777,backgroundColor:k.JournalColors.paperDeep},featuredCoverFallback:{width:'100%',aspectRatio:1.7777777777777777,";
const featuredCoverPatched = "featuredCover:{width:96,height:96,flexShrink:0,backgroundColor:k.JournalColors.paperDeep},featuredCoverFallback:{width:96,height:96,flexShrink:0,";
const featuredCopySource = 'featuredCopy:{gap:k.Space.sm,padding:k.Space.md}';
const featuredCopyPatched = 'featuredCopy:{flex:1,minWidth:0,gap:4,padding:12}';
const featuredTitleSource = 'featuredTitle:{minHeight:42,';
const featuredTitlePatched = 'featuredTitle:{minHeight:21,';
const featuredFooterSource = 'featuredFooter:{minHeight:24,';
const featuredFooterPatched = 'featuredFooter:{minHeight:20,';

assert.ok(bundle.includes(titleSource), 'the immutable Expo bundle must contain the original home section title');
assert.ok(bundle.includes(hintSource), 'the immutable Expo bundle must contain the original observation hint');
assert.ok(bundle.includes(featuredWidthSource), 'the immutable Expo bundle must contain the original featured-card sizing');
assert.ok(bundle.includes(featuredCardSource), 'the immutable Expo bundle must contain the original featured-card layout');
assert.ok(bundle.includes(featuredCoverSource), 'the immutable Expo bundle must contain the original featured-cover ratio');
assert.ok(bundle.includes(featuredCopySource), 'the immutable Expo bundle must contain the original featured-card spacing');
assert.ok(bundle.includes(featuredTitleSource), 'the immutable Expo bundle must contain the original featured-title height');
assert.ok(bundle.includes(featuredFooterSource), 'the immutable Expo bundle must contain the original featured-footer height');
assert.ok(server.includes(`source.replace(homeContinueTitleSource, homeContinueTitlePatched)`), 'the static server must patch the home section title');
assert.ok(server.includes(`source.replace(homeContinueHintSource, homeContinueHintPatched)`), 'the static server must patch the home section hint');
assert.ok(server.includes(`source.replace(homeFeaturedWidthSource, homeFeaturedWidthPatched)`), 'the static server must patch the featured-card width');
assert.ok(server.includes(`source.replace(homeFeaturedCardSource, homeFeaturedCardPatched)`), 'the static server must patch the featured-card layout');
assert.ok(server.includes(`source.replace(homeFeaturedCoverSource, homeFeaturedCoverPatched)`), 'the static server must patch the featured-cover ratio');
assert.ok(server.includes(`source.replace(homeFeaturedCopySource, homeFeaturedCopyPatched)`), 'the static server must patch the featured-card spacing');
assert.ok(server.includes(`source.replace(homeFeaturedTitleSource, homeFeaturedTitlePatched)`), 'the static server must patch the featured-title height');
assert.ok(server.includes(`source.replace(homeFeaturedFooterSource, homeFeaturedFooterPatched)`), 'the static server must patch the featured-footer height');

const servedBundle = bundle
  .replace(titleSource, titlePatched)
  .replace(hintSource, hintPatched)
  .replace(featuredWidthSource, featuredWidthPatched)
  .replace(featuredCardSource, featuredCardPatched)
  .replace(featuredCoverSource, featuredCoverPatched)
  .replace(featuredCopySource, featuredCopyPatched)
  .replace(featuredTitleSource, featuredTitlePatched)
  .replace(featuredFooterSource, featuredFooterPatched);
assert.ok(servedBundle.includes(titlePatched), 'the served bundle must label the section as continue learning');
assert.ok(servedBundle.includes(hintPatched), 'the served bundle must describe the real progress and click behavior');
assert.ok(servedBundle.includes(featuredWidthPatched), 'the served bundle must keep the featured card compact');
assert.ok(servedBundle.includes(featuredCardPatched), 'the served bundle must render the featured card horizontally');
assert.ok(servedBundle.includes(featuredCoverPatched), 'the served bundle must render a compact featured thumbnail');
assert.ok(servedBundle.includes(featuredCopyPatched), 'the served bundle must use compact featured-card spacing');
assert.ok(servedBundle.includes(featuredTitlePatched), 'the served bundle must remove the oversized featured-title reservation');
assert.ok(servedBundle.includes(featuredFooterPatched), 'the served bundle must keep the featured footer compact');
assert.equal(servedBundle.includes(titleSource), false, 'the misleading continue observation title must be removed');
assert.equal(servedBundle.includes(hintSource), false, 'the misleading observation record hint must be removed');

console.log('home continue-learning copy: ok');
