const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'zhiqu-video-next.js'), 'utf8');

class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
    this.listeners = {};
    this.classList = {
      add: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => classes.add(name));
        this.className = Array.from(classes).join(' ');
      },
      remove: (...names) => {
        const removed = new Set(names);
        this.className = this.className.split(/\s+/).filter((name) => name && !removed.has(name)).join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  appendChild(child) {
    return this.insertBefore(child, null);
  }

  insertBefore(child, reference) {
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    child.parentElement = this;
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, callback) {
    this.listeners[type] = callback;
  }

  click() {
    this.listeners.click?.();
  }

  contains(target) {
    return this === target || this.children.some((child) => child.contains(target));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const dataMatch = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
    const tagMatch = /^[a-z][a-z0-9-]*$/i.test(selector) && this.tagName === selector.toUpperCase();
    const matches = (dataMatch && this.getAttribute(dataMatch[1]) === dataMatch[2]) || tagMatch;
    return (matches ? [this] : []).concat(...this.children.map((child) => child.querySelectorAll(selector)));
  }
}

function createPage(referrer, { nativeBack = false } = {}) {
  const root = new TestElement('html');
  const head = new TestElement('head');
  const body = new TestElement('body');
  if (nativeBack) {
    const nativeHeader = new TestElement('div');
    const nativeBackLink = new TestElement('a');
    nativeBackLink.setAttribute('aria-label', '(tabs), back');
    nativeHeader.appendChild(nativeBackLink);
    body.appendChild(nativeHeader);
  }
  const headingHost = new TestElement('div');
  const heading = new TestElement('h1');
  heading.textContent = '学习内容';
  headingHost.appendChild(heading);
  body.appendChild(headingHost);
  root.appendChild(head);
  root.appendChild(body);

  let assignedUrl = null;
  let backCount = 0;
  let observerCallback = null;
  const document = {
    referrer,
    head,
    body,
    createElement(tagName) { return new TestElement(tagName); },
    getElementById(id) {
      return root.querySelectorAll(`[id="${id}"]`)[0] || null;
    },
    querySelector(selector) {
      if (selector === 'video') return null;
      if (selector === 'h1, h2, [role="heading"]') return heading;
      return root.querySelector(selector);
    },
    querySelectorAll(selector) {
      if (selector === 'h1, h2, [role="heading"]') return [heading];
      return root.querySelectorAll(selector);
    },
  };
  const location = {
    href: 'http://localhost:8082/content/video-1',
    origin: 'http://localhost:8082',
    pathname: '/content/video-1',
    search: '',
    hash: '',
    assign(url) { assignedUrl = url; },
  };
  const history = {
    pushState() {},
    replaceState() {},
    back() { backCount += 1; },
  };
  const window = {
    location,
    history,
    setTimeout(callback) { callback(); return 0; },
    addEventListener() {},
    localStorage: { getItem() { return null; } },
  };
  const context = {
    window,
    document,
    location,
    history,
    URL,
    Headers,
    fetch() { throw new Error('fetch should not run without a video'); },
    MutationObserver: class MutationObserver {
      constructor(callback) { observerCallback = callback; }
      observe() {}
    },
    globalThis: null,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'zhiqu-video-next.js' });
  return {
    root,
    body,
    heading,
    headingHost,
    observerCallback,
    getAssignedUrl: () => assignedUrl,
    getBackCount: () => backCount,
  };
}

const nativePage = createPage('http://localhost:8082/categories', { nativeBack: true });
assert.equal(nativePage.root.querySelectorAll('[data-zq-content-back="true"]').length, 0, 'the framed legacy back button must not be injected');
assert.equal(nativePage.root.querySelectorAll('[data-zq-content-native-back="true"]').length, 0, 'a native back link outside the heading container must prevent fallback injection');
nativePage.observerCallback();
assert.equal(nativePage.root.querySelectorAll('[data-zq-content-native-back="true"]').length, 0, 'repeated scans must continue using the native route control');

const returningPage = createPage('http://localhost:8082/categories');
const backButton = returningPage.root.querySelector('[data-zq-content-native-back="true"]');
assert.ok(backButton, 'content pages must have one unframed fallback back button when the native route control is unavailable');
assert.equal(backButton.parentElement, returningPage.headingHost);
assert.equal(backButton.getAttribute('aria-label'), '返回上一页');
backButton.click();
assert.equal(returningPage.getBackCount(), 1, 'same-origin fallback navigation must return to the previous page');
returningPage.observerCallback();
assert.equal(returningPage.root.querySelectorAll('[data-zq-content-native-back="true"]').length, 1, 'repeated scans must not duplicate the unframed fallback');
const lateNativeHeader = new TestElement('div');
const lateNativeBackLink = new TestElement('a');
lateNativeBackLink.setAttribute('aria-label', '(tabs), back');
lateNativeHeader.appendChild(lateNativeBackLink);
returningPage.body.appendChild(lateNativeHeader);
returningPage.observerCallback();
assert.equal(returningPage.root.querySelectorAll('[data-zq-content-native-back="true"]').length, 0, 'a native route control rendered later must remove the fallback button');

const directPage = createPage('');
directPage.root.querySelector('[data-zq-content-native-back="true"]').click();
assert.equal(directPage.getBackCount(), 0);
assert.equal(directPage.getAssignedUrl(), '/categories', 'direct content links must return to the course catalog');

console.log('video native back control: ok');

function createVideoCoverPage() {
  const root = new TestElement('html');
  const head = new TestElement('head');
  const body = new TestElement('body');
  const cover = new TestElement('div');
  const image = new TestElement('img');
  const duplicateCover = new TestElement('div');
  const duplicateImage = new TestElement('img');
  const unrelatedCover = new TestElement('div');
  const unrelatedImage = new TestElement('img');
  const video = new TestElement('video');
  const coverUrl = 'https://video.example/lesson-cover.jpg';
  cover.setAttribute('data-expoimage', 'true');
  image.src = coverUrl;
  image.currentSrc = coverUrl;
  cover.appendChild(image);
  duplicateCover.setAttribute('data-expoimage', 'true');
  duplicateImage.src = coverUrl;
  duplicateImage.currentSrc = coverUrl;
  duplicateCover.appendChild(duplicateImage);
  unrelatedCover.setAttribute('data-expoimage', 'true');
  unrelatedImage.src = 'https://video.example/other-cover.jpg';
  unrelatedImage.currentSrc = unrelatedImage.src;
  unrelatedCover.appendChild(unrelatedImage);
  body.appendChild(cover);
  body.appendChild(duplicateCover);
  body.appendChild(unrelatedCover);
  root.appendChild(head);
  root.appendChild(body);

  const document = {
    referrer: '',
    head,
    body,
    createElement(tagName) { return new TestElement(tagName); },
    getElementById() { return null; },
    querySelector(selector) {
      if (selector === 'video') return video;
      if (selector === '[data-expoimage="true"]') return cover;
      if (selector === 'h1, h2, [role="heading"]') return null;
      return root.querySelector(selector);
    },
    querySelectorAll(selector) {
      if (selector === 'h1, h2, [role="heading"]') return [];
      return root.querySelectorAll(selector);
    },
  };
  const location = {
    href: 'http://localhost:8082/content/video-1',
    origin: 'http://localhost:8082',
    pathname: '/content/video-1',
    search: '',
    hash: '',
    assign() {},
  };
  const history = { pushState() {}, replaceState() {}, back() {} };
  const window = {
    location,
    history,
    setTimeout(callback) { callback(); return 0; },
    addEventListener() {},
    localStorage: { getItem() { return null; } },
  };
  const context = {
    window,
    document,
    location,
    history,
    URL,
    Headers,
    fetch() { throw new Error('fetch should not run without a mounted player'); },
    MutationObserver: class MutationObserver { observe() {} },
    globalThis: null,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'zhiqu-video-next.js' });
  return { cover, duplicateCover, unrelatedCover, coverUrl, video };
}

const coverPage = createVideoCoverPage();
assert.equal(coverPage.cover.classList.contains('zq-video-standalone-cover-hidden'), true, 'the standalone cover must not occupy page space');
assert.equal(coverPage.cover.getAttribute('aria-hidden'), 'true');
assert.equal(coverPage.cover.getAttribute('data-zq-video-standalone-cover'), 'true');
assert.equal(coverPage.video.poster, coverPage.coverUrl, 'the player must keep the image as its loading poster');
assert.equal(coverPage.duplicateCover.classList.contains('zq-video-standalone-cover-hidden'), true, 'all duplicate standalone covers must be hidden');
assert.equal(coverPage.unrelatedCover.classList.contains('zq-video-standalone-cover-hidden'), false, 'unrelated images must remain available');

console.log('video cover layout: ok');
