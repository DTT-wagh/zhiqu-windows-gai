(function (global) {
  'use strict';

  var typeFor = function (level) {
    if (level <= 2) return '示范关';
    if (level <= 8) return '基础关';
    if (level <= 11) return '变化挑战';
    return '自由试玩台';
  };

  function levels(goals) {
    return goals.map(function (goal, index) {
      return {
        levelNo: index + 1,
        type: typeFor(index + 1),
        learningGoal: goal,
        estimatedMinutes: 8
      };
    });
  }

  var games = {
    'prompt-writer': {
      gameCode: 'prompt-writer',
      title: '提示词小作家',
      subject: '语文表达 · 阅读理解',
      accent: 'coral',
      description: '观察 AI 怎样从一句话中找出对象、动作、地点、数量和条件。',
      learningGoal: '比较原始信息、AI 提取结果与一次信息变化。',
      estimatedMinutes: 8,
      levels: levels([
        '观察 AI 怎样找出对象', '观察动作和结果形式怎样被提取', '比较地点信息是否明确',
        '观察数量或范围怎样改变判断', '检查先后顺序是否被读懂', '比较受众和语气信息',
        '找出让 AI 不确定的含糊词', '一次只改变一个条件并比较', '发现互相冲突的条件',
        '信息不足时先追问', '用证据比较两种表达', '综合观察 AI 提取与遗漏的信息'
      ])
    },
    'image-detective': {
      gameCode: 'image-detective',
      title: '图片侦探',
      subject: '美术 · 观察 · 空间关系',
      accent: 'green',
      description: '比较图片规格、视觉模型看到的元素和自己的观察。',
      learningGoal: '用主体、形状、位置和关系证据核对 AI 的识别。',
      estimatedMinutes: 8,
      levels: levels([
        '找出画面主体', '同时观察颜色与形状', '比较元素的位置', '用点数证据观察数量',
        '区分主体与背景', '观察主体由哪些形状构成', '核对元素之间的空间关系', '发现关键元素',
        '比较一个元素变化后的影响', '用位置和关系排除干扰', '用多条线索说明观察', '综合观察并改变一个画面变量'
      ])
    },
    'sound-conductor': {
      gameCode: 'sound-conductor',
      title: '声音小指挥',
      subject: '音乐 · 情绪表达',
      accent: 'amber',
      description: '听一听 AI 怎样测量速度、力度、音色和节拍，再推测感受。',
      learningGoal: '用能听见、能看见的声音证据核对 AI 判断。',
      estimatedMinutes: 8,
      levels: levels([
        '听辨速度快慢', '听辨声音强弱', '把乐段与速度证据配对', '比较多档力度',
        '用速度或力度说明感受', '识别主要音色族', '比较节拍与场景', '同时观察两个声音特征',
        '根据限制比较配器', '只改变一个声音变量', '证据不足时保留不确定', '综合调整结构化乐段'
      ])
    },
    'route-and-conditions': {
      gameCode: 'route-and-conditions',
      title: '路线与条件',
      subject: '数学 · 逻辑',
      accent: 'indigo',
      description: '让程序读取抽象图里的数字和限制，再比较候选路线。',
      learningGoal: '用确定性计算核对 AI 生成的路线条件。',
      estimatedMinutes: 8,
      levels: levels([
        '比较路线长短', '比较路线费用', '检查路线能否连通', '计算路线总长度',
        '计算路线总时间', '在安全限制下重新找路', '按费用而不是长度比较', '先读清两个条件',
        '在时间和费用之间取舍', '在三个条件下筛选路线', '发现路线指标缺失', '调节多个目标的权重'
      ])
    }
  };

  global.ZhiquSinglePlayerData = {
    games: games,
    list: Object.keys(games).map(function (code) { return games[code]; }),
    get: function (code) { return games[code] || games['prompt-writer']; }
  };
})(globalThis);
