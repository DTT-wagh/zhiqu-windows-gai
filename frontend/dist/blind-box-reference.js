(() => {
  const SESSION_KEY = 'zhiqu.auth.session.v1';
  const RUNTIME_KEY = '__zqBlindBoxReferenceRuntimeV1';
  const POLL_INTERVAL_MS = 2_000;
  const STAGES = [
    ['DISCOVERY', '拆解需求'],
    ['VOICE_BRIEFING', '语音传达'],
    ['PROMPT_WRITING', '写 Prompt'],
    ['IMAGE_GENERATING', '生成中'],
    ['AI_JUDGING', 'AI 验收'],
    ['RESULT', '完成'],
  ];

  const apiBase = () => String(globalThis.__ZHIQU_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
  const requestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));

  const session = () => {
    try {
      return JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  };

  let refreshPromise = null;
  const refreshSession = async (currentSession) => {
    if (!currentSession?.refreshToken) return null;
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const response = await globalThis.fetch(`${apiBase()}/api/auth/refresh`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
          });
          if (!response.ok) return null;
          const nextSession = await response.json();
          if (!nextSession?.accessToken) return null;
          globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(nextSession));
          return nextSession;
        } catch {
          return null;
        } finally {
          refreshPromise = null;
        }
      })();
    }
    return refreshPromise;
  };

  const api = async (path, options = {}, retryAfterRefresh = true) => {
    const currentSession = session();
    const token = currentSession?.accessToken;
    const headers = {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    const response = await globalThis.fetch(`${apiBase()}${path}`, { ...options, headers });
    if (response.status === 401 && retryAfterRefresh) {
      const nextSession = await refreshSession(currentSession);
      if (nextSession?.accessToken) return api(path, options, false);
    }
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
    if (!response.ok) throw new Error(payload?.message || payload?.error || '操作暂时无法完成');
    return payload;
  };

  const route = () => {
    const parts = globalThis.location.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'blind-box' || parts.length > 2) return null;
    return { roomId: parts.length === 2 ? parts[1] : null };
  };

  const currentStage = (room) => String(room?.status || 'LOBBY');
  const roleName = (role) => role === 'BOSS' ? '需求沟通者' : role === 'DESIGNER' ? '提示词设计者' : '协作玩家';
  const participantName = (participant, fallback) => String(
    participant?.nickname || participant?.displayName || participant?.username || participant?.name || fallback,
  ).trim() || fallback;
  const stageIndex = (status) => Math.max(0, STAGES.findIndex(([value]) => value === status));
  const detail = (room) => room?.task || {};
  const roomMedia = (room, value) => {
    if (!value) return '';
    const source = String(value);
    if (/^https?:\/\//i.test(source)) return source;
    if (source.startsWith('/')) return `${apiBase()}${source}`;
    return `${apiBase()}/api/blind-box-rooms/${encodeURIComponent(room.id)}/media/${encodeURIComponent(source)}`;
  };

  const runtime = () => {
    if (!globalThis[RUNTIME_KEY]) {
      globalThis[RUNTIME_KEY] = {
        shell: null,
        stylesheet: null,
        timer: null,
        routeTimer: null,
        room: null,
        page: 'home',
        loading: false,
        error: '',
        recorder: null,
        recordChunks: [],
        recordStartedAt: 0,
        recordTimer: null,
        recordSeconds: 0,
      };
    }
    return globalThis[RUNTIME_KEY];
  };

  const setBusy = (state, busy) => {
    state.loading = busy;
    state.shell?.classList.toggle('is-busy', busy);
  };

  const navigate = (path) => globalThis.location.assign(path);
  const toCommunity = () => navigate('/community?section=games');

  const app = (state) => state.shell?.querySelector('[data-blind-box-app]');
  const renderError = (state) => state.error
    ? `<div class="bb-toast" role="alert"><span>${escapeHtml(state.error)}</span><button type="button" data-action="dismiss-error" aria-label="关闭提示">×</button></div>`
    : '';

  const missionRobot = (tone = 'green') => `
    <div class="bb-robot bb-robot--${tone}" aria-hidden="true">
      <span class="bb-robot__antenna"></span><span class="bb-robot__ear bb-robot__ear--left"></span><span class="bb-robot__ear bb-robot__ear--right"></span>
      <span class="bb-robot__head"><i></i><i></i></span><span class="bb-robot__body">✦</span>
    </div>`;

  const button = ({ action, label, kind = 'primary', disabled = false, extra = '', title = '' }) => `
    <button type="button" class="bb-button bb-button--${kind}" data-action="${action}" ${disabled ? 'disabled' : ''} ${title ? `title="${escapeHtml(title)}"` : ''}>${extra}<span>${escapeHtml(label)}</span></button>`;

  const stageRail = (room) => {
    const index = stageIndex(currentStage(room));
    return `<ol class="bb-stage-rail" aria-label="游戏进度">${STAGES.map(([status, label], itemIndex) => `
      <li class="${itemIndex < index ? 'is-done' : itemIndex === index ? 'is-current' : ''}"><span>${itemIndex + 1}</span><b>${label}</b></li>`).join('')}</ol>`;
  };

  const roomHeader = (room) => {
    const status = currentStage(room);
    const stageLabel = STAGES.find(([value]) => value === status)?.[1] || (status === 'LOBBY' ? '等待搭档' : '灵感挑战');
    const role = room?.currentUserRole;
    return `<header class="bb-header">
      <button class="bb-icon-button" type="button" data-action="leave" aria-label="返回游戏大厅" title="返回游戏大厅">←</button>
      <div class="bb-title"><span class="bb-title__orb">✦</span><strong>灵感接力</strong><small>${escapeHtml(stageLabel)}</small></div>
      <span class="bb-role-badge bb-role-badge--${role === 'BOSS' ? 'boss' : 'designer'}">${escapeHtml(roleName(role))}</span>
      ${stageRail(room)}
    </header>`;
  };

  const teammateCard = (room, position) => {
    const isBoss = position === 'boss';
    const participant = isBoss ? room?.boss : room?.designer;
    const role = isBoss ? 'BOSS' : 'DESIGNER';
    const active = room?.currentUserRole === role;
    return `<div class="bb-player ${active ? 'is-active' : ''}">
      <div class="bb-player__avatar ${isBoss ? 'bb-player__avatar--coral' : 'bb-player__avatar--blue'}">${isBoss ? '✎' : '✦'}</div>
      <div><b>${escapeHtml(participantName(participant, isBoss ? '需求小队长' : '提示词设计师'))}</b><small>${isBoss ? '需求沟通者' : '提示词设计者'}</small></div>
      <span class="bb-player__state">${participant ? (active ? '进行中' : '在线') : '等待加入'}</span>
    </div>`;
  };

  const roomAside = (room) => `<aside class="bb-side-panel">
    <div class="bb-side-panel__caption">灵感小队</div>
    ${teammateCard(room, 'boss')}${teammateCard(room, 'designer')}
    <div class="bb-side-panel__robot">${missionRobot('mint')}<p>轮到谁，谁来点亮下一格！</p></div>
  </aside>`;

  const renderLobby = (state) => {
    const isSignedIn = Boolean(session()?.accessToken);
    const activeRoom = state.room;
    const createMode = state.page === 'create';
    const joinMode = state.page === 'join';
    const pageTitle = createMode ? '选择一张任务卡' : joinMode ? '输入伙伴邀请码' : '准备好接力了吗？';
    const pageCopy = createMode ? '随机任务，开始拆解灵感' : joinMode ? '输入 6 位邀请码，进入同一个灵感小队' : '两位小伙伴协作，把模糊想法变成一张作品';
    const activeMarkup = activeRoom?.id ? `<div class="bb-active-room"><span>你有一场正在进行的挑战</span>${button({ action: 'resume', label: '继续挑战', kind: 'secondary' })}</div>` : '';
    const content = createMode ? `
      <div class="bb-mode-grid">
        <button class="bb-mode-card is-selected" data-action="create-seed" type="button"><span class="bb-mode-card__icon">🎯</span><b>主题任务</b><small>从一张神秘任务卡开始</small><i>开始</i></button>
        <button class="bb-mode-card" data-action="create-ai" type="button"><span class="bb-mode-card__icon">✨</span><b>AI 生成任务</b><small>让 AI 发来一份新挑战</small><i>开始</i></button>
      </div>` : joinMode ? `
      <form class="bb-join-form" data-form="join-room">
        <input name="invite-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6 位邀请码" aria-label="6 位邀请码">
        ${button({ action: 'join', label: '加入房间', disabled: !isSignedIn })}
      </form>` : `
      <div class="bb-lobby-actions">
        ${button({ action: 'show-create', label: '创建新挑战', disabled: !isSignedIn, extra: '<em>＋</em>' })}
        ${button({ action: 'show-join', label: '加入伙伴房间', kind: 'secondary', disabled: !isSignedIn, extra: '<em>⌁</em>' })}
      </div>`;
    state.shell.innerHTML = `<div class="bb-shell" data-blind-box-app>
      <div class="bb-lobby-sky"><span></span><span></span><span></span></div>
      <header class="bb-lobby-header"><button class="bb-icon-button" type="button" data-action="back-community" aria-label="返回社区" title="返回社区">←</button><div class="bb-lobby-brand"><b>灵感接力</b><small>双人 AI 创作挑战</small></div>${activeMarkup}</header>
      <main class="bb-lobby-main">
        <section class="bb-lobby-copy"><span class="bb-kicker">AI 创作关卡</span><h1>${pageTitle}</h1><p>${pageCopy}</p>${content}${!isSignedIn ? '<p class="bb-login-hint">登录后即可创建或加入房间</p>' : ''}</section>
        <section class="bb-lobby-art"><div class="bb-idea-bulb">✦</div>${missionRobot('green')}<div class="bb-art-card bb-art-card--one">想法</div><div class="bb-art-card bb-art-card--two">作品</div></section>
      </main>
      <footer class="bb-lobby-footer"><span>需求沟通</span><i>→</i><span>提问拆解</span><i>→</i><span>Prompt 创作</span><i>→</i><span>AI 评审</span></footer>
      ${renderError(state)}
    </div>`;
  };

  const sketchPanel = (room) => {
    const task = detail(room);
    const sketchUrl = roomMedia(room, task.sketchUrl);
    return `<section class="bb-task-card">
      <div class="bb-task-card__tag">任务线索</div>
      ${sketchUrl ? `<img src="${escapeHtml(sketchUrl)}" alt="任务草图">` : `<div class="bb-task-card__placeholder">✦<span>任务卡已准备</span></div>`}
      <p>${escapeHtml(task.vagueRequirement || '先和伙伴聊聊，找出这张作品真正需要的细节。')}</p>
    </section>`;
  };

  const renderDiscovery = (state, room) => {
    const boss = room.currentUserRole === 'BOSS';
    const task = detail(room);
    const questions = Array.isArray(task.questions) ? task.questions : [];
    const history = Array.isArray(room.discoveryHistory) ? room.discoveryHistory : [];
    const questionButtons = questions.length ? questions.map((question, index) => `<button type="button" class="bb-question" data-action="ask-suggested" data-index="${index}" ${!boss || state.loading ? 'disabled' : ''}>${escapeHtml(question)}</button>`).join('') : '<div class="bb-empty-inline">还没有可用的推荐问题</div>';
    const historyHtml = history.length ? history.map((item) => `<li><b>${escapeHtml(item.question || '问题')}</b><span>${escapeHtml(item.answer || '等待回答')}</span></li>`).join('') : '<li class="is-empty">对话记录会显示在这里</li>';
    return `<div class="bb-room-layout bb-room-layout--discovery">
      ${sketchPanel(room)}
      <section class="bb-main-card bb-discovery-card">
        <div class="bb-section-heading"><span>第 1 关</span><h2>拆解创作需求</h2><p>${boss ? '点击问题，把你的想法说清楚' : '伙伴正在把灵感拆成清晰线索'}</p></div>
        <div class="bb-question-grid">${questionButtons}</div>
        ${boss && !room.freeQuestionUsed ? `<form class="bb-free-question" data-form="free-question"><input name="free-question" maxlength="100" placeholder="再补充一个细节…" aria-label="补充一个细节"><button type="submit">发送</button></form>` : ''}
        <ul class="bb-history">${historyHtml}</ul>
        ${boss ? button({ action: 'finish-discovery', label: '线索说清楚了', disabled: state.loading }) : '<div class="bb-waiting"><span>⌛</span>等待需求沟通者确认线索</div>'}
      </section>
      ${roomAside(room)}
    </div>`;
  };

  const audioPlayer = (room) => {
    const source = roomMedia(room, room?.audioUrl);
    return source ? `<audio class="bb-audio" controls src="${escapeHtml(source)}">你的浏览器不支持播放音频</audio>` : '';
  };

  const renderVoice = (state, room) => {
    const boss = room.currentUserRole === 'BOSS';
    const recording = Boolean(state.recorder);
    const seconds = String(state.recordSeconds || 0).padStart(2, '0');
    return `<div class="bb-room-layout">
      <section class="bb-main-card bb-voice-card">
        <div class="bb-section-heading"><span>第 2 关</span><h2>${boss ? '用声音传达画面' : '收听伙伴的创作说明'}</h2><p>${boss ? '说说你最想保留的画面细节' : '听完后，你将把线索写成一段 Prompt'}</p></div>
        ${boss ? `<div class="bb-recorder ${recording ? 'is-recording' : ''}"><div class="bb-record-pulse"><i></i><i></i><i></i></div><b>${recording ? `正在录音 00:${seconds}` : '点击开始录音'}</b><small>最长 30 秒</small></div>
          <div class="bb-recorder-actions">${button({ action: recording ? 'stop-recording' : 'start-recording', label: recording ? '完成录音' : '开始录音', kind: recording ? 'coral' : 'primary', disabled: state.loading })}<label class="bb-upload-label"><input type="file" data-input="audio-file" accept="audio/*">选择音频</label></div>` : `<div class="bb-listen-card">${missionRobot('blue')}<b>伙伴正在录制创作说明</b><p>录音提交后会自动进入下一关</p></div>`}
      </section>
      <section class="bb-task-card bb-task-card--brief"><div class="bb-task-card__tag">本轮任务</div><p>${escapeHtml(detail(room).vagueRequirement || '让灵感更清晰。')}</p>${audioPlayer(room)}</section>
      ${roomAside(room)}
    </div>`;
  };

  const renderPrompt = (state, room) => {
    const designer = room.currentUserRole === 'DESIGNER';
    return `<div class="bb-room-layout">
      <section class="bb-main-card bb-prompt-card">
        <div class="bb-section-heading"><span>第 3 关</span><h2>${designer ? '把线索变成 Prompt' : '伙伴正在写 Prompt'}</h2><p>${designer ? '写下主体、场景、风格和重要细节' : '稍等一会儿，作品马上开始生成'}</p></div>
        <div class="bb-audio-line"><span>🔊 语音线索</span>${audioPlayer(room) || '<b>还没有录音</b>'}</div>
        ${designer ? `<form class="bb-prompt-form" data-form="prompt"><textarea name="prompt" maxlength="1000" placeholder="例如：一只戴着护目镜的小机器人，在森林实验室里观察会发光的植物，卡通插画风格…">${escapeHtml(room.designerPrompt || '')}</textarea>${button({ action: 'submit-prompt', label: '生成作品', disabled: state.loading, extra: '<em>✦</em>' })}</form>` : `<div class="bb-waiting bb-waiting--large"><span>✎</span>设计者正在把线索组合成 Prompt</div>`}
      </section>
      ${sketchPanel(room)}
      ${roomAside(room)}
    </div>`;
  };

  const renderGenerating = (room) => `<div class="bb-room-layout bb-room-layout--single">
    <section class="bb-main-card bb-generating-card"><div class="bb-generating-orbit"><span>✦</span><i></i><i></i><i></i>${missionRobot('green')}</div><h2>AI 正在把灵感画出来</h2><p>把需求、语音和 Prompt 组合成作品</p><div class="bb-loading-track"><i></i></div></section>${roomAside(room)}
  </div>`;

  const renderJudging = (state, room) => {
    const score = room?.score || {};
    return `<div class="bb-room-layout bb-room-layout--single">
      <section class="bb-main-card bb-judging-card"><div class="bb-judge-top">${missionRobot('blue')}<div><span>第 5 关</span><h2>AI 正在验收作品</h2><p>${score.error ? escapeHtml(score.error) : '正在比对任务细节和生成作品'}</p></div></div>${score.error ? button({ action: 'retry-judge', label: '重新评审', disabled: state.loading }) : '<div class="bb-loading-track"><i></i></div>'}</section>${roomAside(room)}
    </div>`;
  };

  const scoreTags = (values, type) => (Array.isArray(values) && values.length
    ? values.map((value) => `<span class="bb-score-tag bb-score-tag--${type}">${escapeHtml(value)}</span>`).join('')
    : `<span class="bb-score-tag bb-score-tag--${type}">${type === 'match' ? '正在核对亮点' : '没有遗漏提示'}</span>`);

  const renderResult = (state, room) => {
    const score = room?.score || {};
    const number = Number(score.totalScore);
    const total = Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null;
    const image = roomMedia(room, room?.imageUrl);
    return `<div class="bb-result-layout">
      <section class="bb-result-score"><div class="bb-score-ring" style="--score:${total ?? 0}%"><span>${total === null ? '--' : total}</span><small>本轮得分</small></div><h2>${total !== null && total >= 80 ? '灵感接力成功！' : '这轮灵感已完成！'}</h2><p>${escapeHtml(score.comment || '看看 AI 从你们的对话中读到了哪些创作细节。')}</p><div class="bb-score-columns"><div><b>抓住的细节</b><p>${scoreTags(score.matchedDetails, 'match')}</p></div><div><b>下次可补充</b><p>${scoreTags(score.missingDetails, 'miss')}</p></div></div></section>
      <section class="bb-result-work"><div class="bb-result-work__frame">${image ? `<img src="${escapeHtml(image)}" alt="AI 生成的作品">` : '<div class="bb-task-card__placeholder">✦<span>作品正在同步</span></div>'}</div><div class="bb-result-prompt"><b>本轮 Prompt</b><p>${escapeHtml(room?.designerPrompt || '本轮没有提交 Prompt')}</p></div></section>
      <aside class="bb-result-actions">${missionRobot('mint')}${button({ action: 'swap', label: '交换角色，再来一局', disabled: state.loading })}${button({ action: 'leave', label: '返回大厅', kind: 'secondary', disabled: state.loading })}</aside>
    </div>`;
  };

  const renderRoom = (state, room) => {
    const status = currentStage(room);
    let content = '';
    if (status === 'LOBBY') {
      const isBoss = room.currentUserRole === 'BOSS';
      content = `<div class="bb-room-layout bb-room-layout--single"><section class="bb-main-card bb-wait-card">${missionRobot('green')}<div><span class="bb-kicker">房间已创建</span><h2>${isBoss ? '把邀请码分享给伙伴' : '正在进入灵感小队'}</h2>${isBoss ? `<strong class="bb-invite-code">${escapeHtml(room.inviteCode || '------')}</strong><p>等伙伴加入后，挑战自动开始</p>` : '<p>房主已经看到你了，马上开始拆解需求</p>'}</div></section>${roomAside(room)}</div>`;
    } else if (status === 'DISCOVERY') content = renderDiscovery(state, room);
    else if (status === 'VOICE_BRIEFING') content = renderVoice(state, room);
    else if (status === 'PROMPT_WRITING') content = renderPrompt(state, room);
    else if (status === 'IMAGE_GENERATING') content = renderGenerating(room);
    else if (status === 'AI_JUDGING') content = renderJudging(state, room);
    else if (status === 'RESULT') content = renderResult(state, room);
    else content = `<div class="bb-room-layout bb-room-layout--single"><section class="bb-main-card bb-wait-card"><h2>本轮挑战已结束</h2><p>房间状态：${escapeHtml(status)}</p>${button({ action: 'leave', label: '返回大厅' })}</section></div>`;
    state.shell.innerHTML = `<div class="bb-shell" data-blind-box-app>${roomHeader(room)}<main class="bb-game-main">${content}</main>${renderError(state)}</div>`;
  };

  const render = (state) => {
    const appRoute = route();
    if (!appRoute || !state.shell) return;
    if (appRoute.roomId) renderRoom(state, state.room || { id: appRoute.roomId, status: 'LOBBY' });
    else renderLobby(state);
  };

  const refreshRoom = async (state, quiet = false) => {
    const activeRoute = route();
    if (!activeRoute?.roomId || state.loading) return;
    try {
      state.room = await api(`/api/blind-box-rooms/${encodeURIComponent(activeRoute.roomId)}`);
      if (!quiet) state.error = '';
      render(state);
    } catch (error) {
      if (!quiet) {
        state.error = error.message || '房间暂时无法同步';
        render(state);
      }
    }
  };

  const refreshLobby = async (state, quiet = false) => {
    if (route()?.roomId || !session()?.accessToken || state.loading) return;
    try {
      const current = await api('/api/blind-box-rooms/active');
      state.room = current?.id ? current : null;
      if (!quiet) state.error = '';
      render(state);
    } catch (error) {
      state.room = null;
      if (!quiet && String(error.message || '').includes('请先登录')) state.error = error.message;
      render(state);
    }
  };

  const refresh = (state, quiet = false) => route()?.roomId ? refreshRoom(state, quiet) : refreshLobby(state, quiet);

  const postJson = async (state, path, payload = {}) => {
    setBusy(state, true);
    try {
      const result = await api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId() },
        body: JSON.stringify({ requestId: requestId(), ...payload }),
      });
      state.error = '';
      return result;
    } catch (error) {
      state.error = error.message || '操作暂时无法完成';
      throw error;
    } finally {
      setBusy(state, false);
    }
  };

  const createRoom = async (state, taskMode) => {
    if (!session()?.accessToken) { navigate('/login?next=%2Fblind-box'); return; }
    try {
      const room = await postJson(state, '/api/blind-box-rooms', { taskMode });
      if (!room?.id) throw new Error('房间暂时没有创建成功');
      navigate(`/blind-box/${encodeURIComponent(room.id)}`);
    } catch { render(state); }
  };

  const joinRoom = async (state, form) => {
    if (!session()?.accessToken) { navigate('/login?next=%2Fblind-box'); return; }
    const inviteCode = String(new FormData(form).get('invite-code') || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(inviteCode)) {
      state.error = '请输入 6 位邀请码';
      render(state);
      return;
    }
    try {
      const room = await postJson(state, '/api/blind-box-rooms/join', { inviteCode });
      if (!room?.id) throw new Error('邀请码暂时无法加入');
      navigate(`/blind-box/${encodeURIComponent(room.id)}`);
    } catch { render(state); }
  };

  const finishDiscovery = async (state) => {
    if (!state.room?.id) return;
    try {
      state.room = await postJson(state, `/api/blind-box-rooms/${encodeURIComponent(state.room.id)}/finish-discovery`);
      render(state);
    } catch { render(state); }
  };

  const askQuestion = async (state, payload) => {
    if (!state.room?.id) return;
    try {
      state.room = await postJson(state, `/api/blind-box-rooms/${encodeURIComponent(state.room.id)}/questions`, payload);
      render(state);
    } catch { render(state); }
  };

  const stopRecordingTimer = (state) => {
    if (state.recordTimer) clearInterval(state.recordTimer);
    state.recordTimer = null;
  };

  const uploadAudio = async (state, file, durationMillis) => {
    if (!state.room?.id || !file) return;
    setBusy(state, true);
    try {
      const form = new FormData();
      form.append('file', file, file.name || 'idea-brief.webm');
      form.append('requestId', requestId());
      form.append('durationMillis', String(Math.max(0, Math.round(durationMillis || 0))));
      state.room = await api(`/api/blind-box-rooms/${encodeURIComponent(state.room.id)}/audio`, { method: 'POST', body: form });
      state.error = '';
    } catch (error) {
      state.error = error.message || '音频上传失败';
    } finally {
      setBusy(state, false);
      render(state);
    }
  };

  const startRecording = async (state) => {
    if (!globalThis.navigator?.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      state.error = '当前浏览器不能录音，请选择音频文件上传';
      render(state);
      return;
    }
    try {
      const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      state.recorder = recorder;
      state.recordChunks = [];
      state.recordStartedAt = Date.now();
      state.recordSeconds = 0;
      recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) state.recordChunks.push(event.data); });
      recorder.addEventListener('stop', () => {
        const elapsed = Date.now() - state.recordStartedAt;
        const type = recorder.mimeType || state.recordChunks[0]?.type || 'audio/webm';
        const file = new File([new Blob(state.recordChunks, { type })], `idea-brief-${Date.now()}.webm`, { type });
        stream.getTracks().forEach((track) => track.stop());
        state.recorder = null;
        stopRecordingTimer(state);
        uploadAudio(state, file, elapsed);
      }, { once: true });
      recorder.start();
      state.recordTimer = globalThis.setInterval(() => {
        state.recordSeconds = Math.min(30, Math.floor((Date.now() - state.recordStartedAt) / 1000));
        if (state.recordSeconds >= 30 && state.recorder?.state === 'recording') state.recorder.stop();
        else render(state);
      }, 300);
      render(state);
    } catch (error) {
      state.error = error?.name === 'NotAllowedError' ? '需要麦克风权限才能录音' : '录音暂时无法开始';
      render(state);
    }
  };

  const stopRecording = (state) => {
    if (state.recorder?.state === 'recording') state.recorder.stop();
  };

  const submitPrompt = async (state, form) => {
    if (!state.room?.id) return;
    const prompt = String(new FormData(form).get('prompt') || '').trim();
    if (!prompt) { state.error = '先写下 Prompt，再生成作品'; render(state); return; }
    try {
      state.room = await postJson(state, `/api/blind-box-rooms/${encodeURIComponent(state.room.id)}/prompt`, { prompt });
      render(state);
    } catch { render(state); }
  };

  const retryJudge = async (state) => {
    if (!state.room?.id) return;
    try {
      state.room = await postJson(state, `/api/blind-box-rooms/${encodeURIComponent(state.room.id)}/retry-judge`);
      render(state);
    } catch { render(state); }
  };

  const swapRoom = async (state) => {
    if (!state.room?.id) return;
    try {
      const result = await postJson(state, `/api/blind-box-rooms/${encodeURIComponent(state.room.id)}/swap`);
      const nextRoomId = result?.nextRoomId || result?.id || state.room?.nextRoomId;
      if (!nextRoomId) throw new Error('新一局正在准备，请稍后从大厅继续');
      navigate(`/blind-box/${encodeURIComponent(nextRoomId)}`);
    } catch { render(state); }
  };

  const leaveRoom = async (state) => {
    if (!state.room?.id) { toCommunity(); return; }
    setBusy(state, true);
    try {
      await api(`/api/blind-box-rooms/${encodeURIComponent(state.room.id)}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId() },
        body: JSON.stringify({ requestId: requestId() }),
      });
    } catch {
      try {
        await api(`/api/blind-box-rooms/${encodeURIComponent(state.room.id)}`, { method: 'DELETE' });
      } catch (error) {
        state.error = error.message || '暂时无法退出房间';
        setBusy(state, false);
        render(state);
        return;
      }
    }
    toCommunity();
  };

  const handleClick = (state, event) => {
    const node = event.target.closest('[data-action]');
    if (!node || node.disabled) return;
    const action = node.dataset.action;
    if (action === 'dismiss-error') { state.error = ''; render(state); }
    if (action === 'back-community') toCommunity();
    if (action === 'show-create') { state.page = 'create'; state.error = ''; render(state); }
    if (action === 'show-join') { state.page = 'join'; state.error = ''; render(state); }
    if (action === 'create-seed') createRoom(state, 'SEED');
    if (action === 'create-ai') createRoom(state, 'AI');
    if (action === 'resume' && state.room?.id) navigate(`/blind-box/${encodeURIComponent(state.room.id)}`);
    if (action === 'leave') leaveRoom(state);
    if (action === 'ask-suggested') askQuestion(state, { questionIndex: Number(node.dataset.index) });
    if (action === 'finish-discovery') finishDiscovery(state);
    if (action === 'start-recording') startRecording(state);
    if (action === 'stop-recording') stopRecording(state);
    if (action === 'submit-prompt') node.closest('form')?.requestSubmit();
    if (action === 'retry-judge') retryJudge(state);
    if (action === 'swap') swapRoom(state);
  };

  const handleSubmit = (state, event) => {
    const form = event.target;
    event.preventDefault();
    if (form.dataset.form === 'join-room') joinRoom(state, form);
    if (form.dataset.form === 'free-question') {
      const freeQuestion = String(new FormData(form).get('free-question') || '').trim();
      if (!freeQuestion) return;
      askQuestion(state, { freeQuestion });
    }
    if (form.dataset.form === 'prompt') submitPrompt(state, form);
  };

  const handleChange = (state, event) => {
    const input = event.target;
    if (input?.dataset.input === 'audio-file' && input.files?.[0]) uploadAudio(state, input.files[0], 0);
  };

  const mount = () => {
    const activeRoute = route();
    if (!activeRoute) return;
    const state = runtime();
    if (!state.shell) {
      const root = document.getElementById('root');
      if (!root) return;
      state.stylesheet = document.createElement('link');
      state.stylesheet.rel = 'stylesheet';
      state.stylesheet.href = '/blind-box-reference.css';
      document.head.appendChild(state.stylesheet);
      state.shell = document.createElement('div');
      state.shell.setAttribute('data-blind-box-reference-shell', 'true');
      root.appendChild(state.shell);
      state.shell.addEventListener('click', (event) => handleClick(state, event));
      state.shell.addEventListener('submit', (event) => handleSubmit(state, event));
      state.shell.addEventListener('change', (event) => handleChange(state, event));
    }
    render(state);
    refresh(state);
    if (!state.timer) state.timer = globalThis.setInterval(() => refresh(state, true), POLL_INTERVAL_MS);
    if (!state.routeTimer) {
      state.routeTimer = globalThis.setInterval(() => {
        if (route()) return;
        stopRecordingTimer(state);
        if (state.recorder?.state === 'recording') state.recorder.stop();
        if (state.timer) clearInterval(state.timer);
        if (state.routeTimer) clearInterval(state.routeTimer);
        state.timer = null;
        state.routeTimer = null;
        state.shell?.remove();
        state.stylesheet?.remove();
        state.shell = null;
        state.stylesheet = null;
        state.room = null;
        document.body?.removeAttribute('data-zq-blind-box-landscape');
      }, 250);
    }
  };

  const scheduleMount = () => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(mount));
  if (document.readyState === 'loading') globalThis.addEventListener('DOMContentLoaded', scheduleMount, { once: true });
  else scheduleMount();
  globalThis.setInterval(() => { if (route()) mount(); }, 250);
})();
