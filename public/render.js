const { Assets, CanvasRenderer, Container, Graphics, Rectangle, Sprite, Text, Texture, VERSION, autoDetectRenderer } = globalThis.PIXI;

// Both backends are official PixiJS renderers. All game visuals are Pixi display objects.
export async function createWorld(container) {
  const renderer = await autoDetectRenderer({ width: 512, height: 384, resolution: 2,
    autoDensity: true, preference: ['webgl', 'canvas'], backgroundColor: 0x233f37, antialias: true });
  container.prepend(renderer.canvas);
  const stage = new Container();
  await Assets.init({ preferences: { preferWorkers: false } });
  const names = ['village', 'volcano', 'beach', 'desert', 'snow', 'icons'];
  const loaded = await Promise.all([
    ...names.map(name => Assets.load(`/assets/${name}.png`)),
    ...['warrior', 'wizard'].map(name => Assets.load(`/assets/${name}/sprite.png`)),
    ...['warrior', 'wizard'].map(name => fetch(`/assets/${name}/sprite.json`).then(response => response.json()))
  ]);
  const backgrounds = Object.fromEntries(names.slice(0, 5).map((name, i) => [name, loaded[i]]));
  const heroes = {};
  for (const [i, name] of ['warrior', 'wizard'].entries()) {
    const texture = loaded[6 + i], meta = loaded[8 + i];
    const frames = Object.fromEntries(Object.entries(meta.frames).map(([key, value]) => {
      const f = value.frame;
      return [key, new Texture({ source: texture.source, frame: new Rectangle(f.x, f.y, f.w, f.h) })];
    }));
    heroes[name] = { meta, frames };
  }
  const atlas = loaded[5], cells = Array.from({ length: 4 }, (_, i) => new Texture({
    source: atlas.source, frame: new Rectangle(i * atlas.width / 4, atlas.height / 2, atlas.width / 4, atlas.height / 2)
  }));
  const background = new Sprite(backgrounds.village);
  const shadow = new Graphics().ellipse(0, 0, 37, 7).fill({ color: 0x183d38, alpha: .22 });
  const object = new Sprite(cells[0]); object.anchor.set(.5, 1); object.visible = false;
  const hero = new Sprite(heroes.warrior.frames.Front_Attack_00);
  stage.addChild(background, shadow, object, hero);
  // One reusable label: new hits replace the old label instead of building a queue.
  const feedback = new Text({ text: '', resolution: 2, style: {
    fontFamily: ['Noto Sans KR', 'Noto Sans CJK KR', 'sans-serif'], fontSize: 40, fontWeight: '900',
    fill: '#ffffff', stroke: { color: '#10202b', width: 7, join: 'round' }, padding: 10
  } });
  feedback.anchor.set(.5); feedback.visible = false; stage.addChild(feedback);
  let feedbackAt = 0, feedbackTarget = null, feedbackCount = 0;
  const clearFeedback = () => { feedback.visible = false; feedbackTarget = null; };
  document.addEventListener('visibilitychange', clearFeedback);
  let currentAnimation = null;
  let state = null, phaseKey = '', phaseAt = performance.now(), lastOffset = 0;
  let frames = 0, framesRendered = 0, fpsAt = performance.now(), fps = 0, stopped = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); stopped = true;
    const message = document.querySelector('#render-error'); message.hidden = false;
    message.textContent = '화면 연결이 끊겼습니다. 서버 모험은 계속됩니다. 페이지를 새로고침해 주세요.';
  });
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || container.closest('.collapsed') || stopped) return;
    const s = state || { classId: 'warrior', phase: 'HOME', theme: 'village', direction: 'right', run: 0, step: 0 };
    const key = `${s.mapId}:${s.run}:${s.currentNodeId}:${s.phase}`;
    if (key !== phaseKey) { phaseKey = key; phaseAt = now; }
    const elapsed = now - phaseAt, texture = backgrounds[s.theme] || backgrounds.village;
    background.texture = texture; background.height = 384; background.width = 384 * texture.width / texture.height;
    if (s.phase === 'TRAVEL' && !reduced) lastOffset = (s.direction === 'left' ? 1 : -1) * Math.min(Math.max(0, (background.width - 512) / 2 - 4), elapsed / (s.duration || 6000) * 64);
    else if (s.phase === 'HOME' || s.phase === 'CHOICE_WAIT' || reduced) lastOffset = 0;
    background.position.set((512 - background.width) / 2 + lastOffset, 0);
    const h = heroes[s.classId], meta = h.meta;
    let action = 'Front_Attack', index = 0;
    if (s.phase === 'TRAVEL') { action = s.direction === 'left' ? 'Front_Walk' : 'Back_Walk'; index = reduced ? 0 : Math.floor(elapsed / (meta.animations[action].durationMs / 24)) % 24; }
    else if (s.phase === 'DOWNED') { action = 'Front_Downed'; index = Math.min(23, Math.floor(elapsed / 110)); }
    else if (s.phase === 'BATTLE' && s.battle?.lastHit?.actor === 'hero') { index = Math.min(23, Math.floor(Math.max(0, Date.now() - s.battle.lastHit.at) / 45)); }
    else if (s.phase === 'TREASURE' || s.phase === 'RETURN_HOME') index = s.classId === 'warrior' ? 9 : 6;
    hero.texture = h.frames[meta.animations[action].frameNames[index]];
    hero.anchor.set(meta.anchor.x / 256, meta.anchor.y / 256);
    hero.scale.set(150 / 256, 150 / 256);
    currentAnimation = { classId: s.classId, action, frame: index, mirrored: false };
    const x = s.phase === 'BATTLE' ? 194 : 245;
    const hit = s.phase === 'BATTLE' && s.battle?.lastHit?.actor === 'enemy' && Date.now() - s.battle.lastHit.at < 220;
    const bob = s.phase === 'TREASURE' && !reduced ? Math.abs(Math.sin(elapsed / 180)) * 5 : 0;
    hero.position.set(x + (hit && !reduced ? Math.sin(now / 15) * 3 : 0), 317 - bob);
    hero.tint = hit ? 0xffaaaa : 0xffffff; shadow.position.set(x, 317);
    object.visible = s.phase === 'BATTLE' || s.phase === 'TREASURE';
    if (object.visible) {
      object.texture = cells[s.phase === 'TREASURE' ? 0 : { village: 1, volcano: 2, beach: 3, desert: 2, snow: 3 }[s.theme]];
      object.width = object.height = s.enemy?.boss ? 112 : 84;
      object.position.set(374, 317 + (s.phase === 'BATTLE' && !reduced ? Math.sin(now / 280) * 3 : 0));
      object.tint = s.phase === 'BATTLE' && s.battle?.lastHit?.actor === 'hero' && Date.now() - s.battle.lastHit.at < 160 ? 0xffd4aa : 0xffffff;
    }
    if (feedback.visible) {
      const age = now - feedbackAt;
      if (age >= 950) clearFeedback();
      else {
        feedback.alpha = age <= 650 ? 1 : (950 - age) / 300;
        const halfWidth = feedback.width / 2;
        feedback.x = Math.max(12 + halfWidth, Math.min(500 - halfWidth, feedbackTarget === 'hero' ? (s.phase === 'BATTLE' ? 194 : 245) : 374));
        feedback.y = 170 - (reduced ? 0 : Math.min(18, age / 40));
      }
    }
    renderer.render({ container: stage }); frames++; framesRendered++;
    if (now - fpsAt >= 1000) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
  }
  requestAnimationFrame(frame);
  return {
    update(value) { state = value; if (!['BATTLE', 'TREASURE', 'DOWNED'].includes(value?.phase)) clearFeedback(); },
    clearFeedback,
    showHit(hit) {
      if (document.hidden || container.closest('.collapsed') || !['BATTLE', 'TREASURE', 'DOWNED'].includes(state?.phase)) return;
      if (!['hero', 'enemy'].includes(hit.actor) || !['빗나감', '스침', '명중', '치명타'].includes(hit.label)) return;
      feedback.text = hit.label;
      feedback.style.fill = ['#e7eef5', '#c6dfed', '#fff7dc', '#ffd36a'][hit.tier] || '#ffffff';
      feedbackTarget = hit.actor === 'hero' ? 'enemy' : 'hero';
      feedbackAt = performance.now(); feedback.alpha = 1; feedback.visible = true; feedbackCount++;
    },
    diagnostics() { return { engine: 'PixiJS', version: VERSION, mode: renderer instanceof CanvasRenderer ? 'pixi-canvas' : 'pixi-webgl',
      renderer: renderer.name, isPixiRenderer: renderer instanceof CanvasRenderer || renderer.name === 'webgl',
      feedback: { visible: feedback.visible, label: feedback.text, target: feedbackTarget, count: feedbackCount,
        bounds: feedback.visible ? { x: feedback.x - feedback.width / 2, y: feedback.y - feedback.height / 2, width: feedback.width, height: feedback.height } : null },
      framesRendered, animation: currentAnimation, displayObjects: stage.children.length, fps, width: renderer.canvas.width, height: renderer.canvas.height }; }
  };
}
