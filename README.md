# TickTick Tag Progress

TickTick 공식 Open API v1으로 태그별 월간 진행률을 조회하고, 확인된 개별 태스크 완료만
TickTick으로 다시 반영하는 간트형 Obsidian ItemView입니다.

## 기능

- 리본 아이콘 또는 명령 팔레트에서 수동 동기화
- 시간대(KST 등)를 반영한 로컬 날짜로 태그별 완료율과 월간 일정 span 집계
- 월간 포트폴리오 요약 헤더: 활성 프로젝트·완료/전체·미분류·기간 미지정·상태 미확정·데이터 경과 시간
- 태그별 마지막 완료 경과(정체 신호) 표시
- 포함 태그 입력 순서대로 행 정렬, 미분류는 별도 “기타” 구획
- 태그 행 → 해당 프로젝트 `Project Hub` 열기 링크(유일 매치일 때만)
- 태그 행 클릭 후 마감일순 드릴다운, 지연 태스크 배지
- 완료 처리 안전 계약: 오래된 데이터 차단(TTL) → 확인 직전 live read → 재시도 없는 단발 전송 → 결과 미확정 시 [상태 확인] → 사후 검증
- 태스크 제목 클릭 시 exact `ticktickId` 기반 로컬 노트 생성/열기
- 일부 조회 실패는 부분(`partial`) 스냅샷으로 유지, 소스 간 상태 충돌은 exact read로 해소
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
