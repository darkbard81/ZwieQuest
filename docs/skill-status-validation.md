# 18개 스킬·36종 상태 적용 검증

2026-10-21, Steam Deck `/home/deck/Documents/ZwieQuest`에서 구현·검증했습니다. 기존 미커밋 작업은 보존했고 커밋·푸시는 하지 않았습니다.

## 적용 결과

- 네 방어별 공격 2개(8), 능력치별 강화 6개, 회복·반사된 형상·정화·해제 4개. 상세 목록은 [skills.md](skills.md).
- 강화/약화 36종과 상쇄·단계 보정·저항/취약·주기 효과·행동 제어를 구현했습니다. [status-effects.md](status-effects.md).
- 별도 스킬 쿨다운을 폐지했습니다. 클릭 → 다음 개인 행동에 예약 → 실행 시 재검증 → 일반 공격 대신 한 번 발동 → 횟수 차감 → 예약 해제 순입니다. 사용 불가능해진 예약은 비용 없이 취소하고 일반 공격합니다.
- 모든 지속시간은 발동 시 INT 1당 +5%, 최소 기본 시간의 25%입니다. 쿨다운 폐지로 Acute는 부여 약화 지속시간 +25%로 대체했습니다.
- 보물상자는 기존 금화와 현재 캐릭터의 미습득 스킬 1개를 확정 지급합니다. 기본 회복 외 17개를 획득하며, 전부 배웠으면 금화만 지급합니다. 자동 장착하지 않습니다.
- 새 몬스터에는 종류별 스킬 1개를 배정하고 세 번째 행동부터 일반 공격 대신 전투당 1회 사용합니다. 기존 저장된 적은 소급 변경하지 않습니다.
- 생성 아이콘 18개를 게임에 연결했습니다. 배경이 있는 256×256 WebP, 총 495,110바이트입니다. 이미지 하위 에이전트가 최적화·40px 검수 및 [기록](skill-image-prompts.json)을 담당했습니다.

## 변경 파일

| 영역 | 파일 |
| --- | --- |
| 데이터 | `data-templates/skills.json`, `data-templates/status-effects.json` |
| 상태·전투·습득 | `src/status-effects.js`, `src/skills.js`, `src/combat.js`, `src/game.js`, `src/monsters.js` |
| 표시·연출 | `public/skills-view.js`, `public/style.css`, `public/index.html`, `public/app.js`, `public/labels.js`, `public/combat-feedback.js`, `public/combat-log.js`, `public/hero-animation.js`, `public/monster-animation.js`, `public/render.js` |
| 아이콘 | `public/assets/skills/*-v1.webp` 18개 |
| 테스트 | `tests/status-skills.test.js` 추가, 기존 예약·스킬 제한·HTTP·행동속도·캐릭터 이관·보물상자·무기 이관 테스트 갱신 |
| 문서 | `README.md`, `docs/skills.md`, `docs/status-effects.md`, `docs/combat-rules.md`, `docs/characters.md`, 이미지 프롬프트·검수 기록, 본 문서 |

## 코드 검증

최종 `npm test`: **220개 통과, 0개 실패**. `git diff --check` 및 핵심 모듈 구문 검사도 통과했습니다.

검증에는 예약/중복 요청/서로 다른 탭/재시작, 쿨다운 제거, 전투당 횟수, 36종 속성/특수 효과, 네 방어, 명중 등급 한 단계 전환, 상쇄/승격/저항, 정화/해제, 매혹/지배, 방해/면역, 주기 회복/횟수 복구, 상태 만료와 행동 동률, 온라인/오프라인·불규칙 틱·이벤트 처리 상한, CON 최대 HP 내림과 평면 HP 보존, 상자 중복 방지, 몬스터의 제한 사용을 포함합니다.

최종 로그: `/home/deck/Documents/Codex/2026-10-21/task/status-skill-validation/full-tests.txt`.

## 실제 브라우저 검증

운영 데이터와 분리한 임시 SQLite DB·테스트 계정·localhost 서버에서 Chromium/Playwright를 사용했습니다. 1280×800, 390×844, 360×740 세 해상도에서 통과했습니다.

- 생성 이미지 18개 목록 및 장착 아이콘 로딩.
- 세 번 클릭/터치해도 요청 1개, 예약 표시와 다른 스킬 차단.
- 다음 행동에 공격 스킬 한 번만 실행, 일반 공격과 중복 없음, 횟수 소진과 예약 해제.
- 적 Hobbled 표시, 본인 반사된 형상 +30과 남은 시간 표시.
- 화면 밖 가로 넘침·플레이필드와 조작부 겹침 없음, 긴 상태 이름 적용 후에도 6개 버튼 최소 너비 30px/높이 40px 유지.
- 브라우저 JavaScript 오류 없음.

검수 중 발견한 모바일 버튼 압축과 빈 타이머 오버레이로 아이콘이 어두워지는 문제를 수정하고 세 해상도 모두 다시 검증했습니다. 최초 테스트 대기는 임시 계정 상태 INSERT 누락 때문이었으며 테스트 준비 코드를 수정했습니다.

스크립트·결과·스크린샷: `/home/deck/Documents/Codex/2026-10-21/task/status-skill-ui-qa/`.

## 운영 적용

요청된 정상 운영 절차로 `zwiequest-game.service`를 재시작했습니다. 최종 PID 1814547, `active/running`을 확인했습니다. 최종 HTTPS `/api/health`는 HTTP 200과 `{"ok":true}`를 반환했습니다. HTTP 제공 아이콘 18개와 UI 소스는 작업 파일의 SHA256과 일치했습니다. HTTPS 확인은 로컬에서 실제 도메인과 인증서를 사용해 역방향 프록시를 통과하는 방식입니다. 외부 네트워크 경로까지 별도로 검증한 것은 아닙니다.

사용자는 게임을 새로고침한 뒤 기존 캐릭터로 검수할 수 있습니다. 새 스킬은 보물상자에서 획득합니다. 운영 계정에 테스트용 스킬·능력치·재화를 지급하지 않았습니다.

## 남은 범위

차단·승인 대기·불확실한 실행 결과는 없습니다. 첫 목록은 단일 대상 전투용이며 36종 상태 모두를 직접 부여하는 스킬 목록은 아닙니다. 처리 기반은 모두 구현했고 이후 목록으로 확장할 수 있습니다. 장기 수치 밸런스는 실제 플레이 검수가 필요합니다. 별도 배포·커밋·푸시는 수행하지 않았습니다.
