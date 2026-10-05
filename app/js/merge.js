// 기기 간 동기화 충돌 해결: 문서 단위 "마지막 수정 우선"(last-write-wins)

/** a 가 b 보다 최신이면 양수 */
export function compareDocs(a, b) {
  const ua = a?.updatedAt ?? 0;
  const ub = b?.updatedAt ?? 0;
  if (ua !== ub) return ua - ub;
  const ra = a?.rev ?? 0;
  const rb = b?.rev ?? 0;
  if (ra !== rb) return ra - rb;
  return String(a?.device ?? '').localeCompare(String(b?.device ?? ''));
}

export function isValidDoc(d) {
  return !!d && typeof d.id === 'string' && d.id.length > 0 && typeof d.updatedAt === 'number';
}

/**
 * 로그인 직후 로컬/서버 문서 목록을 비교해
 * upload: 서버로 올릴 로컬 문서, apply: 로컬에 반영할 서버 문서 를 돌려줍니다.
 */
export function planSync(localDocs, remoteDocs) {
  const local = new Map(localDocs.filter(isValidDoc).map((d) => [d.id, d]));
  const remote = new Map(remoteDocs.filter(isValidDoc).map((d) => [d.id, d]));
  const upload = [];
  const apply = [];
  for (const [id, l] of local) {
    const r = remote.get(id);
    if (!r) upload.push(l);
    else {
      const c = compareDocs(l, r);
      if (c > 0) upload.push(l);
      else if (c < 0) apply.push(r);
    }
  }
  for (const [id, r] of remote) if (!local.has(id)) apply.push(r);
  return { upload, apply };
}
