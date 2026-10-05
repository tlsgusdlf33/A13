// 최소한의 .xlsx 작성기: 서식(머리글·테두리·숫자·날짜), 수식, 드롭다운, 틀 고정, 자동 필터 지원
import { zipStore } from './zip.js';

export const STYLE = { normal: 0, header: 1, text: 2, number: 3, date: 4, totalLabel: 5, totalNumber: 6, center: 7, title: 8, wrap: 9 };

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export function esc(s) {
  return String(s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 'YYYY-MM-DD' → 엑셀 날짜 일련번호 */
export function dateToSerial(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000;
}

export function sheetName(name) {
  return String(name).replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
}

function cellXml(ref, cell) {
  if (cell == null) return '';
  const c = typeof cell === 'object' ? cell : { v: cell };
  const s = c.s != null ? ` s="${c.s}"` : '';
  if (c.f) {
    const hasV = c.v != null && c.v !== '';
    const isStr = typeof c.v === 'string';
    return `<c r="${ref}"${s}${isStr ? ' t="str"' : ''}><f>${esc(c.f)}</f>${hasV ? `<v>${esc(c.v)}</v>` : ''}</c>`;
  }
  if (c.v == null || c.v === '' || (typeof c.v === 'number' && !Number.isFinite(c.v))) return s ? `<c r="${ref}"${s}/>` : '';
  if (typeof c.v === 'number') return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
  if (typeof c.v === 'boolean') return `<c r="${ref}"${s} t="b"><v>${c.v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
}

function sheetXml(sheet, selected) {
  const pane = sheet.freezeHeader
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
    : '';
  const views = `<sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>`;
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const rows = sheet.rows
    .map((r, ri) => {
      const cells = (r ?? []).map((c, ci) => cellXml(`${colLetter(ci)}${ri + 1}`, c)).join('');
      const ht = ri === 0 && sheet.headerHeight ? ` ht="${sheet.headerHeight}" customHeight="1"` : '';
      return `<row r="${ri + 1}"${ht}>${cells}</row>`;
    })
    .join('');
  const filter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : '';
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  const vals = sheet.validations?.length
    ? `<dataValidations count="${sheet.validations.length}">${sheet.validations
        .map((v) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${v.sqref}"><formula1>&quot;${esc(v.list.join(','))}&quot;</formula1></dataValidation>`)
        .join('')}</dataValidations>`
    : '';
  return `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${views}<sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${rows}</sheetData>${filter}${merges}${vals}<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}

const FONT = '<name val="맑은 고딕"/><family val="2"/><charset val="129"/>';
const BORDER = ['left', 'right', 'top', 'bottom'].map((s) => `<${s} style="thin"><color rgb="FFD0D5DD"/></${s}>`).join('');

const STYLES_XML = `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>
<fonts count="4">
<font><sz val="11"/>${FONT}</font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/>${FONT}</font>
<font><b/><sz val="11"/>${FONT}</font>
<font><b/><sz val="16"/>${FONT}</font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF4C6EF5"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEDF2FF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${BORDER}<diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="3" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * workbook: { sheets: [{ name, rows: Cell[][], widths?, freezeHeader?, autoFilter?, validations?: [{sqref, list}], merges? }] }
 * Cell: 값 | { v, f?, s? }
 */
export function buildXlsx(workbook, date = new Date()) {
  const sheets = workbook.sheets.map((s) => ({ ...s, name: sheetName(s.name) }));
  const sheetEntries = sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const defined = sheets
    .map((s, i) => (s.autoFilter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(s.name.replace(/'/g, "''"))}'!${s.autoFilter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : ''))
    .join('');
  const files = [
    {
      name: '[Content_Types].xml',
      data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView/></bookViews><sheets>${sheetEntries}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, i === 0) })),
  ];
  return zipStore(files, date);
}
