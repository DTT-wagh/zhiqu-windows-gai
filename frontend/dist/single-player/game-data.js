(function (global) {
  'use strict';

  var games = {
    'prompt-writer': {
      gameCode: 'prompt-writer',
      title: '提示词小作家',
      subject: '语文表达 · 阅读理解',
      accent: 'coral',
      description: '观察 AI 怎样从一句话中找出对象、动作、地点、数量和条件。',
      learningGoal: '比较原始信息、AI 提取结果与一次信息变化。',
      estimatedMinutes: 6,
      levelNo: 1
    },
    'image-detective': {
      gameCode: 'image-detective',
      title: '图片侦探',
      subject: '美术 · 观察 · 空间关系',
      accent: 'green',
      description: '左右比较同一张完整图和缺失图，找出最能帮助 AI 识别目标的关键元素。',
      learningGoal: '通过一处真实删除实验，观察 AI 如何依赖物体、用途和场景关系识别目标。',
      estimatedMinutes: 2,
      levelNo: 1
    },
    'sound-conductor': {
      gameCode: 'sound-conductor',
      title: '声音小指挥',
      subject: '音乐 · 情绪表达',
      accent: 'amber',
      description: '听一听 AI 怎样测量速度、力度、音色和节拍，再推测感受。',
      learningGoal: '用能听见、能看见的声音证据核对 AI 判断。',
      estimatedMinutes: 6,
      levelNo: 1
    },
    'route-and-conditions': {
      gameCode: 'route-and-conditions',
      title: '路线与条件',
      subject: '数学 · 逻辑',
      accent: 'indigo',
      description: '让程序读取抽象图里的数字和限制，再比较候选路线。',
      learningGoal: '用确定性计算核对 AI 生成的路线条件。',
      estimatedMinutes: 7,
      levelNo: 1
    }
  };

  global.ZhiquSinglePlayerData = {
    games: games,
    list: Object.keys(games).map(function (code) { return games[code]; }),
    get: function (code) { return games[code] || games['prompt-writer']; }
  };
})(globalThis);
