const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendRoot = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(frontendRoot, 'dist', 'zhiqu-rewards-back.js'), 'utf8');
const server = fs.readFileSync(path.join(frontendRoot, 'serve-static.cjs'), 'utf8');

assert.doesNotThrow(
  () => new vm.Script(script, { filename: 'zhiqu-rewards-back.js' }),
  'rewards back-button script must parse',
);
assert.match(script, /setAttribute\('aria-label', '返回'\)/, 'the back button must have an accessible label');
assert.match(script, /pointer-events: auto/, 'the button must opt in to pointer events inside the Expo header');
assert.match(script, /history\.back\(\)/, 'the button must return to the previous in-app page');
assert.match(script, /\/magic\?mode=create/, 'direct visits must have a safe lobby fallback');
assert.match(server, /zhiqu-rewards-back\.js/, 'the static server must inject the rewards back button');

function renderRewardsHeader(historyLength, nativeBackInitially = false) {
  const elementsById = new Map();
  let observerCallback = null;

  class Element {
    constructor(tagName, textContent = '') {
      this.tagName = tagName;
      this.textContent = textContent;
      this.children = [];
      this.listeners = new Map();
      this.attributes = new Map();
      this.parentElement = null;
    }

    get firstElementChild() {
      return this.children[0] || null;
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      if (child.id) elementsById.set(child.id, child);
      return child;
    }

    remove() {
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      }
      if (this.id) elementsById.delete(this.id);
      this.parentElement = null;
    }

    setAttribute(name, value) {
      this.attributes.set(name, value);
    }

    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    }

    click() {
      this.listeners.get('click')?.();
    }
  }

  const leftSlot = new Element('div');
  const titleSlot = new Element('div');
  const heading = new Element('h1', '个人成长');
  const nativeBack = new Element('a');
  nativeBack.setAttribute('aria-label', '(tabs), back');
  const headerRow = new Element('div');
  titleSlot.appendChild(heading);
  headerRow.appendChild(leftSlot);
  headerRow.appendChild(titleSlot);
  if (nativeBackInitially) leftSlot.appendChild(nativeBack);

  const document = {
    readyState: 'complete',
    documentElement: new Element('html'),
    head: new Element('head'),
    createElement: (tagName) => new Element(tagName),
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: (selector) => selector.includes('aria-label') && nativeBack.parentElement ? nativeBack : null,
    querySelectorAll: (selector) => selector.startsWith('h1') ? [heading] : [],
  };
  const navigation = { backCalls: 0, assignedPath: null };
  const context = {
    document,
    history: {
      length: historyLength,
      back: () => { navigation.backCalls += 1; },
    },
    location: {
      pathname: '/rewards',
      assign: (pathName) => { navigation.assignedPath = pathName; },
    },
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
    },
    requestAnimationFrame: (callback) => callback(),
    addEventListener: () => {},
  };
  vm.runInNewContext(script, context, { filename: 'zhiqu-rewards-back.js' });

  return {
    button: () => document.getElementById('zq-rewards-back'),
    addNativeBack() {
      leftSlot.appendChild(nativeBack);
      observerCallback?.();
    },
    leftSlot,
    navigation,
  };
}

const withHistory = renderRewardsHeader(2);
assert.equal(withHistory.button()?.parentElement, withHistory.leftSlot, 'button must render in the header left slot');
assert.equal(withHistory.button()?.attributes.get('aria-label'), '返回');
withHistory.button().click();
assert.equal(withHistory.navigation.backCalls, 1, 'button must go back when page history is available');

const directVisit = renderRewardsHeader(1);
directVisit.button().click();
assert.equal(directVisit.navigation.assignedPath, '/magic?mode=create', 'direct visits must return to the lobby');

const withNativeBack = renderRewardsHeader(2, true);
assert.equal(withNativeBack.button(), null, 'the fallback must not be injected when Expo already rendered a back link');

const lateNativeBack = renderRewardsHeader(2);
assert.ok(lateNativeBack.button(), 'the fallback may render before Expo hydration completes');
lateNativeBack.addNativeBack();
assert.equal(lateNativeBack.button(), null, 'a native back link rendered later must remove the injected fallback');

console.log('rewards back button: ok');
