# 내장 imagegen 생성 기록

모든 배경과 아이콘은 내장 `image_gen.imagegen`을 사용했습니다. 외부 유료 API, 이미지 생성 CLI, 코드 그림 대체 경로는 사용하지 않았습니다. 생성된 PNG를 프로젝트 내부에 저장하고 실제 렌더러·CSS에서 로드합니다. 캐릭터는 별도로 기존 TacticsSD 파일을 복사했습니다.

## 최종 파일과 화면 연결

| 파일 | 생성/사용 |
|---|---|
| `public/assets/village.png` | 마을/HOME의 모든 노드. 새 생성 |
| `public/assets/volcano.png` | 화산의 모든 노드. 새 생성 |
| `public/assets/snow.png` | 설원의 모든 노드. 이번 작업에서 생성한 배경 재사용 |
| `public/assets/desert.png` | 산성 호수의 모든 노드. 2026-10-18 교체 |
| `public/assets/beach.png` | 낙뢰 고원의 모든 노드. 2026-10-18 교체 |
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

## Region refresh 20261018

내장 `image_gen.imagegen`으로 캔버스 2장과 경로 지도 4장을 생성했습니다. 캔버스는 기존 desert/beach를 구도·화풍 참조로, 경로 지도는 기존 village-route를 화풍 참조로 사용했습니다. 모두 RGB PNG이며 생성 원본이 요청 규격과 일치하여 크기 변경 없이 복사했습니다. 기존 파일명과 맵 ID는 저장 호환성을 위해 유지합니다. 새싹마을 경로 지도와 마을·분화구·설원·여관 캔버스는 유지합니다. 교체 전 원본과 작업 기록은 Git 제외된 `art-workbench/backgrounds/region-refresh-20261018/`에 보관합니다.

### acid-lake-canvas

최종 파일: `public/assets/desert.png` (1672×940, RGB PNG).

```text
Use case: stylized-concept. Asset type: production panoramic background for a 2D SD anime fantasy RPG gameplay canvas. Create a NEW environment illustration, wide approximately 16:9 composition, opaque RGB. Input image 1 is STYLE AND CAMERA COMPOSITION REFERENCE ONLY, not an edit target: match its polished hand-painted 2D anime landscape rendering, softened outlines, detailed distant scenery and open foreground stage, but create the requested new biome. Eye-level scenic side view with distant horizon. Keep the lower third as a broad, dry, flat horizontal ground plane where small characters will walk and fight; the hero feet are at about 82% image height. Foreground must continue across the full width and remain walkable and uncluttered at all horizontal pan positions. Distant scenery above the ground, atmospheric depth, readable background behind small sprites. No characters, monsters, buildings, UI, text, labels, icons, route lines, frames or watermark. Primary request: Acid Lake (산성 호수). A fantasy corrosive lake with softly luminous yellow-green water, pale mineral deposits along the shoreline, eroded gray rocky banks and distant ridges, subtle rising vapour, subdued overcast light. Distinctly acidic mineral water rather than clear ocean water or a sandy desert. The lower foreground is a safe dry gray mineral shore, not liquid; keep the main water surface in the middle distance. Do not copy the reference desert cliffs, ruins, arches or sunset. Final target size 1672x940.
```

### thunder-plateau-canvas

최종 파일: `public/assets/beach.png` (1672×941, RGB PNG).

```text
Use case: stylized-concept. Asset type: production panoramic background for a 2D SD anime fantasy RPG gameplay canvas. Create a NEW environment illustration, wide approximately 16:9 composition, opaque RGB. Input image 1 is STYLE AND CAMERA COMPOSITION REFERENCE ONLY, not an edit target: match its polished hand-painted 2D anime landscape rendering, softened outlines, detailed distant scenery and open foreground stage, but create the requested new biome. Eye-level scenic side view with distant horizon. Keep the lower third as a broad, dry, flat horizontal ground plane where small characters will walk and fight; the hero feet are at about 82% image height. Foreground must continue across the full width and remain walkable and uncluttered at all horizontal pan positions. Distant scenery above the ground, atmospheric depth, readable background behind small sprites. No characters, monsters, buildings, UI, text, labels, icons, route lines, frames or watermark. Primary request: Lightning Plateau (낙뢰 고원). A windswept elevated rocky grassland with layered highland mesas, weathered stone ridges and sparse short grass, distant storm clouds and a few visible slender lightning forks in the far sky. Cool storm daylight with readable softly lit ground; dramatic but compatible with charming SD anime characters. This is an inland high plateau, not a beach: no sea, ocean, sand beach, lighthouse or tropical vegetation. Lower third is a broad flat rocky grassland stage. Final target size 1672x941.
```

### crimson-crater-route

최종 파일: `public/assets/maps/volcano-route-v1.png` (1536×1024, RGB PNG).

```text
Use case: stylized-concept. Asset type: production environment backdrop for a scrollable route-map UI in a 2D SD anime fantasy RPG. Create a NEW 1536x1024 landscape illustration, exact 3:2 aspect ratio, opaque RGB. Input image 1 is STYLE AND TOP-VIEW CAMERA REFERENCE ONLY, not an edit target. Match its hand-painted 2D SD anime style, soft clean linework, simplified chunky terrain, detailed but gentle natural textures. True vertical TOP-DOWN 90-degree overhead orthographic plan view, no horizon, no sky, no isometric tilt, no visible vertical front facades. Most of the central area must be spacious, quiet and low contrast for an independent route-node overlay; terrain details should be concentrated around the perimeter. No route network, connecting paths, markers, circles, symbols, arrows, labels, text, UI, compass, borders, characters, monsters, buildings or watermark. Primary request: Crimson Crater (홍련 분화구). A volcanic crater region viewed straight down, with rounded dark volcanic rocks and weathered crater rims around the outer area, a few restrained glowing crimson lava fissures and pools at the perimeter, and a broad calm ash-and-basalt central floor. Use charcoal earth and muted warm volcanic tones, with lava as small accents so the route overlay remains readable. Not a village; no vegetation fields or houses.
```

### white-night-snowfield-route

최종 파일: `public/assets/maps/snow-route-v1.png` (1536×1024, RGB PNG).

```text
Use case: stylized-concept. Asset type: production environment backdrop for a scrollable route-map UI in a 2D SD anime fantasy RPG. Create a NEW 1536x1024 landscape illustration, exact 3:2 aspect ratio, opaque RGB. Input image 1 is STYLE AND TOP-VIEW CAMERA REFERENCE ONLY, not an edit target. Match its hand-painted 2D SD anime style, soft clean linework, simplified chunky terrain, detailed but gentle natural textures. True vertical TOP-DOWN 90-degree overhead orthographic plan view, no horizon, no sky, no isometric tilt, no visible vertical front facades. Most of the central area must be spacious, quiet and low contrast for an independent route-node overlay; terrain details should be concentrated around the perimeter. No route network, connecting paths, markers, circles, symbols, arrows, labels, text, UI, compass, borders, characters, monsters, buildings or watermark. Primary request: White Night Snowfield (백야 설원). A broad softly lit snowfield under pale lingering midnight-sun light, viewed straight down; snowy boulders, frost-covered conifer canopy tops, a few quiet frozen pools and snow drifts around the edges. The central area is smooth gently textured snow with subtle cool shadows. Soft pale blue-white and light lavender shadows, calm northern atmosphere, no night sky or horizon, no strong glare, no footprints or drawn trails.
```

### acid-lake-route

최종 파일: `public/assets/maps/desert-route-v1.png` (1536×1024, RGB PNG).

```text
Use case: stylized-concept. Asset type: production environment backdrop for a scrollable route-map UI in a 2D SD anime fantasy RPG. Create a NEW 1536x1024 landscape illustration, exact 3:2 aspect ratio, opaque RGB. Input image 1 is STYLE AND TOP-VIEW CAMERA REFERENCE ONLY, not an edit target. Match its hand-painted 2D SD anime style, soft clean linework, simplified chunky terrain, detailed but gentle natural textures. True vertical TOP-DOWN 90-degree overhead orthographic plan view, no horizon, no sky, no isometric tilt, no visible vertical front facades. Most of the central area must be spacious, quiet and low contrast for an independent route-node overlay; terrain details should be concentrated around the perimeter. No route network, connecting paths, markers, circles, symbols, arrows, labels, text, UI, compass, borders, characters, monsters, buildings or watermark. Primary request: Acid Lake (산성 호수). A corrosive mineral lake basin viewed straight down, with irregular yellow-green acidic pools around the perimeter, pale sulfur-like mineral rims, weathered gray stone banks and sparse low vapour. The middle is a broad flat muted mineral terrace with soft low-contrast texture for the route overlay. Match the dangerous yet charming anime game environment, not a sandy desert or clear blue sea.
```

### lightning-plateau-route

최종 파일: `public/assets/maps/beach-route-v1.png` (1536×1024, RGB PNG).

```text
Use case: stylized-concept. Asset type: production environment backdrop for a scrollable route-map UI in a 2D SD anime fantasy RPG. Create a NEW 1536x1024 landscape illustration, exact 3:2 aspect ratio, opaque RGB. Input image 1 is STYLE AND TOP-VIEW CAMERA REFERENCE ONLY, not an edit target. Match its hand-painted 2D SD anime style, soft clean linework, simplified chunky terrain, detailed but gentle natural textures. True vertical TOP-DOWN 90-degree overhead orthographic plan view, no horizon, no sky, no isometric tilt, no visible vertical front facades. Most of the central area must be spacious, quiet and low contrast for an independent route-node overlay; terrain details should be concentrated around the perimeter. No route network, connecting paths, markers, circles, symbols, arrows, labels, text, UI, compass, borders, characters, monsters, buildings or watermark. Primary request: Lightning Plateau (낙뢰 고원). A windswept highland plateau viewed straight down, with weathered rock outcrops, flattened short grasses, dark storm-scorched patches and a few tiny restrained blue-white electrical arcs around perimeter stones. Broad open central stony grassland, subdued storm daylight in cool gray-green tones. Indicate storm weather through light and terrain, without sky or foreground clouds obscuring the map. No ocean, beach or desert.
```
