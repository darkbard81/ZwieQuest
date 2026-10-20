import { initProbabilitySettings } from './probability-settings.js';
export function initAdminSettings({ api, getUser, getState = () => null, onReset = () => {} }) {
  const button = document.createElement('button'); button.id = 'admin-button'; button.className = 'quiet';
  button.textContent = '관리자 설정'; button.hidden = true;
  document.querySelector('nav').insertBefore(button, document.querySelector('#help-button'));
  const dialog = document.createElement('dialog'); dialog.id = 'admin-settings';
  dialog.setAttribute('aria-labelledby', 'admin-title');
  dialog.innerHTML = `<button class="dialog-close" type="button" aria-label="관리자 설정 닫기">×</button>
    <p class="eyebrow">ACCOUNT SETTINGS</p><h2 id="admin-title">관리자 설정</h2>
    <div class="admin-tabs" role="tablist" aria-label="관리자 설정 항목"><button id="admin-tab-accounts" type="button" role="tab" aria-selected="true" aria-controls="admin-panel-accounts">계정 관리</button><button id="admin-tab-probabilities" type="button" role="tab" aria-selected="false" aria-controls="admin-panel-probabilities" tabindex="-1">확률관리</button></div>
    <section id="admin-panel-accounts" role="tabpanel" aria-labelledby="admin-tab-accounts">
    <p class="muted">계정의 모험 진행을 초기화하거나 사용하지 않는 계정을 삭제할 수 있습니다.</p>
    <div class="admin-map-actions"><button id="admin-reveal-map" type="button">내 전체 지도·체크포인트 획득</button><button id="admin-reset-maps" class="danger" type="button">지도·체크포인트 초기화</button></div>
    <div class="admin-heading"><strong id="admin-count">계정 목록</strong><button id="admin-refresh" type="button">새로고침</button></div>
    <div id="admin-status" role="status" aria-live="polite"></div><div id="admin-list"></div>
    <form id="admin-confirm" hidden><h3 id="admin-delete-title">계정 삭제 확인</h3>
      <p id="admin-confirm-description"></p>
      <label for="admin-confirm-name">대상 아이디를 정확히 입력하세요.</label>
      <input id="admin-confirm-name" autocomplete="off" autocapitalize="none" spellcheck="false" required maxlength="24">
      <div class="admin-actions"><button id="admin-cancel" type="button">취소</button><button id="admin-delete" class="danger" type="submit" disabled>계정 영구 삭제</button></div>
    </form></section>
    <section id="admin-panel-probabilities" role="tabpanel" aria-labelledby="admin-tab-probabilities" hidden></section>`;
  document.body.append(dialog);
  const find = selector => dialog.querySelector(selector);
  let probabilityEditor;
  function selectTab(name) {
    if (busy || probabilityEditor?.isBusy()) return;
    for (const id of ['accounts', 'probabilities']) {
      const selected = name === id; find(`#admin-tab-${id}`).setAttribute('aria-selected', String(selected));
      find(`#admin-tab-${id}`).tabIndex = selected ? 0 : -1; find(`#admin-panel-${id}`).hidden = !selected;
    }
    if (name === 'probabilities') { probabilityEditor ||= initProbabilitySettings({ panel: find('#admin-panel-probabilities'), api, getUser }); probabilityEditor.load(); }
  }
  for (const id of ['accounts', 'probabilities']) {
    find(`#admin-tab-${id}`).onclick = () => selectTab(id);
    find(`#admin-tab-${id}`).addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || busy || probabilityEditor?.isBusy()) return;
      event.preventDefault(); const next = event.key === 'Home' ? 'accounts' : event.key === 'End' ? 'probabilities' : id === 'accounts' ? 'probabilities' : 'accounts';
      selectTab(next); find(`#admin-tab-${next}`).focus();
    });
  }
  let target = null, busy = false, request = 0, action = 'delete', resetRequestId = null, resetProgressId = null;
  function status(text, error = false) { find('#admin-status').textContent = text; find('#admin-status').classList.toggle('error', error); }
  function cancel() { target = null; find('#admin-confirm').hidden = true; find('#admin-confirm-name').value = ''; find('#admin-delete').disabled = true; }
  function confirm(account, operation) {
    if (busy) return;
    target = account; action = operation; resetRequestId = crypto.randomUUID(); resetProgressId = getState()?.progressId; status('');
    const reset = action === 'reset', maps = action === 'maps';
    find('#admin-delete-title').textContent = account.username + (maps ? ' 지도·체크포인트를 초기화할까요?' : reset ? ' 계정을 초기화할까요?' : ' 계정을 삭제할까요?');
    find('#admin-confirm-description').textContent = maps
      ? '내 계정의 모든 지역 지도를 새로 생성하고 탐험·체크포인트 기록을 초기화합니다. 현재 이동·전투를 종료하고 새싹마을 여관에서 대기합니다. 캐릭터·성장·현재 HP·장비·금화·도감은 유지됩니다. 기존 지도는 앱에서 복구할 수 없습니다.'
      : reset
      ? '모든 캐릭터와 장비·소지품을 삭제하고 금화를 0으로 되돌립니다. 탐험·체크포인트·전투·모험 기록을 지웁니다. 로그인 정보·관리자 권한·지도 구조는 유지되며 여관에서 새 캐릭터를 생성해야 합니다. 관리자도 탐험 기록이 다시 자동 지급되지 않습니다. 앱에서 되돌릴 수 없습니다.'
      : '이 계정의 로그인 세션, 캐릭터·장비·맵·진행, 전투·모험 기록과 요청 기록을 함께 영구 삭제합니다. 앱에서 복구할 수 없습니다.';
    find('#admin-delete').textContent = maps ? '지도·체크포인트 초기화' : reset ? '계정 초기화' : '계정 영구 삭제';
    find('#admin-confirm-name').value = ''; find('#admin-delete').disabled = true;
    find('#admin-confirm').hidden = false; find('#admin-confirm-name').focus();
  }
  function render(accounts) {
    cancel(); const table = document.createElement('table'); table.className = 'admin-table';
    table.innerHTML = '<thead><tr><th scope="col">아이디 · 생성일</th><th scope="col">권한</th><th scope="col">모험가</th><th scope="col">관리</th></tr></thead><tbody></tbody>';
    for (const account of accounts) {
      const row = table.tBodies[0].insertRow(), name = row.insertCell(); name.append(document.createTextNode(account.username));
      const date = document.createElement('small'); date.textContent = new Date(account.createdAt).toLocaleDateString('ko-KR'); name.append(date);
      const role = row.insertCell(); if (account.isAdmin) { const tag = document.createElement('span'); tag.className = 'admin-role'; tag.textContent = '관리자'; role.append(tag); } else role.textContent = '일반';
      row.insertCell().textContent = account.hasCharacter ? '생성됨' : '없음';
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = account.id === getUser()?.id ? '현재 계정' : '삭제';
      remove.disabled = account.id === getUser()?.id; remove.setAttribute('aria-label', account.username + ' 계정 삭제');
      remove.onclick = () => confirm(account, 'delete');
      const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '초기화';
      reset.disabled = !account.hasCharacter; reset.setAttribute('aria-label', account.username + ' 계정 초기화');
      reset.onclick = () => confirm(account, 'reset');
      const actions = document.createElement('div'); actions.className = 'admin-row-actions'; actions.append(reset, remove);
      row.insertCell().append(actions);
    }
    find('#admin-list').replaceChildren(table); find('#admin-count').textContent = `계정 ${accounts.length}개`;
  }
  async function refresh() {
    const revision = ++request; find('#admin-refresh').disabled = true; status('계정 목록을 불러오는 중…');
    try {
      const result = await api('/api/admin/accounts');
      if (revision !== request || !getUser()?.isAdmin) return;
      render(result.accounts); status('');
    } catch (error) { if (revision === request) { status(error.message, true); find('#admin-list').replaceChildren(); cancel(); } }
    finally { if (revision === request) find('#admin-refresh').disabled = false; }
  }
  button.onclick = () => { if (!getUser()?.isAdmin) return; dialog.showModal(); selectTab('accounts'); refresh(); };
  find('#admin-reveal-map').onclick = async () => {
    if (busy || !getUser()?.isAdmin) return;
    busy = true; find('#admin-reveal-map').disabled = true;
    try {
      const result = await api('/api/command', { type: 'ADMIN_REVEAL_MAP', progressId: getState()?.progressId, requestId: crypto.randomUUID() });
      onReset(result); status('모든 지역의 탐험 기록과 체크포인트를 획득했습니다.');
    } catch (error) { status(error.message, true); }
    finally { busy = false; find('#admin-reveal-map').disabled = false; }
  };
  find('#admin-reset-maps').onclick = () => { if (getUser()?.isAdmin) confirm(getUser(), 'maps'); };
  find('#admin-refresh').onclick = () => { if (!busy) refresh(); };
  find('.dialog-close').onclick = () => { if (!busy && !probabilityEditor?.isBusy()) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (busy || probabilityEditor?.isBusy()) event.preventDefault(); });
  dialog.addEventListener('close', () => { request++; cancel(); probabilityEditor?.reset(); });
  find('#admin-cancel').onclick = () => { if (!busy) { cancel(); find('#admin-refresh').focus(); } };
  find('#admin-confirm-name').addEventListener('input', event => { find('#admin-delete').disabled = busy || !target || event.target.value !== target.username; });
  find('#admin-confirm').onsubmit = async event => {
    event.preventDefault(); if (busy || !target || find('#admin-confirm-name').value !== target.username) return;
    busy = true; find('#admin-delete').disabled = true; find('#admin-cancel').disabled = true; find('#admin-refresh').disabled = true;
    try {
      const reset = action === 'reset', maps = action === 'maps';
      const result = maps
        ? await api('/api/command', { type: 'ADMIN_RESET_MAPS', progressId: resetProgressId, confirmUsername: find('#admin-confirm-name').value, requestId: resetRequestId })
        : await api(reset ? '/api/admin/reset-account' : '/api/admin/delete-account', { userId: target.id, confirmUsername: find('#admin-confirm-name').value, ...(reset ? { requestId: resetRequestId } : {}) });
      if (reset || maps) onReset(result);
      cancel(); await refresh(); status(maps ? '지도·체크포인트를 초기화했습니다. 캐릭터와 소지품을 유지한 채 새싹마을 여관에서 대기합니다.' : result.username + (reset ? ' 계정을 캐릭터 0명·소지품 없음·금화 0으로 초기화했습니다.' : ' 계정과 연결 기록을 삭제했습니다.')); find('#admin-refresh').focus();
    } catch (error) { status(error.message, true); }
    finally {
      busy = false; find('#admin-cancel').disabled = false; find('#admin-refresh').disabled = false;
      find('#admin-delete').disabled = !target || find('#admin-confirm-name').value !== target.username;
    }
  };
  return { setUser(user) { button.hidden = !user?.isAdmin; if (!user?.isAdmin) { request++; probabilityEditor?.reset(); dialog.close(); cancel(); find('#admin-list').replaceChildren(); } } };
}
