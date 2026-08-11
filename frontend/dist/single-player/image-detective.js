(function (global) {
  'use strict';
  global.ZhiquSinglePlayerGames = global.ZhiquSinglePlayerGames || {};

  function mediaUrl(value) {
    return global.ZhiquSinglePlayerApi.mediaUrl(value || '');
  }

  function figure(content, className) {
    var wrapper = document.createElement('figure');
    wrapper.className = 'sp-image-figure ' + (className || '');
    var image = document.createElement('img');
    image.className = 'sp-generated-image';
    image.src = mediaUrl(content.imageUrl);
    image.alt = content.altText || content.label || '本局由 AI 实时生成并经过视觉模型核验的图片';
    image.loading = 'eager';
    var caption = document.createElement('figcaption');
    caption.textContent = content.label || '图片';
    wrapper.appendChild(image);
    wrapper.appendChild(caption);
    return wrapper;
  }

  function recognitionText(value) {
    var target = value && value.targetRecognition ? value.targetRecognition : {};
    if (target.description) return target.description;
    return target.detected ? 'AI 能识别本局目标' : 'AI 还不能确定本局目标';
  }

  function recognitionPair(container, before, after, beforeLabel, afterLabel) {
    var section = document.createElement('section');
    section.className = 'sp-ai-view sp-detective-recognition';
    var heading = document.createElement('h2');
    heading.textContent = 'AI 两次看到了什么';
    var grid = document.createElement('div');
    grid.className = 'sp-recognition-pair';
    [
      [beforeLabel || '完整图', before],
      [afterLabel || '缺失图', after]
    ].forEach(function (item) {
      var block = document.createElement('div');
      var label = document.createElement('strong');
      var copy = document.createElement('p');
      label.textContent = item[0];
      copy.textContent = recognitionText(item[1]);
      block.appendChild(label);
      block.appendChild(copy);
      grid.appendChild(block);
    });
    section.appendChild(heading);
    section.appendChild(grid);
    container.appendChild(section);
  }

  function comparison(container, value) {
    var section = document.createElement('section');
    section.className = 'sp-detective-compare';

    var pair = document.createElement('div');
    pair.className = 'sp-image-comparison sp-detective-pair';
    pair.appendChild(figure({
      imageUrl: value.beforeImageUrl,
      altText: value.beforeAltText,
      label: value.beforeLabel || '完整图'
    }, 'sp-before-image'));
    pair.appendChild(figure({
      imageUrl: value.afterImageUrl,
      altText: value.afterAltText,
      label: value.afterLabel || '缺失图'
    }, 'sp-after-image'));
    section.appendChild(pair);
    container.appendChild(section);
  }

  function candidateOptions(container, options, context) {
    var heading = document.createElement('div');
    heading.className = 'sp-element-heading';
    heading.textContent = '哪个是 AI 识别的关键元素？';
    var list = document.createElement('div');
    list.className = 'sp-element-grid';
    (options || []).forEach(function (option) {
      var button = context.optionButton(option);
      button.classList.add('sp-element-card');
      button.replaceChildren();
      var image = document.createElement('img');
      image.src = mediaUrl(option.imageUrl);
      image.alt = option.label || '缺失元素';
      var label = document.createElement('span');
      label.textContent = option.label || '缺失元素';
      var detail = document.createElement('small');
      detail.textContent = option.description || '观察它和画面目标的关系';
      var check = document.createElement('b');
      check.className = 'sp-element-check';
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');
      button.appendChild(image);
      button.appendChild(label);
      button.appendChild(detail);
      button.appendChild(check);
      list.appendChild(button);
    });
    container.appendChild(heading);
    container.appendChild(list);
  }

  function renderDemo(container, demo, context) {
    comparison(container, {
      beforeImageUrl: demo.completeImageUrl || context.content.completeImageUrl,
      beforeAltText: demo.completeAltText || context.content.completeAltText,
      beforeLabel: '图片 1 · 完整图',
      afterImageUrl: demo.missingImageUrl || context.content.missingImageUrl,
      afterAltText: demo.missingAltText || context.content.missingAltText,
      afterLabel: '图片 2 · 缺失图'
    });
    var explanation = document.createElement('section');
    explanation.className = 'sp-feedback';
    var heading = document.createElement('h2');
    heading.textContent = '两张图的关系';
    var copy = document.createElement('p');
    copy.textContent = demo.explanation || '图片 2 是从图片 1 中拿走一些元素得到的，其他画面保持不变。';
    explanation.appendChild(heading);
    explanation.appendChild(copy);
    container.appendChild(explanation);
  }

  function renderRound(container, round, context) {
    comparison(container, {
      beforeImageUrl: round.beforeImageUrl || context.content.completeImageUrl,
      beforeAltText: round.beforeAltText || context.content.completeAltText,
      beforeLabel: round.beforeLabel || '完整图',
      afterImageUrl: round.afterImageUrl || context.content.missingImageUrl,
      afterAltText: round.afterAltText || context.content.missingAltText,
      afterLabel: round.afterLabel || '缺失图'
    });
    candidateOptions(container, round.options || [], context);
  }

  global.ZhiquSinglePlayerGames['image-detective'] = {
    renderDemo: renderDemo,
    renderRound: renderRound
  };
})(globalThis);
