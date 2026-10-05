# 업데이트 배포 (재설치 없는 개선)

## 흐름
```
코드 수정 → npm test → npm run bump -- patch "변경 내용" → git push (main)
        → GitHub Actions: 테스트 → GitHub Pages 배포 (+ 모바일 앱용 bundles/app-<버전>.zip)
        → 사용자 기기: 업데이터가 새 버전 감지 → 백그라운드에서 받아둠 → 적용
```

## 버전 올리기
```bash
npm run bump -- patch "오류 수정"                    # 1.0.0 → 1.0.1
npm run bump -- minor "새 템플릿: 독서 기록"          # 1.0.1 → 1.1.0
npm run bump -- 2.0.0 "대규모 개편"                  # 버전을 직접 지정
```
`app/js/version.js`, `app/sw.js`, `app/version.json`(업데이트 내역), `package.json`이 한꺼번에 바뀝니다.
버전이 서로 다르면 `npm test`(tests/release.test.mjs)가 실패해서 잘못된 배포를 막습니다.

## 사용자 기기에서 일어나는 일
| 환경 | 감지 | 적용 |
| --- | --- | --- |
| PC·휴대폰 설치 앱 / 브라우저 | 앱을 열 때, 화면으로 돌아올 때, 30분마다 (`config.js`의 `updateCheckMinutes`) | 앱을 막 열었으면 바로 적용합니다. 쓰는 중이면 상단 배너에서 “지금 업데이트”를 누를 때 적용합니다. 데이터는 그대로입니다. |
| 스토어 앱 (Capacitor) | 같은 주기로 `version.json` 확인 | `bundles/app-<버전>.zip`을 받아 교체합니다. |

사용자는 `설정 → 업데이트 → 업데이트 확인`으로 직접 확인할 수 있고, “앱을 열 때 자동 적용”을 끌 수도 있습니다.

## 새 파일을 추가했다면
`app/` 아래에 파일을 추가하면 `app/sw.js`의 `SHELL` 목록에도 넣어야 오프라인에서 동작합니다.
빠뜨리면 `npm test`가 어떤 파일을 넣어야 하는지 알려줍니다.

## 주의
- 저장 데이터 형식을 바꿀 때는 예전 형식도 읽을 수 있게 만듭니다. 템플릿에 시트나 열을 **추가**하는 것은 안전합니다(기존 문서에는 빈 칸으로 나타남).
- 템플릿 `id`와 열 `key`는 바꾸지 않습니다. 이름(`name`, `label`)은 바꿔도 됩니다.
