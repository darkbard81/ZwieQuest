# Mastery icon validation — 2026-10-21

숙련 12종 아이콘을 내장 `image_gen`의 개별 호출 12회로 생성했다. 서로 다른 프롬프트 3개씩 병렬 실행했으며 CLI/API 이미지 생성 대체는 사용하지 않았다. 프롬프트, 원본/런타임 경로, SHA256, 크기는 [mastery-image-prompts.json](./mastery-image-prompts.json)에 기록했다.

- 최종 자산: `public/assets/skills/<id>-v1.webp`, 12개, 모두 256×256 RGB WebP.
- 원본: `art-workbench/mastery-icons/originals/<id>-v1.png`, 12개, 모두 1254×1254 RGB PNG. 원본은 수정 없이 보관했다. `art-workbench/`는 기존 `.gitignore`에 따라 추적되지 않는다.
- 변환: `cwebp -resize 256 256 -q 90 -m 6`. 자르기·배경 제거·그림 합성 없이 축소 및 압축만 적용했다.
- 런타임 합계 331,730바이트(약 324 KiB). 원본 합계 30,583,132바이트 대비 98.92% 감소.
- 검사: 12/12 파일 디코딩, RGB 불투명 형식, 256px 정사각형 크기, 원본/런타임 SHA256 기록 일치, 런타임 고유 해시 검사 통과. 누락·실패·차단 없음.

## 시각 검수

실제 런타임 WebP의 256px 및 40px 축소본을 배치한 `art-workbench/mastery-icons/contact-sheet.jpg`를 직접 검수했다. 모든 이미지에 불투명 배경이 있으며 UI 테두리·읽을 수 있는 글자·워터마크가 없다. 중앙 장비 모티프는 40px에서도 구분된다.

| ID | 확인한 모티프 |
| --- | --- |
| light-weapon-mastery | 교차한 레이피어와 단검 |
| sword-mastery | 균형 잡힌 은빛 롱소드 |
| axe-mastery | 넓은 날의 손도끼 |
| mace-mastery | 둔중한 금속 메이스 |
| spear-mastery | 가늘고 긴 자루와 단순한 창날 |
| polearm-mastery | 도끼날·윗창날·뒤갈고리가 있는 할버드 |
| heavy-weapon-mastery | 넓고 육중한 양손 대검 |
| staff-mastery | 불꽃과 냉기 기운을 두른 보석 지팡이 |
| cloth-armor-mastery | 보라색 천 로브 |
| light-armor-mastery | 갈색 가죽과 교차 끈의 경갑 |
| medium-armor-mastery | 사슬갑옷 위 부분 흉갑 |
| heavy-armor-mastery | 큰 견갑과 목 보호대를 갖춘 판금갑옷 |

시각 검수는 파일 및 축소 가독성을 확인한 것이다. 게임의 ON/OFF 표시와 실제 로딩은 통합 UI 검증 범위다. 이 자산 작업은 게임 코드·운영 서버·계정 데이터·기존 이미지를 변경하지 않았고 커밋·푸시하지 않았다.
