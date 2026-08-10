(function (global) {
  'use strict';
  global.ZhiquSinglePlayerGames = global.ZhiquSinglePlayerGames || {};

  function image(container, content, label) {
    var figure = document.createElement('figure');
    figure.className = 'sp-image-figure';
    var element = document.createElement('img');
    element.className = 'sp-generated-image';
    element.src = global.ZhiquSinglePlayerApi.mediaUrl(content.imageUrl || '');
    element.alt = content.altText || '本局由 AI 实时生成并经过视觉模型核验的插画';
    figure.appendChild(element);
    if (label) {
      var caption = document.createElement('figcaption');
      caption.textContent = label;
      figure.appendChild(caption);
    }
    container.appendChild(figure);
  }

  function imageComparison(container, round) {
    var comparison = document.createElement('div');
    comparison.className = 'sp-image-comparison';
    image(comparison, { imageUrl: round.beforeImageUrl, altText: round.beforeAltText }, '改变前');
    image(comparison, { imageUrl: round.afterImageUrl, altText: round.afterAltText }, '改变后');
    container.appendChild(comparison);
  }

  function detections(container, values) {
    var section = document.createElement('section');
    section.className = 'sp-ai-view';
    var heading = document.createElement('h2');
    heading.textContent = '视觉模型重新看到了什么';
    var chips = document.createElement('div');
    chips.className = 'sp-chips';
    (values || []).forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'sp-chip';
      chip.textContent = (item.label || item.sceneElementId || '元素') + (item.relation ? ' · ' + item.relation : '');
      chips.appendChild(chip);
    });
    section.appendChild(heading);
    section.appendChild(chips);
    container.appendChild(section);
  }

  function renderDemo(container, demo, context) {
    image(container, demo);
    detections(container, context.content.aiDetected);
    var explanation = document.createElement('section');
    explanation.className = 'sp-feedback';
    explanation.innerHTML = '<h2>示范发现</h2><p></p>';
    explanation.querySelector('p').textContent = demo.explanation || '把画面、AI 识别和自己的观察放在一起比较。';
    container.appendChild(explanation);
  }

  function renderRound(container, round, context) {
    if (round.beforeImageUrl && round.afterImageUrl) imageComparison(container, round);
    else image(container, round);
    detections(container, round.afterImageUrl ? context.content.variantAiDetected : context.content.aiDetected);
    context.renderOptions(container, round.options || []);
  }

  global.ZhiquSinglePlayerGames['image-detective'] = {
    renderDemo: renderDemo,
    renderRound: renderRound
  };
})(globalThis);
