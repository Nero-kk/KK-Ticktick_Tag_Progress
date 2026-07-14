# TickTick Tag Progress

TickTick 공식 Open API v1으로 태그별 월간 진행률을 조회하고, 확인된 개별 태스크 완료만
TickTick으로 다시 반영하는 간트형 Obsidian ItemView입니다.

## 기능

- 리본 아이콘 또는 명령 팔레트에서 수동 동기화
- 태그별 완료/전체 집계와 월간 일정 span
- 태그 행 클릭 후 태스크 드릴다운
- 원형 체크 버튼 → 변경 미리보기·확인 → TickTick 완료 처리 → 현재 월 재동기화
- 태스크 제목 클릭 시 exact `ticktickId` 기반 로컬 노트 생성/열기
- 기존 `Projects.base`의 `TickTick Task Notes` 뷰 연결
- 토큰은 Obsidian SecretStorage에만 저장

## API 토큰 설정

1. TickTick 웹 앱에서 왼쪽 위 프로필 → **설정 → 계정 → API Token**으로 이동합니다.
2. API Token을 생성해 복사합니다.
3. Obsidian의 **TickTick Tag Progress → TickTick API 토큰 직접 저장** 입력란에 붙여넣고
   **토큰 저장**을 누릅니다.

TickTick 로그인 이메일이나 비밀번호는 이 플러그인에 입력하지 않습니다. Obsidian에는 토큰 값이
`ticktick-progress-api-token`이라는 고정 SecretStorage ID로 저장됩니다.

## 개발

```sh
npm install
npm run verify
```

빌드 산출물은 `main.js`, `manifest.json`, `styles.css`입니다. 실제 계정 capability 검증 전에는
공식 v1 외 endpoint를 추가하지 마세요. 쓰기 범위는
`POST /project/{projectId}/task/{taskId}/complete` 한 개로 제한되며, 나머지 생성·수정·삭제
endpoint는 allow-list guard가 차단합니다.
