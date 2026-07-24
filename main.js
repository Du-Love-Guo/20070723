/* main.js */
/* 状态机与交互实现（严格按 Step 1..7 流程） */

document.addEventListener('DOMContentLoaded', () => {
  const cover = document.getElementById('cover');
  const stage = document.getElementById('stage');
  const app = document.getElementById('app');
  const candle = document.getElementById('candle');
  const flameTurb = document.getElementById('turb');
  const flameGroup = document.getElementById('flameGroup');
  const cake = document.getElementById('cake');
  const cakeFill = document.querySelector('.cake-fill');
  const envelope = document.getElementById('envelope');
  const letter = document.getElementById('letter');
  const overlay = document.getElementById('overlay');
  const paper = document.getElementById('paper');
  const paperText = document.getElementById('paperText');
  const particlesCanvas = document.getElementById('particles');

  // 状态机
  const state = {
    coverOpen: false,
    candleBlown: false,
    cakeCut: false,
    envelopeOpened: false,
    step5Done: false
  };

  // 初始场景位置（Step 1 进入会从 translateZ(-500) 到 0）
  gsap.set(stage, {z: -500});
  gsap.set([cover], {clearProps: 'all'});

  // rAF loop 用于视差与粒子（节流）
  let lastOrientation = {x:0,y:0};
  let parallaxTarget = {x:0,y:0};
  let parallaxPos = {x:0,y:0};
  const layers = Array.from(document.querySelectorAll('.layer'));

  // 粒子画布适配
  const ctx = particlesCanvas.getContext('2d');
  let particles = [];
  function resizeCanvas(){
    particlesCanvas.width = overlay.clientWidth;
    particlesCanvas.height = overlay.clientHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // 生成粒子（简单缓慢漂浮心形/点）
  function createParticles(){
    particles = [];
    for(let i=0;i<80;i++){
      particles.push({
        x: Math.random()*particlesCanvas.width,
        y: Math.random()*particlesCanvas.height,
        vx: (Math.random()-0.5)*0.2,
        vy: -0.2 - Math.random()*0.6,
        size: 1 + Math.random()*3,
        hue: 330 - Math.random()*60,
        alpha: 0.2 + Math.random()*0.6
      });
    }
  }
  createParticles();

  function drawParticles(){
    ctx.clearRect(0,0,particlesCanvas.width,particlesCanvas.height);
    ctx.globalCompositeOperation = 'lighter';
    particles.forEach(p=>{
      p.x += p.vx;
      p.y += p.vy;
      if(p.y < -20) { p.y = particlesCanvas.height + 20; p.x = Math.random()*particlesCanvas.width; }
      if(p.x < -20) p.x = particlesCanvas.width + 20;
      if(p.x > particlesCanvas.width + 20) p.x = -20;
      const g = ctx.createRadialGradient(p.x,p.y,p.size*0.1,p.x,p.y,p.size*1.8);
      g.addColorStop(0, `hsla(${p.hue},85%,65%,${p.alpha})`);
      g.addColorStop(1, `hsla(${p.hue},60%,40%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
      ctx.fill();
    });
  }

  // parallax update (lerp)
  function rafLoop(){
    // lerp parallaxPos toward parallaxTarget
    parallaxPos.x += (parallaxTarget.x - parallaxPos.x) * 0.08;
    parallaxPos.y += (parallaxTarget.y - parallaxPos.y) * 0.08;

    // apply to layers by data-speed
    layers.forEach(layer=>{
      const sp = parseFloat(layer.dataset.speed) || 0.5;
      const tx = parallaxPos.x * sp;
      const ty = parallaxPos.y * sp;
      layer.style.transform = `translate3d(${tx}px, ${ty}px, 0) translateZ(0)`;
    });

    // draw particles only when overlay shown
    if(overlay.classList.contains('active')){
      drawParticles();
    }

    requestAnimationFrame(rafLoop);
  }
  requestAnimationFrame(rafLoop);

  /* ------------------------------
     Step 1: 启幕与场景滑入
     - 监听 touchstart/end，Y轴位移 > 50px 触发
  -------------------------------*/
  let touchStartY = null;
  let touchEndY = null;
  let didRequestDevicePermission = false;

  function handleCoverTouchStart(e){
    e.preventDefault();
    touchStartY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
    // iOS deviceorientation permission request must be in user gesture:
    if(!didRequestDevicePermission && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function'){
      didRequestDevicePermission = true;
      DeviceMotionEvent.requestPermission().catch(()=>{}).then(()=>{/* ignore result; permissions handled later when event fires */});
    }
  }
  function handleCoverTouchEnd(e){
    e.preventDefault();
    touchEndY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : e.clientY;
    if(touchStartY !== null && (touchStartY - touchEndY) > 50){
      // 执行封面退出与场景弹入
      openScene();
    }
    touchStartY = touchEndY = null;
  }
  cover.addEventListener('touchstart', handleCoverTouchStart, {passive:false});
  cover.addEventListener('touchend', handleCoverTouchEnd, {passive:false});
  cover.addEventListener('pointerdown', handleCoverTouchStart, {passive:false});
  cover.addEventListener('pointerup', handleCoverTouchEnd, {passive:false});

  function openScene(){
    if(state.coverOpen) return;
    state.coverOpen = true;
    gsap.to(cover, {y:'-100%',duration:0.9,ease:'power3.inOut',onComplete:()=>{cover.style.display='none'}});
    // 3D 桌面场景弹性滑入 (translateZ -500 -> 0)
    gsap.to(stage, {z:0,duration:1.4,ease:'elastic.out(1,0.6)'});
    // 将 stage 可见于屏幕 Reader
    stage.setAttribute('aria-hidden','false');
  }

  /* ------------------------------
     Step 2: 桌面场景与2.5D视差
     - 监听 deviceorientation（支持 iOS 13+ 权限）
     - 三层以不同速度位移（已在 rafLoop 中使用 data-speed 做插值）
  -------------------------------*/
  function handleDeviceOrientation(e){
    const gamma = e.gamma || 0; // left-right
    const beta = e.beta || 0; // front-back
    // 映射角度到像素位移（限制幅度）
    const max = 30;
    const tx = Math.max(-max, Math.min(max, gamma)); // -30..30
    const ty = Math.max(-max, Math.min(max, beta-20)); // 调整基线
    parallaxTarget.x = tx;
    parallaxTarget.y = ty;
    lastOrientation = {x:tx,y:ty};
  }
  if(window.DeviceOrientationEvent){
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
  }

  /* ------------------------------
     Step 3: 吹蜡烛（长按触发）
     - pointerdown 持续 > 800ms 触发
     - 执行：SVG 火焰参数激增后 scaleY(0) 消失；场景 brightness 降至 0.7；vibrate；state.candleBlown=true
     - 锁定避免重复
  -------------------------------*/
  let longPressTimer = null;
  let pointerActive = false;

  function handlePointerDownForCandle(e){
    e.preventDefault();
    pointerActive = true;
    if(state.candleBlown) return;
    // 触摸在蜡烛区域才触发
    const target = e.target;
    if(!candle.contains(target) && !target.closest('#candle')) return;
    // [Step 3] 吹蜡烛逻辑：长按>800ms触发，锁定状态防止重复
    longPressTimer = setTimeout(()=>{ triggerBlowCandle(); }, 800);
  }

  function handlePointerUpForCandle(e){
    e.preventDefault();
    pointerActive = false;
    if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
  }

  function triggerBlowCandle(){
    if(state.candleBlown) return;
    // 动效：先让feTurbulence 激增抖动几次，再 scaleY(0) 收束消失
    const turbEl = flameTurb;
    // 激烈抖动（通过 attr.baseFrequency & parent scale）
    gsap.timeline()
      .to(turbEl, {attr:{baseFrequency: '0.09 0.18'}, duration:0.12, repeat:2, yoyo:true, ease:'power2.in'}, 0)
      .to(flameGroup, {scaleY:1.35, duration:0.12, repeat:2, yoyo:true, transformOrigin:'50% 90%'}, 0)
      .to(flameGroup, {scaleY:0, opacity:0, duration:0.35, ease:'power3.in', delay:0.42})
      .call(()=>{
        // 场景整体暗化（色温变冷）
        app.classList.add('dimmed');
        // 触发震动
        if(navigator.vibrate) navigator.vibrate([50,30,50]);
        state.candleBlown = true;
      });
  }

  // 绑定 pointer 事件（全局以避免丢失）
  document.addEventListener('pointerdown', handlePointerDownForCandle, {passive:false});
  document.addEventListener('pointerup', handlePointerUpForCandle, {passive:false});
  document.addEventListener('touchstart', handlePointerDownForCandle, {passive:false});
  document.addEventListener('touchend', handlePointerUpForCandle, {passive:false});

  /* ------------------------------
     Step 4: 切蛋糕（下滑触发）
     - 条件：state.candleBlown === true
     - 监听 touchmove，下滑位移 > 100px 触发
     - 动画：用 clip-path 平滑切开，露出夹心；vibrate；state.cakeCut=true
  -------------------------------*/
  let cutTouchStartY = null;
  function handleCutTouchStart(e){
    if(!state.candleBlown) return;
    const t = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
    cutTouchStartY = t;
  }
  function handleCutTouchMove(e){
    if(!state.candleBlown || state.cakeCut) return;
    if(cutTouchStartY === null) return;
    const t = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
    const delta = t - cutTouchStartY;
    if(delta > 100){
      // 执行切蛋糕动画
      cutCakeAnimation();
      cutTouchStartY = null;
    }
  }
  function handleCutTouchEnd(e){ cutTouchStartY = null; }
  function cutCakeAnimation(){
    // 使用 clip-path 从中线向下滑动显示夹心
    // initial: cakeFill opacity 0 -> show and animate clip-path
    cakeFill.style.opacity = '1';
    // 初始隐藏 clip: full width 0 reveal from center; We'll animate via gsap on CSS variables
    // To keep simple: animate transformY and scale, plus a pseudo clip via width/height
    gsap.fromTo(cakeFill, {scaleY:0.02, transformOrigin:'50% 0%'},{scaleY:1, duration:0.9, ease:'power2.out', onComplete:()=>{
      if(navigator.vibrate) navigator.vibrate(30);
      state.cakeCut = true;
    }});
    // 侧面略微分裂（视觉）
    gsap.to('.cake-side', {x:-8, duration:0.6, yoyo:true, repeat:1, ease:'power2.inOut'});
  }
  document.addEventListener('touchstart', handleCutTouchStart, {passive:false});
  document.addEventListener('touchmove', handleCutTouchMove, {passive:false});
  document.addEventListener('touchend', handleCutTouchEnd, {passive:false});
  document.addEventListener('pointerdown', handleCutTouchStart, {passive:false});
  document.addEventListener('pointermove', handleCutTouchMove, {passive:false});
  document.addEventListener('pointerup', handleCutTouchEnd, {passive:false});

  /* ------------------------------
     Step 5: 镜头前拉（景深控制）
     - 条件：state.cakeCut === true 且 用户点击信封
     - 动画：背景/蛋糕 scale:1.5 + blur(8px)，信封小幅放大上移
  -------------------------------*/
  function handleEnvelopeClick(e){
    e.preventDefault();
    if(!state.cakeCut) return;
    if(state.step5Done) return;
    state.step5Done = true;
    // 放大背景与中景（整体用 layer-mid .layer-bg）
    const bg = document.querySelector('.layer-bg');
    const mid = document.querySelector('.layer-mid');
    gsap.to([bg, mid], {scale:1.5, filter:'blur(8px)', duration:1.2, ease:'power2.out'});
    gsap.to(envelope, {scale:1.1, y:'-10%', duration:0.8, ease:'power3.out', onComplete: ()=>{
      // Step 6 在 Step5 完成后执行
      openEnvelope3D();
    }});
  }
  envelope.addEventListener('click', handleEnvelopeClick);
  envelope.addEventListener('touchend', handleEnvelopeClick, {passive:false});

  /* ------------------------------
     Step 6: 信件3D展开
     - Step 5 动画完成后触发
     - 信封 rotateX(180deg) 3D 翻转
     - 信纸从信封中 translateY(-100%) 抽出，带 back.out 回弹
  -------------------------------*/
  function openEnvelope3D(){
    if(state.envelopeOpened) return;
    state.envelopeOpened = true;
    // 执行翻转（翻面）
    gsap.to(envelope, {rotationX:180, transformOrigin:'center center', duration:0.9, ease:'power2.inOut', onStart:()=>{
      envelope.style.transformStyle='preserve-3d';
    }});
    // 抽出信纸
    gsap.to(letter, {y:'-100%', opacity:1, duration:0.9, ease:'back.out(1.6)', delay:0.18, onComplete:()=>{
      // 进入 Step7：祝福呈现
      presentBlessing();
    }});
  }

  /* ------------------------------
     Step 7: 祝福呈现与彩蛋
     - 全屏遮罩淡入，信纸居中
     - 祝福语逐行 staggerFrom 淡入, 带 text-shadow 墨迹晕染效果
     - 背景是缓慢流动的星云/爱心粒子（Canvas）
  -------------------------------*/
  function presentBlessing(){
    overlay.classList.add('active');
    // overlay 逐渐淡入并出现 paper
    gsap.to(overlay, {opacity:1, duration:0.6});
    gsap.to(paper, {opacity:1,y:'0%',duration:0.9,ease:'power3.out', onStart:()=>{
      resizeCanvas();
      createParticles();
    }});
    // 逐行文字淡入（staggerFrom）
    const lines = Array.from(paperText.querySelectorAll('.line'));
    gsap.fromTo(lines, {y:8,opacity:0, filter:'blur(4px)'}, {
      y:0,opacity:1,filter:'blur(0px)',stagger:0.28,duration:0.9,ease:'power2.out',onComplete:()=>{
        // 最小彩蛋淡入
        const egg = paperText.querySelector('.egg');
        gsap.to(egg, {opacity:0.18, duration:0.8});
      }
    });
    // 启动粒子渲染（overlay active 时 rafLoop 会绘制）
  }

  /* ------------------------------
     额外：为可访问性与键盘触发添加支持
  -------------------------------*/
  envelope.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' ') handleEnvelopeClick(e);
  });

  /* ------------------------------
     视觉/性能建议补强：确保 will-change 与 translateZ(0) 在关键元素
  -------------------------------*/
  [cake, stage, ...layers].forEach(el => { if(el) el.style.willChange='transform'; el.style.transform='translateZ(0)'; });

  /* 初始化：微弱悬浮的蛋糕动画以增加质感 */
  gsap.to('.cake', {y:-6, duration:3.6, yoyo:true, repeat:-1, ease:'sine.inOut', force3D:true});

  /* 注意：在 iOS/部分浏览器上，deviceorientation 可能需要用户手势后才触发 */
  // 如果用户没有倾斜设备，也允许通过鼠标移动模拟视差（桌面）
  document.addEventListener('mousemove', (e)=>{
    const cx = (e.clientX - window.innerWidth/2) / (window.innerWidth/2);
    const cy = (e.clientY - window.innerHeight/2) / (window.innerHeight/2);
    parallaxTarget.x = cx * 18;
    parallaxTarget.y = cy * 12;
  });

  // 画布与粒子循环大小调节
  setInterval(()=>{
    // 轻微更新粒子 properties for organic feel
    particles.forEach(p=>{ p.vx += (Math.random()-0.5)*0.02; p.vy += -0.01 + (Math.random()-0.5)*0.02; });
  }, 800);

  // 清理（页面卸载）
  window.addEventListener('beforeunload', ()=>{
    window.removeEventListener('deviceorientation', handleDeviceOrientation);
  });
});