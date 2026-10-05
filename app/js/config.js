// 배포 전에 이 파일만 수정하면 됩니다. (자세한 방법: README.md)
export const CONFIG = {
  appName: '템플릿킷',

  // 앱이 배포된 주소 (GitHub Pages 기본값). 모바일 앱(Capacitor)의 업데이트 확인에도 사용됩니다.
  appUrl: 'https://tlsgusdlf33.github.io/A13/',

  // 프리미엄 구매 링크 (Gumroad / 크몽 / 스마트스토어 상품 페이지). 비워두면 버튼이 숨겨집니다.
  purchaseUrl: '',

  // 프리미엄 가격 안내 문구 (선택)
  priceText: '',

  // PC·모바일 동기화용 Firebase 설정. null 이면 "이 기기에만 저장" 모드로 동작합니다.
  // Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → SDK 설정의 firebaseConfig 를 그대로 붙여넣으세요.
  firebase: null,
  // firebase: {
  //   apiKey: '...',
  //   authDomain: '...firebaseapp.com',
  //   projectId: '...',
  //   appId: '...',
  // },

  // 새 버전 확인 주기(분)
  updateCheckMinutes: 30,
};
