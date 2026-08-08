(function (global) {
  'use strict';
  global.ZhiquSinglePlayerGames = global.ZhiquSinglePlayerGames || {};
  var SVG = 'http://www.w3.org/2000/svg';

  function map(container, mapData) {
    mapData = mapData || { nodes: [], edges: [] };
    var section = document.createElement('section');
    section.className = 'sp-map-panel';
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'sp-map');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '本局实时生成的抽象路线图，不是现实导航');
    var byId = {};
    (mapData.nodes || []).forEach(function (node) { byId[node.id] = node; });
    (mapData.edges || []).forEach(function (edge) {
      var from = byId[edge.from];
      var to = byId[edge.to];
      if (!from || !to) return;
      var line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', from.x);
      line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x);
      line.setAttribute('y2', to.y);
      svg.appendChild(line);
      var label = document.createElementNS(SVG, 'text');
      label.setAttribute('x', (Number(from.x) + Number(to.x)) / 2);
      label.setAttribute('y', (Number(from.y) + Number(to.y)) / 2 - 2);
      label.setAttribute('text-anchor', 'middle');
      label.textContent = [edge.distance, edge.time, edge.cost].filter(function (value) { return value !== null && value !== undefined; }).join('/');
      svg.appendChild(label);
    });
    (mapData.nodes || []).forEach(function (node) {
      var circle = document.createElementNS(SVG, 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', node.id === mapData.startId || node.id === mapData.endId ? '6' : '5');
      svg.appendChild(circle);
      var text = document.createElementNS(SVG, 'text');
      text.setAttribute('x', node.x);
      text.setAttribute('y', Number(node.y) + 1);
      text.setAttribute('text-anchor', 'middle');
      text.textContent = node.label;
      svg.appendChild(text);
    });
    section.appendChild(svg);
    var note = document.createElement('p');
    note.className = 'sp-sound-text';
    note.textContent = '边上依次显示长度 / 时间 / 费用；安全值在路线选项中列出。这是抽象练习图。';
    section.appendChild(note);
    container.appendChild(section);
  }

  function renderOptions(container, options, context) {
    var list = document.createElement('div');
    list.className = 'sp-options';
    options.forEach(function (option) {
      var button = context.optionButton(option);
      if (option.metrics) {
        var metrics = document.createElement('span');
        metrics.className = 'sp-route-metrics';
        [
          ['长度', option.metrics.distance], ['时间', option.metrics.time],
          ['费用', option.metrics.cost], ['安全', option.metrics.safety]
        ].forEach(function (entry) {
          var item = document.createElement('span');
          item.textContent = entry[0] + ' ' + (entry[1] === null || entry[1] === undefined ? '缺少' : entry[1]);
          metrics.appendChild(item);
        });
        button.appendChild(metrics);
      }
      list.appendChild(button);
    });
    container.appendChild(list);
  }

  function renderDemo(container, demo) {
    map(container, demo.map || {});
    var source = document.createElement('section');
    source.className = 'sp-source';
    source.innerHTML = '<h2>示范条件</h2><p></p>';
    source.querySelector('p').textContent = demo.original || '';
    container.appendChild(source);
    var feedback = document.createElement('section');
    feedback.className = 'sp-feedback';
    feedback.innerHTML = '<h2>程序怎样核对</h2><p></p>';
    feedback.querySelector('p').textContent = demo.explanation || '';
    container.appendChild(feedback);
  }

  function renderRound(container, round, context) {
    map(container, round.map || context.content.map || {});
    renderOptions(container, round.options || [], context);
  }

  global.ZhiquSinglePlayerGames['route-and-conditions'] = {
    renderDemo: renderDemo,
    renderRound: renderRound
  };
})(globalThis);
