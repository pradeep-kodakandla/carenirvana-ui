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




export function extractPriorAuth(text: string): PriorAuth {
  let out: Partial<PriorAuth> = genericExtractor(text);
  if (isTexas(text)) out = { ...out, ...texasAdapter(text) };
  if (isArizona(text)) out = { ...out, ...arizonaAdapter(text) };
  if (isGeorgia(text)) out = { ...out, ...georgiaAdapter(text) };
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
  const npiIdx1 = findLineIdx(lines, /\bNPI NO\./i);
  let npiTop: string | undefined;
  if (npiIdx1 >= 0) {
    // Try inline first: "REFERRING PHYSICIAN'S SIGNATURE NPI NO. 100000002"
    const inlineDigits = lines[npiIdx1].match(/NPI\s+NO\.?\s*(\d{7,10})/i);
    if (inlineDigits) {
      npiTop = inlineDigits[1];
    } else {
      // Try next non-empty lines
      for (let k = 1; k <= 3 && npiIdx1 + k < lines.length; k++) {
        const v = cleanLine(lines[npiIdx1 + k]);
        if (v) {
          const dm = v.match(/(\d{7,10})/);
          npiTop = dm ? dm[1] : undefined;
          break;
        }
      }
    }
  }

  // Phone/Fax for referring physician — use start offsets to avoid matching servicing section
  const refNameIdx = findLineIdx(lines, /REFERRING PHYSICIAN.S NAME/i);
  const refPhone = firstMatch(phoneRe, getNext(/PHONE NO\./i, refNameIdx > 0 ? refNameIdx : 0) || '') || undefined;
  const refFax = firstMatch(phoneRe, getNext(/FAX NO\./i, refNameIdx > 0 ? refNameIdx : 0) || '') || undefined;

  out.providerRequesting = { name: refName, phone: refPhone, fax: refFax, npi: npiTop };

  // ── Service dates: use positional start to avoid "TO END" matching wrong text ──
  const dateBeginIdx = findLineIdx(lines, /DATE SERVICE TO BEGIN/i);
  const svcStart = firstMatch(dateRe, getNext(/DATE SERVICE TO BEGIN/i) || '') || undefined;
  const svcEnd = firstMatch(dateRe, getNext(/\bTO END\b/i, dateBeginIdx >= 0 ? dateBeginIdx : 0) || '') || undefined;

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
    const inlineDigits = lines[npiIdx2].match(/NPI\s+NO\.?\s*(\d{7,10})/i);
    if (inlineDigits) {
      npiBottom = inlineDigits[1];
    } else {
      for (let k = 1; k <= 3 && npiIdx2 + k < lines.length; k++) {
        const v = cleanLine(lines[npiIdx2 + k]);
        if (v) {
          const dm = v.match(/(\d{7,10})/);
          npiBottom = dm ? dm[1] : undefined;
          break;
        }
      }
    }
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

