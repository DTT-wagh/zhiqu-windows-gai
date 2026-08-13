const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'dist', 'records.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dist', 'records-reference.css'), 'utf8');
const page = fs.readFileSync(path.join(root, 'dist', 'records-reference.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'dist', 'zhiqu-records-navigation.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'serve-static.cjs'), 'utf8');

assert.match(html, /记录中心/);
assert.match(html, /data-record-tab="play"/);
assert.match(html, /data-record-tab="watch"/);
assert.match(html, /data-record-tab="browse"/);
assert.match(html, /data-action="back"/);
assert.doesNotMatch(html, /打开画里藏词记录|画里藏词.*实践完成/, 'the records page must not contain seeded record rows');

assert.match(page, /loadJson\('\/api\/home'\)/, 'game history must come from the real home response');
assert.match(page, /view=review/, 'magic play records must open a read-only review route');
assert.match(page, /loadJson\('\/api\/history'\)/, 'watch history must come from the real history API');
assert.match(page, /zhiqu\.browse\.history\.v1/, 'browse history must use the locally captured real navigation trail');
assert.ok(page.includes('/^\\/content\\/[^/]+$/'), 'browse history must be limited to content detail routes');
assert.ok(page.includes('/^\\/community\\/questions\\/[^/]+$/'), 'community question details may be browsed');
assert.match(page, /JSON\.stringify\(valid\)/, 'legacy broad browse entries must be cleaned on read');
assert.match(page, /暂无.*记录/, 'each empty category must have a real empty state');
assert.doesNotMatch(page, /const.*mock|fake|seed/i, 'records must not be seeded in the page');

assert.match(navigation, /textContent === '最近记录'/);
assert.match(navigation, /查看全部/);
assert.match(navigation, /window\.location\.assign\('\/records'\)/);
assert.match(navigation, /rows\.slice\(1\)/, 'the home summary must remain compact');
assert.match(navigation, /function isRecordable/);
assert.ok(navigation.includes('/^\\/community\\/questions\\/[^/]+$/'));
assert.doesNotMatch(navigation, /var labels =/);

assert.match(server, /standaloneRecords = path\.basename\(file\) === 'records\.html'/);
assert.match(server, /standaloneRecords\s*\? \[apiConfigScript\]/);
assert.match(server, /standaloneRecords\s*\? recordsReferenceScript/);
assert.match(server, /standaloneRecords \? '' : recordsNavigationScript/);

assert.match(css, /grid-template-columns:\s*repeat\(3, 1fr\)/);
assert.match(css, /min-height:\s*44px/);

console.log('zhiqu records reference tests passed');
