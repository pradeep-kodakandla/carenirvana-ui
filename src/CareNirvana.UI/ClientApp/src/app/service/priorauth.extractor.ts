import { PriorAuth } from './priorauth.schema';

const icd10Pattern = /\b([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)\b/; // ICD-10-CM


const cptHcpcsPattern = /\b(?:[0-9]{5}|[A-Z][0-9]{4})\b/; // CPT 5-digit or HCPCS letter+4

const getVal = (label: string, t: string) => {
  // grabs the value after "Label: " up to end-of-line
  const m = t.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i'));
  return m?.[1]?.trim();
};
const getFlag = (label: string, t: string): boolean | undefined => {
  const m = t.match(new RegExp(`${label}\\s*:\\s*(On|Off)`, 'i'));
  return m ? m[1].toLowerCase() === 'on' : undefined;
};
const onlyDate = (s?: string) => s?.match(/\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/)?.[0];
const onlyDigits = (s?: string) => s?.replace(/[^\d]/g, '') || undefined;
export interface OcrWord { text: string; x0: number; y0: number; x1: number; y1: number; line: number; }

const joinRight = (words: OcrWord[], fromIndex: number, stopLabels: string[] = []): string => {
  const line = words[fromIndex].line;
  const xStart = words[fromIndex].x1;
  const stop = new Set(stopLabels.map(s => s.toLowerCase()));
  const onSameLineRight = words.filter(w => w.line === line && w.x0 >= xStart)
    .map(w => w.text.trim());
  // stop when the next label appears
  const buf: string[] = [];
  for (const t of onSameLineRight) {
    const low = t.toLowerCase();
    if (stop.has(low) || /^(name:|phone:|fax:|date:|npi|specialty|group|dob:?)$/i.test(t)) break;
    buf.push(t);
  }
  return buf.join(' ').replace(/\s{2,}/g, ' ').trim();
};

const findLabelIndex = (words: OcrWord[], labelTokens: string[]): number => {
  const toks = labelTokens.map(s => s.toLowerCase().replace(/[:：]+$/, ''));
  const norm = (s: string) => s.toLowerCase().replace(/[:：]+$/, '');
  for (let i = 0; i <= words.length - toks.length; i++) {
    let ok = true;
    for (let k = 0; k < toks.length; k++) {
      if (norm(words[i + k].text || '') !== toks[k]) { ok = false; break; }
    }
    if (ok) return i + toks.length - 1;
  }
  return -1;
};

const phoneRe = /(\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4})/g;
//const dateRe = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
//const icd10Global = /\b([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)\b/g;
//const cptHcpcsGlobal = /\b(?:[0-9]{5}|[A-Z][0-9]{4})\b/g;

const phonePretty = (s?: string) => s?.replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{4}).*/, '($1) $2-$3');

const phoneRe1 = /\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{4}/g; // allows "457 - 879 - 8585"
const phoneRe2 = /\b\d{10}\b/g;                       // allows "3332223333"
const dateRe = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
const icd10Global = /\b([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)\b/g;
const cptHcpcsGlobal = /\b(?:\d{5}|[A-Z]\d{4})\b/g;

const cleanLine = (s: string) => s.replace(/[|[\]]/g, ' ').replace(/\s{2,}/g, ' ').trim();

function findLineIdx(lines: string[], re: RegExp, start = 0, end?: number): number {
  for (let i = start; i < (end ?? lines.length); i++) {
    if (re.test(lines[i])) return i;
  }
  return -1;
}

function nextValueLine(lines: string[], headerIdx: number, lookahead = 3): string | undefined {
  for (let k = 1; k <= lookahead && headerIdx + k < lines.length; k++) {
    const cand = cleanLine(lines[headerIdx + k]);
    if (cand) return cand;
  }
  return undefined;
}

function firstMatch(re: RegExp, s: string): string | undefined {
  const m = s.match(re);
  return m ? m[0] : undefined;
}

const icd9Global = /\b\d{3}(?:\.\d{1,2})?\b/g;           // e.g., 250, 250.01

function afterLabelInlineOrNext(lines: string[], labelRe: RegExp, start = 0): string | undefined {
  const i = findLineIdx(lines, labelRe, start);
  if (i < 0) return undefined;
  // try inline (text after label on same line)
  const inline = cleanLine(lines[i].replace(labelRe, ''));
  if (inline) return inline;
  // else next non-empty line
  return nextValueLine(lines, i);
}

//const norm = (s: string) =>
//  (s || '')
//    .replace(/\u2019/g, "'")        // smart apostrophe -> '
//    .replace(/[–—]/g, '-')          // ndash/mdash -> hyphen
//    .replace(/[|[\]]/g, ' ')        // remove table bars/brackets
//    .replace(/\s+/g, ' ')           // collapse spaces
//    .trim();

//function between(text: string, start: RegExp, end: RegExp): string | undefined {
//  const t = norm(text);
//  const s = new RegExp(start, 'i'); const e = new RegExp(end, 'i');
//  const m1 = s.exec(t); if (!m1) return undefined;
//  const from = m1.index + m1[0].length;
//  e.lastIndex = from;
//  const m2 = e.exec(t);
//  const to = m2 ? m2.index : t.length;
//  const seg = t.slice(from, to).trim();
//  return seg || undefined;
//}


const norm = (s: string) =>
  (s || '')
    .replace(/\u2019/g, "'")          // curly -> ASCII apostrophe
    .replace(/[–—]/g, '-')            // ndash/mdash -> hyphen
    .replace(/[|[\]]/g, ' ')          // table bars/brackets
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();

// Build a regex that allows junk between letters: "NAME" -> /N\W*A\W*M\W*E/i
const loose = (label: string) =>
  new RegExp(label.split('').map(ch => {
    if (/\w/.test(ch)) return `${ch}\\W*`;
    if (/\s/.test(ch)) return `\\W*`;
    return `\\${ch}`;
  }).join(''), 'i');

function between(text: string, start: RegExp, end: RegExp): string | undefined {
  const t = norm(text);
  const s = new RegExp(start, 'i');
  const e = new RegExp(end, 'i');
  const m1 = s.exec(t);
  if (!m1) return undefined;
  const from = m1.index + m1[0].length;
  e.lastIndex = from;
  const m2 = e.exec(t);
  const to = m2 ? m2.index : t.length;
  const seg = t.slice(from, to).trim();
  return seg || undefined;
}

const first = (re: RegExp, s?: string) => (s ? (s.match(re) || [])[0] : undefined);
const phonesFrom = (s?: string) => {
  if (!s) return [];
  const out = new Set<string>();
  for (const m of s.matchAll(phoneRe1)) out.add(m[0]);
  for (const m of s.matchAll(phoneRe2)) out.add(m[0]);
  return Array.from(out);
};
const uniq = <T,>(a: T[]) => Array.from(new Set(a));

//const first = (re: RegExp, s?: string) => (s ? (s.match(re) || [])[0] : undefined);
//const uniq = <T,>(a: T[]) => Array.from(new Set(a));
// Texas boilerplate headers/lines that commonly pollute values
const texasBoilerplate = [
  'SECTION II — GENERAL INFORMATION',
  'SECTION III — PATIENT INFORMATION',
  'SECTION IV ― PROVIDER INFORMATION',
  'SECTION V ― SERVICES REQUESTED ( WITH CPT, CDT, OR HCPCS CODE ) AND SUPPORTING DIAGNOSES ( WITH ICD CODE )',
  'SECTION VI ― CLINICAL DOCUMENTATION (SEE INSTRUCTIONS PAGE, SECTION VI)',
  'Planned Service or Procedure', 'Code', 'Start Date', 'End Date',
  'Diagnosis Description', 'ICD version', 'Inpatient', 'Outpatient',
  'Provider Office', 'Observation', 'Home', 'Day Surgery', 'Other',
  'Physical Therapy', 'Occupational Therapy', 'Speech Therapy', 'Cardiac Rehab',
  'Mental Health/Substance Abuse', 'Number of Sessions', 'Duration', 'Frequency',
  'Home Health', 'MD Signed Order', 'Nursing Assessment',
  'DME', 'Medicaid Only', 'Title 19 Certification', 'Equipment/Supplies',
  'NOFR001', 'Page 2 of 2'
];

function stripTexasBoilerplate(text: string): string {
  let t = text;
  for (const phrase of texasBoilerplate) {
    // remove lines that are just the phrase or include it as a header
    t = t.replace(new RegExp(`^.*${phrase}.*$`, 'gmi'), '');
  }
  // collapse leftover multiple blank lines
  t = t.replace(/\n{3,}/g, '\n\n');
  return t;
}

function onlyDates(s: string | undefined): string | undefined {
  if (!s) return s;
  const m = s.match(/\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}\-\d{2}\-\d{2})\b/);
  return m ? m[0] : undefined; // drop garbage like single "1"
}



function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

type Extractor = (text: string) => Partial<PriorAuth>;
const pick = (re: RegExp, text: string) => text.match(re)?.[1]?.trim();

const genericExtractor: Extractor = (text) => {
  const pa: Partial<PriorAuth> = {};

  // Patient basics
  const memberId = pick(/(?:Member(?:\s+or\s+Medicaid)?\s*ID\s*#?:?|CMDP ID NO\.?)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i, text);
  const name = pick(/(?:Patient(?:’s)?\s*Name|Member(?:’s)?\s*Last Name.*?\n)([^\n]+)/i, text) || pick(/Name:\s*([^\n]+)/i, text);
  const dob = pick(/(?:DOB|Date of Birth)\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}|[0-9]{4}\-[0-9]{2}\-[0-9]{2})/i, text);
  const phone = pick(/Phone(?:\s*Number)?\s*[:\-]?\s*([()\-\s0-9]{7,})/i, text);

  // Extract possible ICD-10 codes and filter strictly
  const dxMatches = text.match(icd10Global) || [];
  const dxCodes = unique(dxMatches);

  // Extract a reasonable service code (avoid headers like NOFR001 / CODE)
  const svcCodes = (text.match(cptHcpcsGlobal) || []).filter(c => !/^(?:00000|99999)$/.test(c));
  const firstServiceCode = svcCodes[0];

  // Service dates (strict)
  const startDate = onlyDates(pick(/(?:Start Date|Date Service to Begin|Date of Service\(s\) Requested)\s*[:\-]?\s*([^\n]+)/i, text));
  const endDate = onlyDates(pick(/(?:End Date|To End|To\/From \(Date\).*\bTo|\bTo)\s*[:\-]?\s*([^\n]+)/i, text));

  // Review type (heuristic)
  const reviewType =
    /Urgent/i.test(text) ? 'Urgent' :
      /Non-?Urgent|Routine/i.test(text) ? (/Routine/i.test(text) ? 'Routine' : 'Non-Urgent') :
        undefined;

  const inpatient = /\bInpatient\b/i.test(text) && !/Outpatient only/i.test(text);
  const outpatient = /\bOutpatient\b/i.test(text);

  pa.patient = { name, memberId, dob, phone };
  if (dxCodes.length) pa.dx = { codes: dxCodes };
  pa.services = firstServiceCode ? [{ code: firstServiceCode, description: 'Service', startDate, endDate }] : [];
  pa.review = { type: reviewType };
  pa.setting = { inpatient, outpatient };
  return pa;
};

// Form detectors + adapters (trim as needed)
const isTexas = (t: string) => /TEXAS STANDARD PRIOR AUTHORIZATION REQUEST FORM/i.test(t);
const isArizona = (t: string) => /PRIOR AUTHORIZATION FOR MEDICAL\/SURGICAL SERVICES/i.test(t);
const isGeorgia = (t: string) => /Georgia Medical Prior Authorization Request Form/i.test(t);
export const isNevada = (t: string) =>
  /NEVADA HEALTH SOLUTIONS/i.test(t) || /NHS Fax \(702\) 691-?5614/i.test(t);

// Banner Plans & Networks — BPN_PA046 family.
// Multiple markers because pdf.js text extraction order varies:
//   - "Banner Plans & Networks" comes from the logo block at top of page
//   - "BPN_PA046" is the form code in the footer
//   - The "Banner – University…" and "Banner Medicare Advantage Dual HMO D-SNP"
//     strings live in the Health Plan checkbox row near the top.
// Any one match is enough — these phrases don't appear in TX/AZ/GA/NHS forms.
export const isBanner = (t: string) =>
  /Banner\s+Plans\s*&\s*Networks/i.test(t) ||
  /BPN_PA046/i.test(t) ||
  /Banner\s+Medicare\s+Advantage\s+Dual\s+HMO\s+D-?SNP/i.test(t) ||
  /Banner\s*[\u2013\-]\s*University\s+Family\s+Care/i.test(t);

// UMR Prior Authorization Fax Sheet.
// Markers (any one is enough — these don't appear on TX/AZ/GA/NHS/Banner forms):
//   - The "PLEASE COMPLETE FORM AND ATTACH WITH CLINICAL RECORDS" header
//   - The distinctive UMR confidentiality footer ("UMR's confidential and/or
//     proprietary business information")
export const isUMR = (t: string) =>
  /UMR(?:[\u2019']s)?\s+confidential\s+and\/or\s+proprietary/i.test(t) ||
  /PLEASE\s+COMPLETE\s+FORM\s+AND\s+ATTACH\s+WITH\s+CLINICAL\s+RECORDS/i.test(t);

// === Replace your current texasAdapter with this version ===
const texasAdapter: Extractor = (raw) => {
  const text = raw;

  // --- Submission / Issuer ---
  const issuerName = getVal('Issuer Name', text) || getVal('Issuer', text);
  const issuerPhone = getVal('Issuer Phone Number', text) || getVal('Phone', text);
  const issuerFax = getVal('Issuer Fax Number', text) || getVal('Fax', text);
  const issuerDate = onlyDate(getVal('Submission Date', text) || getVal('Date', text));
  const prevAuth = getVal('Previous Authorization Number', text) || getVal('Prev. Auth. #', text);

  // --- Patient ---
  const patientName = getVal('Patient Name', text) || getVal('Name', text);
  const patientPhone = getVal('Patient Phone Number', text) || getVal('Phone', text);
  const patientDob = onlyDate(getVal('Patient Date of Birth', text) || getVal('DOB', text));
  const memberId = getVal('Member or Medicaid ID Number', text) || getVal('Member or Medicaid ID #', text);
  const groupNumber = getVal('Group Number', text) || getVal('Group #', text);

  // --- Providers (Requesting / Servicing) ---
  const reqName = getVal('Requesting Provider or Facility Name', text);
  const reqNpi = getVal('Requesting Provider or Facility NPI Number', text);
  const reqSpec = getVal('Requesting Provider or Facility Specialty', text);
  const reqPhone = getVal('Requesting Provider or Facility Phone Number', text);
  const reqFax = getVal('Requesting Provider or Facility Fax Number', text);
  const reqCName = getVal('Requesting Provider or Facility Contact Name', text);
  const reqCPhone = getVal('Requesting Provider or Facility Contact Phone Number', text);

  const svcName = getVal('Service Provider or Facility Name', text);
  const svcNpi = getVal('Service Provider or Facility NPI Number', text);
  const svcSpec = getVal('Service Provider or Facility Specialty', text);
  const svcPhone = getVal('Service Provider or Facility Phone Number', text);
  const svcFax = getVal('Service Provider or Facility Fax Number', text);

  // --- Review Type (explicit flags) ---
  let reviewType: string | undefined;
  if (getFlag('Review Type - Urgent', text)) reviewType = 'Urgent';
  else if (getFlag('Review Type - Non-Urgent', text)) reviewType = 'Non-Urgent';

  // --- Setting flags (explicit On/Off) ---
  const inpatient = getFlag('Inpatient', text);
  const outpatient = getFlag('Outpatient', text);

  // --- Services (Row 1 preferred) ---
  const svcDesc = getVal('Planned Service or Procedure Row 1', text) || getVal('Planned Service or Procedure', text);
  const svcCode = getVal('Planned Service or Procedure Code Row 1', text) || getVal('Code', text);
  const start = onlyDate(getVal('Planned Service or Procedure Start Date Row 1', text) || getVal('Start Date', text));
  const end = onlyDate(getVal('Planned Service or Procedure End Date Row 1', text) || getVal('End Date', text));
  // Some forms show diagnosis description/code per row:
  const dxDesc = getVal('Planned Service or Procedure Diagnosis Description Row 1', text) || getVal('Diagnosis Description', text);
  const dxCode1 = getVal('Planned Service or Procedure Diagnosis Code Row 1', text) || getVal('Code', text);
  // Fallback: scan whole text for legit ICD-10 tokens
  const dxAll = Array.from(text.matchAll(icd10Global), m => m[1]);

  // Ensure we end up with string[] (no undefineds)
  const dxCodes = Array.from(new Set(
    [dxCode1, ...dxAll].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
  ));

  const services = (svcCode || svcDesc || start || end) ? [{
    code: svcCode ? svcCode.trim() : undefined,
    description: svcDesc || 'Service',
    startDate: start,
    endDate: end,
    diagnosisDescription: dxDesc,
    diagnosisCode: dxCodes[0]
  }] : [];

  const pa: Partial<PriorAuth> = {
    source: { template: 'Texas TDI NOFR001', confidence: 0.95 },
    submission: { issuerName, phone: issuerPhone, fax: issuerFax, date: issuerDate, prevAuthNumber: prevAuth },
    review: { type: reviewType },
    patient: {
      name: patientName,
      phone: patientPhone,
      dob: patientDob,
      memberId,
      groupNumber
    },
    providerRequesting: {
      name: reqName, npi: reqNpi, specialty: reqSpec, phone: reqPhone, fax: reqFax,
      contactName: reqCName, contactPhone: reqCPhone
    },
    providerServicing: {
      name: svcName, npi: svcNpi, specialty: svcSpec, phone: svcPhone, fax: svcFax
    },
    setting: { inpatient, outpatient },
    services: services.length ? services : undefined,
    dx: dxCodes.length ? { codes: dxCodes } : undefined,
  };

  return pa;
};


// AZ CMDP CSO-1179A — Page 1 values are on the NEXT non-empty line after each label
// --- AZ CMDP CSO-1179A: robust "between labels" parser for page 1 text ---
// CSO-1179A (AZ) — tolerant "between labels" parser that handles split letters like "NA ME"
const arizonaAdapter: Extractor = (raw) => {
  const text = norm(raw);

  // Label regexes that allow garbage between letters
  const L = {
    PATIENT_NAME: loose("PATIENT'S NAME"),
    CMDP_ID: loose('CMDP ID NO.'),
    DOB: loose('DATE OF BIRTH'),
    REF_NAME: loose("REFERRING PHYSICIAN'S NAME"),
    AHCCCS: loose('AHCCCS REGISTRATION NO.'),
    REF_ADDR: loose("REFERRING PHYSICIAN'S ADDRESS"),
    PHONE_NO: loose('PHONE NO.'),
    DATE_BEGIN: loose('DATE SERVICE TO BEGIN'),
    TO_END: loose('TO END'),
    FAX_NO: loose('FAX NO.'),
    DIAGNOSIS: loose('DIAGNOSIS'),
    SVC_RECOMMENDED: loose('SERVICE RECOMMENDED'),
    SVC_RATIONALE: loose('SERVICE RATIONALE'),
    REF_SIGNATURE: loose("REFERRING PHYSICIAN'S SIGNATURE"),
    NPI_NO: loose('NPI NO.'),
    PROV_NAME: loose("PROVIDER'S NAME"),
    PROV_ADDR: loose("PROVIDER'S ADDRESS"),
    FACILITY_NAME: loose('FACILITY NAME'),
    FACILITY_ADDR: loose('FACILITY ADDRESS'),
  };

  // Review type from banner
  const banner = text.slice(0, 1400);
  let reviewType: PriorAuth['review'] extends infer _ ? 'Emergency' | 'Urgent' | 'Routine' | 'Initial' | 'Renewal' | undefined : never;
  if (/EMERGENCY/i.test(banner)) reviewType = 'Emergency';
  else if (/URGENT/i.test(banner)) reviewType = 'Urgent';
  else if (/ROUTINE/i.test(banner)) reviewType = 'Routine';
  else if (/INITIAL/i.test(banner)) reviewType = 'Initial';
  else if (/RENEWAL/i.test(banner)) reviewType = 'Renewal';

  const cleanPersonName = (s?: string): string | undefined => {
    if (!s) return undefined;
    let t = s;
    // Examples: "(Last, First, M.I.) King, Alexander", "Last, First, M.I.) King, Alexander"
    t = t.replace(/^\s*\(?\s*Last,\s*First,\s*M\.?I\.?\s*\)?\s*/i, '');
    // Examples: "(Print or type) Mathew Jones", "Print or type) Mathew Jones"
    t = t.replace(/^\s*\(?\s*Print\s*or\s*type\s*\)?\s*/i, '');
    t = t.replace(/^\s*[\)\(:\-]+\s*/g, '');
    t = t.replace(/\s{2,}/g, ' ').trim();
    return t || undefined;
  };
  // Patient
  const patientNameRaw = between(text, L.PATIENT_NAME, L.CMDP_ID);
  const patientName = cleanPersonName(patientNameRaw);
  const memberId = between(text, L.CMDP_ID, L.DOB)?.match(/\b[0-9A-Z\-]{3,}\b/)?.[0];
  const dob = first(dateRe, between(text, L.DOB, L.REF_NAME));

  // Referring (requesting) physician
  const refNameRaw = between(text, L.REF_NAME, L.AHCCCS);
  const refName = cleanPersonName(refNameRaw);
  const refAddr = between(text, L.REF_ADDR, L.PHONE_NO);
  const refPhone = phonesFrom(between(text, L.PHONE_NO, L.DATE_BEGIN))[0];
  const svcStart = first(dateRe, between(text, L.DATE_BEGIN, L.TO_END));
  const svcEnd = first(dateRe, between(text, L.TO_END, L.FAX_NO));
  const refFax = phonesFrom(between(text, L.FAX_NO, L.DIAGNOSIS))[0];

  // Diagnosis (accept ICD-10 or ICD-9 like 250.01)
  const dxBlk = between(text, L.DIAGNOSIS, L.SVC_RECOMMENDED) || '';
  const dx10 = Array.from(dxBlk.matchAll(icd10Global), m => m[1]);
  const dx9 = Array.from(dxBlk.matchAll(icd9Global), m => m[0]);
  const dxCodes = uniq([...dx10, ...dx9]);

  // Service & rationale
  const svcRec = between(text, L.SVC_RECOMMENDED, L.SVC_RATIONALE) || '';
  const svcCodeFromSvcRec = first(cptHcpcsGlobal, svcRec);


  // Bottom table: "HCPCS/CPT DESCRIPTION CHARGES A9604 STRONTIUM ... $108.00"
  // Strategy 1: strict regex — header words immediately followed by code
  const hcpcsRow = text.match(/HCPCS\/CPT\s+DESCRIPTION\s+CHARGES\s+(\b(?:\d{5}|[A-Z]\d{4})\b)\s+(.+?)(?=\s+\$?\d)/i);
  let hcpcsCode = hcpcsRow?.[1];
  let hcpcsDesc = hcpcsRow?.[2]?.trim();

  // Strategy 2: find "HCPCS" or "CPT" label, then scan nearby text for a code
  if (!hcpcsCode) {
    const hcpcsIdx = text.search(/HCPCS\/?CPT/i);
    if (hcpcsIdx >= 0) {
      // Scan up to 500 chars after the label for an HCPCS code (letter+4 digits)
      const window = text.slice(hcpcsIdx, hcpcsIdx + 500);
      const codeMatch = window.match(/\b([A-Z]\d{4})\b/);
      if (codeMatch) {
        hcpcsCode = codeMatch[1];
        // Try to grab the description after the code
        const afterCode = window.slice(window.indexOf(hcpcsCode) + hcpcsCode.length);
        const descMatch = afterCode.match(/^\s+(.+?)(?=\s+\$[\d,]+|\s{3,}|$)/);
        if (descMatch && !hcpcsDesc) hcpcsDesc = descMatch[1].trim();
      }
      // Also check for 5-digit CPT code if no alpha code found
      if (!hcpcsCode) {
        const cptMatch = window.match(/\b(\d{5})\b/);
        if (cptMatch) hcpcsCode = cptMatch[1];
      }
    }
  }

  // Strategy 3: global scan for HCPCS alpha codes (A-Z + 4 digits) anywhere in text
  // Exclude form identifiers like CSO-1179A by checking surrounding context
  if (!hcpcsCode) {
    const allCodes = Array.from(text.matchAll(/\b([A-Z]\d{4})\b/g), m => m[1]);
    // Filter out form numbers and ICD codes (ICD-10 codes start with specific letters and have dots)
    const filtered = allCodes.filter(c => {
      const idx = text.indexOf(c);
      const before = text.slice(Math.max(0, idx - 10), idx).toUpperCase();
      // Skip if preceded by CSO-, CMD-, form-like prefixes
      return !/(?:CSO|CMD|FORM|REF|NO\.)[-\s]*$/i.test(before);
    });
    if (filtered.length) hcpcsCode = filtered[0];
  }

  const svcCode = svcCodeFromSvcRec || hcpcsCode || undefined;

  const rationaleRaw = between(text, L.SVC_RATIONALE, L.REF_SIGNATURE);
  const rationale = rationaleRaw
    ?.replace(/^\s*(?:AND\s+PROGNOSIS)?\s*(?:\([^)]*\))?\s*/i, '')
    ?.trim();

  const svcDesc = hcpcsDesc || (svcRec.trim() || undefined) || rationale || undefined;

  // NPI (search the region after signature first, else global)
  let npiTop = between(text, L.REF_SIGNATURE, L.PROV_NAME)?.match(/\bNPI\W*NO\.?\W*([0-9]{6,})/i)?.[1];
  if (!npiTop) npiTop = text.match(/\bNPI\W*NO\.?\W*([0-9]{6,})/i)?.[1];

  // Servicing provider / facility
  const provNameRaw = between(text, L.PROV_NAME, L.AHCCCS) || between(text, L.PROV_NAME, L.FAX_NO);
  const provName = cleanPersonName(provNameRaw);
  const provAddr = between(text, L.PROV_ADDR, L.PHONE_NO);
  const provPhone = phonesFrom(between(text, loose("PROVIDER'S PHONE NO."), L.FACILITY_NAME))[0]
    || phonesFrom(between(text, L.PHONE_NO, L.FACILITY_NAME))[0];
  const provFax = phonesFrom(between(text, loose("PROVIDER'S FAX NO."), L.PROV_ADDR))[0]
    || phonesFrom(between(text, L.FAX_NO, L.PROV_ADDR))[0];

  const facility = between(text, L.FACILITY_NAME, L.FAX_NO);
  const facilityFax = phonesFrom(between(text, L.FAX_NO, L.FACILITY_ADDR))[0];
  const facilityAddr = between(text, L.FACILITY_ADDR, L.PHONE_NO);

  const out: Partial<PriorAuth> = {
    source: { template: 'AZ CMDP CSO-1179A', confidence: 0.95 },
    review: { type: reviewType },
    patient: { name: patientName, memberId, dob },
    providerRequesting: {
      name: refName,
      address: refAddr || undefined,
      phone: phonePretty(refPhone) || refPhone,
      fax: phonePretty(refFax) || refFax,
      npi: npiTop
    },
    providerServicing: {
      name: provName,
      address: provAddr || undefined,
      phone: phonePretty(provPhone) || provPhone,
      fax: phonePretty(provFax) || provFax,
      facility: facility || undefined
      // If you want: include facilityFax/facilityAddr in address/notes
    },
  };

  // Only include services if we actually extracted useful data; otherwise let generic extractor's result stand
  const hasServiceData = svcCode || svcDesc || svcStart || svcEnd;
  if (hasServiceData) {
    out.services = [{
      code: svcCode,
      description: svcDesc,
      startDate: svcStart,
      endDate: svcEnd,
      diagnosisCode: dxCodes[0]
    }];
  }

  if (dxCodes.length) out.dx = { codes: dxCodes, description: dxBlk || undefined };
  return out;
};





// GA CareSource (GA-P-0229) — Page 1 values appear on the NEXT line after headers
const georgiaAdapter: Extractor = (raw) => {
  const lines = raw.split(/\r?\n/).map(cleanLine).filter(Boolean);

  const out: Partial<PriorAuth> = {
    source: { template: 'GA CareSource GA-P-0229', confidence: 0.95 },
    patient: {}, providerRequesting: {}, providerServicing: {}, review: {}, submission: {},
  };

  // Routine / Urgent
  const banner = lines.slice(0, 40).join(' ');
  if (/Urgent/i.test(banner) && !/Routine/i.test(banner)) out.review = { type: 'Urgent' };
  else if (/Routine/i.test(banner)) out.review = { type: 'Routine' };

  // Patient block
  let pStart = findLineIdx(lines, /PATIENT INFORMATION/i);
  if (pStart < 0) pStart = 0;

  // "Date of Request  Member ID #  Member’s Last Name  First Name"
  let idx = findLineIdx(lines, /Date of Request.*Member ID/i, pStart, pStart + 15);
  if (idx >= 0) {
    const v = nextValueLine(lines, idx);
    if (v) {
      const date = firstMatch(dateRe, v);
      const memberId = (v.match(/\b[0-9A-Z\-]{4,}\b/) || [])[0];
      let name = v; if (date) name = name.replace(date, ' '); if (memberId) name = name.replace(memberId, ' ');
      name = cleanLine(name);
      if (date) out.submission = { ...(out.submission ?? {}), date };
      out.patient = { ...(out.patient ?? {}), memberId, name: name || undefined };
    }
  }

  // "DOB  Phone Number"
  idx = findLineIdx(lines, /\bDOB\b.*Phone Number/i, pStart, pStart + 15);
  if (idx >= 0) {
    const v = nextValueLine(lines, idx);
    if (v) {
      const dob = firstMatch(dateRe, v);
      const phone = firstMatch(phoneRe, v);
      out.patient = { ...(out.patient ?? {}), dob, phone };
    }
  }

  // Ordering Provider
  idx = findLineIdx(lines, /Ordering Provider Name/i);
  if (idx >= 0) {
    const name = nextValueLine(lines, idx);
    const taxNpi = nextValueLine(lines, idx + 1);
    const phoneFax = nextValueLine(lines, idx + 2);
    const address = nextValueLine(lines, idx + 3);
    const npi = taxNpi?.match(/\bNPI\b\s*([0-9]{6,})/i)?.[1] || taxNpi?.match(/\b([0-9]{6,})\b/)?.[1];
    const phone = firstMatch(phoneRe, phoneFax || '');
    const fax = (phoneFax || '').replace(phone || '', ' ').match(phoneRe)?.[0];
    out.providerRequesting = { name: name || undefined, npi, phone, fax, address: address || undefined };
  }

  // Date of Service(s) Requested
  idx = findLineIdx(lines, /Date of Service\(s\) Requested/i);
  if (idx >= 0) {
    const v = nextValueLine(lines, idx);
    if (v) {
      const dates = Array.from(v.matchAll(dateRe)).map(m => m[0]);
      out.services = [{ startDate: dates[0], endDate: dates[1] }];
    }
  }

  // Facility / Service Provider
  idx = findLineIdx(lines, /Facility\/Service Provider/i);
  if (idx >= 0) {
    const name = nextValueLine(lines, idx);
    const address = nextValueLine(lines, idx + 1);
    const phoneFax = nextValueLine(lines, idx + 2);
    const taxNpi = nextValueLine(lines, idx + 3);
    const npi = taxNpi?.match(/\bNPI\b\s*([0-9]{6,})/i)?.[1] || taxNpi?.match(/\b([0-9]{6,})\b/)?.[1];
    const phone = firstMatch(phoneRe, phoneFax || '');
    const fax = (phoneFax || '').replace(phone || '', ' ').match(phoneRe)?.[0];
    out.providerServicing = { name: name || undefined, address: address || undefined, phone, fax, npi };
  }

  // DX + Procedure codes
  idx = findLineIdx(lines, /\bDX Codes\b/i);
  if (idx >= 0) {
    const codesLine = nextValueLine(lines, idx);
    const descLine = nextValueLine(lines, idx + 1);
    const codes = Array.from((codesLine || '').matchAll(icd10Global), m => m[1]);
    if (codes.length || descLine) out.dx = { codes: Array.from(new Set(codes)), description: descLine || undefined };
  }
  idx = findLineIdx(lines, /Requested Procedures\/Services\/Surgery/i);
  if (idx >= 0) {
    const desc = nextValueLine(lines, idx);
    const codesLine = nextValueLine(lines, idx + 1);
    const codes = Array.from((codesLine || '').matchAll(cptHcpcsGlobal)).map(m => m[0]);
    if (!out.services?.length) out.services = [{}];
    out.services[0] = { ...(out.services[0] ?? {}), description: desc || undefined, code: codes[0] };
  }

  return out;
};




export function extractPriorAuth(text: string, formFields: Record<string, string> = {}): PriorAuth {
  let out: Partial<PriorAuth> = genericExtractor(text);
  if (isTexas(text)) out = { ...out, ...texasAdapter(text) };
  if (isArizona(text)) out = { ...out, ...arizonaAdapter(text) };
  if (isGeorgia(text)) out = { ...out, ...georgiaAdapter(text) };
  if (isNevada(text) && formFields && Object.keys(formFields).length) {
    out = { ...out, ...extractNhsFromFields(formFields) };
  }
  if (isBanner(text) && formFields && Object.keys(formFields).length) {
    out = { ...out, ...extractBannerFromFields(formFields) };
  }
  if (isUMR(text) && formFields && Object.keys(formFields).length) {
    out = { ...out, ...extractUmrFromFields(formFields) };
  }
  if (out.dx?.codes) out.dx.codes = Array.from(new Set(out.dx.codes.map(x => x.replace(/[^A-Za-z0-9.\-]/g, ''))));
  return out as PriorAuth;
}

export function extractTexasFromText(pageText: string): Partial<PriorAuth> {
  const lines = pageText.split(/\r?\n/).map(cleanLine).filter(Boolean);

  const out: Partial<PriorAuth> = {
    source: { template: 'Texas TDI NOFR001', confidence: 0.95 },
    patient: {},
    submission: {},
    providerRequesting: {},
    providerServicing: {},
    review: {},
  };

  // --- SUBMISSION (Issuer Name, Phone, Fax, Date) ---
  // Header example: "| Issuer Name: Phone: Fax: Date: |" then next line has values
  let idx = findLineIdx(lines, /Issuer\s+Name:\s*Phone:\s*Fax:\s*Date:/i);
  if (idx >= 0) {
    const v = nextValueLine(lines, idx);
    if (v) {
      const phones = Array.from(v.matchAll(phoneRe)).map(m => m[1]);
      const date = firstMatch(dateRe, v);
      let name = v;
      for (const p of phones) name = name.replace(p, ' ');
      if (date) name = name.replace(date, ' ');
      name = cleanLine(name);
      out.submission = {
        issuerName: name || undefined,
        phone: phones[0],
        fax: phones[1],
        date
      };
    }
  }

  // --- GENERAL INFO (Review Type) ---
  // Example: "Review Type: [=] Non-Urgent O Urgent"
  idx = findLineIdx(lines, /Review\s*Type:/i);
  if (idx >= 0) {
    const line = lines[idx];
    if (/\[=\]\s*Non-?Urgent/i.test(line)) out.review = { ...out.review, type: 'Non-Urgent' };
    else if (/\[=\]\s*Urgent/i.test(line)) out.review = { ...out.review, type: 'Urgent' };
  }

  // --- PATIENT (Name, Phone, DOB) ---
  // Header: "Name: Phone: DOB:" then next line has values
  let pStart = findLineIdx(lines, /SECTION\s*III/i);
  if (pStart < 0) pStart = 0; // fallback
  idx = findLineIdx(lines, /\bName:\s*Phone:\s*DOB:/i, pStart, pStart + 12);
  if (idx >= 0) {
    const v = nextValueLine(lines, idx);
    if (v) {
      const phone = firstMatch(phoneRe, v);
      const dob = firstMatch(dateRe, v);
      let name = v;
      if (phone) name = name.replace(phone, ' ');
      if (dob) name = name.replace(dob, ' ');
      // Strip common checkbox words that might appear after DOB
      name = cleanLine(name.replace(/\b(male|female|other|unknown)\b/ig, ''));
      out.patient = { ...out.patient, name: name || undefined, phone, dob };
    }
  }

  // Subscriber / Member or Medicaid ID / Group (two numbers at end)
  idx = findLineIdx(lines, /Subscriber\s+Name.*Member\s+or\s+Medicaid\s+ID\s*#?:\s*Group\s*#?:/i, pStart, pStart + 12);
  if (idx >= 0) {
    const v = nextValueLine(lines, idx);
    if (v) {
      // assume last two numeric-ish tokens are memberId and group
      const nums = v.match(/\b[0-9]{4,}\b/g) || [];
      const memberId = nums[0];
      const groupNumber = nums[1];
      let subName = v;
      if (memberId) subName = subName.replace(memberId, ' ');
      if (groupNumber) subName = subName.replace(groupNumber, ' ');
      subName = cleanLine(subName);
      out.patient = { ...out.patient, memberId, groupNumber };
      // If subscriber name is truly different you can store it in out.subscriber?.name
      if (subName && subName !== out.patient?.name) out.subscriber = { name: subName };
    }
  }

  // --- PROVIDERS (SECTION IV) ---
  let vStart = findLineIdx(lines, /SECTION\s*IV/i);
  let vEnd = findLineIdx(lines, /SECTION\s*V/i, vStart + 1);
  if (vStart < 0) vStart = 0;
  if (vEnd < 0) vEnd = Math.min(lines.length, vStart + 30);
  const provLines = lines.slice(vStart, vEnd);

  // Names: two occurrences on a single line: "... Name: DewelON ... Name: Jenifer Brown ..."
  const nameMatches = Array.from(provLines.join(' | ').matchAll(/\bName:\s*([A-Za-z][A-Za-z.\-'\s]+)/g)).map(m => cleanLine(m[1]));
  if (nameMatches[0]) out.providerRequesting = { ...(out.providerRequesting ?? {}), name: nameMatches[0] };
  if (nameMatches[1]) out.providerServicing = { ...(out.providerServicing ?? {}), name: nameMatches[1] };

  // NPI
  const npiMatches = Array.from(provLines.join(' | ').matchAll(/\bNPI\s*#?:\s*([0-9]{6,})/g)).map(m => m[1]);
  if (npiMatches[0]) out.providerRequesting = { ...(out.providerRequesting ?? {}), npi: npiMatches[0] };
  if (npiMatches[1]) out.providerServicing = { ...(out.providerServicing ?? {}), npi: npiMatches[1] };

  // Phones
  const phoneMatches = Array.from(provLines.join(' | ').matchAll(/\bPhone:\s*([()0-9\- \t]{7,})/g)).map(m => cleanLine(m[1]));
  if (phoneMatches[0]) out.providerRequesting = { ...(out.providerRequesting ?? {}), phone: phoneMatches[0] };
  if (phoneMatches[1]) out.providerServicing = { ...(out.providerServicing ?? {}), phone: phoneMatches[1] };

  // Faxes
  const faxMatches = Array.from(provLines.join(' | ').matchAll(/\bFax:\s*([()0-9\- \t]{7,})/g)).map(m => cleanLine(m[1]));
  if (faxMatches[0]) out.providerRequesting = { ...(out.providerRequesting ?? {}), fax: faxMatches[0] };
  if (faxMatches[1]) out.providerServicing = { ...(out.providerServicing ?? {}), fax: faxMatches[1] };

  // --- SERVICES (SECTION V) ---
  // Header line + next line usually holds Code, Start Date, End Date, Diagnosis description/code.
  let sStart = findLineIdx(lines, /SECTION\s*V/i);
  if (sStart < 0) sStart = 0;
  const codeHeader = findLineIdx(lines, /Planned\s+Service\s+or\s+Procedure\s+Code/i, sStart, sStart + 12);
  if (codeHeader >= 0) {
    const v = nextValueLine(lines, codeHeader);
    if (v) {
      const codes = Array.from(v.matchAll(cptHcpcsGlobal)).map(m => m[0]);
      const dates = Array.from(v.matchAll(dateRe)).map(m => m[0]);
      const icds = Array.from(pageText.matchAll(icd10Global), m => m[1]);
      out.services = [{
        code: codes[0],
        description: undefined,
        startDate: dates[0],
        endDate: dates[1],
        diagnosisCode: icds[0]
      }];
    }
  } else {
    // fallback: search nearby lines
    const near = lines.slice(sStart, sStart + 12).join(' ');
    const codes = Array.from(near.matchAll(cptHcpcsGlobal)).map(m => m[0]);
    const dates = Array.from(near.matchAll(dateRe)).map(m => m[0]);
    const icds = Array.from(pageText.matchAll(icd10Global), m => m[1]);
    if (codes.length || dates.length || icds.length) {
      out.services = [{
        code: codes[0],
        startDate: dates[0],
        endDate: dates[1],
        diagnosisCode: icds[0]
      }];
    }
  }

  // Add DX list (global scan on page)
  const dxAll = Array.from(pageText.matchAll(icd10Global), m => m[1]);
  if (dxAll.length) out.dx = { codes: Array.from(new Set(dxAll)) };

  return out;
}



export function extractGeorgiaFromText(pageText: string): Partial<PriorAuth> {
  const lines = pageText.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const out: Partial<PriorAuth> = {
    source: { template: 'GA CareSource GA-P-0229', confidence: 0.95 },
    patient: {}, review: {}, submission: {},
    providerRequesting: {}, providerServicing: {}
  };

  // Routine/Urgent hint at the top
  if (/Urgent/i.test(lines.join(' ')) && !/Routine/i.test(lines.join(' '))) out.review = { type: 'Urgent' };
  else if (/Routine/i.test(lines.join(' '))) out.review = { type: 'Routine' };

  // PATIENT INFORMATION
  let pStart = findLineIdx(lines, /PATIENT INFORMATION/i);
  if (pStart < 0) pStart = 0;

  // Date of Request | Member ID # | Member’s Last Name | First Name
  let idx = findLineIdx(lines, /Date of Request.*Member ID/i, pStart, pStart + 15);
  if (idx >= 0) {
    const v = nextValueLine(lines, idx);
    if (v) {
      const dor = firstMatch(dateRe, v);
      const ids = v.match(/\b[0-9A-Z\-]{4,}\b/g) || [];
      const memberId = ids[0];
      let nameStr = v; if (dor) nameStr = nameStr.replace(dor, ' '); if (memberId) nameStr = nameStr.replace(memberId, ' ');
      nameStr = cleanLine(nameStr);
      if (nameStr) out.patient = { ...(out.patient ?? {}), name: nameStr };
      if (dor) out.submission = { ...(out.submission ?? {}), date: dor };
      if (memberId) out.patient = { ...(out.patient ?? {}), memberId };
    }
  }

  // DOB | Phone Number
  idx = findLineIdx(lines, /\bDOB\b.*Phone Number/i, pStart, pStart + 15);
  if (idx >= 0) {
    const v = nextValueLine(lines, idx);
    if (v) {
      const dob = firstMatch(dateRe, v);
      const phone = firstMatch(phoneRe, v);
      out.patient = { ...(out.patient ?? {}), dob, phone };
    }
  }

  // Ordering Provider block
  idx = findLineIdx(lines, /Ordering Provider Name/i);
  if (idx >= 0) {
    const name = nextValueLine(lines, idx);
    const taxNpi = nextValueLine(lines, idx + 1);
    const phoneFax = nextValueLine(lines, idx + 2);
    const addr = nextValueLine(lines, idx + 3);
    const npi = taxNpi?.match(/\bNPI\b\s*([0-9]{6,})/i)?.[1] || taxNpi?.match(/\b([0-9]{6,})\b/)?.[1];
    const phone = firstMatch(phoneRe, phoneFax || '');
    const fax = (phoneFax || '').replace(phone || '', '').match(phoneRe)?.[0];
    out.providerRequesting = { name: name || undefined, npi, phone, fax, address: addr || undefined };
  }

  // Date of Service(s) Requested
  idx = findLineIdx(lines, /Date of Service\(s\) Requested/i);
  if (idx >= 0) {
    const v = nextValueLine(lines, idx);
    if (v) {
      const dates = Array.from(v.matchAll(dateRe)).map(m => m[0]);
      out.services = [{ startDate: dates[0], endDate: dates[1] }];
    }
  }

  // Facility / Service Provider block
  idx = findLineIdx(lines, /Facility\/Service Provider/i);
  if (idx >= 0) {
    const name = nextValueLine(lines, idx);
    const addr = nextValueLine(lines, idx + 1); // Provider Address
    const phoneFax = nextValueLine(lines, idx + 2);
    const taxNpi = nextValueLine(lines, idx + 3);
    const npi = taxNpi?.match(/\bNPI\b\s*([0-9]{6,})/i)?.[1] || taxNpi?.match(/\b([0-9]{6,})\b/)?.[1];
    const phone = firstMatch(phoneRe, phoneFax || '');
    const fax = (phoneFax || '').replace(phone || '', '').match(phoneRe)?.[0];
    out.providerServicing = { name: name || undefined, address: addr || undefined, phone, fax, npi };
  }

  // DX Codes / Description
  idx = findLineIdx(lines, /\bDX Codes\b/i);
  if (idx >= 0) {
    const codesLine = nextValueLine(lines, idx);
    const descLine = nextValueLine(lines, idx + 1); // DX Description
    const codes = Array.from((codesLine || '').matchAll(icd10Global), m => m[1]);
    if (codes.length || descLine) out.dx = { codes: Array.from(new Set(codes)), description: descLine || undefined };
  }

  // Requested Procedures / Procedure Codes
  idx = findLineIdx(lines, /Requested Procedures\/Services\/Surgery/i);
  if (idx >= 0) {
    const desc = nextValueLine(lines, idx);
    const codesLine = nextValueLine(lines, idx + 1); // Procedure Codes (CPT/HCPCS)
    const cpts = Array.from((codesLine || '').matchAll(cptHcpcsGlobal)).map(m => m[0]);
    if (!out.services?.length) out.services = [{}];
    out.services[0] = { ...(out.services[0] ?? {}), description: desc || undefined, code: cpts[0] };
  }

  return out;
}


export function extractArizonaFromText(pageText: string): Partial<PriorAuth> {
  const lines = pageText.split(/\r?\n/).map(cleanLine);
  const getNext = (re: RegExp, start = 0) => {
    const i = findLineIdx(lines, re, start);
    if (i < 0) return undefined;
    for (let k = 1; i + k < lines.length && k <= 3; k++) {
      const v = cleanLine(lines[i + k]); if (v) return v;
    }
    return undefined;
  };

  const out: Partial<PriorAuth> = {
    source: { template: 'AZ CMDP CSO-1179A', confidence: 0.95 },
    patient: {}, review: {}, submission: {},
    providerRequesting: {}, providerServicing: {}
  };

  // Review type (scan top banner)
  const banner = lines.slice(0, 40).join(' ');
  if (/EMERGENCY/i.test(banner)) out.review = { type: 'Emergency' };
  else if (/URGENT/i.test(banner)) out.review = { type: 'Urgent' };
  else if (/ROUTINE/i.test(banner)) out.review = { type: 'Routine' };
  else if (/INITIAL/i.test(banner)) out.review = { type: 'Initial' };
  else if (/RENEWAL/i.test(banner)) out.review = { type: 'Renewal' };

  // Patient block
  const pname = getNext(/PATIENT.S NAME/i);
  const pid = getNext(/CMDP ID NO\.?/i);
  const dob = firstMatch(dateRe, getNext(/DATE OF BIRTH/i) || '') || undefined;
  out.patient = { name: pname, memberId: pid, dob };

  // Referring physician block (top half)
  const refName = getNext(/REFERRING PHYSICIAN.S NAME/i);

  // ── NPI: extract digits from same line AND next line (OCR may place it either way) ──
  // OCR often inserts spaces within digit sequences ("10000000 2" instead of "100000002")
  const npiIdx1 = findLineIdx(lines, /\bNPI NO\./i);
  let npiTop: string | undefined;
  if (npiIdx1 >= 0) {
    // Try inline first: "REFERRING PHYSICIAN'S SIGNATURE NPI NO. 100000002"
    const inlineDigits = lines[npiIdx1].match(/NPI\s+NO\.?\s*([\d\s]{7,})/i);
    if (inlineDigits) {
      npiTop = inlineDigits[1].replace(/\s/g, '');  // strip OCR spaces
    } else {
      // Try next non-empty lines — grab ALL digits (even space-separated)
      for (let k = 1; k <= 3 && npiIdx1 + k < lines.length; k++) {
        const v = cleanLine(lines[npiIdx1 + k]);
        if (v) {
          // Collect all digit characters, stripping internal spaces
          const digitsOnly = v.replace(/\s/g, '').match(/(\d{7,10})/);
          // Also try: the line might be "100000002" or "10000000 2" or "1 0 0 0 0 0 0 0 2"
          if (digitsOnly) {
            npiTop = digitsOnly[1];
          } else {
            // Try collecting all digits from the line
            const allDigits = v.replace(/[^\d]/g, '');
            if (allDigits.length >= 7 && allDigits.length <= 10) {
              npiTop = allDigits;
            }
          }
          break;
        }
      }
    }
    // Validate: NPI must be 9 or 10 digits in practice
    if (npiTop && (npiTop.length < 7 || npiTop.length > 10)) npiTop = undefined;
  }

  // Phone/Fax for referring physician — use start offsets to avoid matching servicing section
  const refNameIdx = findLineIdx(lines, /REFERRING PHYSICIAN.S NAME/i);
  const refPhone = firstMatch(phoneRe, getNext(/PHONE NO\./i, refNameIdx > 0 ? refNameIdx : 0) || '') || undefined;
  const refFax = firstMatch(phoneRe, getNext(/FAX NO\./i, refNameIdx > 0 ? refNameIdx : 0) || '') || undefined;

  out.providerRequesting = { name: refName, phone: refPhone, fax: refFax, npi: npiTop };

  // ── Service dates: use positional start to avoid "TO END" matching wrong text ──
  // Also try inline extraction since OCR may place date on same line as label
  const dateBeginIdx = findLineIdx(lines, /DATE SERVICE TO BEGIN/i);
  let svcStart: string | undefined;
  let svcEnd: string | undefined;

  if (dateBeginIdx >= 0) {
    // Try inline first: "DATE SERVICE TO BEGIN 3/1/26"
    const beginLine = lines[dateBeginIdx];
    const inlineStart = firstMatch(dateRe, beginLine.replace(/DATE SERVICE TO BEGIN/i, ''));
    if (inlineStart) {
      svcStart = inlineStart;
    } else {
      // Try next line
      const nextVal = getNext(/DATE SERVICE TO BEGIN/i);
      svcStart = firstMatch(dateRe, nextVal || '') || undefined;
    }

    // TO END — search from dateBeginIdx to avoid matching wrong "TO" text
    const toEndIdx = findLineIdx(lines, /\bTO END\b/i, dateBeginIdx);
    if (toEndIdx >= 0) {
      // Try inline: "TO END 3/5/26"
      const endLine = lines[toEndIdx];
      const inlineEnd = firstMatch(dateRe, endLine.replace(/TO END/i, ''));
      if (inlineEnd) {
        svcEnd = inlineEnd;
      } else {
        // Try next line
        for (let k = 1; k <= 3 && toEndIdx + k < lines.length; k++) {
          const v = cleanLine(lines[toEndIdx + k]);
          if (v) {
            svcEnd = firstMatch(dateRe, v);
            break;
          }
        }
      }
    }
  }

  // Fallback: scan entire text for date pairs near "BEGIN" and "END"
  if (!svcStart || !svcEnd) {
    const fullText = lines.join(' ');
    if (!svcStart) {
      const sm = fullText.match(/DATE\s+SERVICE\s+TO\s+BEGIN\s*[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      if (sm) svcStart = sm[1];
    }
    if (!svcEnd) {
      const em = fullText.match(/TO\s+END\s*[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      if (em) svcEnd = em[1];
    }
  }

  // Diagnosis & CPT/HCPCS
  const dxLine = getNext(/\bDIAGNOSIS\b/i) || '';
  const dxCodes = Array.from(dxLine.matchAll(icd10Global), m => m[1]);
  let svcCode = (getNext(/SERVICE RECOMMENDED/i) || '').match(cptHcpcsGlobal)?.[0];
  const svcDesc = getNext(/SERVICE RATIONALE/i) || undefined;

  // Fallback: look in HCPCS/CPT table section for service codes
  if (!svcCode) {
    const hcpcsIdx = findLineIdx(lines, /HCPCS\/?.*CPT/i);
    if (hcpcsIdx >= 0) {
      // Scan the header line and next few lines for HCPCS code (letter + 4 digits ONLY)
      // Do NOT match pure 5-digit patterns — too many false positives (P.O. Box, ZIP codes)
      for (let k = 0; k <= 5 && hcpcsIdx + k < lines.length; k++) {
        const line = lines[hcpcsIdx + k];
        const m = line.match(/\b([A-Z]\d{4})\b/);
        if (m) { svcCode = m[1]; break; }
      }
    }
  }

  // Fallback 2: scan entire page for HCPCS-pattern codes (letter + 4 digits ONLY)
  if (!svcCode) {
    for (const line of lines) {
      const m = line.match(/\b([A-Z]\d{4})\b/);
      if (m) { svcCode = m[1]; break; }
    }
  }

  // Provider (bottom half) — start search AFTER the referring physician section
  // to avoid matching the wrong "PROVIDER'S NAME" or "NPI NO."
  const providerSectionStart = findLineIdx(lines, /PROVIDER MUST BE AHCCCS/i);
  const searchFrom = providerSectionStart >= 0 ? providerSectionStart : Math.floor(lines.length / 2);

  const provName = getNext(/PROVIDER.S NAME/i, searchFrom);
  const facility = getNext(/\bFACILITY NAME\b/i, searchFrom) || undefined;
  const provPhone = firstMatch(phoneRe, getNext(/PHONE NO\./i, searchFrom) || '') || undefined;
  const provFax = firstMatch(phoneRe, getNext(/FAX NO\./i, searchFrom) || '') || undefined;

  // Second NPI = servicing provider
  let npiBottom: string | undefined;
  const npiIdx2 = findLineIdx(lines, /\bNPI NO\./i, npiIdx1 >= 0 ? npiIdx1 + 1 : searchFrom);
  if (npiIdx2 >= 0) {
    const inlineDigits = lines[npiIdx2].match(/NPI\s+NO\.?\s*([\d\s]{7,})/i);
    if (inlineDigits) {
      npiBottom = inlineDigits[1].replace(/\s/g, '');
    } else {
      for (let k = 1; k <= 3 && npiIdx2 + k < lines.length; k++) {
        const v = cleanLine(lines[npiIdx2 + k]);
        if (v) {
          const allDigits = v.replace(/[^\d]/g, '');
          if (allDigits.length >= 7 && allDigits.length <= 10) {
            npiBottom = allDigits;
          }
          break;
        }
      }
    }
    if (npiBottom && (npiBottom.length < 7 || npiBottom.length > 10)) npiBottom = undefined;
  }

  out.providerServicing = { name: provName, facility, phone: provPhone, fax: provFax, npi: npiBottom };

  out.services = [{
    code: svcCode,
    description: svcDesc,
    startDate: svcStart,
    endDate: svcEnd,
    diagnosisCode: dxCodes[0]
  }];

  if (dxCodes.length) out.dx = { codes: Array.from(new Set(dxCodes)) };

  return out;
}



// ============================================================================
// Nevada Health Solutions (NHS) — AcroForm fillable PDF adapter
// ----------------------------------------------------------------------------
// NHS PDFs are fillable forms; their data lives in PDF form fields rather than
// in the rendered text layer. PdfOcrService.extractFormFields() pulls these
// values via pdf.js getFieldObjects() and hands them to this adapter.
//
// Field names captured directly from the NHS template:
//   primary_insurance_yes / primary_insurance_no    (checkbox)
//   primary_insurance_name                          (text)
//   patient_name_member_id                          ("Name / 12345")
//   cardholder_name_member_id                       ("Name / 12345")
//   patient_dob                                     ("MM/DD/YYYY")
//   patient_address_phone                           ("Address / phone")
//   patient_mobile_phone                            (text)
//   requesting_provider_name_address                ("Name / Address")
//   requesting_provider_tel / _fax / _npi / _tax_id
//   contact_person_name / contact_telephone_extension / contact_fax_no
//   pcp_name_address / pcp_tel / pcp_fax
//   pending_ref_no / no_fax_pages
//   date_of_request                                 ("MM/DD/YYYY")
//   inpatient_checkbox / observation_checkbox / outpatient_checkbox
//   procedure_date                                  ("MM/DD/YYYY")
//   no_of_treatments                                ("1")
//   service_requested_yes / service_requested_no    (checkbox)
//   diagnosis_icd                                   ("R07.9")
//   procedure_treatment_cpt                         ("99219")
//   servicing_provider_name_address                 ("Name / Address")
//   place_of_service
//   same_as_requesting_provider                     (checkbox)
//   servicing_provider_npi / servicing_provider_tax_id
// ============================================================================

type NhsFields = Record<string, string>;

const nhsField = (fields: NhsFields, key: string): string | undefined => {
  const v = fields[key];
  if (v == null) return undefined;
  const t = String(v).trim();
  return t.length ? t : undefined;
};

const nhsChecked = (fields: NhsFields, key: string): boolean => {
  const v = (fields[key] || '').toLowerCase();
  return v === 'yes' || v === 'on' || v === 'true' || v === '1';
};

/**
 * Splits "Name / 12345" or "Address line / phone" — returns [left, right].
 * Uses the LAST " / " as separator since addresses can themselves contain commas
 * and other punctuation that we want to preserve in the left half.
 */
const nhsSplitSlash = (s?: string): [string | undefined, string | undefined] => {
  if (!s) return [undefined, undefined];
  const idx = s.lastIndexOf(' / ');
  if (idx < 0) return [s.trim() || undefined, undefined];
  const left = s.slice(0, idx).trim();
  const right = s.slice(idx + 3).trim();
  return [left || undefined, right || undefined];
};

/**
 * Maps an NHS AcroForm field map → PriorAuth schema. Safe to call with an
 * empty/partial field map; missing fields produce `undefined` values rather
 * than throwing.
 */
export function extractNhsFromFields(fields: NhsFields): Partial<PriorAuth> {
  const out: Partial<PriorAuth> = {
    source: { template: 'NHS Nevada Health Solutions', confidence: 0.99 },
    patient: {},
    subscriber: {},
    providerRequesting: {},
    providerServicing: {},
    pcp: {},
    submission: {},
    review: {},
    setting: {},
  };

  // ── Patient ────────────────────────────────────────────────────────────
  const [pName, pMemberId] = nhsSplitSlash(nhsField(fields, 'patient_name_member_id'));
  const [pAddr,  pPhone]   = nhsSplitSlash(nhsField(fields, 'patient_address_phone'));
  out.patient = {
    name:     pName,
    memberId: pMemberId,
    dob:      nhsField(fields, 'patient_dob'),
    address:  pAddr,
    phone:    pPhone || nhsField(fields, 'patient_mobile_phone'),
  };

  // ── Subscriber / Card holder ───────────────────────────────────────────
  const [subName, subId] = nhsSplitSlash(nhsField(fields, 'cardholder_name_member_id'));
  if (subName || subId) {
    out.subscriber = { name: subName };
    // If patient memberId wasn't on its own field, fall back to cardholder id
    if (!out.patient!.memberId && subId) out.patient!.memberId = subId;
  }

  // ── Requesting provider ────────────────────────────────────────────────
  const [reqName, reqAddr] = nhsSplitSlash(nhsField(fields, 'requesting_provider_name_address'));
  out.providerRequesting = {
    name:         reqName,
    address:      reqAddr,
    phone:        nhsField(fields, 'requesting_provider_tel'),
    fax:          nhsField(fields, 'requesting_provider_fax'),
    npi:          nhsField(fields, 'requesting_provider_npi'),
    contactName:  nhsField(fields, 'contact_person_name'),
    contactPhone: nhsField(fields, 'contact_telephone_extension'),
  };

  // ── Servicing provider (with "same as requesting" handling) ────────────
  const sameAsReq = nhsChecked(fields, 'same_as_requesting_provider');
  const [svcName, svcAddr] = nhsSplitSlash(nhsField(fields, 'servicing_provider_name_address'));
  out.providerServicing = {
    name:     svcName    || (sameAsReq ? reqName : undefined),
    address:  svcAddr    || (sameAsReq ? reqAddr : undefined),
    npi:      nhsField(fields, 'servicing_provider_npi') || (sameAsReq ? nhsField(fields, 'requesting_provider_npi') : undefined),
    facility: nhsField(fields, 'place_of_service'),
    phone:    sameAsReq ? nhsField(fields, 'requesting_provider_tel') : undefined,
    fax:      sameAsReq ? nhsField(fields, 'requesting_provider_fax') : undefined,
  };

  // ── PCP ────────────────────────────────────────────────────────────────
  const [pcpName] = nhsSplitSlash(nhsField(fields, 'pcp_name_address'));
  if (pcpName || nhsField(fields, 'pcp_tel') || nhsField(fields, 'pcp_fax')) {
    out.pcp = {
      name:  pcpName,
      phone: nhsField(fields, 'pcp_tel'),
      fax:   nhsField(fields, 'pcp_fax'),
    };
  }

  // ── Submission / request meta ──────────────────────────────────────────
  out.submission = {
    date:           nhsField(fields, 'date_of_request'),
    prevAuthNumber: nhsField(fields, 'pending_ref_no'),
    issuerName:     nhsField(fields, 'primary_insurance_name'),
  };

  // ── Setting (Inpatient / Outpatient / Observation) ─────────────────────
  out.setting = {
    inpatient:   nhsChecked(fields, 'inpatient_checkbox')   || undefined,
    outpatient:  nhsChecked(fields, 'outpatient_checkbox')  || undefined,
    observation: nhsChecked(fields, 'observation_checkbox') || undefined,
  };

  // NHS doesn't have an explicit Urgent/Routine flag on this form. The note
  // on the form says "Scheduling Issues do not meet the definition of Urgent",
  // so default to Non-Urgent unless caller overrides downstream.
  out.review = { type: 'Non-Urgent' };

  // ── Diagnosis (ICD) ────────────────────────────────────────────────────
  const dxRaw = nhsField(fields, 'diagnosis_icd');
  const dxCodes = dxRaw
    ? Array.from(dxRaw.matchAll(/\b([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)\b/g), m => m[1])
    : [];
  if (dxCodes.length) out.dx = { codes: Array.from(new Set(dxCodes)) };

  // ── Service / Procedure (CPT/HCPCS) ────────────────────────────────────
  const cptRaw = nhsField(fields, 'procedure_treatment_cpt');
  const cptCodes = cptRaw
    ? Array.from(cptRaw.matchAll(/\b(?:\d{5}|[A-Z]\d{4})\b/g), m => m[0])
    : [];
  const procDate   = nhsField(fields, 'procedure_date');
  const treatments = nhsField(fields, 'no_of_treatments');

  if (cptCodes.length || procDate || dxCodes.length) {
    out.services = [{
      code:           cptCodes[0],
      description:    undefined, // NHS form doesn't include a separate description
      startDate:      procDate,
      endDate:        procDate,  // single procedure date — same start/end
      diagnosisCode:  dxCodes[0],
      placeOfService: nhsField(fields, 'place_of_service'),
    }];
  }

  // Stash treatment count in notes since the schema doesn't model it directly
  if (treatments && treatments !== '1') {
    out.notes = `No. of Treatments Requested: ${treatments}`;
  }

  return out;
}


// ============================================================================
// Banner Plans & Networks (BPN_PA046_CY26) — AcroForm fillable PDF adapter
// ----------------------------------------------------------------------------
// Banner Health Medical Prior Authorization Forms are fillable PDFs whose
// values live in PDF form fields (same pattern as NHS Nevada Health Solutions).
// PdfOcrService.extractFormFields() pulls these values via pdf.js
// getFieldObjects() and hands them to this adapter.
//
// Field names captured directly from the BPN_PA046_CY26 template. The PDF
// strips punctuation ("/", "-", "–") and apostrophes from labels when
// generating field names, which produces the double spaces and merged tokens
// you see below (e.g. "Banner  University Family CareACC" was originally
// "Banner – University Family Care/ACC"). Names are case- AND space-sensitive
// because they're the literal /T entries in the PDF's AcroForm dictionary.
//
//   Submission / Health plan:
//     'Todays Date'                                   text
//     'AHCCCS' / 'Medicare'                           checkbox
//     'Banner  University Family CareACC'             checkbox
//     'Banner  University Family CareALTCS'           checkbox
//     'Banner  University Care Advantage HMO DSNP'    checkbox
//
//   Member:
//     'Member Name Last', 'First', 'MI'
//     'Date of Birth', 'Member ID'
//
//   Setting:
//     'Inpatient' / 'Outpatient' / 'Home' / 'Office'  checkbox
//
//   Requesting provider (Provider making this request):
//     'Provider making this request Name  Provider Type'
//     'Address', 'City', 'State', 'Zip'
//     'NPI', 'TID', 'Phone'
//     'InNetwork' / 'OutofNetwork'                    checkbox
//     'NameDirect Contact Requesting Provider office'
//     'Backline', 'Ext', 'Fax', 'Office Email'
//
//   Servicing provider (Provider to perform the request):
//     'Provider to perform the request if applicable'
//     'Specialty Type'
//     'Address_2', 'City_2', 'State_2', 'Zip_2'
//     'NPI_2', 'TID_2'
//     'Continuity of Care'                            checkbox
//
//   Facility (Outpatient/Inpatient Only):
//     'Name'
//     'Address_3', 'City_3', 'State_3', 'Zip_3'
//     'Phone_2', 'NPI_3', 'TID_3'
//
//   Procedure / dx:
//     'Procedure Requested', 'Description'
//     'Date of Procedure if sched'
//     'HCPCCPT Code', 'HCPCCPT Code_2'
//     'ICD10 Code', 'ICD10 Code_2'
// ============================================================================

type BannerFields = Record<string, string>;

const bannerField = (fields: BannerFields, key: string): string | undefined => {
  const v = fields[key];
  if (v == null) return undefined;
  const t = String(v).trim();
  return t.length ? t : undefined;
};

const bannerChecked = (fields: BannerFields, key: string): boolean => {
  const v = (fields[key] || '').toLowerCase();
  return v === 'yes' || v === 'on' || v === 'true' || v === '1';
};

/**
 * Join the four discrete Banner address fields (street/city/state/zip) into a
 * single comma-separated line — that's the shape the downstream
 * AuthdetailsComponent.parseProviderAddress() expects, and matches how the
 * other adapters (AZ/TX) deliver provider addresses.
 *
 * Returns undefined if every part is blank, so the prefill object cleanly
 * "wins nothing" when the user didn't fill the address out (e.g. when the
 * "Provider to perform" half of the form is left empty, as it is on most
 * single-provider Banner submissions).
 */
const bannerJoinAddress = (
  street?: string,
  city?: string,
  state?: string,
  zip?: string
): string | undefined => {
  const stateZip = [state, zip].filter(Boolean).join(' ').trim();
  const parts = [street, city, stateZip]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map(s => s.trim());
  return parts.length ? parts.join(', ') : undefined;
};

/**
 * Build "First MI Last" from the three name fields. Banner splits the patient
 * name across three boxes; downstream code expects a single string. We pick
 * "First [MI] Last" rather than "Last, First" because that's the convention
 * the existing prefill mapper uses for non-NHS sources.
 */
const bannerJoinName = (last?: string, first?: string, mi?: string): string | undefined => {
  const f = (first || '').trim();
  const m = (mi || '').trim();
  const l = (last || '').trim();
  if (!f && !l && !m) return undefined;
  return [f, m, l].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim() || undefined;
};

/**
 * Resolves which Banner health-plan checkbox the requester ticked and returns
 * a human-readable label suitable for the submission.issuerName field. Falls
 * through to undefined if none of the three plan boxes are checked.
 */
const bannerIssuerName = (fields: BannerFields): string | undefined => {
  if (bannerChecked(fields, 'Banner  University Care Advantage HMO DSNP'))
    return 'Banner Medicare Advantage Dual HMO D-SNP';
  if (bannerChecked(fields, 'Banner  University Family CareACC'))
    return 'Banner \u2013 University Family Care/ACC';
  if (bannerChecked(fields, 'Banner  University Family CareALTCS'))
    return 'Banner \u2013 University Family Care/ALTCS';
  return undefined;
};

/**
 * Maps a Banner BPN_PA046 AcroForm field map → PriorAuth schema. Safe to call
 * with an empty/partial field map; missing fields produce `undefined` values
 * rather than throwing.
 */
export function extractBannerFromFields(fields: BannerFields): Partial<PriorAuth> {
  const out: Partial<PriorAuth> = {
    source: { template: 'Banner Health BPN_PA046', confidence: 0.99 },
    patient: {},
    providerRequesting: {},
    providerServicing: {},
    submission: {},
    review: {},
    setting: {},
  };

  // ── Submission / issuer ───────────────────────────────────────────────
  out.submission = {
    date:       bannerField(fields, 'Todays Date'),
    issuerName: bannerIssuerName(fields),
  };

  // Banner doesn't have an explicit Urgent/Routine flag on this template; the
  // Expedite section is free-text only. Default to Non-Urgent unless the
  // caller overrides downstream. (Same convention as the NHS adapter.)
  out.review = { type: 'Non-Urgent' };

  // ── Patient ───────────────────────────────────────────────────────────
  out.patient = {
    name: bannerJoinName(
      bannerField(fields, 'Member Name Last'),
      bannerField(fields, 'First'),
      bannerField(fields, 'MI'),
    ),
    dob:      bannerField(fields, 'Date of Birth'),
    memberId: bannerField(fields, 'Member ID'),
  };

  // ── Setting (Inpatient / Outpatient / Home / Office) ──────────────────
  // Only emit `true` for ticked boxes; leave the others undefined so the
  // existing merge logic in faxes.component doesn't clobber values from
  // earlier adapters with explicit `false`.
  out.setting = {
    inpatient:  bannerChecked(fields, 'Inpatient')  || undefined,
    outpatient: bannerChecked(fields, 'Outpatient') || undefined,
    home:       bannerChecked(fields, 'Home')       || undefined,
    office:     bannerChecked(fields, 'Office')     || undefined,
  };

  // ── Requesting provider ───────────────────────────────────────────────
  out.providerRequesting = {
    name:    bannerField(fields, 'Provider making this request Name  Provider Type'),
    address: bannerJoinAddress(
      bannerField(fields, 'Address'),
      bannerField(fields, 'City'),
      bannerField(fields, 'State'),
      bannerField(fields, 'Zip'),
    ),
    npi:          bannerField(fields, 'NPI'),
    phone:        bannerField(fields, 'Phone'),
    fax:          bannerField(fields, 'Fax'),
    contactName:  bannerField(fields, 'NameDirect Contact Requesting Provider office'),
    contactPhone: bannerField(fields, 'Backline'),
  };

  // ── Servicing provider ────────────────────────────────────────────────
  out.providerServicing = {
    name:      bannerField(fields, 'Provider to perform the request if applicable'),
    specialty: bannerField(fields, 'Specialty Type'),
    address:   bannerJoinAddress(
      bannerField(fields, 'Address_2'),
      bannerField(fields, 'City_2'),
      bannerField(fields, 'State_2'),
      bannerField(fields, 'Zip_2'),
    ),
    npi:      bannerField(fields, 'NPI_2'),
    facility: bannerField(fields, 'Name'), // Facility Information → Name
  };

  // ── Diagnosis (ICD-10) ────────────────────────────────────────────────
  // Banner provides up to two ICD-10 fields. Each box may contain one or
  // more codes separated by whitespace/comma; pull every match.
  const dxRaw = [
    bannerField(fields, 'ICD10 Code'),
    bannerField(fields, 'ICD10 Code_2'),
  ]
    .filter((v): v is string => !!v)
    .flatMap(v => Array.from(
      v.matchAll(/\b([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)\b/g),
      m => m[1]
    ));
  const dxCodes = Array.from(new Set(dxRaw));
  if (dxCodes.length) out.dx = { codes: dxCodes };

  // ── Service / Procedure (CPT/HCPCS) ───────────────────────────────────
  const cptCodes = [
    bannerField(fields, 'HCPCCPT Code'),
    bannerField(fields, 'HCPCCPT Code_2'),
  ]
    .filter((v): v is string => !!v)
    .flatMap(v => Array.from(
      v.matchAll(/\b(?:\d{5}|[A-Z]\d{4})\b/g),
      m => m[0]
    ));

  const procDate = bannerField(fields, 'Date of Procedure if sched');
  // Description box is usually blank on Banner — fall back to "Procedure
  // Requested" so the auth doesn't end up with an empty service description.
  const procDesc =
    bannerField(fields, 'Description') ||
    bannerField(fields, 'Procedure Requested');

  // Single-token setting hint for downstream — pick the first ticked box in
  // the standard Inpatient → Outpatient → Home → Office order.
  const placeOfService =
    bannerChecked(fields, 'Inpatient')  ? 'Inpatient'  :
    bannerChecked(fields, 'Outpatient') ? 'Outpatient' :
    bannerChecked(fields, 'Home')       ? 'Home'       :
    bannerChecked(fields, 'Office')     ? 'Office'     :
    undefined;

  if (cptCodes.length || procDate || procDesc) {
    out.services = [{
      code:           cptCodes[0],
      description:    procDesc,
      startDate:      procDate,
      endDate:        procDate, // single procedure date — same start/end
      diagnosisCode:  dxCodes[0],
      placeOfService,
    }];
  }

  return out;
}

// ============================================================================
// UMR Prior Authorization Fax Sheet — AcroForm adapter.
//
// Field names captured directly from the UMR template:
//   From                  ("Mathew Jones")            — fax sender / requestor
//   Patient name          ("Alexander King")
//   Patients DOB          ("09-14-2007")
//   ID                    ("10037")                   — member ID
//   Group                 ("...")                      — group # (often blank)
//   Ordering Physician    ("Matthew Jones - 1000000002")  name + NPI
//   Credentials           ("MD")
//   Address / City / State / Zip                       requesting provider addr
//   Phone / Fax                                         requesting provider
//   Facility              ("Family Health Group ...")  servicing facility name
//   Facility address      ("8653 Healthcare Drive, Austin, TX, 53932")
//   Facility phone        ("7035551088")
//   DATE OF SERVICE       ("07/08/2026")
//   ICD10                 ("M17.11")
//   CPT                   ("27447")                    — CPT row 1 code
//   1                     ("1")                        — sessions row 1
//   CPT_start_1 / CPT-end_1                             service date range row 1
// ============================================================================

type UmrFields = Record<string, string>;

const umrField = (fields: UmrFields, key: string): string | undefined => {
  const v = fields[key];
  if (v == null) return undefined;
  const t = String(v).trim();
  return t.length ? t : undefined;
};

/**
 * "Matthew Jones - 1000000002" → { name: "Matthew Jones", npi: "1000000002" }.
 * Tolerates the name-only case (no NPI) and a stray trailing NPI with no dash.
 */
const umrSplitOrderingPhysician = (s?: string): { name?: string; npi?: string } => {
  if (!s) return {};
  const m = s.match(/^(.*?)[\s\-\u2013]+(\d{6,})\s*$/);
  if (m) return { name: m[1].trim() || undefined, npi: m[2] };
  return { name: s.trim() || undefined };
};

/** Joins line + city/state/zip into the "addr, city, state, zip" shape the
 *  component's parseProviderAddress() expects. */
const umrJoinAddress = (
  line?: string, city?: string, state?: string, zip?: string
): string | undefined => {
  const parts = [line, city, state, zip]
    .map(p => p?.replace(/[,\s]+$/, '').trim())
    .filter((p): p is string => !!p && p.length > 0);
  return parts.length ? parts.join(', ') : undefined;
};

/**
 * Maps a UMR AcroForm field map → PriorAuth schema. Safe to call with an
 * empty/partial field map; missing fields produce `undefined` values rather
 * than throwing.
 */
export function extractUmrFromFields(fields: UmrFields): Partial<PriorAuth> {
  const out: Partial<PriorAuth> = {
    source: { template: 'UMR Prior Authorization', confidence: 0.99 },
    patient: {},
    providerRequesting: {},
    providerServicing: {},
    submission: {},
    review: {},
    setting: {},
  };

  // ── Patient ──────────────────────────────────────────────────────────────
  out.patient = {
    name:        umrField(fields, 'Patient name'),
    dob:         onlyDate(umrField(fields, 'Patients DOB')) || umrField(fields, 'Patients DOB'),
    memberId:    umrField(fields, 'ID'),
    groupNumber: umrField(fields, 'Group'),
  };

  // ── Requesting (ordering) provider ─────────────────────────────────────────
  const ordering = umrSplitOrderingPhysician(umrField(fields, 'Ordering Physician'));
  out.providerRequesting = {
    name:     ordering.name || umrField(fields, 'From'),
    npi:      ordering.npi,
    specialty: umrField(fields, 'Credentials'),
    phone:    umrField(fields, 'Phone'),
    fax:      umrField(fields, 'Fax'),
    address:  umrJoinAddress(
      umrField(fields, 'Address'),
      umrField(fields, 'City'),
      umrField(fields, 'State'),
      umrField(fields, 'Zip'),
    ),
  };

  // ── Servicing provider / facility ──────────────────────────────────────────
  const facility = umrField(fields, 'Facility');
  out.providerServicing = {
    name:     facility,
    facility: facility,
    address:  umrField(fields, 'Facility address'),
    phone:    umrField(fields, 'Facility phone'),
  };

  // ── Submission meta ────────────────────────────────────────────────────────
  out.submission = {
    issuerName: 'UMR',
    date:       onlyDate(umrField(fields, 'DATE OF SERVICE')),
  };

  // ── Diagnosis ──────────────────────────────────────────────────────────────
  const icd = umrField(fields, 'ICD10');
  if (icd) out.dx = { codes: [icd] };

  // ── Services (CPT row 1) ───────────────────────────────────────────────────
  const cpt    = umrField(fields, 'CPT');
  const start  = onlyDate(umrField(fields, 'CPT_start_1') || umrField(fields, 'DATE OF SERVICE'));
  const end    = onlyDate(umrField(fields, 'CPT-end_1')   || umrField(fields, 'DATE OF SERVICE'));
  const qty    = umrField(fields, '1'); // "sessions" for CPT row 1
  if (cpt || start || end) {
    out.services = [{
      code:          cpt,
      description:   'Service',
      startDate:     start,
      endDate:       end,
      diagnosisCode: icd,
    }];
    if (qty) (out.services[0] as any).quantity = qty;
  }

  // UMR sheet has no Urgent/Routine flag — leave review.type undefined so the
  // downstream default applies (same behaviour as the other text adapters).
  out.review = {};

  return out;
}
