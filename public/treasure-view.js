const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function treasureCardHTML(item, owned = true) {
  const action = owned ? `<span class="treasure-owned">소장 중</span>` : `<button data-action="BUY_TREASURE" data-treasure-id="${esc(item.id)}">구입 ${item.price} G</button>`;
  const icon = '<span class="icon chest" aria-hidden="true"></span>';
  return `<article class="item treasure-item">${owned ? `<button class="item-icon treasure-open" data-open-treasure="${esc(item.id)}" aria-label="${esc(item.name)} 타이틀 이미지 보기" title="${esc(item.name)} 크게 보기">${icon}</button>` : `<div class="item-icon">${icon}</div>`}<div><div class="item-heading"><h3>${esc(item.name)}</h3><div class="item-actions">${action}</div></div><p>${esc(item.description)}<br>계정 공용 소장품</p></div></article>`;
}
export function initTreasureViewer() {
  const dialog = document.createElement('dialog');
  dialog.id = 'treasure-viewer';
  dialog.setAttribute('aria-label', '환영합니다 타이틀 이미지');
  dialog.innerHTML = '<img alt="몬스터들이 ZwieQuest를 둘러싼 환영 타이틀" draggable="false"><button type="button" class="treasure-close" aria-label="이미지 닫기">×</button><span class="treasure-viewer-hint">클릭·터치 또는 Esc로 닫기</span><p class="treasure-image-error" role="status" hidden>이미지를 불러오지 못했습니다. 닫은 뒤 다시 열어 주세요.</p>';
  document.body.append(dialog);
  const img = dialog.querySelector('img'), error = dialog.querySelector('.treasure-image-error');
  let originId = null;
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('click', close);
  img.addEventListener('error', () => { error.hidden = false; });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('treasure-viewer-open');
    img.removeAttribute('src');
    const trigger = [...document.querySelectorAll('[data-open-treasure]')].find(b => b.dataset.openTreasure === originId);
    trigger?.focus({ preventScroll: true });
  });
  return {
    open(item) {
      if (item?.slot !== 'treasure' || !/^\/assets\/treasures\/[a-z0-9-]+\.webp$/.test(item.imagePath)) return;
      originId = item.id;
      error.hidden = true;
      img.src = item.imagePath;
      if (!dialog.open) dialog.showModal();
      document.documentElement.classList.add('treasure-viewer-open');
    },
    close
  };
}
