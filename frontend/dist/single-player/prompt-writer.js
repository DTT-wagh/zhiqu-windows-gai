(function (global) {
  'use strict';
  global.ZhiquSinglePlayerGames = global.ZhiquSinglePlayerGames || {};

  function panel(className, title, text) {
    var section = document.createElement('section');
    section.className = className;
    var heading = document.createElement('h2');
    heading.textContent = title;
    var copy = document.createElement('p');
    copy.textContent = text || '';
    section.appendChild(heading);
    section.appendChild(copy);
    return section;
  }

  function chips(values) {
    var chips = document.createElement('div');
    chips.className = 'sp-chips';
    (values || []).forEach(function (value) {
      var chip = document.createElement('span');
      chip.className = 'sp-chip';
      chip.textContent = value;
      chips.appendChild(chip);
    });
    return chips;
  }

  function extracted(values) {
    var section = document.createElement('section');
    section.className = 'sp-ai-view';
    var heading = document.createElement('h2');
    heading.textContent = 'AI 提取了这些信息';
    section.appendChild(heading);
    section.appendChild(chips(values));
    return section;
  }

  function comparisonPanel(className, title, before, after) {
    var section = document.createElement('section');
    section.className = className;
    var heading = document.createElement('h2');
    heading.textContent = title;
    var grid = document.createElement('div');
    grid.className = 'sp-comparison';
    [['改变前', before], ['改变后', after]].forEach(function (entry) {
      var item = document.createElement('div');
      var label = document.createElement('strong');
      label.textContent = entry[0];
      var copy = document.createElement('p');
      copy.textContent = entry[1] || '';
      item.appendChild(label);
      item.appendChild(copy);
      grid.appendChild(item);
    });
    section.appendChild(heading);
    section.appendChild(grid);
    return section;
  }

  function extractedComparison(before, after) {
    var section = document.createElement('section');
    section.className = 'sp-ai-view';
    var heading = document.createElement('h2');
    heading.textContent = 'AI 提取结果前后对比';
    var grid = document.createElement('div');
    grid.className = 'sp-comparison';
    [['改变前', before], ['改变后', after]].forEach(function (entry) {
      var item = document.createElement('div');
      var label = document.createElement('strong');
      label.textContent = entry[0];
      item.appendChild(label);
      item.appendChild(chips(entry[1]));
      grid.appendChild(item);
    });
    section.appendChild(heading);
    section.appendChild(grid);
    return section;
  }

  function renderDemo(container, demo) {
    container.appendChild(panel('sp-source', '原始信息', demo.original || demo.input || '请观察本次实时生成的信息。'));
    container.appendChild(extracted(demo.aiExtracted || []));
    container.appendChild(panel('sp-feedback', '示范发现', demo.explanation || demo.result || '比较原始信息与 AI 提取结果。'));
  }

  function renderRound(container, round, context) {
    if (round.roundId === 'r3' && round.changedOriginal) {
      container.appendChild(comparisonPanel(
        'sp-source',
        '原始信息前后对比',
        round.original,
        round.changedOriginal
      ));
      container.appendChild(extractedComparison(
        round.aiExtracted || [],
        round.changedAiExtracted || []
      ));
    } else {
      container.appendChild(panel('sp-source', '原始信息', round.original || round.prompt));
      container.appendChild(extracted(round.aiExtracted || []));
    }
    context.renderOptions(container, round.options || []);
  }

  global.ZhiquSinglePlayerGames['prompt-writer'] = {
    renderDemo: renderDemo,
    renderRound: renderRound
  };
})(globalThis);
