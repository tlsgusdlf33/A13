// 로컬 저장소 (오프라인에서도 동작). 동기화 모듈은 이 저장소의 변경 이벤트를 구독합니다.
import { compareDocs, isValidDoc } from './merge.js';
import { randomId } from './format.js';

export const STORAGE_KEY = 'templatekit.v1';

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export class Store {
  constructor({ storage = defaultStorage(), now = () => Date.now(), key = STORAGE_KEY } = {}) {
    this.storage = storage;
    this.now = now;
    this.key = key;
    this.listeners = new Set();
    this.docs = new Map();
    this.meta = { licenses: [], ownerUid: null };
    this.settings = {};
    this.deviceId = null;
    this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem(this.key);
      if (raw) {
        const s = JSON.parse(raw);
        for (const d of s.docs ?? []) if (isValidDoc(d)) this.docs.set(d.id, d);
        this.meta = { ...this.meta, ...(s.meta ?? {}) };
        this.settings = s.settings ?? {};
        this.deviceId = s.deviceId ?? null;
      }
    } catch (e) {
      console.warn('저장된 데이터를 읽지 못했습니다', e);
    }
    if (!this.deviceId) {
      this.deviceId = randomId(12);
      this.persist();
    }
  }

  persist() {
    try {
      this.storage?.setItem(
        this.key,
        JSON.stringify({ docs: [...this.docs.values()], meta: this.meta, settings: this.settings, deviceId: this.deviceId }),
      );
    } catch (e) {
      this.emit({ type: 'error', error: e });
    }
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(evt) {
    for (const fn of this.listeners) {
      try {
        fn(evt);
      } catch (e) {
        console.error(e);
      }
    }
  }

  /* ── 문서 ── */

  list() {
    return [...this.docs.values()].filter((d) => !d.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  allDocs() {
    return [...this.docs.values()];
  }

  get(id) {
    const d = this.docs.get(id);
    return d && !d.deleted ? d : null;
  }

  stamp(doc) {
    const prev = this.docs.get(doc.id);
    doc.updatedAt = Math.max(this.now(), (prev?.updatedAt ?? 0) + 1);
    doc.rev = (prev?.rev ?? 0) + 1;
    doc.device = this.deviceId;
    return doc;
  }

  commit(doc) {
    this.docs.set(doc.id, doc);
    this.persist();
    this.emit({ type: 'doc', doc, source: 'local' });
    return doc;
  }

  create({ templateId, title, data }) {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${randomId(10)}`;
    const doc = this.stamp({ id, templateId, title, data: data ?? { sheets: {} }, createdAt: this.now(), deleted: false });
    return this.commit(doc);
  }

  /** mutator(draft) 가 사본을 수정하면 저장 */
  update(id, mutator) {
    const cur = this.get(id);
    if (!cur) return null;
    const draft = clone(cur);
    draft.data ??= { sheets: {} };
    draft.data.sheets ??= {};
    mutator(draft);
    return this.commit(this.stamp(draft));
  }

  rename(id, title) {
    return this.update(id, (d) => {
      d.title = title;
    });
  }

  duplicate(id, title) {
    const cur = this.get(id);
    if (!cur) return null;
    return this.create({ templateId: cur.templateId, title: title ?? `${cur.title} (복사본)`, data: clone(cur.data) });
  }

  remove(id) {
    const cur = this.docs.get(id);
    if (!cur) return;
    // 다른 기기에도 삭제가 전달되도록 기록(tombstone)만 남깁니다.
    this.commit(this.stamp({ id, templateId: cur.templateId, title: cur.title, data: { sheets: {} }, createdAt: cur.createdAt, deleted: true }));
  }

  /** 서버에서 받은 문서가 더 최신이면 반영. 반영했으면 true */
  applyRemote(remote, { emit = true } = {}) {
    if (!isValidDoc(remote)) return false;
    const local = this.docs.get(remote.id);
    if (local && compareDocs(remote, local) <= 0) return false;
    this.docs.set(remote.id, remote);
    if (emit) {
      this.persist();
      this.emit({ type: 'doc', doc: remote, source: 'remote' });
    }
    return true;
  }

  applyRemoteMany(list) {
    const changed = list.filter((d) => this.applyRemote(d, { emit: false }));
    if (changed.length) {
      this.persist();
      for (const doc of changed) this.emit({ type: 'doc', doc, source: 'remote' });
    }
    return changed.length;
  }

  clearDocs() {
    this.docs.clear();
    this.persist();
    this.emit({ type: 'reset', source: 'local' });
  }

  /* ── 계정 메타 (라이선스 등: 계정 간 동기화) ── */

  addLicense(code) {
    if (this.meta.licenses.includes(code)) return false;
    this.meta.licenses = [...this.meta.licenses, code];
    this.persist();
    this.emit({ type: 'meta', source: 'local' });
    return true;
  }

  mergeLicenses(codes) {
    const add = (codes ?? []).filter((c) => typeof c === 'string' && !this.meta.licenses.includes(c));
    if (!add.length) return false;
    this.meta.licenses = [...this.meta.licenses, ...add];
    this.persist();
    this.emit({ type: 'meta', source: 'remote' });
    return true;
  }

  setOwner(uid) {
    this.meta.ownerUid = uid;
    this.persist();
  }

  /* ── 기기별 설정 (동기화 안 함) ── */

  getSetting(key, fallback) {
    return key in this.settings ? this.settings[key] : fallback;
  }

  setSetting(key, value) {
    this.settings[key] = value;
    this.persist();
  }

  /* ── 백업 ── */

  exportBackup(appVersion) {
    return { app: 'templatekit', appVersion, exportedAt: new Date(this.now()).toISOString(), docs: this.allDocs(), licenses: this.meta.licenses };
  }

  /** 백업 파일 복원: 기존 문서와 병합(더 최신 쪽 유지). 복원된 문서 수 반환 */
  importBackup(backup) {
    if (!backup || backup.app !== 'templatekit' || !Array.isArray(backup.docs)) throw new Error('템플릿킷 백업 파일이 아닙니다.');
    let n = 0;
    for (const d of backup.docs) {
      if (!isValidDoc(d)) continue;
      const local = this.docs.get(d.id);
      if (local && compareDocs(d, local) <= 0) continue;
      this.commit(d);
      n++;
    }
    this.mergeLicenses(backup.licenses);
    return n;
  }
}
