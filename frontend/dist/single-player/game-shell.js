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
  var levelNo = clampLevel(params.get('level'));
  var game = catalog.get(gameCode);
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

  function clampLevel(value) {
    var number = Number(value || 1);
    return Number.isInteger(number) && number >= 1 && number <= 12 ? number : 1;
  }

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
    return 'zhiqu.single-player.active.' + gameCode + '.' + levelNo;
  }

  function demoKey(instanceId) {
    return 'zhiqu.single-player.demo.' + instanceId;
  }

  function finishKey(instanceId) {
    return 'zhiqu.single-player.finish.' + instanceId;
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
    detail.textContent = '第 ' + levelNo + ' 关 · ' + game.levels[levelNo - 1].learningGoal;
    heading.appendChild(title);
    heading.appendChild(detail);
    var progress = document.createElement('div');
    progress.className = 'sp-progress-label';
    progress.textContent = machine.state === STATES.ROUND_ACTIVE || machine.state === STATES.EVALUATING || machine.state === STATES.FEEDBACK
      ? '第 ' + Math.min(3, (state.instance ? state.instance.currentRound : 0) + 1) + ' / 3 轮'
      : machine.state === STATES.RESULT ? '结算' : '12 关可选';
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
    document.title = game.title + ' · 第 ' + levelNo + ' 关 | 智趣 AI 学堂';
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
    description.textContent = game.description + ' 每关有一次示范、三轮挑战和一条本局生成的发现。';
    head.appendChild(kicker);
    head.appendChild(title);
    head.appendChild(description);
    intro.appendChild(head);

    var loop = document.createElement('div');
    loop.className = 'sp-loop';
    [
      ['01', '看原始信息'], ['02', '看 AI 提取'], ['03', '和自己比较'], ['04', '改变一个信息'], ['05', '发现 AI 还不知道什么']
    ].forEach(function (item) {
      var step = document.createElement('span');
      var number = document.createElement('b');
      number.textContent = item[0];
      step.appendChild(number);
      step.appendChild(document.createTextNode(item[1]));
      loop.appendChild(step);
    });
    intro.appendChild(loop);

    var levelSection = document.createElement('section');
    var heading = document.createElement('h2');
    heading.className = 'sp-section-title';
    heading.textContent = '选择关卡';
    levelSection.appendChild(heading);
    var grid = document.createElement('div');
    grid.className = 'sp-level-grid';
    game.levels.forEach(function (level) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'sp-level';
      button.dataset.current = String(level.levelNo === levelNo);
      button.dataset.complete = String(!!state.progress[gameCode + ':' + level.levelNo]);
      var number = document.createElement('span');
      number.className = 'sp-level-number';
      number.textContent = '第 ' + level.levelNo + ' 关';
      var goal = document.createElement('strong');
      goal.textContent = level.learningGoal;
      var type = document.createElement('small');
      type.textContent = level.type + ' · 约 ' + level.estimatedMinutes + ' 分钟';
      button.appendChild(number);
      button.appendChild(goal);
      button.appendChild(type);
      button.addEventListener('click', function () { selectLevel(level.levelNo); });
      grid.appendChild(button);
    });
    levelSection.appendChild(grid);
    intro.appendChild(levelSection);

    if (state.showAgePicker) intro.appendChild(agePicker());
    var actions = document.createElement('div');
    actions.className = 'sp-actions';
    var start = document.createElement('button');
    start.type = 'button';
    start.className = 'sp-primary';
    start.textContent = api.session() ? '开始第 ' + levelNo + ' 关' : '登录后开始';
    start.addEventListener('click', startNew);
    actions.appendChild(start);
    var note = document.createElement('span');
    note.className = 'sp-hint-text';
    note.textContent = api.session()
      ? '开局后由 AI 实时生成，本局有效期 24 小时。'
      : '游客可查看介绍与全部关卡目录；生成、进度和奖励需要登录。';
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
      ? '正在生成场景、图片，并让视觉模型重新核对画面。'
      : gameCode === 'route-and-conditions'
        ? '正在生成抽象图，随后由路线程序检查每个数字和条件。'
        : '正在根据本关目标和年龄段创建新的观察材料。';
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
    begin.textContent = '开始三轮挑战';
    begin.addEventListener('click', beginRounds);
    actions.appendChild(begin);
    if (levelNo === 12) {
      var change = document.createElement('button');
      change.type = 'button';
      change.className = 'sp-secondary';
      change.textContent = '换一个';
      change.addEventListener('click', regenerate);
      actions.appendChild(change);
    }
    main.appendChild(actions);
  }

  function currentRound() {
    return state.content && state.content.rounds
      ? state.content.rounds[Math.min(2, state.instance.currentRound)]
      : null;
  }

  function renderRound(main) {
    var round = currentRound();
    if (!round) return fail({ code: 'ROUND_CONTENT_MISSING', message: '本轮内容不可用' });
    main.classList.add('sp-stage');
    stageHeader(main, '第 ' + (state.instance.currentRound + 1) + ' 轮', round.title || '观察并核对', round.prompt);
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
    submit.textContent = '核对我的观察';
    submit.disabled = state.selected.size === 0;
    submit.addEventListener('click', function () { submitRound(false); });
    actions.appendChild(submit);
    var note = document.createElement('span');
    note.className = 'sp-status-note';
    note.textContent = state.selected.size ? '已选择 ' + state.selected.size + ' 项' : '先选择你观察到的证据或判断';
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
      else state.selected.add(option.id);
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
    title.textContent = gameCode === 'route-and-conditions' ? '程序正在核对路线' : '正在比较这次观察';
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
    if (evaluation.correct && evaluation.comparison) main.appendChild(comparisonView(evaluation.comparison));
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
    stageHeader(main, '三轮观察完成', '我发现了什么', '结算记录的是观察和证据，不是内容好不好看。');
    var result = state.content && state.content.result ? state.content.result : {};
    var band = document.createElement('section');
    band.className = 'sp-result-band';
    var heading = document.createElement('h2');
    heading.textContent = result.discovery || '这次观察已经完成。';
    var limitation = document.createElement('p');
    limitation.textContent = result.limitation || 'AI 只能根据当前信息判断，还有它不知道的部分。';
    band.appendChild(heading);
    band.appendChild(limitation);
    main.appendChild(band);

    if (!state.finish) {
      var label = document.createElement('label');
      label.className = 'sp-workspace';
      var labelText = document.createElement('strong');
      labelText.textContent = '我的一句发现（可选）';
      var input = document.createElement('textarea');
      input.className = 'sp-reflection';
      input.maxLength = 500;
      input.placeholder = '可以写下 AI 漏掉了什么，或哪个信息改变了判断。不要填写姓名、学校或联系方式。';
      label.appendChild(labelText);
      label.appendChild(input);
      main.appendChild(label);
      var actions = document.createElement('div');
      actions.className = 'sp-actions';
      var finish = document.createElement('button');
      finish.type = 'button';
      finish.className = 'sp-primary';
      finish.textContent = state.settling ? '正在保存' : '保存进度并领取奖励';
      finish.disabled = state.settling;
      finish.addEventListener('click', function () { finishGame(input.value); });
      actions.appendChild(finish);
      main.appendChild(actions);
      if (state.error) {
        var error = document.createElement('p');
        error.className = 'sp-error-code';
        error.textContent = state.error.message || '结算暂时没有保存，请重试。';
        main.appendChild(error);
      }
      return;
    }

    var reward = document.createElement('section');
    reward.className = 'sp-reward';
    var rewardText = state.finish.reward
      ? '本关奖励：' + state.finish.reward.awardedXp + ' XP' + (state.finish.reward.capped ? '（今日奖励已达上限）' : '')
      : '本关进度已经保存。';
    reward.textContent = rewardText;
    main.appendChild(reward);
    var completedActions = document.createElement('div');
    completedActions.className = 'sp-actions';
    var lobby = document.createElement('a');
    lobby.className = 'sp-primary';
    lobby.href = '/community?section=games';
    lobby.textContent = '返回游戏大厅';
    var again = document.createElement('button');
    again.type = 'button';
    again.className = 'sp-secondary';
    again.textContent = levelNo === 12 ? '换一个新实例' : '再生成一局';
    again.addEventListener('click', restartFromResult);
    completedActions.appendChild(lobby);
    completedActions.appendChild(again);
    main.appendChild(completedActions);
  }

  function renderFailed(main) {
    var loading = document.createElement('section');
    loading.className = 'sp-loading';
    var wrap = document.createElement('div');
    var title = document.createElement('h1');
    title.textContent = '本关内容暂时生成失败';
    var copy = document.createElement('p');
    copy.textContent = '没有使用固定题目代替这次 AI 内容。可以重新生成，或先返回大厅。';
    var code = document.createElement('p');
    code.className = 'sp-error-code';
    code.textContent = state.error && state.error.code ? state.error.code : 'GENERATION_FAILED';
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

  function selectLevel(nextLevel) {
    stopRequests();
    levelNo = nextLevel;
    state.instance = null;
    state.content = null;
    state.finish = null;
    state.error = null;
    state.selected.clear();
    machine.force(STATES.INTRO);
    var next = new URL(global.location.href);
    next.searchParams.set('game', gameCode);
    next.searchParams.set('level', String(levelNo));
    global.history.replaceState({}, '', next.pathname + next.search);
    render();
    restoreActive();
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
    state.statusNote = '正在生成新关卡';
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
    if (instance.currentRound >= 3) {
      machine.force(STATES.RESULT);
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
      state.progress[gameCode + ':' + levelNo] = true;
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

  function regenerate() {
    if (!state.instance) return;
    machine.force(machine.state);
    if (machine.state === STATES.DEMO) machine.transition('REGENERATE');
    else machine.force(STATES.GENERATING);
    state.content = null;
    state.selected.clear();
    render();
    var requestId = api.createRequestId();
    var activeController = controller();
    api.regenerate(state.instance.instanceId, { requestId: requestId }, activeController.signal)
      .then(handleInstance)
      .catch(function (error) { if (!activeController.signal.aborted) fail(error); });
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
    machine.force(STATES.INTRO);
    state.instance = null;
    state.content = null;
    state.finish = null;
    state.error = null;
    state.createRequestId = null;
    state.finishRequestId = null;
    state.settling = false;
    removeStorage(activeKey());
    render();
    startNew();
  }

  function fail(error) {
    stopRequests();
    state.error = error || { code: 'GENERATION_FAILED' };
    machine.force(STATES.FAILED);
    state.statusNote = '本关内容暂时生成失败';
    render();
  }

  function restoreActive() {
    if (!api.session()) return;
    var instanceId = readStorage(activeKey());
    if (!instanceId) return;
    state.statusNote = '正在恢复上次进度';
    machine.force(STATES.GENERATING);
    render();
    var activeController = controller();
    api.instance(instanceId, activeController.signal).then(handleInstance).catch(function (error) {
      if (activeController.signal.aborted) return;
      if (error && error.status === 404) {
        removeStorage(activeKey());
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
        if (item.completed) state.progress[item.gameCode + ':' + item.levelNo] = true;
      });
      if (machine.state === STATES.INTRO) render();
    }).catch(function () { /* catalog remains available without account progress */ });
  }

  function loadCatalog() {
    return api.games().then(function (items) {
      var serverGame = (items || []).find(function (item) { return item.gameCode === gameCode; });
      if (!serverGame || !Array.isArray(serverGame.levels) || serverGame.levels.length !== 12) return;
      game.description = serverGame.description || game.description;
      game.learningGoal = serverGame.learningGoal || game.learningGoal;
      serverGame.levels.forEach(function (level, index) {
        game.levels[index].learningGoal = level.learningGoal || game.levels[index].learningGoal;
      });
      if (machine.state === STATES.INTRO) render();
    }).catch(function () { /* fixed metadata is allowed; generated game content never falls back */ });
  }

  global.addEventListener('pagehide', stopRequests);
  render();
  Promise.all([loadCatalog(), loadProgress()]).finally(restoreActive);
})(globalThis);
