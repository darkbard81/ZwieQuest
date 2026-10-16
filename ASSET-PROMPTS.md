# 내장 imagegen 생성 기록

모든 배경과 아이콘은 내장 `image_gen.imagegen`을 사용했습니다. 외부 유료 API, 이미지 생성 CLI, 코드 그림 대체 경로는 사용하지 않았습니다. 생성된 PNG를 프로젝트 내부에 저장하고 실제 렌더러·CSS에서 로드합니다. 캐릭터는 별도로 기존 TacticsSD 파일을 복사했습니다.

## 최종 파일과 화면 연결

| 파일 | 생성/사용 |
|---|---|
| `public/assets/village.png` | 마을/HOME의 모든 노드. 새 생성 |
| `public/assets/volcano.png` | 화산의 모든 노드. 새 생성 |
| `public/assets/snow.png` | 설원의 모든 노드. 이번 작업에서 생성한 배경 재사용 |
| `public/assets/desert.png` | 사막의 모든 노드. 이번 작업에서 생성한 배경 재사용 |
| `public/assets/beach.png` | 해변의 모든 노드. 첫 4:3 결과를 폐기하고 내장 편집 생성으로 넓은 구도 수정 |
| `public/assets/forest.png` | 초기 구현 시 생성. 최신 맵에서는 사용하지 않고 생성 원본 보존 |
| `public/assets/icons.png` | 무기·갑옷·부적·상자·몬스터. 4열×2행 투명 아틀라스 |

배경 원본은 최종 1672×940~941의 16:9 근사 비율입니다(생성기가 반환한 원본 그대로). 렌더러는 높이 384에 맞추고 좌우를 잘라 원근·세로 비율을 유지합니다. 캐릭터 발 기준 y=317이며 스크롤을 overscan 범위로 제한합니다. 이미지 자체를 코드로 그리거나 도로를 새로 합성하지 않았습니다.

## 첫 생성 프롬프트

### Forest

Use case: stylized-concept. Production game environment for ZwieQuest, a cozy autonomous anime fantasy journey. Generate one wide 16:9 2D hand-painted anime forest road background, no text, no UI, no characters, no monsters. Emerald and teal woodland frames a distant pale castle and hazy blue mountains, warm golden afternoon sunlight, painterly detailed foliage. Upper two thirds exclusively distant landscape and trees. Lower one third is a broad perfectly horizontal side-scrolling pale earthen road running straight left to right across the entire image, no path curving into depth. Ground contact line at 82 percent of image height, even flat perspective. Elegant storybook game quality, restrained rich colors, gentle atmospheric depth. Image will be cropped centrally to 4:3 and scrolled slightly horizontally. Keep sides filled. Save generated image locally for integration into project.

### Desert

Use case: stylized-concept. Production game background, one wide 16:9 2D hand-painted anime fantasy desert road. No text, UI, characters, monsters. Warm ochre canyon pillars and distant pale ruined citadel, peach sky, tiny dry shrubs and turquoise atmospheric distance. Upper two thirds is distant scenery. Lower third broad perfectly horizontal pale sandy road crossing entire frame left to right, not into distance, flat ground contact at 82 percent height. Storybook anime game art, detailed painterly rock, soft cinematic sunlight, restrained colors. Camera exactly side-view with distant backdrop, suitable for center 4:3 crop and small horizontal scroll. Keep all edges filled.

### Snow

Use case: stylized-concept. Production game environment, one wide 16:9 hand-painted 2D anime fantasy snowy road. No text, UI, characters, monsters. Snow-covered blue spruce trees frame distant silver mountains and a tiny warm-lit stone lodge, pale lavender sky, soft late-afternoon winter sunlight, cozy and hopeful. Upper two thirds exclusively landscape and distant scenery; lower third broad perfectly horizontal pale snowy road running entirely left to right across frame, not into depth. Flat foot contact at 82 percent image height. Camera and perspective appropriate for side-scrolling character on horizontal road. Rich detailed storybook painting, restrained blue and lilac with warm amber highlights. Center cropped to 4:3 in game and slightly scrolled horizontally; keep edges filled.

### Icons — transparent_background=true

Use case: stylized-concept. A production 2D anime fantasy game icon atlas with exactly eight isolated icons on a fully TRANSPARENT background. Regular grid of 4 columns and 2 rows, identical square cells, each object centered with generous transparent margin and never touching other cells. Top row from left to right: a polished silver sword with teal hilt; a wooden wizard staff with glowing violet crystal; a teal leather chest armor tunic; a golden crescent moon charm. Bottom row from left to right: an open wooden treasure chest filled with gold; a round cute emerald slime monster with little dark eyes; a round cute amber sand elemental monster with little dark eyes; a round cute pale blue ice elemental monster with little dark eyes. High quality hand-painted anime game inventory art, clean crisp silhouettes, soft dimensional shading, ornate but readable at small size. Eight different isolated subjects, no text, no labels, no border, no checkerboard, no background decoration. Output square atlas, exact equal 4 by 2 grid cell placement.

반환된 아이콘 아틀라스는 실제로 1774×887이며 정방 셀 4×2로 정상 배치되어 있습니다. 이미지 알파를 그대로 유지합니다.

## 최신 맵 추가 생성

마을·화산·해변의 실제 생성 프롬프트와 해변 최종 편집 프롬프트는 `public/assets/new-generation-prompts.json`에 저장했습니다. 해변 편집은 처음 생성된 로컬 PNG를 확인한 뒤 참조 이미지로 전달했습니다. 최종 파일만 런타임에서 사용합니다.

## 원본 캐릭터 매핑

- 출처: `/home/deck/Documents/TacticsSD/game/assets/video-character-sprites/{warrior,wizard}/{sprite.png,sprite.json}`.
- 복사본: `public/assets/{warrior,wizard}/`.
- IDLE: `Front_Attack_00`. WALK: `Front_Walk` 전체 24프레임, 원본 재생 시간, 좌측 이동은 반전.
- DOWNED: `Front_Downed` 0~23. 보상 제스처: 전사 `Front_Attack_09`, 마법사 `Front_Attack_06`.
- 원본에는 측면 걷기와 양팔 만세가 없습니다. 이는 정식 측면/만세 스프라이트의 대체 완료를 의미하지 않습니다.
- 파일별 SHA-256과 원본 동일성은 `public/assets/manifest.json`에 기록합니다.
