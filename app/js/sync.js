// PC·모바일 동기화 (Firebase Authentication + Cloud Firestore)
// 같은 계정으로 로그인한 모든 기기에서 문서와 라이선스가 실시간으로 맞춰집니다.
// 오프라인일 때 수정한 내용은 기기에 저장되었다가 다시 연결되면 자동으로 올라갑니다.
import { planSync } from './merge.js';

const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.14.1';

const AUTH_ERRORS = {
  'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
  'auth/missing-password': '비밀번호를 입력해 주세요.',
  'auth/user-not-found': '가입되지 않은 이메일입니다.',
  'auth/wrong-password': '비밀번호가 틀렸습니다.',
  'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
  'auth/invalid-login-credentials': '이메일 또는 비밀번호가 올바르지 않습니다.',
  'auth/email-already-in-use': '이미 가입된 이메일입니다. 로그인해 주세요.',
  'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
  'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  'auth/network-request-failed': '네트워크에 연결할 수 없습니다.',
  'auth/popup-closed-by-user': '로그인 창이 닫혔습니다.',
  'auth/unauthorized-domain': 'Firebase 콘솔의 승인된 도메인에 이 주소를 추가해야 합니다.',
  'auth/operation-not-allowed': 'Firebase 콘솔에서 이 로그인 방식을 사용 설정해 주세요.',
  'permission-denied': '서버 접근 권한이 없습니다. firestore.rules 를 배포했는지 확인해 주세요.',
};

export const authErrorMessage = (err) => AUTH_ERRORS[err?.code] ?? err?.message ?? String(err);

/**
 * @param {import('./store.js').Store} store
 * @param {object} firebaseConfig
 * @param {(status: {state: string, user: object|null, error?: string}) => void} onStatus
 */
export async function initSync(store, firebaseConfig, onStatus) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`),
  ]);

  const fbApp = initializeApp(firebaseConfig);
  const auth = A.getAuth(fbApp);
  let db;
  try {
    db = F.initializeFirestore(fbApp, {
      ignoreUndefinedProperties: true,
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch {
    db = F.getFirestore(fbApp);
  }

  let user = null;
  let ready = false;
  let inflight = 0;
  let unsubs = [];
  const timers = new Map();
  let status = { state: 'signedOut', user: null };

  const online = () => globalThis.navigator?.onLine !== false;
  const setStatus = (patch) => {
    status = { ...status, ...patch, user: user ? { uid: user.uid, email: user.email, name: user.displayName } : null };
    onStatus(status);
  };
  const settle = () => {
    if (user && !inflight && !timers.size && status.state !== 'error') setStatus({ state: online() ? 'synced' : 'offline' });
  };
  const track = (promise) => {
    inflight++;
    setStatus({ state: online() ? 'syncing' : 'offline', error: undefined });
    return promise
      .catch((err) => setStatus({ state: 'error', error: authErrorMessage(err) }))
      .finally(() => {
        inflight--;
        settle();
      });
  };

  const docsCol = () => F.collection(db, 'users', user.uid, 'docs');
  const userRef = () => F.doc(db, 'users', user.uid);
  const plain = (d) => JSON.parse(JSON.stringify(d));

  const pushDoc = (d) => F.setDoc(F.doc(docsCol(), d.id), plain(d));
  const pushLicenses = (codes) => F.setDoc(userRef(), { licenses: F.arrayUnion(...codes), updatedAt: Date.now() }, { merge: true });

  function queuePush(id) {
    clearTimeout(timers.get(id));
    setStatus({ state: online() ? 'syncing' : 'offline' });
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        const d = store.docs.get(id);
        if (d && user) track(pushDoc(d));
        else settle();
      }, 600),
    );
  }

  function stop() {
    for (const u of unsubs) u();
    unsubs = [];
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    ready = false;
  }

  function start() {
    // 다른 계정으로 쓰던 기기라면 그 계정의 데이터가 섞이지 않도록 로컬 문서를 비웁니다.
    if (store.meta.ownerUid && store.meta.ownerUid !== user.uid) store.clearDocs();
    store.setOwner(user.uid);
    setStatus({ state: 'syncing' });

    let first = true;
    unsubs.push(
      F.onSnapshot(
        docsCol(),
        (snap) => {
          if (first) {
            first = false;
            const remote = snap.docs.map((s) => s.data());
            const { upload, apply } = planSync(store.allDocs(), remote);
            store.applyRemoteMany(apply);
            for (const d of upload) track(pushDoc(d));
            ready = true;
            settle();
          } else {
            store.applyRemoteMany(snap.docChanges().filter((c) => c.type !== 'removed').map((c) => c.doc.data()));
          }
        },
        (err) => setStatus({ state: 'error', error: authErrorMessage(err) }),
      ),
    );

    unsubs.push(
      F.onSnapshot(
        userRef(),
        (snap) => {
          const remote = snap.data()?.licenses ?? [];
          store.mergeLicenses(remote);
          const missing = store.meta.licenses.filter((c) => !remote.includes(c));
          if (missing.length) track(pushLicenses(missing));
        },
        (err) => setStatus({ state: 'error', error: authErrorMessage(err) }),
      ),
    );
  }

  store.on((evt) => {
    if (!user || !ready || evt.source !== 'local') return;
    if (evt.type === 'doc') queuePush(evt.doc.id);
    if (evt.type === 'meta' && store.meta.licenses.length) track(pushLicenses(store.meta.licenses));
  });

  globalThis.addEventListener?.('online', settle);
  globalThis.addEventListener?.('offline', () => user && setStatus({ state: 'offline' }));

  A.onAuthStateChanged(auth, (u) => {
    stop();
    user = u;
    if (u) start();
    else setStatus({ state: 'signedOut' });
  });
  A.getRedirectResult(auth).catch(() => {});

  return {
    get status() {
      return status;
    },
    signIn: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
    signUp: (email, pw) => A.createUserWithEmailAndPassword(auth, email, pw),
    resetPassword: (email) => A.sendPasswordResetEmail(auth, email),
    async signInWithGoogle() {
      const provider = new A.GoogleAuthProvider();
      try {
        return await A.signInWithPopup(auth, provider);
      } catch (err) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(err?.code)) {
          return A.signInWithRedirect(auth, provider);
        }
        throw err;
      }
    },
    signOut: () => A.signOut(auth),
    /** 대기 중인 변경을 즉시 올림 */
    async flush() {
      for (const [id, t] of timers) {
        clearTimeout(t);
        timers.delete(id);
        const d = store.docs.get(id);
        if (d && user) track(pushDoc(d));
      }
      settle();
    },
  };
}
