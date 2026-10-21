const lootLabels={weaponWeight:'무기',armorWeight:'방어구',charmWeight:'액세서리',skillWeight:'스킬'};
// Largest remainders keep the displayed whole-percent partition at exactly 100.
// Existing raw weights are preserved until a loot boundary is actually edited.
export function lootBoundaries(probabilities) {
  const values=Object.keys(lootLabels).map(k=>probabilities[k]??1),total=values.reduce((a,b)=>a+b,0);
  const exact=values.map(v=>v*100/total), shares=exact.map(Math.floor);
  const order=exact.map((v,i)=>({i,remainder:v-shares[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  for(let i=0,remaining=100-shares.reduce((a,b)=>a+b,0);i<remaining;i++)shares[order[i].i]++;
  return [shares[0],shares[0]+shares[1],shares[0]+shares[1]+shares[2]];
}
export function lootWeights([weapon,armor,charm]) {
  return {weaponWeight:weapon,armorWeight:armor-weapon,charmWeight:charm-armor,skillWeight:100-charm};
}
export function initProbabilitySettings({ panel, api, getUser }) {
  panel.innerHTML = `<form id="probability-form"><div class="admin-scroll"><p class="muted">모든 계정에 적용되는 확률입니다. 확률과 종류 비율을 조절한 뒤 확정을 눌러 적용하세요.</p>
      <fieldset disabled>
        <section class="probability-card"><h3>탐험</h3><p class="probability-help">일반 경로 도착 시 한 번 추첨합니다. 보스·출구·막다른 길은 제외합니다.</p>
          <div class="probability-legend"><span class="probability-battle">전투 <output id="probability-battle-value">20%</output></span><span class="probability-treasure">보물 <output id="probability-treasure-value">5%</output></span><span class="probability-pass">통과 <output id="probability-pass-value">75%</output></span></div>
          <div class="exploration-slider"><div class="exploration-track" aria-hidden="true"></div><input id="probability-battle" type="range" min="0" max="100" step="1" value="20" aria-label="전투 구간 끝"><input id="probability-treasure" type="range" min="0" max="100" step="1" value="25" aria-label="보물 구간 끝"></div>
          <p class="probability-help">위 손잡이: 전투 구간 · 아래 손잡이: 보물 구간<br>남은 구간은 통과이며, 합계는 항상 100%입니다.</p>
        </section>
        <section class="probability-card"><div class="probability-heading"><h3><label for="probability-drop">장비·스킬 획득</label></h3><output id="probability-drop-value" for="probability-drop">25%</output></div>
          <input id="probability-drop" type="range" min="0" max="100" step="1" value="25">
          <p class="probability-help">일반 몬스터·보스 처치와 보물상자에 동일하게 적용합니다. 성공 시 아래 비율로 한 종류를 추첨합니다. 등급·특수 옵션 확률은 유지됩니다.</p>
        </section>
        <section class="probability-card"><h3>획득 종류 비율</h3><p class="probability-help">획득에 성공했을 때의 종류별 비중입니다. 기본은 각각 25%이며 1% 단위로 조절합니다.</p>
          <div class="probability-legend loot-legend">${Object.entries(lootLabels).map(([key,label])=>`<span class="loot-${key}">${label} <output id="probability-${key}-value">25%</output></span>`).join('')}</div>
          <div class="exploration-slider loot-slider"><div class="exploration-track loot-track" aria-hidden="true"></div><input id="loot-weapon-end" type="range" min="0" max="100" step="1" value="25" aria-label="무기 구간 끝"><input id="loot-armor-end" type="range" min="0" max="100" step="1" value="50" aria-label="방어구 구간 끝"><input id="loot-charm-end" type="range" min="0" max="100" step="1" value="75" aria-label="액세서리 구간 끝"></div>
          <p class="probability-help">위 손잡이: 무기 · 가운데: 방어구 · 아래: 액세서리<br>남은 구간은 스킬이며, 합계는 항상 100%입니다. 경계를 겹치면 해당 종류가 0%가 됩니다. 스킬은 미습득 목록에서 추첨하며, 모두 습득했으면 추가 지급 없이 종료합니다.</p>
        </section>
      </fieldset></div><footer class="admin-dialog-footer">
      <p id="probability-current" class="probability-help"></p><p id="probability-status" role="status" aria-live="polite"></p>
      <div class="admin-actions"><button id="probability-reload" type="button">다시 불러오기</button><button id="probability-confirm" class="primary" type="submit" disabled>확정</button></div>
    </footer></form>`;
  const find = s => panel.querySelector(s), form = find('#probability-form'), fieldset = find('fieldset');
  const a = find('#probability-battle'), b = find('#probability-treasure'), drop = find('#probability-drop');
  const edges=['weapon','armor','charm'].map(k=>find(`#loot-${k}-end`));
  let editedWeights=null;
  let saved = null, pending = false, loading = false, generation = 0, requestId = null;
  const draft = () => ({ battlePercent: Number(a.value), treasurePercent: Number(b.value) - Number(a.value), passPercent: 100 - Number(b.value), dropPercent: Number(drop.value), ...(editedWeights || Object.fromEntries(Object.keys(lootLabels).map(k=>[k,saved?.probabilities[k] ?? 1]))) });
  const dirty = () => saved && Object.entries(draft()).some(([k,v]) => v !== saved.probabilities[k]);
  function status(message, error = false) { find('#probability-status').textContent = message; find('#probability-status').classList.toggle('error', error); }
  function controls() { fieldset.disabled = pending || loading || !saved; find('#probability-reload').disabled = pending || loading; find('#probability-confirm').disabled = pending || loading || !dirty(); }
  function paint() {
    const p = draft();
    for (const [key,value] of [['battle',p.battlePercent],['treasure',p.treasurePercent],['pass',p.passPercent],['drop',p.dropPercent]]) find(`#probability-${key}-value`).textContent = `${value}%`;
    find('.exploration-slider').style.setProperty('--battle-end', `${a.value}%`); find('.exploration-slider').style.setProperty('--treasure-end', `${b.value}%`);
    a.setAttribute('aria-valuetext', `전투 ${p.battlePercent}%, 보물 ${p.treasurePercent}%, 통과 ${p.passPercent}%`);
    b.setAttribute('aria-valuetext', `보물 구간 끝 ${b.value}%, 보물 ${p.treasurePercent}%, 통과 ${p.passPercent}%`);
    const shares=lootWeights(edges.map(input=>Number(input.value)));
    for(const k of Object.keys(lootLabels)) find(`#probability-${k}-value`).textContent=`${shares[k]}%`;
    const slider=find('.loot-slider');
    edges.forEach((input,index)=>{
      slider.style.setProperty(['--weapon-end','--armor-end','--charm-end'][index], `${input.value}%`);
      input.setAttribute('aria-valuetext', `${input.value}%, 무기 ${shares.weaponWeight}%, 방어구 ${shares.armorWeight}%, 액세서리 ${shares.charmWeight}%, 스킬 ${shares.skillWeight}%`);
    });
    controls();
  }
  function showSaved(result) {
    saved = result; requestId = null; editedWeights=null; const p = result.probabilities;
    a.value = p.battlePercent; b.value = p.battlePercent + p.treasurePercent; drop.value = p.dropPercent; lootBoundaries(p).forEach((value,index)=>edges[index].value=value);
    find('#probability-current').textContent = `현재 적용: 전투 ${p.battlePercent}% · 보물 ${p.treasurePercent}% · 통과 ${p.passPercent}% / 획득 ${p.dropPercent}% · 무기:방어구:액세서리:스킬 ${Object.keys(lootLabels).map(k=>p[k]).join(':')}`;
    paint();
  }
  for (const input of [a,b,drop,...edges]) input.addEventListener('input', () => {
    if (input === a) a.value = Math.min(Number(a.value), Number(b.value));
    if (input === b) b.value = Math.max(Number(a.value), Number(b.value));
    const index=edges.indexOf(input);
    if(index>=0){input.value=Math.max(index>0?Number(edges[index-1].value):0, Math.min(Number(input.value),index<2?Number(edges[index+1].value):100));editedWeights=lootWeights(edges.map(edge=>Number(edge.value)));}
    requestId = null; paint(); status(dirty() ? '아직 적용되지 않았습니다. 확정을 눌러 저장하세요.' : '현재 적용값과 같습니다.');
  });
  async function load() {
    if (pending || !getUser()?.isAdmin) return;
    const token = ++generation; loading = true; saved = null; controls(); status('현재 확률을 불러오는 중…');
    try { const result = await api('/api/admin/probabilities'); if (token !== generation || !getUser()?.isAdmin) return; showSaved(result); status('확정하면 이후의 새 탐험·드롭 추첨부터 적용됩니다.'); }
    catch (error) { if (token === generation) status(error.message, true); }
    finally { if (token === generation) { loading = false; controls(); } }
  }
  find('#probability-reload').onclick = load;
  form.onsubmit = async event => {
    event.preventDefault(); if (pending || loading || !dirty() || !getUser()?.isAdmin) return;
    const token = generation; pending = true; requestId ||= crypto.randomUUID(); controls(); status('확률을 적용하는 중…');
    try {
      const result = await api('/api/admin/probabilities', { revision: saved.revision, probabilities: draft(), requestId });
      if (token !== generation || !getUser()?.isAdmin) return;
      showSaved(result); status('확정한 확률을 모든 계정에 적용했습니다.');
    } catch (error) { if (token === generation) status(error.message, true); }
    finally { pending = false; controls(); }
  };
  return { load, isBusy: () => pending, reset() { generation++; saved = null; loading = false; requestId = null; controls(); } };
}
