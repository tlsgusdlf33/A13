// 템플릿 정의. 새 템플릿을 여기에 추가하고 버전을 올려 배포하면
// 이미 설치된 앱에도 업데이터를 통해 자동으로 나타납니다.
//
// 열(column) 타입: text | number | currency | date | time | select | check
// computed 열: compute(row, ctx) 로 앱에서 계산, excel({ r, L, S }) 로 엑셀 수식 생성
//   r: 엑셀 행 번호, L(key): 같은 시트의 열 문자, S(sheetKey, key): 다른 시트의 열 전체 참조
import { parseNumber, daysBetween, inPeriod, addDays } from './format.js';

const sum = (rows, key) => rows.reduce((s, r) => s + parseNumber(typeof key === 'function' ? key(r) : r[key]), 0);
const rowsOf = (ctx, key) => ctx?.data?.sheets?.[key] ?? [];
const ratio = (a, b) => (b ? a / b : 0);

/* ───────────────────────── 가계부 ───────────────────────── */

const EXPENSE = ['식비', '카페/간식', '교통', '주거/통신', '생활용품', '의료/건강', '문화/여가', '교육', '경조사', '기타지출'];
const INCOME = ['급여', '부수입', '용돈', '기타수입'];

const spentFor = (row, ctx) =>
  sum(rowsOf(ctx, 'ledger').filter((r) => r.type !== '수입' && r.category === row.category && inPeriod(r.date, ctx.period)), 'amount');

const budget = {
  id: 'budget',
  name: '가계부',
  icon: '💰',
  color: '#2f9e44',
  premium: false,
  defaultPeriod: 'month',
  description: '수입·지출을 기록하고 월별 잔액과 분류별 지출, 예산 대비 사용액을 한눈에 봅니다.',
  guide: [
    "'내역' 시트에 날짜·구분(수입/지출)·분류·금액을 입력합니다.",
    "'예산' 시트에 분류별 월 예산을 적으면 사용액과 남은 금액이 자동 계산됩니다.",
    '분류·구분·결제수단 칸은 드롭다운으로 선택할 수 있습니다.',
    '맨 아래 합계 행은 자동으로 계산됩니다.',
  ],
  sheets: [
    {
      key: 'ledger',
      name: '내역',
      periodKey: 'date',
      defaultSort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'date', label: '날짜', type: 'date', default: (ctx) => ctx.newRowDate },
        { key: 'type', label: '구분', type: 'select', options: ['지출', '수입'], default: '지출' },
        { key: 'category', label: '분류', type: 'select', options: [...EXPENSE, ...INCOME] },
        { key: 'item', label: '내용', type: 'text', width: 22 },
        { key: 'amount', label: '금액', type: 'currency', total: true },
        { key: 'method', label: '결제수단', type: 'select', options: ['카드', '현금', '계좌이체', '기타'] },
        { key: 'memo', label: '메모', type: 'text', width: 24 },
      ],
      summary: (rows) => {
        const income = sum(rows.filter((r) => r.type === '수입'), 'amount');
        const expense = sum(rows.filter((r) => r.type !== '수입'), 'amount');
        const balance = income - expense;
        return [
          { label: '수입', value: income, format: 'won', tone: 'pos' },
          { label: '지출', value: expense, format: 'won', tone: 'neg' },
          { label: '잔액', value: balance, format: 'won', tone: balance >= 0 ? 'pos' : 'neg' },
        ];
      },
      breakdown: { title: '분류별 지출', groupBy: 'category', value: 'amount', filter: (r) => r.type !== '수입' },
    },
    {
      key: 'plan',
      name: '예산',
      columns: [
        { key: 'category', label: '분류', type: 'select', options: EXPENSE },
        { key: 'budget', label: '월 예산', type: 'currency', total: true },
        {
          key: 'spent', label: '사용액', type: 'currency', computed: true, total: true,
          compute: spentFor,
          excel: ({ r, L, S }) => `SUMIFS(${S('ledger', 'amount')},${S('ledger', 'category')},${L('category')}${r},${S('ledger', 'type')},"지출")`,
        },
        {
          key: 'left', label: '남은 금액', type: 'currency', computed: true, total: true,
          compute: (row, ctx) => parseNumber(row.budget) - spentFor(row, ctx),
          excel: ({ r, L }) => `${L('budget')}${r}-${L('spent')}${r}`,
        },
      ],
      summary: (rows, ctx) => {
        const planned = sum(rows, 'budget');
        const spent = sum(rows, (r) => spentFor(r, ctx));
        return [
          { label: '예산 합계', value: planned, format: 'won' },
          { label: '사용액', value: spent, format: 'won', tone: 'neg' },
          { label: '남은 예산', value: planned - spent, format: 'won', tone: planned - spent >= 0 ? 'pos' : 'neg' },
          { label: '사용률', value: ratio(spent, planned), format: 'pct' },
        ];
      },
    },
  ],
  sample: ({ month }) => ({
    ledger: [
      { date: `${month}-01`, type: '수입', category: '급여', item: '월급', amount: 3000000, method: '계좌이체' },
      { date: `${month}-02`, type: '지출', category: '주거/통신', item: '월세·통신비', amount: 600000, method: '계좌이체' },
      { date: `${month}-03`, type: '지출', category: '식비', item: '마트 장보기', amount: 68000, method: '카드' },
      { date: `${month}-04`, type: '지출', category: '카페/간식', item: '커피', amount: 4500, method: '카드' },
      { date: `${month}-05`, type: '지출', category: '교통', item: '교통카드 충전', amount: 50000, method: '카드' },
      { date: `${month}-06`, type: '지출', category: '문화/여가', item: '영화', amount: 15000, method: '카드', memo: '주말' },
    ],
    plan: [
      { category: '식비', budget: 400000 },
      { category: '카페/간식', budget: 60000 },
      { category: '교통', budget: 80000 },
      { category: '주거/통신', budget: 650000 },
      { category: '문화/여가', budget: 100000 },
    ],
  }),
};

/* ───────────────────────── 업무 관리표 ───────────────────────── */

export function ddayText(row, today) {
  if (row.status === '완료') return '완료';
  if (!row.due) return '';
  const d = daysBetween(today, row.due);
  if (Number.isNaN(d)) return '';
  if (d < 0) return `지연 ${-d}일`;
  if (d === 0) return 'D-Day';
  return `D-${d}`;
}

const isLate = (row, today) => row.status !== '완료' && row.due && daysBetween(today, row.due) < 0;

const tasks = {
  id: 'tasks',
  name: '업무 관리표',
  icon: '✅',
  color: '#4c6ef5',
  premium: false,
  defaultPeriod: 'all',
  description: '업무별 담당자·우선순위·상태·마감일을 관리하고 지연 업무와 완료율을 자동으로 계산합니다.',
  guide: [
    '업무명·담당자·우선순위·상태·시작일·마감일을 입력합니다.',
    "'D-Day' 칸은 마감일 기준으로 남은 날짜 또는 지연 일수를 자동 표시합니다.",
    "상태를 '완료'로 바꾸면 D-Day 칸에 '완료'가 표시됩니다.",
  ],
  sheets: [
    {
      key: 'tasks',
      name: '업무',
      periodKey: 'due',
      defaultSort: { key: 'due', dir: 'asc' },
      columns: [
        { key: 'title', label: '업무', type: 'text', width: 26 },
        { key: 'owner', label: '담당', type: 'text', width: 10 },
        { key: 'priority', label: '우선순위', type: 'select', options: ['높음', '보통', '낮음'], default: '보통' },
        { key: 'status', label: '상태', type: 'select', options: ['대기', '진행중', '완료', '보류'], default: '대기' },
        { key: 'start', label: '시작일', type: 'date', default: (ctx) => ctx.today },
        { key: 'due', label: '마감일', type: 'date' },
        {
          key: 'dday', label: 'D-Day', type: 'text', computed: true, width: 10,
          compute: (row, ctx) => ddayText(row, ctx.today),
          excel: ({ r, L }) => {
            const st = `${L('status')}${r}`;
            const due = `${L('due')}${r}`;
            return `IF(${st}="완료","완료",IF(${due}="","",IF(${due}<TODAY(),"지연 "&(TODAY()-${due})&"일",IF(${due}=TODAY(),"D-Day","D-"&(${due}-TODAY())))))`;
          },
        },
        { key: 'memo', label: '메모', type: 'text', width: 24 },
      ],
      summary: (rows, ctx) => {
        const done = rows.filter((r) => r.status === '완료').length;
        return [
          { label: '전체', value: rows.length, format: 'count', unit: '건' },
          { label: '진행중', value: rows.filter((r) => r.status === '진행중').length, format: 'count', unit: '건' },
          { label: '지연', value: rows.filter((r) => isLate(r, ctx.today)).length, format: 'count', unit: '건', tone: 'neg' },
          { label: '완료율', value: ratio(done, rows.length), format: 'pct', tone: 'pos' },
        ];
      },
      breakdown: { title: '담당자별 남은 업무', groupBy: 'owner', value: null, filter: (r) => r.status !== '완료', unit: '건' },
    },
  ],
  sample: ({ today }) => ({
    tasks: [
      { title: '주간 보고서 작성', owner: '나', priority: '높음', status: '진행중', start: addDays(today, -2), due: addDays(today, 1) },
      { title: '거래처 견적 회신', owner: '김대리', priority: '높음', status: '대기', start: addDays(today, -5), due: addDays(today, -1), memo: '단가 확인 필요' },
      { title: '회의실 예약', owner: '나', priority: '낮음', status: '완료', start: addDays(today, -3), due: addDays(today, -2) },
      { title: '분기 매출 정리', owner: '박과장', priority: '보통', status: '대기', start: today, due: addDays(today, 10) },
    ],
  }),
};

/* ───────────────────────── 여행 플래너 ───────────────────────── */

const travel = {
  id: 'travel',
  name: '여행 플래너',
  icon: '✈️',
  color: '#1098ad',
  premium: false,
  description: '일정표·준비물 체크리스트·경비 기록을 한 문서에서 관리합니다.',
  guide: [
    "'일정' 시트에 날짜별 장소·할 일·예상 비용·예약 여부를 적습니다.",
    "'준비물' 시트에서 챙긴 물건을 O로 표시합니다.",
    "'경비' 시트에 실제 쓴 돈을 기록하면 합계가 자동 계산됩니다.",
  ],
  sheets: [
    {
      key: 'schedule',
      name: '일정',
      defaultSort: { key: 'day', dir: 'asc' },
      columns: [
        { key: 'day', label: '날짜', type: 'date', default: (ctx) => ctx.today },
        { key: 'time', label: '시간', type: 'time' },
        { key: 'place', label: '장소', type: 'text', width: 18 },
        { key: 'plan', label: '할 일', type: 'text', width: 24 },
        { key: 'cost', label: '예상 비용', type: 'currency', total: true },
        { key: 'booked', label: '예약', type: 'check' },
        { key: 'memo', label: '메모', type: 'text', width: 20 },
      ],
      summary: (rows) => [
        { label: '일정', value: rows.length, format: 'count', unit: '개' },
        { label: '예상 비용', value: sum(rows, 'cost'), format: 'won' },
        { label: '예약 완료', value: ratio(rows.filter((r) => r.booked).length, rows.length), format: 'pct', tone: 'pos' },
      ],
    },
    {
      key: 'packing',
      name: '준비물',
      columns: [
        { key: 'item', label: '준비물', type: 'text', width: 20 },
        { key: 'category', label: '분류', type: 'select', options: ['서류', '의류', '세면', '전자기기', '약', '기타'] },
        { key: 'qty', label: '수량', type: 'number', default: 1 },
        { key: 'packed', label: '챙김', type: 'check' },
      ],
      summary: (rows) => {
        const packed = rows.filter((r) => r.packed).length;
        return [
          { label: '준비물', value: rows.length, format: 'count', unit: '개' },
          { label: '챙김', value: packed, format: 'count', unit: '개', tone: 'pos' },
          { label: '남음', value: rows.length - packed, format: 'count', unit: '개', tone: rows.length - packed ? 'neg' : 'pos' },
          { label: '진행률', value: ratio(packed, rows.length), format: 'pct' },
        ];
      },
    },
    {
      key: 'expenses',
      name: '경비',
      defaultSort: { key: 'date', dir: 'asc' },
      columns: [
        { key: 'date', label: '날짜', type: 'date', default: (ctx) => ctx.today },
        { key: 'category', label: '분류', type: 'select', options: ['항공', '숙소', '교통', '식비', '관광', '쇼핑', '기타'] },
        { key: 'item', label: '내용', type: 'text', width: 22 },
        { key: 'amount', label: '금액', type: 'currency', total: true },
        { key: 'payer', label: '결제자', type: 'text', width: 10 },
      ],
      summary: (rows, ctx) => {
        const spent = sum(rows, 'amount');
        const planned = sum(rowsOf(ctx, 'schedule'), 'cost');
        return [
          { label: '실제 지출', value: spent, format: 'won', tone: 'neg' },
          { label: '예상 비용', value: planned, format: 'won' },
          { label: '차이', value: planned - spent, format: 'won', tone: planned - spent >= 0 ? 'pos' : 'neg' },
        ];
      },
      breakdown: { title: '분류별 경비', groupBy: 'category', value: 'amount' },
    },
  ],
  sample: ({ today }) => {
    const d1 = addDays(today, 14);
    const d2 = addDays(today, 15);
    return {
      schedule: [
        { day: d1, time: '09:00', place: '김포공항', plan: '제주행 비행기', cost: 120000, booked: true },
        { day: d1, time: '13:00', place: '애월', plan: '점심 · 카페', cost: 40000, booked: false },
        { day: d1, time: '18:00', place: '숙소', plan: '체크인', cost: 150000, booked: true },
        { day: d2, time: '10:00', place: '성산일출봉', plan: '등반', cost: 5000, booked: false },
      ],
      packing: [
        { item: '신분증', category: '서류', qty: 1, packed: true },
        { item: '충전기', category: '전자기기', qty: 1, packed: false },
        { item: '갈아입을 옷', category: '의류', qty: 3, packed: false },
        { item: '상비약', category: '약', qty: 1, packed: false },
      ],
      expenses: [
        { date: d1, category: '항공', item: '왕복 항공권', amount: 118000, payer: '나' },
      ],
    };
  },
};

/* ───────────────────────── 프리미엄: 습관 트래커 ───────────────────────── */

const habit = {
  id: 'habit',
  name: '습관 트래커',
  icon: '🔥',
  color: '#f76707',
  premium: true,
  defaultPeriod: 'month',
  description: '매일의 습관 달성 여부를 기록하고 습관별 달성 횟수와 달성률을 확인합니다.',
  guide: ['날짜·습관 이름을 적고 달성했으면 O를 선택합니다.', '월별로 시트를 복사해 쓰면 편리합니다.'],
  sheets: [
    {
      key: 'log',
      name: '기록',
      periodKey: 'date',
      defaultSort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'date', label: '날짜', type: 'date', default: (ctx) => ctx.newRowDate },
        { key: 'habit', label: '습관', type: 'text', width: 18 },
        { key: 'done', label: '달성', type: 'check' },
        { key: 'memo', label: '메모', type: 'text', width: 24 },
      ],
      summary: (rows) => {
        const done = rows.filter((r) => r.done).length;
        return [
          { label: '기록', value: rows.length, format: 'count', unit: '회' },
          { label: '달성', value: done, format: 'count', unit: '회', tone: 'pos' },
          { label: '달성률', value: ratio(done, rows.length), format: 'pct', tone: 'pos' },
        ];
      },
      breakdown: { title: '습관별 달성 횟수', groupBy: 'habit', value: null, filter: (r) => r.done, unit: '회' },
    },
  ],
  sample: ({ today }) => ({
    log: [0, 1, 2].flatMap((n) => [
      { date: addDays(today, -n), habit: '물 2L 마시기', done: n !== 1 },
      { date: addDays(today, -n), habit: '30분 걷기', done: true },
    ]),
  }),
};

/* ───────────────────────── 프리미엄: 구독 관리 ───────────────────────── */

const monthlyOf = (r) => (r.status === '해지' ? 0 : r.cycle === '매년' ? Math.round(parseNumber(r.price) / 12) : parseNumber(r.price));

const subscriptions = {
  id: 'subscriptions',
  name: '구독 관리',
  icon: '📺',
  color: '#ae3ec9',
  premium: true,
  description: 'OTT·음악·클라우드 등 정기결제를 모아 월 고정비와 연간 지출을 계산합니다.',
  guide: ['서비스·요금·결제주기(매월/매년)·결제일을 입력합니다.', "'월 환산' 칸은 연간 결제를 12로 나눠 자동 계산합니다."],
  sheets: [
    {
      key: 'subs',
      name: '구독',
      defaultSort: { key: 'payday', dir: 'asc' },
      columns: [
        { key: 'service', label: '서비스', type: 'text', width: 18 },
        { key: 'category', label: '분류', type: 'select', options: ['OTT', '음악', '클라우드', '쇼핑', '소프트웨어', '기타'] },
        { key: 'price', label: '요금', type: 'currency' },
        { key: 'cycle', label: '결제주기', type: 'select', options: ['매월', '매년'], default: '매월' },
        { key: 'payday', label: '결제일', type: 'number' },
        { key: 'method', label: '결제수단', type: 'text', width: 12 },
        { key: 'status', label: '상태', type: 'select', options: ['사용중', '해지예정', '해지'], default: '사용중' },
        {
          key: 'monthly', label: '월 환산', type: 'currency', computed: true, total: true,
          compute: monthlyOf,
          excel: ({ r, L }) => `IF(${L('status')}${r}="해지",0,IF(${L('cycle')}${r}="매년",ROUND(${L('price')}${r}/12,0),${L('price')}${r}))`,
        },
      ],
      summary: (rows) => {
        const monthly = sum(rows, monthlyOf);
        return [
          { label: '월 고정비', value: monthly, format: 'won', tone: 'neg' },
          { label: '연간 환산', value: monthly * 12, format: 'won' },
          { label: '사용중', value: rows.filter((r) => r.status !== '해지').length, format: 'count', unit: '개' },
        ];
      },
      breakdown: { title: '분류별 월 지출', groupBy: 'category', value: monthlyOf },
    },
  ],
  sample: () => ({
    subs: [
      { service: '넷플릭스', category: 'OTT', price: 17000, cycle: '매월', payday: 5, method: '카드', status: '사용중' },
      { service: '음악 스트리밍', category: '음악', price: 11990, cycle: '매월', payday: 12, method: '카드', status: '사용중' },
      { service: '클라우드 200GB', category: '클라우드', price: 33000, cycle: '매년', payday: 20, method: '카드', status: '사용중' },
      { service: '쇼핑 멤버십', category: '쇼핑', price: 7890, cycle: '매월', payday: 25, method: '카드', status: '해지예정' },
    ],
  }),
};

export const TEMPLATES = [budget, tasks, travel, habit, subscriptions];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);
