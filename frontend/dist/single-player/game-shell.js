(function (global) {
  'use strict';

  var STATES = Object.freeze({
    INTRO: 'INTRO',
    GENERATING: 'GENERATING',
    DEMO: 'DEMO',
    ROUND_ACTIVE: 'ROUND_ACTIVE',
    EVALUATING: 'EVALUATING',
    FEEDBACK: 'FEEDBACK',
    RESULT: 'RESULT',
    FAILED: 'FAILED'
  });

  var TRANSITIONS = {
    INTRO: { START: 'GENERATING' },
    GENERATING: { READY: 'DEMO', FAIL: 'FAILED' },
    DEMO: { BEGIN: 'ROUND_ACTIVE', REGENERATE: 'GENERATING' },
    ROUND_ACTIVE: { SUBMIT: 'EVALUATING', REGENERATE: 'GENERATING' },
    EVALUATING: { EVALUATED: 'FEEDBACK', FAIL: 'FAILED' },
    FEEDBACK: { RETRY: 'ROUND_ACTIVE', NEXT: 'ROUND_ACTIVE', COMPLETE: 'RESULT' },
    RESULT: { RESTART: 'INTRO' },
    FAILED: { RETRY_GENERATION: 'GENERATING', BACK: 'INTRO' }
  };

  function createStateMachine(initial) {
    var current = initial || STATES.INTRO;
    return {
      get state() { return current; },
      transition: function (event) {
        var target = TRANSITIONS[current] && TRANSITIONS[current][event];
        if (!target) throw new Error('Invalid single-player transition: ' + current + ' -> ' + event);
        current = target;
        return current;
      },
      force: function (next) {
        if (!STATES[next]) throw new Error('Unknown single-player state: ' + next);
        current = next;
        return current;
      }
    };
  }

  global.ZhiquSinglePlayerShell = {
    STATES: STATES,
    TRANSITIONS: TRANSITIONS,
    createStateMachine: createStateMachine
  };
  global.ZhiquSinglePlayerGames = global.ZhiquSinglePlayerGames || {};

  if (typeof document === 'undefined') return;

  var api = global.ZhiquSinglePlayerApi;
  var catalog = global.ZhiquSinglePlayerData;
  var root = document.getElementById('zq-single-player-root');
  if (!root || !api || !catalog) return;

  var params = new URLSearchParams(global.location.search);
  var gameCode = catalog.games[params.get('game')] ? params.get('game') : 'prompt-writer';
  var levelNo = 1;
  var game = catalog.get(gameCode);
  if (params.has('level')) {
    var canonicalUrl = new URL(global.location.href);
    canonicalUrl.searchParams.delete('level');
    global.history.replaceState({}, '', canonicalUrl.pathname + canonicalUrl.search);
  }
  var machine = createStateMachine(STATES.INTRO);
  var state = {
    instance: null,
    content: null,
    selected: new Set(),
    evaluation: null,
    finish: null,
    error: null,
    progress: {},
    showAgePicker: false,
    ageBand: readStorage('zhiqu.single-player.age-band.v1') || '',
    createRequestId: null,
    submitRequestId: null,
    finishRequestId: null,
    settling: false,
    abortController: null,
    pollTimer: null,
    statusNote: ''
  };

  function readStorage(key) {
    try { return global.localStorage.getItem(key); } catch (error) { return null; }
  }

  function writeStorage(key, value) {
    try { global.localStorage.setItem(key, value); } catch (error) { /* storage can be disabled */ }
  }

  function removeStorage(key) {
    try { global.localStorage.removeItem(key); } catch (error) { /* storage can be disabled */ }
  }

  function activeKey() {
    return 'zhiqu.single-player.active.' + gameCode;
  }

  function legacyActiveKey() {
    return activeKey() + '.1';
  }

  function demoKey(instanceId) {
    return 'zhiqu.single-player.demo.' + instanceId;
  }

  function finishKey(instanceId) {
    return 'zhiqu.single-player.finish.' + instanceId;
  }

  function totalRoundCount() {
    if (state.content && Array.isArray(state.content.rounds) && state.content.rounds.length) {
      return state.content.rounds.length;
    }
    return gameCode === 'image-detective' ? 1 : 3;
  }

  function stopRequests() {
    if (state.abortController) state.abortController.abort();
    state.abortController = null;
    global.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }

  function controller() {
    if (state.abortController) state.abortController.abort();
    state.abortController = new AbortController();
    return state.abortController;
  }

  function topbar(page) {
    var header = document.createElement('header');
    header.className = 'sp-topbar';
    var back = document.createElement('a');
    back.className = 'sp-back';
    back.href = '/community?section=games';
    back.textContent = '返回大厅';
    back.setAttribute('aria-label', '返回游戏大厅');
    var heading = document.createElement('div');
    heading.className = 'sp-heading';
    var title = document.createElement('strong');
    title.textContent = game.title;
    var detail = document.createElement('span');
    detail.textContent = game.learningGoal;
    heading.appendChild(title);
    heading.appendChild(detail);
    var progress = document.createElement('div');
    progress.className = 'sp-progress-label';
    var roundCount = totalRoundCount();
    progress.textContent = machine.state === STATES.ROUND_ACTIVE || machine.state === STATES.EVALUATING || machine.state === STATES.FEEDBACK
      ? Math.min(roundCount, (state.instance ? state.instance.currentRound : 0) + 1) + ' / ' + roundCount
      : machine.state === STATES.GENERATING ? '生成'
        : machine.state === STATES.DEMO ? '示范'
          : machine.state === STATES.RESULT ? '完成'
            : machine.state === STATES.FAILED ? '未生成' : '介绍';
    header.appendChild(back);
    header.appendChild(heading);
    header.appendChild(progress);
    page.appendChild(header);
  }

  function render() {
    var sound = global.ZhiquSinglePlayerGames['sound-conductor'];
    if (sound && typeof sound.stop === 'function' && gameCode === 'sound-conductor') sound.stop();
    root.replaceChildren();
    var page = document.createElement('div');
    page.className = 'sp-page';
    topbar(page);
    var main = document.createElement('main');
    main.className = 'sp-main';
    main.setAttribute('data-state', machine.state);
    if (machine.state === STATES.INTRO) renderIntro(main);
    else if (machine.state === STATES.GENERATING) renderGenerating(main);
    else if (machine.state === STATES.DEMO) renderDemo(main);
    else if (machine.state === STATES.ROUND_ACTIVE) renderRound(main);
    else if (machine.state === STATES.EVALUATING) renderEvaluating(main);
    else if (machine.state === STATES.FEEDBACK) renderFeedback(main);
    else if (machine.state === STATES.RESULT) renderResult(main);
    else renderFailed(main);
    page.appendChild(main);
    var live = document.createElement('div');
    live.className = 'sp-visually-hidden';
    live.setAttribute('aria-live', 'polite');
    live.textContent = state.statusNote;
    page.appendChild(live);
    root.appendChild(page);
    document.title = game.title + ' | 智趣 AI 学堂';
  }

  function renderIntro(main) {
    var intro = document.createElement('div');
    intro.className = 'sp-intro';
    var head = document.createElement('section');
    head.className = 'sp-intro-head';
    var kicker = document.createElement('span');
    kicker.className = 'sp-kicker';
    kicker.textContent = game.subject;
    var title = document.createElement('h1');
    title.textContent = game.title;
    var description = document.createElement('p');
    description.textContent = gameCode === 'image-detective'
      ? game.description + ' 一局只需左右对照、选择一个关键元素，再查看总结。'
      : game.description + ' 本局包含一次示范、三轮挑战和一次结算。';
    head.appendChild(kicker);
    head.appendChild(title);
    head.appendChild(description);
    intro.appendChild(head);

    var loop = document.createElement('div');
    loop.className = 'sp-loop';
    var loopItems = gameCode === 'image-detective'
      ? [['01', '左右找不同'], ['02', '选关键元素'], ['03', '查看总结']]
      : [['01', '看 AI 提取'], ['02', '和自己比'], ['03', '改一个信息']];
    loopItems.forEach(function (item) {
      var step = document.createElement('span');
      var number = document.createElement('b');
      number.textContent = item[0];
      step.appendChild(number);
      step.appendChild(document.createTextNode(item[1]));
      loop.appendChild(step);
    });
    intro.appendChild(loop);

    var completion = document.createElement('section');
    completion.className = 'sp-completion';
    var completionLabel = document.createElement('strong');
    completionLabel.textContent = state.progress[gameCode] ? '已完成' : '未完成';
    var completionCopy = document.createElement('span');
    completionCopy.textContent = state.progress[gameCode]
      ? '可以再玩一次，获得新的实时内容。'
      : '约 ' + game.estimatedMinutes + ' 分钟，完成一次即记录本游戏进度。';
    completion.appendChild(completionLabel);
    completion.appendChild(completionCopy);
    intro.appendChild(completion);

    if (state.showAgePicker) intro.appendChild(agePicker());
    var actions = document.createElement('div');
    actions.className = 'sp-actions';
    var start = document.createElement('button');
    start.type = 'button';
    start.className = 'sp-primary';
    start.textContent = api.session() ? '开始游戏' : '登录后开始';
    start.addEventListener('click', startNew);
    actions.appendChild(start);
    var note = document.createElement('span');
    note.className = 'sp-hint-text';
    note.textContent = api.session()
      ? '开局后由 AI 实时生成，本局有效期 24 小时。'
      : '游客可查看游戏介绍；生成、进度和奖励需要登录。';
    actions.appendChild(note);
    intro.appendChild(actions);
    main.appendChild(intro);
  }

  function agePicker() {
    var section = document.createElement('section');
    section.className = 'sp-age-picker';
    var heading = document.createElement('h2');
    heading.textContent = '选择适合的年龄段';
    var copy = document.createElement('p');
    copy.textContent = '只把年龄段发送给生成服务，不发送生日、姓名、学校或联系方式。';
    var choices = document.createElement('div');
    choices.className = 'sp-segmented';
    ['6-8', '9-10', '11-12'].forEach(function (band) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = band + ' 岁';
      button.setAttribute('aria-pressed', String(state.ageBand === band));
      button.addEventListener('click', function () {
        state.ageBand = band;
        writeStorage('zhiqu.single-player.age-band.v1', band);
        state.showAgePicker = false;
        render();
        startNew();
      });
      choices.appendChild(button);
    });
    section.appendChild(heading);
    section.appendChild(copy);
    section.appendChild(choices);
    return section;
  }

  function renderGenerating(main) {
    var loading = document.createElement('section');
    loading.className = 'sp-loading';
    var wrap = document.createElement('div');
    var loader = document.createElement('div');
    loader.className = 'sp-loader';
    loader.setAttribute('aria-hidden', 'true');
    var title = document.createElement('h1');
    title.textContent = '正在生成这一局';
    var copy = document.createElement('p');
    copy.textContent = gameCode === 'image-detective'
      ? '正在生成完整图，从同一张图删除元素，并让视觉模型核对每次识别。'
      : gameCode === 'route-and-conditions'
        ? '正在生成抽象图，随后由路线程序检查每个数字和条件。'
        : '正在根据本局目标和年龄段创建新的观察材料。';
    wrap.appendChild(loader);
    wrap.appendChild(title);
    wrap.appendChild(copy);
    loading.appendChild(wrap);
    main.appendChild(loading);
  }

  function stageHeader(main, kickerText, titleText, copyText) {
    var head = document.createElement('header');
    head.className = 'sp-stage-head';
    var kicker = document.createElement('span');
    kicker.className = 'sp-kicker';
    kicker.textContent = kickerText;
    var title = document.createElement('h1');
    title.className = 'sp-state-title';
    title.textContent = titleText;
    var copy = document.createElement('p');
    copy.className = 'sp-state-copy';
    copy.textContent = copyText || '';
    head.appendChild(kicker);
    head.appendChild(title);
    head.appendChild(copy);
    main.appendChild(head);
  }

  function renderDemo(main) {
    main.classList.add('sp-stage');
    stageHeader(main, '先看一次示范', state.content.demo.title || 'AI 怎样提取和判断', state.content.instruction);
    var workspace = document.createElement('div');
    workspace.className = 'sp-workspace';
    var module = global.ZhiquSinglePlayerGames[gameCode];
    if (module && module.renderDemo) module.renderDemo(workspace, state.content.demo, moduleContext());
    main.appendChild(workspace);
    var actions = document.createElement('div');
    actions.className = 'sp-actions';
    var begin = document.createElement('button');
    begin.type = 'button';
    begin.className = 'sp-primary';
    begin.textContent = '我看懂了';
    begin.addEventListener('click', beginRounds);
    actions.appendChild(begin);
    main.appendChild(actions);
  }

  function currentRound() {
    return state.content && state.content.rounds
      ? state.content.rounds[Math.min(totalRoundCount() - 1, state.instance.currentRound)]
      : null;
  }

  function renderRound(main) {
    var round = currentRound();
    if (!round) return fail({ code: 'ROUND_CONTENT_MISSING', message: '本轮内容不可用' });
    main.classList.add('sp-stage');
    stageHeader(
      main,
      gameCode === 'image-detective' ? '唯一关卡' : '第 ' + (state.instance.currentRound + 1) + ' 轮',
      round.title || '观察并核对',
      round.prompt
    );
    var workspace = document.createElement('div');
    workspace.className = 'sp-workspace';
    var module = global.ZhiquSinglePlayerGames[gameCode];
    if (module && module.renderRound) module.renderRound(workspace, round, moduleContext());
    main.appendChild(workspace);
    var actions = document.createElement('div');
    actions.className = 'sp-actions';
    var submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'sp-primary';
    submit.textContent = gameCode === 'image-detective' ? '提交答案并查看总结' : '核对我的观察';
    submit.disabled = state.selected.size === 0;
    submit.addEventListener('click', function () { submitRound(false); });
    actions.appendChild(submit);
    var note = document.createElement('span');
    note.className = 'sp-status-note';
    note.textContent = state.selected.size
      ? (gameCode === 'image-detective' ? '已选择一个答案' : '已选择 ' + state.selected.size + ' 项')
      : (gameCode === 'image-detective' ? '先选择一个元素' : '先选择你观察到的证据或判断');
    actions.appendChild(note);
    main.appendChild(actions);
  }

  function moduleContext() {
    return {
      content: state.content,
      selected: state.selected,
      optionButton: optionButton,
      renderOptions: function (container, options) {
        var list = document.createElement('div');
        list.className = 'sp-options';
        options.forEach(function (option) { list.appendChild(optionButton(option)); });
        container.appendChild(list);
      }
    };
  }

  function optionButton(option) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sp-option';
    button.setAttribute('aria-pressed', String(state.selected.has(option.id)));
    button.textContent = option.label || option.value || option.id;
    if (option.description) {
      var detail = document.createElement('small');
      detail.textContent = option.description;
      button.appendChild(detail);
    }
    button.addEventListener('click', function () {
      if (state.selected.has(option.id)) state.selected.delete(option.id);
      else {
        if (gameCode === 'image-detective') state.selected.clear();
        state.selected.add(option.id);
      }
      render();
    });
    return button;
  }

  function renderEvaluating(main) {
    var loading = document.createElement('section');
    loading.className = 'sp-loading';
    var wrap = document.createElement('div');
    var loader = document.createElement('div');
    loader.className = 'sp-loader';
    var title = document.createElement('h1');
    title.textContent = gameCode === 'route-and-conditions'
      ? '程序正在核对路线'
      : gameCode === 'image-detective'
        ? '正在核对这次识别'
        : '正在比较这次观察';
    var copy = document.createElement('p');
    copy.textContent = '只根据本局生成的信息和你刚才的操作判断。';
    wrap.appendChild(loader);
    wrap.appendChild(title);
    wrap.appendChild(copy);
    loading.appendChild(wrap);
    main.appendChild(loading);
  }

  function renderFeedback(main) {
    var evaluation = state.evaluation || {};
    main.classList.add('sp-stage');
    stageHeader(
      main,
      evaluation.correct ? '观察已核对' : '再试一次',
      evaluation.correct ? '这条证据能支持你的判断' : '沿着这条线索再看看',
      evaluation.correct ? evaluation.feedback : evaluation.hint
    );
    var feedback = document.createElement('section');
    feedback.className = 'sp-feedback';
    var heading = document.createElement('h2');
    heading.textContent = evaluation.correct ? '这次比较' : '可操作提示';
    var copy = document.createElement('p');
    copy.textContent = evaluation.correct
      ? (evaluation.feedback || '程序已经记录本轮观察。')
      : (evaluation.hint || '回到原始信息，换一条证据再试。');
    feedback.appendChild(heading);
    feedback.appendChild(copy);
    main.appendChild(feedback);
    if ((evaluation.correct || gameCode === 'image-detective') && evaluation.comparison) {
      main.appendChild(comparisonView(evaluation.comparison));
    }
    var actions = document.createElement('div');
    actions.className = 'sp-actions';
    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'sp-primary';
    if (evaluation.requestFailed) {
      next.textContent = '重新提交';
      next.addEventListener('click', function () { submitRound(true); });
    } else if (!evaluation.correct) {
      next.textContent = '马上再试';
      next.addEventListener('click', retryRound);
    } else if (evaluation.allRoundsComplete) {
      next.textContent = '查看我发现了什么';
      next.addEventListener('click', showResult);
    } else {
      next.textContent = '进入下一轮';
      next.addEventListener('click', nextRound);
    }
    actions.appendChild(next);
    main.appendChild(actions);
  }

  function comparisonView(value) {
    var section = document.createElement('section');
    section.className = 'sp-ai-view';
    var heading = document.createElement('h2');
    heading.textContent = '改变前后，AI 的判断怎样变化';
    section.appendChild(heading);
    var grid = document.createElement('div');
    grid.className = 'sp-comparison';
    if (typeof value === 'object' && value !== null) {
      Object.keys(value).slice(0, 4).forEach(function (key) {
        var item = document.createElement('div');
        var label = document.createElement('strong');
        label.textContent = key;
        var copy = document.createElement('p');
        copy.textContent = typeof value[key] === 'string' ? value[key] : JSON.stringify(value[key]);
        item.appendChild(label);
        item.appendChild(copy);
        grid.appendChild(item);
      });
    }
    section.appendChild(grid);
    return section;
  }

  function renderResult(main) {
    main.classList.add('sp-stage');
    stageHeader(
      main,
      gameCode === 'image-detective' ? '本局结束' : '三轮观察完成',
      gameCode === 'image-detective' ? '总结与反思' : '我发现了什么',
      gameCode === 'image-detective'
        ? '结论来自同一张图的真实删除实验，请看看 AI 为什么依赖这个线索。'
        : '结算记录的是观察和证据，不是内容好不好看。'
    );
    var resultContainer = main;
    if (gameCode === 'image-detective') {
      var dialog = document.createElement('section');
      dialog.className = 'sp-result-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-label', '图片侦探总结与反思');
      dialog.tabIndex = -1;
      resultContainer = dialog;
      main.appendChild(dialog);
      global.setTimeout(function () { dialog.focus(); }, 0);
    }
    var result = state.content && state.content.result ? state.content.result : {};
    var band = document.createElement('section');
    band.className = 'sp-result-band';
    var heading = document.createElement('h2');
    heading.textContent = result.discovery || '这次观察已经完成。';
    var limitation = document.createElement('p');
    limitation.textContent = result.limitation || 'AI 只能根据当前信息判断，还有它不知道的部分。';
    band.appendChild(heading);
    band.appendChild(limitation);
    resultContainer.appendChild(band);

    var summary = document.createElement('section');
    summary.className = 'sp-result-summary';
    var summaryItems = gameCode === 'image-detective'
      ? [
        ['完整图与缺失图', result.evidence || result.discovery || '我比较了两张来自同一原图的图片。'],
        ['本次选择', state.evaluation && state.evaluation.correct
          ? (state.evaluation.feedback || '你找到了关键元素。')
          : (state.evaluation && state.evaluation.hint) || '这次选择没有命中关键元素，但本局已经给出真实对照。'],
        ['AI 依赖的线索', result.aiCorrect || 'AI 对关键元素的判断发生了明显变化。'],
        ['需要保持的判断', result.limitation || result.uncertain || '不同画面中的关键线索可能不同。']
      ]
      : [
        ['我观察到的证据', result.evidence || result.discovery || '我根据本局的原始信息完成了判断。'],
        ['AI 提取正确的地方', result.aiCorrect || '本局已核对 AI 能从原始信息中识别的内容。'],
        ['AI 漏掉或不确定的地方', result.uncertain || result.limitation || 'AI 还有未知或可能看错的部分。'],
        ['改变一个信息后', result.change || result.discovery || '只改变一个信息，AI 的判断可能随之变化。']
      ];
    summaryItems.forEach(function (item) {
      var row = document.createElement('div');
      var label = document.createElement('strong');
      var copy = document.createElement('p');
      label.textContent = item[0];
      copy.textContent = item[1];
      row.appendChild(label);
      row.appendChild(copy);
      summary.appendChild(row);
    });
    resultContainer.appendChild(summary);

    if (!state.finish) {
      var label = document.createElement('label');
      label.className = 'sp-workspace';
      var labelText = document.createElement('strong');
      labelText.textContent = gameCode === 'image-detective' ? '我的反思（可选）' : '我的一句发现（可选）';
      var input = document.createElement('textarea');
      input.className = 'sp-reflection';
      input.maxLength = 500;
      input.placeholder = gameCode === 'image-detective'
        ? '可以写下你先注意到什么，或 AI 为什么需要这个元素。不要填写姓名、学校或联系方式。'
        : '可以写下 AI 漏掉了什么，或哪个信息改变了判断。不要填写姓名、学校或联系方式。';
      label.appendChild(labelText);
      label.appendChild(input);
      resultContainer.appendChild(label);
      var actions = document.createElement('div');
      actions.className = 'sp-actions';
      var finish = document.createElement('button');
      finish.type = 'button';
      finish.className = 'sp-primary';
      finish.textContent = state.settling ? '正在保存' : gameCode === 'image-detective' ? '保存总结并结束' : '保存进度并领取奖励';
      finish.disabled = state.settling;
      finish.addEventListener('click', function () { finishGame(input.value); });
      actions.appendChild(finish);
      resultContainer.appendChild(actions);
      if (state.error) {
        var error = document.createElement('p');
        error.className = 'sp-error-code';
        error.textContent = state.error.message || '结算暂时没有保存，请重试。';
        resultContainer.appendChild(error);
      }
      return;
    }

    var reward = document.createElement('section');
    reward.className = 'sp-reward';
    var rewardText = state.finish.reward
      ? '本游戏奖励：' + state.finish.reward.awardedXp + ' XP' + (state.finish.reward.capped ? '（今日奖励已达上限）' : '')
      : '本游戏进度已经保存。';
    reward.textContent = rewardText;
    resultContainer.appendChild(reward);
    var completedActions = document.createElement('div');
    completedActions.className = 'sp-actions';
    var again = document.createElement('button');
    again.type = 'button';
    again.className = 'sp-primary';
    again.textContent = '再玩一次';
    again.addEventListener('click', restartFromResult);
    completedActions.appendChild(again);
    var lobby = document.createElement('a');
    lobby.className = 'sp-secondary';
    lobby.href = '/community?section=games';
    lobby.textContent = '返回大厅';
    completedActions.appendChild(lobby);
    resultContainer.appendChild(completedActions);
  }

  function renderFailed(main) {
    var loading = document.createElement('section');
    loading.className = 'sp-loading';
    var wrap = document.createElement('div');
    var title = document.createElement('h1');
    title.textContent = '本局内容暂时生成失败';
    var copy = document.createElement('p');
    var failureCode = state.error && state.error.code ? state.error.code : 'GENERATION_FAILED';
    var failureMessages = {
      TEXT_AI_TIMEOUT: '题目内容生成时间较长，请重新试一次。',
      TEXT_PROVIDER_BUSY: '题目服务暂时繁忙，请稍后重新试一次。',
      IMAGE_AI_TIMEOUT: '图片生成服务响应较慢，请稍后重新试一次。',
      IMAGE_PROVIDER_BUSY: '图片生成服务暂时繁忙，自动重试后仍未成功。',
      VISION_AI_TIMEOUT: '图片识别服务响应较慢，请重新试一次。',
      VISION_PROVIDER_BUSY: '图片识别服务暂时繁忙，请稍后重新试一次。',
      GENERATION_INTERRUPTED: '生成过程因服务重启中断，请重新试一次。',
      UNAUTHORIZED: '登录状态已失效，请返回大厅重新登录。'
    };
    copy.textContent = failureMessages[failureCode]
      || '没有使用固定题目代替这次 AI 内容。可以重新生成，或先返回大厅。';
    var code = document.createElement('p');
    code.className = 'sp-error-code';
    code.textContent = '错误编号：' + failureCode;
    var actions = document.createElement('div');
    actions.className = 'sp-actions';
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'sp-primary';
    retry.textContent = '重试生成';
    retry.addEventListener('click', retryGeneration);
    var back = document.createElement('a');
    back.className = 'sp-secondary';
    back.href = '/community?section=games';
    back.textContent = '返回大厅';
    actions.appendChild(retry);
    actions.appendChild(back);
    wrap.appendChild(title);
    wrap.appendChild(copy);
    wrap.appendChild(code);
    wrap.appendChild(actions);
    loading.appendChild(wrap);
    main.appendChild(loading);
  }

  function sessionHasBirthDate() {
    var current = api.session();
    return !!(current && current.user && current.user.birthDate);
  }

  function startNew() {
    if (!api.session()) {
      global.location.assign(api.loginUrl());
      return;
    }
    if (!sessionHasBirthDate() && !state.ageBand) {
      state.showAgePicker = true;
      render();
      return;
    }
    stopRequests();
    state.showAgePicker = false;
    state.createRequestId = api.createRequestId();
    state.instance = null;
    state.content = null;
    state.finish = null;
    state.error = null;
    state.statusNote = '正在生成新的本局内容';
    machine.force(STATES.INTRO);
    machine.transition('START');
    render();
    var activeController = controller();
    api.createInstance(gameCode, {
      requestId: state.createRequestId,
      levelNo: levelNo,
      ageBand: sessionHasBirthDate() ? null : state.ageBand
    }, activeController.signal).then(handleInstance).catch(function (error) {
      if (activeController.signal.aborted) return;
      fail(error);
    });
  }

  function handleInstance(instance) {
    if (!instance || instance.levelNo !== 1) {
      fail({ code: 'SINGLE_PLAYER_LEVEL_INVALID', message: '本游戏只有一个统一入口' });
      return;
    }
    if (gameCode === 'image-detective' && instance.content
        && (!Array.isArray(instance.content.candidateElements)
          || instance.content.candidateElements.length !== 3
          || !Array.isArray(instance.content.rounds)
          || instance.content.rounds.length !== 1)) {
      removeStorage(activeKey());
      state.instance = null;
      state.content = null;
      state.finish = null;
      state.error = null;
      state.statusNote = '旧版图片关卡已更新';
      machine.force(STATES.INTRO);
      render();
      return;
    }
    state.instance = instance;
    if (instance && instance.instanceId) writeStorage(activeKey(), instance.instanceId);
    if (instance.status === 'GENERATING') {
      machine.force(STATES.GENERATING);
      render();
      pollInstance();
      return;
    }
    if (instance.status === 'FAILED' || instance.status === 'REJECTED') {
      fail({ code: instance.failureCode || instance.status, message: '生成未完成' });
      return;
    }
    if (instance.content) state.content = instance.content;
    if (instance.status === 'COMPLETED') {
      machine.force(STATES.RESULT);
      render();
      restoreFinish();
      return;
    }
    if (instance.status !== 'READY' || !state.content) {
      fail({ code: 'INSTANCE_STATE_INVALID', message: '本局状态不可用' });
      return;
    }
    if (instance.currentRound >= totalRoundCount()) {
      machine.force(STATES.RESULT);
    } else if (gameCode === 'image-detective') {
      machine.force(STATES.ROUND_ACTIVE);
    } else if (instance.currentRound > 0 || readStorage(demoKey(instance.instanceId))) {
      machine.force(STATES.ROUND_ACTIVE);
    } else {
      machine.force(STATES.DEMO);
    }
    state.selected.clear();
    render();
  }

  function pollInstance() {
    global.clearTimeout(state.pollTimer);
    state.pollTimer = global.setTimeout(function () {
      var activeController = controller();
      api.instance(state.instance.instanceId, activeController.signal).then(handleInstance).catch(function (error) {
        if (activeController.signal.aborted) return;
        fail(error);
      });
    }, 1100);
  }

  function beginRounds() {
    writeStorage(demoKey(state.instance.instanceId), '1');
    machine.transition('BEGIN');
    state.selected.clear();
    state.statusNote = '示范完成，进入第一轮';
    render();
  }

  function submitRound(retryRequest) {
    var round = currentRound();
    if (!round || state.selected.size === 0) return;
    if (!retryRequest) state.submitRequestId = api.createRequestId();
    machine.force(STATES.ROUND_ACTIVE);
    machine.transition('SUBMIT');
    state.statusNote = '正在核对本轮观察';
    render();
    var activeController = controller();
    api.submit(state.instance.instanceId, round.roundId, {
      requestId: state.submitRequestId,
      action: { selectedIds: Array.from(state.selected) }
    }, activeController.signal).then(function (evaluation) {
      state.evaluation = evaluation;
      state.instance.currentRound = evaluation.currentRound;
      if (gameCode === 'image-detective') {
        machine.force(STATES.RESULT);
        state.statusNote = '本局已经结束，可以查看总结与反思';
        render();
        return;
      }
      machine.transition('EVALUATED');
      state.statusNote = evaluation.correct ? '本轮观察已核对' : '可以立即重试';
      render();
    }).catch(function (error) {
      if (activeController.signal.aborted) return;
      state.evaluation = {
        correct: false,
        hint: error && error.message ? error.message : '请求没有完成，可以原样重新提交。',
        requestFailed: true,
        allRoundsComplete: false
      };
      machine.force(STATES.FEEDBACK);
      state.statusNote = '请求没有完成，不扣除任何进度';
      render();
    });
  }

  function retryRound() {
    machine.transition('RETRY');
    state.selected.clear();
    state.evaluation = null;
    state.submitRequestId = null;
    render();
  }

  function nextRound() {
    machine.transition('NEXT');
    state.selected.clear();
    state.evaluation = null;
    state.submitRequestId = null;
    render();
  }

  function showResult() {
    machine.transition('COMPLETE');
    state.selected.clear();
    render();
  }

  function finishGame(discovery) {
    if (!state.instance || state.settling) return;
    state.finishRequestId = state.finishRequestId || readStorage(finishKey(state.instance.instanceId)) || api.createRequestId();
    writeStorage(finishKey(state.instance.instanceId), state.finishRequestId);
    state.settling = true;
    state.error = null;
    state.statusNote = '正在保存进度和奖励';
    render();
    var activeController = controller();
    api.finish(state.instance.instanceId, {
      requestId: state.finishRequestId,
      discovery: String(discovery || '').trim()
    }, activeController.signal).then(function (finish) {
      state.finish = finish;
      state.instance.status = 'COMPLETED';
      state.settling = false;
      state.statusNote = '进度和奖励已经保存';
      state.progress[gameCode] = true;
      render();
    }).catch(function (error) {
      if (activeController.signal.aborted) return;
      state.settling = false;
      state.statusNote = '';
      state.error = error;
      render();
    });
  }

  function restoreFinish() {
    state.finishRequestId = readStorage(finishKey(state.instance.instanceId)) || api.createRequestId();
    writeStorage(finishKey(state.instance.instanceId), state.finishRequestId);
    var activeController = controller();
    api.finish(state.instance.instanceId, { requestId: state.finishRequestId, discovery: '' }, activeController.signal)
      .then(function (finish) { state.finish = finish; render(); })
      .catch(function () { /* completed content stays readable even if reward retrieval is temporarily unavailable */ });
  }

  function retryGeneration() {
    machine.force(STATES.FAILED);
    machine.transition('RETRY_GENERATION');
    state.error = null;
    state.statusNote = '正在重试生成';
    render();
    if (!state.instance) {
      startNew();
      return;
    }
    var requestId = api.createRequestId();
    var activeController = controller();
    api.retryGeneration(state.instance.instanceId, { requestId: requestId }, activeController.signal)
      .then(handleInstance)
      .catch(function (error) { if (!activeController.signal.aborted) fail(error); });
  }

  function restartFromResult() {
    if (!state.instance) {
      machine.force(STATES.INTRO);
      render();
      startNew();
      return;
    }
    stopRequests();
    var previousInstanceId = state.instance.instanceId;
    machine.force(STATES.GENERATING);
    state.content = null;
    state.finish = null;
    state.error = null;
    state.createRequestId = null;
    state.finishRequestId = null;
    state.settling = false;
    removeStorage(activeKey());
    removeStorage(finishKey(previousInstanceId));
    state.statusNote = '正在生成新的本局内容';
    render();
    var requestId = api.createRequestId();
    var activeController = controller();
    api.regenerate(previousInstanceId, { requestId: requestId }, activeController.signal)
      .then(handleInstance)
      .catch(function (error) { if (!activeController.signal.aborted) fail(error); });
  }

  function fail(error) {
    stopRequests();
    state.error = error || { code: 'GENERATION_FAILED' };
    machine.force(STATES.FAILED);
    state.statusNote = '本局内容暂时生成失败';
    render();
  }

  function restoreActive() {
    if (!api.session()) return;
    var instanceId = readStorage(activeKey()) || readStorage(legacyActiveKey());
    if (!instanceId) return;
    if (!readStorage(activeKey())) writeStorage(activeKey(), instanceId);
    state.statusNote = '正在恢复上次进度';
    machine.force(STATES.GENERATING);
    render();
    var activeController = controller();
    api.instance(instanceId, activeController.signal).then(handleInstance).catch(function (error) {
      if (activeController.signal.aborted) return;
      if (error && error.status === 404) {
        removeStorage(activeKey());
        removeStorage(legacyActiveKey());
        machine.force(STATES.INTRO);
        state.statusNote = '';
        render();
        return;
      }
      fail(error);
    });
  }

  function loadProgress() {
    if (!api.session()) return Promise.resolve();
    return api.progress().then(function (items) {
      (items || []).forEach(function (item) {
        if (item.completed) state.progress[item.gameCode] = true;
      });
      if (machine.state === STATES.INTRO) render();
    }).catch(function () { /* catalog remains available without account progress */ });
  }

  function loadCatalog() {
    return api.games().then(function (items) {
      var serverGame = (items || []).find(function (item) { return item.gameCode === gameCode; });
      if (!serverGame || Number(serverGame.levelNo || 1) !== 1) return;
      game.description = serverGame.description || game.description;
      game.learningGoal = serverGame.learningGoal || game.learningGoal;
      game.estimatedMinutes = Number(serverGame.estimatedMinutes || game.estimatedMinutes);
      if (machine.state === STATES.INTRO) render();
    }).catch(function () { /* fixed metadata is allowed; generated game content never falls back */ });
  }

  global.addEventListener('pagehide', stopRequests);
  render();
  Promise.all([loadCatalog(), loadProgress()]).finally(restoreActive);
})(globalThis);
