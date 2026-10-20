export function initProbabilitySettings({ panel, api, getUser }) {
  panel.innerHTML = `<form id="probability-form"><div class="admin-scroll"><p class="muted">모든 계정에 적용되는 확률입니다. 슬라이더를 조절한 뒤 확정을 눌러 적용하세요.</p>
      <fieldset disabled>
        <section class="probability-card"><h3>탐험</h3><p class="probability-help">일반 경로 도착 시 한 번 추첨합니다. 보스·출구·막다른 길은 제외합니다.</p>
          <div class="probability-legend"><span class="probability-battle">전투 <output id="probability-battle-value">20%</output></span><span class="probability-treasure">보물 <output id="probability-treasure-value">5%</output></span><span class="probability-pass">통과 <output id="probability-pass-value">75%</output></span></div>
          <div class="exploration-slider"><div class="exploration-track" aria-hidden="true"></div><input id="probability-battle" type="range" min="0" max="100" step="1" value="20" aria-label="전투 구간 끝"><input id="probability-treasure" type="range" min="0" max="100" step="1" value="25" aria-label="보물 구간 끝"></div>
          <p class="probability-help">위 손잡이: 전투 구간 · 아래 손잡이: 보물 구간<br>남은 구간은 통과이며, 합계는 항상 100%입니다.</p>
        </section>
        <section class="probability-card"><div class="probability-heading"><h3><label for="probability-drop">장비 획득</label></h3><output id="probability-drop-value" for="probability-drop">25%</output></div>
          <input id="probability-drop" type="range" min="0" max="100" step="1" value="25">
          <p class="probability-help">모든 레벨의 일반 몬스터·보스 처치 시 적용합니다. 보물 상자는 제외합니다. 장비 종류·등급·특수 옵션 확률은 유지됩니다.</p>
        </section>
      </fieldset></div><footer class="admin-dialog-footer">
      <p id="probability-current" class="probability-help"></p><p id="probability-status" role="status" aria-live="polite"></p>
      <div class="admin-actions"><button id="probability-reload" type="button">다시 불러오기</button><button id="probability-confirm" class="primary" type="submit" disabled>확정</button></div>
    </footer></form>`;
  const find = s => panel.querySelector(s), form = find('#probability-form'), fieldset = find('fieldset');
  const a = find('#probability-battle'), b = find('#probability-treasure'), drop = find('#probability-drop');
  let saved = null, pending = false, loading = false, generation = 0, requestId = null;
  const draft = () => ({ battlePercent: Number(a.value), treasurePercent: Number(b.value) - Number(a.value), passPercent: 100 - Number(b.value), dropPercent: Number(drop.value) });
  const dirty = () => saved && Object.entries(draft()).some(([k,v]) => v !== saved.probabilities[k]);
  function status(message, error = false) { find('#probability-status').textContent = message; find('#probability-status').classList.toggle('error', error); }
  function controls() { fieldset.disabled = pending || loading || !saved; find('#probability-reload').disabled = pending || loading; find('#probability-confirm').disabled = pending || loading || !dirty(); }
  function paint() {
    const p = draft();
    for (const [key,value] of [['battle',p.battlePercent],['treasure',p.treasurePercent],['pass',p.passPercent],['drop',p.dropPercent]]) find(`#probability-${key}-value`).textContent = `${value}%`;
    find('.exploration-slider').style.setProperty('--battle-end', `${a.value}%`); find('.exploration-slider').style.setProperty('--treasure-end', `${b.value}%`);
    a.setAttribute('aria-valuetext', `전투 ${p.battlePercent}%, 보물 ${p.treasurePercent}%, 통과 ${p.passPercent}%`);
    b.setAttribute('aria-valuetext', `보물 구간 끝 ${b.value}%, 보물 ${p.treasurePercent}%, 통과 ${p.passPercent}%`);
    controls();
  }
  function showSaved(result) {
    saved = result; requestId = null; const p = result.probabilities;
    a.value = p.battlePercent; b.value = p.battlePercent + p.treasurePercent; drop.value = p.dropPercent;
    find('#probability-current').textContent = `현재 적용: 전투 ${p.battlePercent}% · 보물 ${p.treasurePercent}% · 통과 ${p.passPercent}% / 장비 ${p.dropPercent}%`;
    paint();
  }
  for (const input of [a,b,drop]) input.addEventListener('input', () => {
    if (input === a) a.value = Math.min(Number(a.value), Number(b.value));
    if (input === b) b.value = Math.max(Number(a.value), Number(b.value));
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
