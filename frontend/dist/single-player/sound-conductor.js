(function (global) {
  'use strict';
  global.ZhiquSinglePlayerGames = global.ZhiquSinglePlayerGames || {};
  var active = { context: null, nodes: [], timer: null, playing: false, button: null };

  function stop() {
    active.nodes.forEach(function (node) {
      try { node.stop(); } catch (error) { /* already stopped */ }
    });
    active.nodes = [];
    global.clearTimeout(active.timer);
    active.timer = null;
    active.playing = false;
    if (active.button) {
      active.button.textContent = '▶';
      active.button.setAttribute('aria-label', '播放本局乐段');
    }
  }

  function frequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function waveform(family) {
    if (family === 'PERCUSSION') return 'square';
    if (family === 'WOODWIND') return 'sine';
    if (family === 'STRINGS') return 'sawtooth';
    return 'triangle';
  }

  function play(sequence, volume, button) {
    stop();
    var AudioContext = global.AudioContext || global.webkitAudioContext;
    if (!AudioContext) return;
    active.context = active.context || new AudioContext();
    if (active.context.state === 'suspended') active.context.resume();
    var cursor = active.context.currentTime + .05;
    var secondsPerBeat = 60 / Number(sequence.tempo || 90);
    var strength = sequence.dynamics === 'STRONG' ? .18 : sequence.dynamics === 'SOFT' ? .07 : .12;
    (sequence.notes || []).forEach(function (note) {
      var duration = Math.max(.05, Number(note.beats || 1) * secondsPerBeat);
      var oscillator = active.context.createOscillator();
      var gain = active.context.createGain();
      oscillator.type = waveform(sequence.instrumentFamily);
      oscillator.frequency.value = frequency(Number(note.midi || 60));
      gain.gain.setValueAtTime(.001, cursor);
      gain.gain.linearRampToValueAtTime(strength * volume, cursor + .02);
      gain.gain.setValueAtTime(strength * volume, Math.max(cursor + .02, cursor + duration - .04));
      gain.gain.linearRampToValueAtTime(.001, cursor + duration);
      oscillator.connect(gain);
      gain.connect(active.context.destination);
      oscillator.start(cursor);
      oscillator.stop(cursor + duration + .02);
      active.nodes.push(oscillator);
      cursor += duration;
    });
    active.playing = true;
    active.button = button;
    button.textContent = 'Ⅱ';
    button.setAttribute('aria-label', '暂停本局乐段');
    active.timer = global.setTimeout(stop, Math.max(100, (cursor - active.context.currentTime) * 1000));
  }

  function soundPanel(container, sequence) {
    var section = document.createElement('section');
    section.className = 'sp-sound-panel';
    var controls = document.createElement('div');
    controls.className = 'sp-sound-controls';
    var playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'sp-icon-button';
    playButton.textContent = '▶';
    playButton.setAttribute('aria-label', '播放本局乐段');
    var repeatButton = document.createElement('button');
    repeatButton.type = 'button';
    repeatButton.className = 'sp-icon-button';
    repeatButton.textContent = '↻';
    repeatButton.setAttribute('aria-label', '从头重复本局乐段');
    var volumeLabel = document.createElement('label');
    volumeLabel.className = 'sp-volume';
    volumeLabel.textContent = '音量';
    var volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '0.7';
    volume.step = '0.05';
    volume.value = '0.35';
    volume.setAttribute('aria-label', '乐段音量');
    volumeLabel.appendChild(volume);
    playButton.addEventListener('click', function () {
      if (active.playing) stop();
      else play(sequence, Number(volume.value), playButton);
    });
    repeatButton.addEventListener('click', function () { play(sequence, Number(volume.value), playButton); });
    controls.appendChild(playButton);
    controls.appendChild(repeatButton);
    controls.appendChild(volumeLabel);
    section.appendChild(controls);

    var rhythm = document.createElement('div');
    rhythm.className = 'sp-rhythm';
    rhythm.setAttribute('aria-hidden', 'true');
    (sequence.notes || []).slice(0, 12).forEach(function (note, index) {
      var bar = document.createElement('span');
      bar.style.height = Math.min(68, 16 + Number(note.beats || 1) * 18) + 'px';
      bar.title = '第 ' + (index + 1) + ' 个音，' + note.beats + ' 拍';
      rhythm.appendChild(bar);
    });
    section.appendChild(rhythm);
    var text = document.createElement('p');
    text.className = 'sp-sound-text';
    text.textContent = '文字替代：每分钟 ' + sequence.tempo + ' 拍，' +
      (sequence.dynamics === 'SOFT' ? '力度轻' : sequence.dynamics === 'STRONG' ? '力度强' : '力度中等') +
      '，' + sequence.meter + ' 拍一组，主要音色族 ' + sequence.instrumentFamily + '。';
    section.appendChild(text);
    container.appendChild(section);
  }

  function renderDemo(container, demo) {
    soundPanel(container, demo.sequence || {});
    var feedback = document.createElement('section');
    feedback.className = 'sp-feedback';
    feedback.innerHTML = '<h2>示范发现</h2><p></p>';
    feedback.querySelector('p').textContent = demo.explanation || '速度、力度和音色是可以观察的证据，感受可以不止一种。';
    container.appendChild(feedback);
  }

  function renderRound(container, round, context) {
    soundPanel(container, round.sequence || {});
    context.renderOptions(container, round.options || []);
  }

  global.addEventListener('pagehide', stop);
  global.ZhiquSinglePlayerGames['sound-conductor'] = {
    renderDemo: renderDemo,
    renderRound: renderRound,
    stop: stop
  };
})(globalThis);
