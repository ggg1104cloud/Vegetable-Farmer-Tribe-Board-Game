/* =========================================================================
   背景音乐（BGM）—— 独立模块
   -------------------------------------------------------------------------
   与游戏逻辑**完全解耦**：这一支只关心「网页有没有打开」，跟对局状态、
   回合、谁在行动都无关。在 index.html 里单独用一个 <script type="module">
   引入，排在游戏模块之前；即使游戏脚本加载失败，这里照样能循环播放。

   行为：
   · 打开页面就尝试自动播放，并一直循环（audio.loop）。
   · 浏览器自动播放策略会拦「有声自动播放」（首次用户手势前 play() 被拒）——
     这不是 bug，是浏览器硬规定。被拒时挂**捕获阶段**的一次性手势监听，
     用户第一次点/按/触摸页面任意位置就补播，触发后立即摘掉。
     （旧实现在冒泡阶段挂监听，游戏里 stopPropagation 会把补播吃掉。）
   · 音量存 localStorage（键 cnvillage.bgm.v2），默认 50%；0% 即真静音
     （muted + pause 双保险）。
   · 对外接口：window.BGM = { setVolume, getVolume, play, pause, el, isPlaying }
     游戏的「设置」弹层只调 window.BGM.setVolume()，不碰这里的内部状态。
   ========================================================================= */
(function () {
  'use strict';

  const KEY = 'cnvillage.bgm.v2';
  const DEFAULT_VOL = 0.5;                 // 默认半音量，别一进游戏就吵到人
  const SRC = 'assets/bgm.m4a';

  const clamp = v => Math.min(1, Math.max(0, Number(v) || 0));

  /* 读音量：上次存过就用上次的，否则用默认值 */
  let vol = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && Number.isFinite(Number(raw.vol))) return clamp(raw.vol);
    } catch (e) { /* 忽略 */ }
    return DEFAULT_VOL;
  })();

  /* 复用页面里的 #bgm；没有就自建一个（模块自带元素，不依赖页面结构） */
  let el = document.getElementById('bgm');
  if (!el) {
    el = document.createElement('audio');
    el.id = 'bgm';
    el.src = SRC;
    document.documentElement.appendChild(el);
  }
  el.loop = true;
  el.preload = 'auto';
  el.setAttribute('playsinline', '');

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ vol })); } catch (e) { /* 忽略 */ }
  }

  /* 唯一的播放入口：音量 0 一律不播 */
  function play() {
    if (vol <= 0) return;
    const p = el.play();
    if (p && p.catch) p.catch(() => armGesture());   // 被自动播放策略拦下 → 等手势补播
  }

  /* 把「当前音量」落到元素上：0 = 真静音（muted + pause 双保险） */
  function apply() {
    el.volume = vol;
    if (vol <= 0) {
      el.muted = true;
      el.pause();
    } else {
      el.muted = false;
      play();
    }
  }

  /* 一次性手势监听（捕获阶段，避免被游戏里的 stopPropagation 吃掉） */
  let armed = false;
  const EVENTS = ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'];
  function armGesture() {
    if (armed) return;
    armed = true;
    const kick = () => {
      EVENTS.forEach(t => window.removeEventListener(t, kick, true));
      armed = false;
      if (vol > 0) play();
    };
    EVENTS.forEach(t => window.addEventListener(t, kick, true));
  }

  function setVolume(v) { vol = clamp(v); persist(); apply(); }
  function getVolume() { return vol; }
  function pause() { el.pause(); }
  function isPlaying() { return !el.paused; }

  window.BGM = {
    setVolume, getVolume, play, pause, isPlaying,
    get el() { return el; },
  };

  /* 打开即播（多数浏览器首次会拒，交给手势补播）；页面重新可用时再试一次 */
  apply();
  armGesture();
  el.addEventListener('canplay', () => { if (vol > 0 && el.paused) play(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && vol > 0 && el.paused) play();
  });
  window.addEventListener('focus', () => { if (vol > 0 && el.paused) play(); });
})();