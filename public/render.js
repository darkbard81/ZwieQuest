import { createTravelCamera } from './travel-camera.js';
import { REGIONS } from './regions.js';
import { createHeroAnimator, sampleAnimationFrame } from './hero-animation.js';
import { innRoster } from './inn-roster.js';
import { APPEARANCES, appearanceFor, appearanceAssets, mirrorAppearance } from './appearances.js';
const { Assets, CanvasRenderer, Container, Graphics, Rectangle, Sprite, Text, Texture, VERSION, autoDetectRenderer } = globalThis.PIXI;

// Both backends are official PixiJS renderers. All game visuals are Pixi display objects.
export async function createWorld(container) {
  const renderer = await autoDetectRenderer({ width: 512, height: 384, resolution: 2,
    autoDensity: true, preference: ['webgl', 'canvas'], backgroundColor: 0x233f37, antialias: true });
  container.prepend(renderer.canvas);
  const stage = new Container();
  await Assets.init({ preferences: { preferWorkers: false } });
  const names = ['village', 'volcano', 'beach', 'desert', 'snow', 'pub', 'icons'];
  const loaded = await Promise.all([
    ...names.map(name => Assets.load(REGIONS[name]?.canvas || `/assets/${name}.png`)),
    ...APPEARANCES.map(({ id, assetVersion = 'inn-1' }) => Assets.load(`${appearanceAssets(id)}/sprite.png?v=${assetVersion}`)),
    ...APPEARANCES.map(({ id, assetVersion = 'inn-1' }) => fetch(`${appearanceAssets(id)}/sprite.json?v=${assetVersion}`).then(response => response.json()))
  ]);
  const backgrounds = Object.fromEntries(names.slice(0, -1).map((name, i) => [name, loaded[i]]));
  const heroes = {};
  for (const [i, { id: name }] of APPEARANCES.entries()) {
    const texture = loaded[names.length + i], meta = loaded[names.length + APPEARANCES.length + i];
    const frames = Object.fromEntries(Object.entries(meta.frames).map(([key, value]) => {
      const f = value.frame;
      return [key, new Texture({ source: texture.source, frame: new Rectangle(f.x, f.y, f.w, f.h) })];
    }));
    heroes[name] = { meta, frames };
  }
  const atlas = loaded[names.length - 1], cells = Array.from({ length: 4 }, (_, i) => new Texture({
    source: atlas.source, frame: new Rectangle(i * atlas.width / 4, atlas.height / 2, atlas.width / 4, atlas.height / 2)
  }));
  const background = new Sprite(backgrounds.village);
  const shadow = new Graphics().ellipse(0, 0, 50, 9).fill({ color: 0x183d38, alpha: .22 });
  const object = new Sprite(cells[0]); object.anchor.set(.5, 1); object.visible = false;
  const hero = new Sprite(heroes.warrior.frames.Front_Idle_00);
  stage.addChild(background, shadow, object, hero);
  const innGuests = Array.from({ length: 3 }, () => {
    const shade = new Graphics().ellipse(0, 0, 34, 6).fill({ color: 0x183d38, alpha: .22 });
    const sprite = new Sprite(heroes.warrior.frames.Front_Idle_00);
    shade.visible = sprite.visible = false;
    stage.addChild(shade, sprite);
    return { sprite, shade, characterId: null, frame: 0 };
  });
  // One reusable label: new hits replace the old label instead of building a queue.
  const feedback = new Text({ text: '', resolution: 2, style: {
    fontFamily: ['Noto Sans KR', 'Noto Sans CJK KR', 'sans-serif'], fontSize: 40, fontWeight: '900',
    fill: '#ffffff', stroke: { color: '#10202b', width: 7, join: 'round' }, padding: 10
  } });
  feedback.anchor.set(.5); feedback.visible = false; stage.addChild(feedback);
  let feedbackAt = 0, feedbackTarget = null, feedbackCount = 0;
  const clearFeedback = () => { feedback.visible = false; feedbackTarget = null; };
  const animator = createHeroAnimator();
  const camera = createTravelCamera();
  const clearTransient = () => { clearFeedback(); animator.clear(); };
  document.addEventListener('visibilitychange', clearTransient);
  let currentAnimation = null;
  let state = null, cameraView = null;
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
    const s = state || { appearanceId: 'warrior', phase: 'HOME', theme: 'village', direction: 'right', run: 0, step: 0 };
    const texture = s.phase === 'HOME' ? backgrounds.pub : backgrounds[s.theme] || backgrounds.village;
    background.texture = texture; background.height = 384; background.width = 384 * texture.width / texture.height;
    cameraView = camera.sample(now, background.width, reduced);
    background.position.set(cameraView.x, 0);
    const appearance = appearanceFor(s), h = heroes[appearance.id], meta = h.meta;
    const motion = animator.sample(now, reduced);
    hero.visible = shadow.visible = s.phase !== 'HOME' && !!s.activeCharacterId;
    const guests = s.phase === 'HOME' ? innRoster(s.characters) : [];
    for (const [index, view] of innGuests.entries()) {
      const guest = guests[index];
      view.sprite.visible = view.shade.visible = !!guest;
      view.characterId = guest?.id || null;
      if (!guest) continue;
      const art = heroes[appearanceFor(guest).id], m = art.meta;
      view.frame = sampleAnimationFrame('Front_Idle', now, reduced);
      view.sprite.texture = art.frames[m.animations.Front_Idle.frameNames[view.frame]];
      view.sprite.anchor.set(m.anchor.x / m.frameWidth, m.anchor.y / m.frameHeight);
      view.sprite.scale.set(guest.size / m.frameHeight);
      view.sprite.position.set(guest.x, guest.y);
      view.shade.position.set(guest.x, guest.y);
    }
    hero.texture = h.frames[meta.animations[motion.action].frameNames[motion.frame]];
    hero.anchor.set(meta.anchor.x / meta.frameWidth, meta.anchor.y / meta.frameHeight);
    const size = (s.phase === 'HOME' ? 154 : 192) / meta.frameHeight;
    hero.scale.set(mirrorAppearance(meta, motion) ? -size : size, size);
    currentAnimation = { ...motion, appearanceId: appearance.id };
    const x = ['BATTLE', 'TREASURE'].includes(s.phase) ? 166 : 245;
    const groundY = s.phase === 'HOME' ? 242 : 317;
    hero.position.set(x, groundY);
    hero.tint = motion.hurt ? 0xffdddd : 0xffffff; shadow.position.set(x, groundY);
    object.visible = s.phase === 'BATTLE' || s.phase === 'TREASURE';
    if (object.visible) {
      object.texture = cells[s.phase === 'TREASURE' ? 0 : { village: 1, volcano: 2, beach: 3, desert: 2, snow: 3 }[s.theme]];
      object.width = object.height = s.enemy?.boss ? 112 : 84;
      object.position.set(398, 317 + (s.phase === 'BATTLE' && !reduced ? Math.sin(now / 280) * 3 : 0));
      object.tint = s.phase === 'BATTLE' && s.battle?.lastHit?.actor === 'hero' && Date.now() - s.battle.lastHit.at < 160 ? 0xffd4aa : 0xffffff;
    }
    if (feedback.visible) {
      const age = now - feedbackAt;
      if (age >= 950) clearFeedback();
      else {
        feedback.alpha = age <= 650 ? 1 : (950 - age) / 300;
        const halfWidth = feedback.width / 2;
        feedback.x = Math.max(12 + halfWidth, Math.min(500 - halfWidth, feedbackTarget === 'hero' ? x : 398));
        feedback.y = (feedbackTarget === 'hero' ? 80 : 128) - (reduced ? 0 : Math.min(feedbackTarget === 'hero' ? 8 : 18, age / 40));
      }
    }
    renderer.render({ container: stage }); frames++; framesRendered++;
    if (now - fpsAt >= 1000) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
  }
  requestAnimationFrame(frame);
  return {
    update(value) { const now = performance.now(); camera.update(value, now); state = value; animator.update(value, now); if (!['BATTLE', 'TREASURE', 'DOWNED'].includes(value?.phase)) clearFeedback(); },
    clearFeedback,
    clearTransient,
    playEvents(events) {
      if (document.hidden || container.closest('.collapsed')) { clearTransient(); return; }
      animator.events(events, performance.now());
      const hit = events.filter(e => e.type === 'hit').at(-1)?.hit;
      if (hit) this.showHit(hit);
    },
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
      background: state?.phase === 'HOME' ? 'pub' : state?.theme, camera: cameraView, heroDisplay: { cellSize: state?.phase === 'HOME' ? 154 : 192, x: hero.x, y: hero.y, mirrored: hero.scale.x < 0 }, objectDisplay: { x: object.x, y: object.y, width: object.width, visible: object.visible },
      innCharacters: innGuests.filter(v => v.sprite.visible).map(v => ({ characterId: v.characterId, action: 'Front_Idle', frame: v.frame, x: v.sprite.x, y: v.sprite.y })),
      framesRendered, animation: currentAnimation, displayObjects: stage.children.length, fps, width: renderer.canvas.width, height: renderer.canvas.height }; }
  };
}
