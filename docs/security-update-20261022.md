# Node 및 로그인 보안 업데이트 — 2026-10-22

## 변경

- 공식 Node.js 24.22.1 Linux x64 배포본을 `/home/deck/.nvm/versions/node/v24.22.1`에 설치한다. 이전 24.18.1은 보존한다.
- 배포본: https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz
- 공식 릴리스: https://nodejs.org/en/blog/release/v24.22.1
- 공식 HTTPS `SHASUMS256.txt` 및 릴리스 페이지와 파일 SHA256 대조 완료: `6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6`.
- 로그인 아이디별 연속 실패 5회에 5분 잠금. 5번째 실패부터 HTTP 429, `Retry-After` 초 단위 헤더, `LOGIN_LOCKED` 코드와 남은 초를 반환한다. 화면에서는 남은 분·초를 갱신한다.
- 성공 시 실패 기록 삭제. 잠금 만료 후 실패는 1회부터 다시 센다. 잠금 중 올바른 비밀번호도 거절하며 추가 요청은 만료 시간을 바꾸지 않는다.
- 기존 숫자 6자리 비밀번호 정책 유지. 형식이 잘못된 비밀번호도 유효한 아이디에 대한 로그인 실패로 계산한다. 사용자명은 기존 규칙대로 검증하고 소문자로 정규화한다.
- 없는 아이디도 같은 잠금 규칙과 오류를 사용한다. `login_attempts`의 키는 정규화한 아이디의 SHA256이다.
- 기존 SQLite에 별도 테이블만 추가한다. 계정·세션·게임 데이터 스키마와 저장 내용은 유지한다. 잠금은 재시작 후에도 유지된다.
- 현재 단일 Node 서버에서 아이디별 비동기 검증을 직렬화한다. 향후 다중 프로세스/인스턴스로 변경할 경우 공유 잠금 조정이 필요하다.
- 계정별 잠금은 제3자가 다른 사람의 로그인을 일시적으로 잠글 수 있는 절충이 있다. 회원가입 제한, 방화벽 변경, 다른 서비스 업데이트는 이번 범위에 포함하지 않는다.

## 복구 정보

변경 전 서비스와 소스 백업: `/home/deck/.local/state/zwiequest/security-20261022/` (소유자 전용 디렉터리).

변경 전 실행은 `zwiequest-game.service`의 `/home/deck/.nvm/versions/node/v24.18.1/bin/npm start`, 작업 경로 `/home/deck/Documents/ZwieQuest`였다. 서비스는 기존부터 transient 서비스였다.

새 Node 경로는 `/home/deck/.config/systemd/user/zwiequest-game.service.d/20-node-runtime.conf`에서 ExecStart와 PATH만 지정한다. 기존 서비스의 재시작 정책과 시작 스크립트는 유지한다.

Node만 되돌릴 때는 위 추가 drop-in 파일만 제거하고 아래 명령으로 설정을 다시 읽고 재시작한다. 로그인 보호 코드는 유지할 수 있으며 추가 DB 테이블은 기존 코드와 호환된다. 이전 바이너리는 제거하지 않는다.

```bash
export XDG_RUNTIME_DIR=/run/user/1000
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
systemctl --user daemon-reload
systemctl --user restart zwiequest-game.service
```

서비스 설정 원본은 `service-before.txt`, 변경 전 실행 파일 경로는 `node-before.txt`에 있다. 코드까지 복구할 때는 해당 `.before` 파일을 사용하되 이후 작업과 사용자 변경을 먼저 비교한다. 운영 DB 전체 복원은 업데이트 이후 진행 상태를 잃게 할 수 있으므로 일반적인 Node 롤백에 사용하지 않는다.

## 검증

- 단위·HTTP 테스트: 4회 실패, 5번째 잠금, 정확한 만료 경계, 성공 초기화, 잠금 시간 미연장, 동시 요청, 대소문자 통합, 없는 아이디의 동일 응답, 서버 재시작 후 지속.
- 테스트는 임시 SQLite 및 격리 서버에서 수행한다. 실제 사용자 계정은 테스트에 사용하지 않는다.

## 배포 확인 결과

- Node 24.22.1에서 전체 테스트 **289개 통과, 실패 0개**. 로그인 집중 테스트 7개 포함.
- 서비스 재시작 후 실제 게임 PID `3362064`, 실행 파일 `/home/deck/.nvm/versions/node/v24.22.1/bin/node`, 해당 실행 파일의 버전 `v24.22.1` 확인.
- 로컬 Caddy를 통한 실제 HTTPS 호스트 검증: `/api/health` 200, 비로그인 `/api/state` 401.
- 새 전용 임시 계정으로 HTTPS 로그인 검증: 실패 1~4회 400, 5번째 429 및 `Retry-After: 300`, 잠금 중 올바른 비밀번호 429, 추가 요청 후 만료 시각 동일.
- 검증용 계정·세션·잠금 행은 정확한 임시 계정 ID로 확인하여 제거했다. 실제 사용자 계정으로 실패 테스트를 하지 않았다.
- 배포 전 SQLite 온라인 백업 `zwiequest-before.sqlite`의 `quick_check` 통과. 기존 Node 24.18.1과 변경 전 소스·서비스 설정 보존.
- HTTPS 검증은 `--resolve`로 로컬 프록시를 지정했으며 외부 인터넷 경로까지 검사한 것은 아니다.
- 커밋·푸시, 방화벽 수정 및 다른 서비스 업데이트 없음.
