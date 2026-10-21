# 스킬 목록과 실행 규칙

`data-templates/skills.json`(schemaVersion 3)에 활성 스킬 18개를 정의합니다. 상태 정의는 [상태 효과 36종](status-effects.md), 아이콘 기록은 [생성 기록](skill-image-prompts.json)을 참고하세요.

## 첫 적용 목록

기본 지속시간은 아래 표와 같고, **모두 발동 시 INT 1당 +5%**를 적용합니다(최소 25%). 공격 스킬은 장착 무기의 피해 타입·기본 피해를 사용하고 판정 방어만 지정한 값으로 바꿉니다. Miss/Graze도 발동한 공격 1회를 소비하되 상태는 Hit/Crit에만 적용합니다.

| 이름 / ID | 판정·효과 | 기본 시간 | 전투당 |
| --- | --- | --- | --- |
| 무력화 / `hamstring` | ACC vs FOR, 피해 +25%, PEN +2, Hobbled | 15초 | 1 |
| 눈찌르기 / `eye-gouge` | ACC vs REF, 피해 +25%, ACC +10, Blinded | 15초 | 1 |
| 충격의 일격 / `staggering-blow` | ACC vs DEF, 피해 +25%, Dazed | 15초 | 1 |
| 위압의 일격 / `intimidating-strike` | ACC vs DEF, 무기 피해, Terrified | 15초 | 1 |
| 발목 묶기 / `binding-strike` | ACC vs REF, 피해 +25%, Immobilized | 15초 | 1 |
| 쇠약의 일격 / `weakening-strike` | ACC vs FOR, 피해 +25%, Weakened | 15초 | 1 |
| 정신 교란 / `mind-fog` | ACC vs WIL, 무기 피해, Charmed | 15초 | 1 |
| 공포의 속삭임 / `dread-whisper` | ACC vs WIL, 피해 +25%, Frightened | 15초 | 1 |
| 완력 고양 / `might-inspiration` | 자신에게 Tenacious(STR 2단계) | 30초 | 1 |
| 체질 고양 / `constitution-inspiration` | 자신에게 Hardy(CON 2단계) | 30초 | 1 |
| 민첩 고양 / `dexterity-inspiration` | 자신에게 Nimble(DEX 2단계) | 30초 | 1 |
| 지각 고양 / `perception-inspiration` | 자신에게 Aware(PER 2단계) | 30초 | 1 |
| 지능 고양 / `intellect-inspiration` | 자신에게 Acute(INT 2단계) | 30초 | 1 |
| 용맹한 결의 / `resolve-inspiration` | 자신에게 Courageous(RES 3단계) | 30초 | 1 |
| 회복 / `heal` | 최대 HP × (10% + INT × 5%), 받는 회복 보정 적용 | 즉시 | 2 |
| 반사된 형상 / `mirrored-image` | 자신 DEF +30, 적의 Hit/Crit마다 −10 | 60초 | 1 |
| 정화 / `purify` | 자신의 모든 Debuff 제거 | 즉시 | 1 |
| 해제 / `dispel` | 적의 모든 Buff 및 반사된 형상 제거 | 즉시 | 1 |

용맹한 결의를 먼저 사용한 뒤 다른 강화 스킬을 사용하면 그 강화는 3단계로 적용됩니다. 여섯 능력치 강화는 해당 능력치 약화를 상쇄할 수 있습니다. 상쇄 시 강화 자체는 남지 않습니다. 매혹·지배 중에는 본인 정화를 예약할 수 없으며 이미 예약한 정화도 취소됩니다.

## 실행·획득

- **별도 회복시간/쿨다운 없음.** DEX는 캐릭터의 다음 행동 간격에만 영향을 줍니다. 최대 6개 장착, 한 행동에 스킬 1개, 전투당 횟수 제한은 유지합니다.
- 클릭은 다음 행동에 예약만 합니다. 준비도와 체력/사용 횟수는 그대로입니다. 다음 행동에서 일반 공격 대신 한 번 발동하고 예약을 비웁니다. 같은 요청 재전송·다른 탭·중복 클릭으로 추가 발동하지 않습니다.
- 예약과 실제 발동 시 소유·장착·정의 활성·생존·전투/캐릭터/개인 행동 순번·매혹/지배·남은 횟수를 검사합니다. 회복은 회복 가능량, 정화/해제는 제거 대상 존재 여부도 양쪽에서 확인합니다.
- 실행 때 조건을 잃으면 비용 없이 취소하고 일반 공격합니다. 실행 가능한 공격은 빗나가거나 상태가 저항/상쇄되어도 사용 횟수를 차감합니다. 지속시간과 보정은 실제 발동 시의 능력치로 결정합니다.
- 반사된 형상은 피격 Hit/Crit마다 10을 잃고 0이면 제거합니다. Miss/Graze·자기 공격은 감소시키지 않습니다. 다시 적용하면 보너스 30, 지속시간은 긴 값을 유지합니다.
- 보물상자는 기존 금화와 함께 **현재 캐릭터가 미습득한 획득 대상 스킬 중 1개를 균등 추첨하여 확정 습득**합니다. 중복 지급·자동 장착·판매는 없습니다. 전부 배웠으면 금화만 지급합니다.
- 회복은 기존대로 기본 습득·처음 슬롯 1 장착입니다. 신규 17개는 상자에서 얻습니다. 캐릭터별 습득 목록과 6개 장착 슬롯은 저장되며 다른 캐릭터와 공유하지 않습니다.
- 기존 `skillCooldowns`는 불러올 때 빈 객체로 정리하며 더 이상 게임 판정이나 UI에 사용하지 않습니다. 기존 스킬·장착·횟수·예약은 보존합니다. 비활성 `dagger-mastery` 항목은 호환성을 위해 남기고 신규 지급하지 않습니다.
- 예약, 상태, 주기 회복, 횟수 복구 모두 같은 게임 시간 스케줄러에서 처리합니다. 온라인 1배·오프라인 2배, 서버 정지 중에는 정지합니다. 사망/전투 종료에 예약·상태를 제거하고 새 전투에서 횟수를 초기화합니다.

## 몬스터

새로 생성한 슬라임은 쇠약의 일격, 골렘은 체질 고양, 하피는 발목 묶기, 유령은 정신 교란을 가집니다. 세 번째 개인 행동부터 사용할 수 있는 스킬을 일반 공격 대신 사용하며 전투당 1회입니다. 보스도 해당 종류의 계획을 따릅니다. 기존 저장된 전투의 적에게는 소급 지급하지 않습니다. 몬스터 공격도 명중 방어·상태 성공 조건·INT 지속시간·매혹/지배·상쇄·저항 규칙이 같습니다.

## 데이터 관리

`id`는 저장 식별자로 유지합니다. `enabled`, `grantOnCreate`, `equipByDefault`, `treasureDrop`, `useContexts`, `activationMode`, `perBattleLimit`이 획득·장착·사용 정책입니다. `iconPath`는 `/assets/skills/<id>-v1.webp` 형태의 로컬 이미지입니다.

`effect.type`은 `attack`, `status`, `heal`, `mirror`, `cleanse`, `dispel`을 지원합니다. 공격은 `defense`, `damageMultiplier`, `accuracyBonus`, `penetrationBonus`, `statusId`, `durationMs`를 사용합니다. 상태 부여는 `statusId`, `durationMs`, 반사된 형상은 `durationMs`, 회복은 `maxHpRate`, `intelligenceRate`를 사용합니다. 시간 단위는 ms이며 수식 문자열을 실행하지 않습니다. 기존 `accuracyBonus` 유지형은 호환 처리합니다. `toggleConsumesCycle:false`인 단검숙련 ON/OFF 정책은 유지합니다.

상태 정의의 `modifiers`는 이전 단계 효과까지 포함한 완전한 목록입니다. 상위 단계가 아래 단계의 능력치를 중복 합산하지 않습니다. 정의 변경은 정상 서버 재시작 후 적용됩니다.

## 검증과 범위

`npm test`는 임시 DB HTTP 회귀를 포함합니다. `tests/status-skills.test.js`는 36종 정의, 18개 목록, 네 방어, 단계/상쇄/저항, 명중 전환, 제어, 타이머·저장·오프라인, 상자 중복 방지, 몬스터 계획을 검사합니다.

첫 목록은 단일 대상 전투용이며 광역/파티/지면 이동 효과는 추가하지 않습니다. Raw 피해는 기존 규칙대로 고정 피해여서 일반 피해 증폭을 적용하지 않습니다. 36종 처리 기반 중 첫 목록에서 직접 부여하지 않는 상태도 테스트하며 이후 스킬 정의로 확장할 수 있습니다. 수치의 장기 밸런스는 실제 플레이 검수가 필요합니다.
