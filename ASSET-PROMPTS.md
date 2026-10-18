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

## 현재 캐릭터 스프라이트

사용자가 제공한 Fighter/Wizard 정면·측면 Base 이미지를 Grok native `image_to_video`로 각각 6초·480p 영상으로 만들었습니다. 정면 Idle·Victory, 측면 Walk·Attack·Down·Hit의 여섯 동작에서 각각 24프레임을 추출했습니다. Fighter Attack은 빈손 타격, Wizard Attack은 빈손 주문 시전입니다. Wizard의 왼쪽 측면 Base는 영상 입력 복사본에서만 좌우 반전했습니다.

- 입력 원본과 생성 프롬프트·영상·개별 시트: `art-workbench/sprites/Fighter/animations-20261016T010827Z/`, `art-workbench/sprites/Wizard/animations-20261016T022431Z/` (Git 제외).
- 런타임: `public/assets/{warrior,wizard}/{sprite.png,sprite.json,portrait.png}`.
- 합본: 2048×4608, 8열×18행, 256×256 RGBA 셀. 기존 128px 시트를 확대한 것이 아니라 보존된 544×544·24fps 영상의 원본 프레임에서 재추출했습니다.
- 작업 산출물: `art-workbench/sprites/reextracted-256-20261016/`의 클래스별 6개 시트·GIF·합본과 `preview.html`. 재현 스크립트와 원본 프레임 번호는 같은 폴더에 보관합니다.
- 걷기는 반복되는 한 주기를 선택했습니다(전사 110–134, 마법사 39–70, 0-based). 공격 도입부의 회전을 제외하고 실제 타격·시전 구간을 골랐습니다. 승리 동작은 팔을 들고 내리는 전환에 더 많은 프레임을 배정했습니다.
- 프레임별 크기 변경 없이 클래스 공통 배율과 동작별 고정 발 기준점을 사용합니다. 마법사 시전과 전사 승리 영상의 확대 차이는 동작 전체에 한 가지 고정 배율을 적용해 보정합니다. 마젠타 배경을 분리하고 경계 색만 보정하여 보라색 의상의 불필요한 투명화를 방지했습니다.
- 288개 셀의 프레임 수·알파·잘림 검사, 원본 타임라인과 추출 시트 검수, 밝고 어두운 배경의 4배 확대 가장자리 검수 및 실제 브라우저 재생 검증을 수행했습니다. `quality.json`과 `evidence/sprite-hq-20261016/`에 결과를 보관합니다.
- 원본 생성 영상의 신체·의상 형태 변화와 전사 Idle의 가벼운 발 움직임은 남습니다. Wizard 정면·측면 Base의 의상·머리 장식 차이와 승리 영상의 작은 반짝임도 유지합니다. 재추출만으로 원본 영상에 없는 세부 묘사를 복구하지는 않습니다.
