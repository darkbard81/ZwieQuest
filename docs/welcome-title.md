# 환영합니다 — 타이틀 보물

## 사용 방법

가방 → 보물 → 환영합니다 → 구입 0 G. 계정마다 한 번 무료로 소장하며, 보물상자 아이콘으로 이미지를 엽니다. 모든 캐릭터가 같은 소장품을 공유하고 재접속·서버 재시작에도 유지합니다. 기존 계정에 자동 지급하지 않습니다.

뷰어는 현재 브라우저 표시 영역을 채우고 이미지는 4:3 비율을 유지하며 잘림 없이 최대 크기로 표시합니다. 이미지·여백 클릭/터치, 닫기 버튼, Esc로 닫습니다. 닫으면 상자 버튼으로 키보드 포커스를 돌려줍니다. 소장품은 장착·판매·일괄 판매 대상이 아니며, 기존 드롭 확률과 전투에는 영향을 주지 않습니다.

## 이미지

- 내장 ImageGen으로 제작. CLI/API 대체 경로는 사용하지 않았습니다.
- 1448×1086, 정확한 4:3. 중앙의 굵은 외곽선 금색 ZwieQuest 제목, 2D 애니메이션 하늘 배경, 몬스터가 대부분을 채우는 구성.
- 고스트·골렘·하피·슬라임 각각 7변형, 총 28개를 참조하고 완성본에서 모두 확인했습니다.
- 배포: `public/assets/treasures/welcome-title-v1.webp` (무손실 3,017,694 bytes). 원본 PNG와 픽셀 일치 검증.
- 원본·참조 시트·프롬프트: `art-workbench/title/welcome-v1/` (기존 정책대로 Git 제외).
- 참조는 `public/assets/monster/{ghost,golem,harpy,slime}/`의 `01-*-fire`, `02-*-cold`, `03-*-corrosion`, `04-*-lightning`, `05-*-slash`, `06-*-blunt`, `07-*-pierce` WebP 전부입니다. 원본을 종류별 시트 4장으로 묶어 도구에 전달했습니다.

## 구현 및 검증

- `src/treasures.js`: 서버 고정 가격·상품 정의, 중복 구매 방지. 클라이언트가 보내는 금액은 사용하지 않습니다.
- `src/game.js`: BUY_TREASURE 명령, 소장 목록·미구입 상품 조회, 장비·판매 명령과 분리.
- `public/treasure-view.js`, `public/app.js`, `public/index.html`, `public/style.css`: 보물 탭·기존 상자 아이콘·구입·뷰어.
- `tests/treasures.test.js`: 무료 구매, 이중 요청, 기존 저장 복원, 캐릭터 공유, 계정 격리, 가격 위조, 판매·장착·일괄 판매 제외 및 HTTP 재시작 검증.
- 전체 Node 테스트 248개 통과. 기존 가방 테스트 포함 관련 테스트 6개 통과.
- 격리 DATA_DIR·시험 계정 Chromium에서 1280×800, 360×740, 모바일 가로 740×360 검증. 구매·재접속·뷰어 크기/비율·닫기·포커스 복원·스크롤 복원 통과. 브라우저 오류 및 가로 넘침 없음.
- 브라우저 실행 기록·스크린샷: `/home/deck/Documents/Codex/2026-10-21/task/title-treasure/`. 모바일은 Chromium 터치 에뮬레이션으로 확인했으며 실제 iPhone Safari 검증은 별도입니다.

## 최종 생성 프롬프트

```text
Use case: illustration-story.
Create a finished landscape 4:3 game title illustration, ideally 2048x1536, for ZwieQuest. The FOUR input images are reference contact sheets, each showing SEVEN different monsters. Sheet 1 ghosts, sheet 2 golems, sheet 3 harpies, sheet 4 slimes. Use ALL 28 monsters once each, NOT just four representatives. Do not copy the sheets' grid, labels or pale background. Within each sheet read left-to-right top row four then bottom row three. Within each group the variants are fire orange, ice blue, corrosion green, lightning gold, slash red (harpy slash purple), blunt amber (harpy blunt cream with toy hammer), pierce purple (harpy pierce crimson).
Composition: an exuberant dense ensemble surrounding the central single-line title "ZwieQuest", exact case and spelling Z w i e Q u e s t. Very thick dark outline on large polished fantasy lettering with warm ivory-to-gold fill, legible at thumbnail scale. The title sits at the true middle, not bottom. Arrange all 28 monsters as a lively layered ring and crowd above, below, left and right of the lettering; every monster has a visible distinct face and recognizable defining elemental accessory. Keep faces unobscured, use overlapping bodies to fill the frame, larger foreground and medium background characters, avoid tiny distant characters. Monsters occupy most of the picture, roughly 80% of the non-lettering area; sky only shows through small gaps.
Backdrop: beautiful bright blue sky and soft white clouds, 2D anime background painting. Style: polished colorful 2D anime fantasy game key art matching the provided monster designs, clean ink lines, luminous cel shading, welcoming expressions and playful adventure energy. Depict humanoid monsters as adult fantasy women with their recognizable armor, wings and ghost robes; focus on faces, elemental designs and group composition. Slimes retain cute blob silhouettes. No extra people, no missing family or variant, no grid, no panels, no list labels, no border, no watermark, no other words. Full-bleed opaque illustration, exact 4:3 landscape.

```
