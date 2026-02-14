// @ts-nocheck
const container = document.getElementById('container');
const particleStage = document.getElementById('particle-stage');
const centerLoader = document.getElementById('center-loader');
const textDisplay = document.getElementById('text-display');
const btnLeft = document.getElementById('btn-left');
const btnInput = document.getElementById('btn-input');
const streamLoader = document.getElementById('stream-loader');

// Icons
const iconClose = document.getElementById('icon-close');
const iconCopy = document.getElementById('icon-copy');
const iconCheck = document.getElementById('icon-check');

// 数据状态
let fullTextData = ''; // 后端接收到的完整数据
let visualText = ''; // 屏幕上当前显示的动画数据

let isTaskFinished = false;
let isClosing = false;
let isTyping = false;
let isRendering = false; // 是否正在执行动画循环

let shutdownTimer = null;
let animationTimer = null;
let isDarkMode = false;

// --- 核心：打字机动画循环 ---
function renderLoop() {
  // 如果显示的文字少于接收到的文字，继续渲染
  if (visualText.length < fullTextData.length) {
    isRendering = true;

    // 确保UI已切换到显示状态
    if (centerLoader.style.display !== 'none') {
      centerLoader.style.display = 'none';
      textDisplay.classList.add('visible');
      streamLoader.style.display = 'block';
    }

    // 动态步长算法：积压越多，跑得越快，保证流畅且不卡顿
    const lag = fullTextData.length - visualText.length;
    const step = Math.max(1, Math.ceil(lag / 5));

    // 追加文本
    visualText += fullTextData.substr(visualText.length, step);

    // 更新 DOM
    textDisplay.textContent = visualText.replace(/[\r\n]+/g, ' ');
    textDisplay.scrollLeft = textDisplay.scrollWidth; // 自动跟随滚动

    requestAnimationFrame(renderLoop);
  } else {
    isRendering = false;
    // 如果任务已完成且动画已播放完毕，确保加载圈隐藏
    if (isTaskFinished) {
      streamLoader.style.display = 'none';
    }
  }
}

if (window.preload && window.preload.receiveMsg) {
  // 1. 初始化配置
  window.preload.receiveMsg((data) => {
    const { config } = data;
    isDarkMode = config.isDarkMode;
    if (isDarkMode) document.documentElement.classList.add('dark');

    // 初始状态：显示中间加载点
    if (centerLoader.style.display !== 'none') {
      centerLoader.style.display = 'none';
      textDisplay.classList.add('visible');
      streamLoader.style.display = 'block';
    }
  });

  // 2. 监听流式数据
  if (window.preload.onStreamUpdate) {
    window.preload.onStreamUpdate((data) => {
      const { type, payload } = data;

      if (type === 'chunk') {
        // 仅累加数据，不直接操作DOM，交给 renderLoop
        fullTextData += payload;
        if (!isRendering) renderLoop();
      } else if (type === 'done') {
        handleTaskFinish(); // 标记完成
      } else if (type === 'error') {
        // 错误情况直接显示，不走动画
        fullTextData = payload;
        visualText = fullTextData;
        handleTaskFinish(true);
      }
    });
  }
}

function handleTaskFinish(isError = false) {
  isTaskFinished = true;

  if (isError) {
    textDisplay.textContent = fullTextData;
    textDisplay.style.color = 'var(--error-color)';
    centerLoader.style.display = 'none';
    streamLoader.style.display = 'none';
  } else {
    // 如果动画已经追平，立即隐藏加载圈；否则 renderLoop 会在追平后隐藏它
    if (!isRendering) {
      streamLoader.style.display = 'none';
    }
  }

  // 切换 UI 状态 -> 完成 (金边内闪烁)
  container.classList.add('finished');

  // 左侧按钮：从 Close 变为 Copy
  btnLeft.classList.remove('close');
  btnLeft.classList.add('copy');
  btnLeft.title = '复制并关闭';

  iconClose.classList.remove('icon-visible');
  iconClose.classList.add('icon-hidden');
  iconCopy.classList.remove('icon-hidden');
  iconCopy.classList.add('icon-visible');

  // 自动复制完整文本
  window.api.copyText(fullTextData);
  checkShutdownLogic();
}

function checkShutdownLogic() {
  if (!isTaskFinished || isClosing || isTyping) return;
  if (!document.hasFocus()) {
    startCountdown();
  }
}

function startCountdown() {
  if (shutdownTimer) clearTimeout(shutdownTimer);
  if (isTyping) return;

  console.log('Start 3s countdown...');
  shutdownTimer = setTimeout(() => {
    playCloseAnimation();
  }, 3000);
}

function playCloseAnimation() {
  if (isClosing) return;
  isClosing = true;

  spawnParticles();
  container.classList.add('vanish'); // 触发CSS瞬间消失

  animationTimer = setTimeout(() => {
    window.api.closeWindow({ x: window.screenX, y: window.screenY });
  }, 1000);
}

function restoreWindow() {
  console.log('Interrupted! Restoring...');
  if (shutdownTimer) clearTimeout(shutdownTimer);
  if (animationTimer) clearTimeout(animationTimer);
  shutdownTimer = null;
  animationTimer = null;
  isClosing = false;

  container.classList.remove('vanish');
  particleStage.innerHTML = '';
}

window.addEventListener('blur', () => {
  if (isTaskFinished && !isClosing && !isTyping) {
    startCountdown();
  }
});

window.addEventListener('focus', restoreWindow);
document.addEventListener('mousedown', restoreWindow);

// 左侧按钮逻辑
btnLeft.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!isTaskFinished) {
    // 未完成 -> 关闭
    playCloseAnimation();
  } else {
    // 已完成 -> 复制并关闭
    window.api.copyText(fullTextData);

    // 勾选动画
    iconCopy.classList.remove('icon-visible');
    iconCopy.classList.add('icon-hidden');
    iconCheck.classList.remove('icon-hidden');
    iconCheck.classList.add('icon-visible');

    playCloseAnimation();
  }
});

// --- 右侧输入按钮逻辑 ---

// 1. 拖拽开始
btnInput.addEventListener('dragstart', (e) => {
  e.dataTransfer.setData('text/plain', fullTextData);
  btnInput.classList.add('dragging');
  restoreWindow();
  isTyping = true; // 锁定状态，防止失焦关闭
});

// 2. 拖拽结束 -> 立即输入 -> 延时关闭
btnInput.addEventListener('dragend', (e) => {
  btnInput.classList.remove('dragging');

  // if (window.api.typeText) {
  //     window.api.typeText(fullTextData);
  // }
  setTimeout(() => {
    isTyping = false;
    playCloseAnimation();
  }, 1000);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') playCloseAnimation();
});

// ================= 粒子特效 (最终修正版) =================

function spawnParticles() {
  const rect = container.getBoundingClientRect();
  // 减少粒子数量，避免过于拥挤导致视觉溢出感
  const particleCount = 150;

  // 【关键】安全内边距：确保粒子生成在圆角矩形内部
  const paddingX = 15;
  const paddingY = 5;

  const spawnW = rect.width - paddingX * 2;
  const spawnH = rect.height - paddingY * 2;

  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement('div');
    p.classList.add('particle');

    // 随机生成坐标（在安全区域内）
    const offsetX = Math.random() * spawnW + paddingX;
    const offsetY = Math.random() * spawnH + paddingY;

    const startX = rect.left + offsetX;
    const startY = rect.top + offsetY;

    p.style.left = startX + 'px';
    p.style.top = startY + 'px';

    // 【关键】极小的位移（抖动），最大仅 2px
    // 确保粒子不会飞出狭窄的窗口可视区域
    const jitter = 2;
    const tx = (Math.random() - 0.5) * jitter * 2;
    const ty = (Math.random() - 0.5) * jitter * 2;

    p.style.setProperty('--tx', tx + 'px');
    p.style.setProperty('--ty', ty + 'px');

    // 统一动画时长，快速消失
    const duration = 0.3 + Math.random() * 0.2;
    // 深色浅色统一使用缩小消失动画
    p.style.animation = `particle-implode ${duration}s ease-out forwards`;

    if (isDarkMode) {
      // --- 深色模式：煤灰 ---
      const size = 4 + Math.random() * 4;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.borderRadius = '50%';

      const randC = Math.random();
      if (randC > 0.6) p.style.backgroundColor = 'var(--p-color-1)';
      else if (randC > 0.3) p.style.backgroundColor = 'var(--p-color-2)';
      else p.style.backgroundColor = 'var(--p-color-3)';
    } else {
      // --- 浅色模式：碎片 ---
      const size = 5 + Math.random() * 6;
      p.style.width = size + 'px';
      p.style.height = size + 'px';

      if (Math.random() > 0.5) {
        p.style.borderRadius = '2px'; // 方形碎片
      } else {
        p.style.borderRadius = '50%';
      }

      const randC = Math.random();
      if (randC > 0.6) p.style.backgroundColor = 'var(--p-color-1)';
      else if (randC > 0.2) p.style.backgroundColor = 'var(--p-color-2)';
      else p.style.backgroundColor = 'var(--p-color-3)';
    }

    particleStage.appendChild(p);
  }
}
