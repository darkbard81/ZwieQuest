# ZwieQuest 사이트 아이콘

기존 평행사변형 테두리와 Z를 바탕으로 만든 금색 그라데이션 벡터 로고입니다. 글꼴 의존성을 없애기 위해 모든 모양을 SVG path로 작성했습니다. 페이지 제목 옆 기존 로고는 유지합니다.

- `public/favicon.svg`: 브라우저용 벡터 원본, 64×64 viewBox, 투명한 바깥 영역과 짙은 녹색 내부.
- `public/favicon.ico`: 16·32·48px 호환 아이콘.
- `public/favicon-32x32.png`: 32px PNG 대체 아이콘.
- `public/assets/brand/home-icon.svg`: 홈 화면용 512×512 벡터 원본.
- `public/apple-touch-icon.png`: 180×180 불투명 RGB PNG. 녹색 배경과 충분한 여백을 포함하며 모서리는 원본에서 둥글게 자르지 않습니다.

`index.html`에서 각 아이콘 및 홈 화면 제목 ZwieQuest를 연결합니다. 홈 화면 아이콘은 Apple의 apple-touch-icon 규칙을 따릅니다: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html

PNG와 ICO는 벡터를 Chromium으로 512px 렌더링하고 Lanczos 축소하여 생성했습니다. 로고 변경 시 두 SVG를 함께 수정하고 출력 이미지를 재생성한 뒤 HTML의 아이콘 버전을 올립니다.

검증: 격리 서버에서 네 아이콘 URL의 HTTP 200·MIME, HTML 링크, 실제 Chromium의 16/32/48/64px 밝은·어두운 배경과 홈 화면 모서리 미리보기를 확인했습니다. PNG 크기·불투명도와 ICO 내장 크기도 확인했습니다. 기존 서버 HTTP 통합 테스트 1개 통과. 실제 iPhone 기기의 홈 화면 추가는 이 환경에서 검증하지 못했습니다.

검증 이미지와 실행 기록: `/home/deck/Documents/Codex/2026-10-21/task/favicon-qa/`.
