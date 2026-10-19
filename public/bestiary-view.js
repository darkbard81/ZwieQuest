import { statLabelHTML } from './labels.js';
import { itemDetailsHTML } from './equipment-view.js';
import { REGIONS } from './regions.js';
import { monsterAssetURL } from './monster-assets.js';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const gradeNames = { normal: '일반', fine: '양질', excellent: '우수', superior: '고급', legendary: '전설' };

export function initBestiary(panel) {
  panel.innerHTML = '<div class="bestiary-heading"><h2>몬스터 도감</h2><span id="bestiary-count">0종 조우</span></div><p class="bestiary-intro">모험에서 만난 유형을 기록합니다. 아이콘을 선택해 자세히 살펴보세요.</p><p id="bestiary-empty">아직 조우한 몬스터가 없습니다.</p><div id="bestiary-grid" class="bestiary-grid"></div>';
  const grid = panel.querySelector('#bestiary-grid'), empty = panel.querySelector('#bestiary-empty');
  const dialog = document.createElement('dialog'); dialog.id = 'bestiary-dialog'; dialog.setAttribute('aria-labelledby', 'bestiary-title');
  dialog.innerHTML = '<button class="dialog-close" aria-label="몬스터 상세 닫기">×</button><p class="eyebrow">FIELD JOURNAL</p><h2 id="bestiary-title"></h2><div id="bestiary-detail"></div>';
  document.body.append(dialog);
  let entries = {}, selected = null, previousKey = '', detailKey = '';
  dialog.querySelector('.dialog-close').onclick = () => dialog.close();
  function renderDetail() {
    const entry = entries[selected];
    if (!entry) { if (dialog.open) dialog.close(); return; }
    const key = JSON.stringify(entry); if (key === detailKey) return; detailKey = key;
    const sample = entry.sample, detail = dialog.querySelector('#bestiary-detail');
    dialog.querySelector('#bestiary-title').textContent = entry.name;
    const image = monsterAssetURL(sample.img_path);
    detail.style.setProperty('--monster-image', image ? `url('${image}')` : 'none');
    const stats = ['STR','CON','DEX','PER','INT','RES','ACC','DEF','REF','FOR','WIL','PEN','AR','LB'];
    detail.innerHTML = `<div class="bestiary-lore"><p>${esc(sample.description)}</p><p>조우 ${entry.encounters}회 · 처치 ${entry.defeats}회</p></div><div class="bestiary-facts"><p class="eyebrow">최근 조우 개체</p><h3>${esc(sample.name)} <span>Lv.${sample.level}</span></h3><p class="monster-hp">최대 HP <b>${sample.maxHp}</b></p><div class="monster-stats">${stats.map(key => `<div>${statLabelHTML(key)} <b>${sample[key]}</b></div>`).join('')}</div><h4>${esc(sample.weapon.name)}</h4><p>${itemDetailsHTML(sample.weapon)}</p><h4>${esc(sample.armor.name)}</h4><p>${itemDetailsHTML(sample.armor)}</p><p>스킬: ${sample.skills.length ? sample.skills.map(skill => esc(typeof skill === 'string' ? skill : skill.name || skill.id)).join(' · ') : '없음'}</p><div class="bestiary-history"><p>발견 레벨: ${entry.minLevel === entry.maxLevel ? entry.minLevel : `${entry.minLevel}–${entry.maxLevel}`}</p><p>발견 등급: ${Object.keys(gradeNames).filter(id => entry.grades[id]).map(id => `${gradeNames[id]} ${entry.grades[id]}회`).join(' · ')}</p><p>조우 지역: ${entry.maps.map(id => esc(REGIONS[id]?.name || id)).join(' · ')}</p></div></div>`;
  }
  grid.onclick = event => {
    const button = event.target.closest('button[data-variation]'); if (!button || !entries[button.dataset.variation]) return;
    selected = button.dataset.variation; renderDetail(); dialog.showModal();
  };
  return {
    update(state) {
      entries = Object.fromEntries(Object.entries(state?.bestiary || {}).filter(([, entry]) => entry.sample));
      if (!entries[selected] && dialog.open) dialog.close();
      const rows = Object.values(entries), key = JSON.stringify(rows.map(e => [e.variationId,e.name,e.sample.icon_path,e.encounters,e.defeats]));
      if (key !== previousKey) {
        previousKey = key;
        const focused = grid.contains(document.activeElement) ? document.activeElement.dataset.variation : null;
        grid.innerHTML = rows.map(entry => `<button class="bestiary-card" type="button" data-variation="${esc(entry.variationId)}" aria-label="${esc(entry.name)} 상세 보기"><img src="${monsterAssetURL(entry.sample.icon_path)}" alt="" width="128" height="128" loading="lazy"><strong>${esc(entry.name)}</strong><small>조우 ${entry.encounters} · 처치 ${entry.defeats}</small></button>`).join('');
        if (focused) [...grid.children].find(button => button.dataset.variation === focused)?.focus();
      }
      empty.hidden = rows.length > 0;
      panel.querySelector('#bestiary-count').textContent = `${rows.length}종 조우`;
      if (dialog.open) renderDetail();
    }
  };
}
