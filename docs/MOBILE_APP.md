# 모바일 앱으로 만들어 스토어에 배포하기 (Capacitor)

`app/` 폴더의 웹앱을 그대로 Android·iOS 앱으로 감쌉니다. 코드를 다시 짤 필요는 없습니다.

## 준비물
| 대상 | 필요한 것 |
| --- | --- |
| Android | Android Studio, Google Play 개발자 계정(1회 등록비) |
| iOS | Mac + Xcode, Apple Developer Program(연회비) |

## 1. 프로젝트 생성
```bash
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/android @capacitor/ios @capgo/capacitor-updater
npx cap add android        # android/ 폴더 생성
npx cap add ios            # ios/ 폴더 생성 (Mac)
npx cap sync
```
설정은 [`capacitor.config.json`](../capacitor.config.json)에 이미 들어 있습니다(앱 ID `kr.templatekit.app`, 웹 폴더 `app`).
앱 ID는 스토어에 올린 뒤에는 바꿀 수 없으니, 원하는 값으로 먼저 정하세요.

## 2. 아이콘·스플래시
```bash
npm i -D @capacitor/assets
mkdir -p assets && cp app/icons/icon-512.png assets/icon.png
npx capacitor-assets generate
```

## 3. 빌드
- Android: `npx cap open android` → Android Studio에서 **Build → Generate Signed App Bundle(AAB)** → Play Console에 업로드
- iOS: `npx cap open ios` → Xcode에서 **Product → Archive** → App Store Connect에 업로드

## 4. 스토어 앱의 업데이트 (재설치·재심사 없는 개선)
스토어 앱에도 같은 업데이터가 들어 있습니다(`app/js/updater.js`의 `nativeUpdater`).
1. `npm run bump` → push하면 GitHub Actions가 `bundles/app-<버전>.zip`을 함께 배포합니다.
2. 앱은 `config.js`의 `appUrl` + `version.json`을 확인하고, 새 버전이 있으면 `@capgo/capacitor-updater`로 zip을 받아 교체합니다(자체 서버 방식이라 별도 요금 없음).
3. 단, **네이티브 코드나 플러그인이 바뀌면** 스토어 업데이트가 필요합니다. 화면, 템플릿, 로직(웹 코드) 변경은 이 방식으로 바로 반영됩니다.
4. 스토어 정책상 앱의 핵심 목적을 바꾸는 큰 변경은 스토어 업데이트로 내보내세요.

## 5. 앱에서의 동기화(Firebase)
- 이메일 로그인은 그대로 동작합니다. 같은 계정이면 웹·PC·스토어 앱이 모두 연동됩니다.
- Google 로그인 팝업은 앱 WebView에서 제한될 수 있습니다. 필요하면 `@capacitor-firebase/authentication` 플러그인으로 네이티브 Google 로그인을 붙입니다.

## 6. 심사 체크리스트
- [ ] 개인정보처리방침 URL (수집 항목: 이메일, 사용자가 입력한 문서 데이터 / 보관: Firebase)
- [ ] 계정 삭제 방법 안내 (스토어 필수 항목)
- [ ] iOS에서는 라이선스 코드 입력을 숨기고 인앱 결제로 바꾸기 ([MONETIZE.md](MONETIZE.md) C 항목)
- [ ] 스크린샷: 홈, 가계부 요약, 업무 관리표(휴대폰 카드 화면), 엑셀 내보내기
