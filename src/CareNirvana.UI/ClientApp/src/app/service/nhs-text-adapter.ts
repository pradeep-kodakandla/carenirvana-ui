// ============================================================================
// NHS (Nevada Health Solutions) — TEXT adapter for FLATTENED PDFs
// ----------------------------------------------------------------------------
// extractNhsFromFields() in priorauth.extractor.ts handles LIVE AcroForm NHS
// PDFs. This adapter handles the OTHER common case: NHS forms that have been
// "printed to PDF" (flattened). When that happens:
//
//   - The AcroForm dictionary is gone (getFieldObjects returns null).
//   - The values are drawn AS TEXT directly on top of the page template.
//   - pdf.js / pypdf return text in DRAWING order, not visual order, so
//     labels and values DO NOT live on the same line. Instead, the entire
//     form-template text is emitted first, and the filled values appear in
//     a single contiguous block at the end — always in the same order.
//
// The block always starts with the literal sequence "Outpatient Observation"
// (these are setting labels rendered as part of the value layer), and then
// values follow in this fixed order:
//
//   1. Patient Name / Member ID#         "Amelia Cook / 10083"
//   2. Date of Request                   "05/05/2026"
//   3. Diagnosis (ICD)                   "R07.9"
//   4. No. of Treatments Requested       "1"
//   5. <checkbox glyph(s)>               "3"          ← Wingdings ✓ → "3"
//   6. Patient Address / Telephone       "141 Maple… USA / 9000000084"
//   7. Patient DOB                       "02/18/2001"
//   8. Card Holder Name / Member ID#     "Amelia Cook / 10083"
//   9. Name of Primary Insurance         "Medicare"
//  10. <checkbox glyph>                  "3"
//  11. Procedure Date                    "05/20/2026"
//  12. CPT / Procedure Code              "99219"
//  13. Requesting Provider FAX           "(703) 555-2046"
//  14. Requesting Provider Name/Address  "Matthew Brown / 5256 Medical… USA"
//  15. Requesting Provider NPI           "1000000046"
//  16. Requesting Provider Tax ID        "12-3456746"
//  17. Requesting Provider TEL           "(703) 555-1046"
//  18. <checkbox glyphs>                 "3", "3"
//  19. Servicing Provider Name/Address   (same shape as 14)
//  20. Servicing Provider NPI            "1000000046"
//  21. Servicing Provider Tax ID         "12-3456746"
//
// We don't trust line breaks (pdf.js sometimes emits them, sometimes joins
// everything onto one line). Instead, we walk the value block with a
// sequential regex consumer — at each step we try to match the NEXT EXPECTED
// pattern at the current position, treating any whitespace (space, tab, or
// newline) as a separator. This works equally well on:
//
//   "Outpatient\nObservation\nAmelia Cook / 10083\n05/05/2026\n…"   (newline-delimited)
//   "Outpatient Observation Amelia Cook / 10083 05/05/2026 …"        (space-delimited)
// ============================================================================

import { PriorAuth } from './priorauth.schema';

const norm = (s: string) =>
  (s || '')
    .replace(/\u2019/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n');

/** True if the text looks like a single NHS prior auth form. */
export function isNhsText(text: string): boolean {
  return /NEVADA\s+HEALTH\s+SOLUTIONS/i.test(text)
      || /NHS\s+Fax\s*\(702\)\s*691-?5614/i.test(text);
}

/**
 * Sequentially consumes patterns from the start of `state.rest`, anchored to
 * the current position. Whitespace before each pattern is consumed implicitly.
 * Returns the matched substring (whitespace-trimmed) or undefined when the
 * pattern isn't present at the current position — in which case `state.rest`
 * is left untouched so the caller can try a different pattern.
 *
 * The trailing `(?=\s|$)` lookahead ensures we stop at a token boundary
 * rather than chopping a value mid-word.
 */
type State = { rest: string };
function take(state: State, patternSource: string): string | undefined {
  const re = new RegExp(`^\\s*(${patternSource})(?=\\s|$|[,;:])`, 's');
  const m = state.rest.match(re);
  if (!m) return undefined;
  state.rest = state.rest.slice(m[0].length);
  // Collapse any internal whitespace (spaces, tabs, newlines) to a single
  // space — pdf.js sometimes emits hard line breaks mid-value when an
  // address wraps across two visual lines.
  return m[1].replace(/\s+/g, ' ').trim();
}

/** Eat any number of consecutive lone-digit "checkbox glyphs" (Wingdings ✓ → "3"). */
function eatCheckboxes(state: State): void {
  // We accept any single non-zero digit followed by whitespace/end/punct.
  // Limit to 4 in a row to avoid runaway matching of legitimate small numbers.
  for (let i = 0; i < 4; i++) {
    if (take(state, '\\d') === undefined) break;
  }
}

const splitSlash = (s?: string): [string | undefined, string | undefined] => {
  if (!s) return [undefined, undefined];
  const idx = s.lastIndexOf(' / ');
  if (idx < 0) return [s.trim() || undefined, undefined];
  return [s.slice(0, idx).trim() || undefined, s.slice(idx + 3).trim() || undefined];
};

// ── Pattern fragments (regex source strings, not RegExp objects) ───────────
// All are designed to match a SINGLE token at the current position.

const NAME_SLASH_ID = "[A-Za-z][A-Za-z .'-]+?\\s\\/\\s\\d+";  // "Amelia Cook / 10083"
const DATE          = "\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}";       // "05/05/2026"
const ICD           = "[A-TV-Z][0-9][0-9A-Z](?:\\.[0-9A-Z]{1,4})?";
const SMALL_INT     = "\\d{1,3}";
// Address+phone: "<address text> / <10-digit phone>". Address has no '/' inside.
const ADDR_PHONE    = "[^\\/\\n]+?\\s\\/\\s\\d{10}(?!\\d)";
// CPT (5 digits) or HCPCS (letter + 4 digits)
const CPT_OR_HCPCS  = "(?:\\d{5}|[A-Z]\\d{4})";
const PHONE         = "\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}";
const NPI           = "\\d{10}(?!\\d)";
const TAX_ID        = "\\d{2}-\\d{7}";
// Insurance name — letters/spaces, lazy, terminated by lookahead at next token boundary
const INSURANCE     = "[A-Za-z][A-Za-z &/'-]{1,40}?";
// Provider name+address: name + " / " + address, lazily consumed up to the
// next NPI. The lookahead is what prevents over-matching into NPI/Tax ID.
const PROVIDER_LINE = "[A-Za-z][A-Za-z .'-]+?\\s\\/\\s.+?(?=\\s+\\d{10}(?!\\d))";

/**
 * Parses a flattened NHS form's text layer into a Partial<PriorAuth>. Returns
 * an empty object if the NHS marker is absent or the value block can't be
 * located. Safe to call on any text.
 */
export function extractNhsFromText(rawText: string): Partial<PriorAuth> {
  const text = norm(rawText);
  if (!isNhsText(text)) return {};

  // Find the anchor "Outpatient ... Observation" — it always sits right
  // before the value block in the rendered text, regardless of how pdf.js
  // chose to lay out whitespace.
  const anchor = text.match(/\bOutpatient\s+Observation\b/i);
  if (!anchor) return {};

  const state: State = { rest: text.slice(anchor.index! + anchor[0].length) };

  // 1. Patient Name / Member ID
  const patientLine   = take(state, NAME_SLASH_ID);
  // 2. Date of Request
  const dateOfRequest = take(state, DATE);
  // 3. Diagnosis (ICD)
  const dxCode        = take(state, ICD);
  // 4. # treatments
  const treatments    = take(state, SMALL_INT);
  // 5. checkbox
  eatCheckboxes(state);
  // 6. Patient Address+Phone
  const addrLine      = take(state, ADDR_PHONE);
  // 7. Patient DOB
  const dob           = take(state, DATE);
  // 8. Card holder
  const cardLine      = take(state, NAME_SLASH_ID);
  // 9. Primary insurance
  const insurance     = take(state, INSURANCE);
  // 10. checkbox
  eatCheckboxes(state);
  // 11. Procedure date
  const procDate      = take(state, DATE);
  // 12. CPT / HCPCS
  const cpt           = take(state, CPT_OR_HCPCS);
  // 13. Requesting provider FAX
  const reqFax        = take(state, PHONE);
  // 14. Requesting provider name + address
  const reqProvider   = take(state, PROVIDER_LINE);
  // 15. Requesting provider NPI
  const reqNpi        = take(state, NPI);
  // 16. Requesting provider Tax ID
  const reqTaxId      = take(state, TAX_ID);
  // 17. Requesting provider TEL
  const reqTel        = take(state, PHONE);
  // 18. checkbox glyph(s)
  eatCheckboxes(state);
  // 19. Servicing provider name + address
  const svcProvider   = take(state, PROVIDER_LINE);
  // 20. Servicing provider NPI
  const svcNpi        = take(state, NPI);
  // 21. Servicing provider Tax ID
  const svcTaxId      = take(state, TAX_ID);

  // ── Build the PriorAuth ────────────────────────────────────────────────
  const [pName, pMemberId] = splitSlash(patientLine);
  const [pAddr,  pPhone]   = splitSlash(addrLine);
  const [subName, subId]   = splitSlash(cardLine);
  const [reqName, reqAddr] = splitSlash(reqProvider);
  const [svcName, svcAddr] = splitSlash(svcProvider);

  const dxCodes = dxCode ? [dxCode] : [];

  const out: Partial<PriorAuth> = {
    source: { template: 'NHS Nevada Health Solutions (text)', confidence: 0.85 },
    patient: {
      name:     pName,
      memberId: pMemberId,
      dob,
      address:  pAddr,
      phone:    pPhone,
    },
    subscriber: subName ? { name: subName } : {},
    providerRequesting: {
      name:    reqName,
      address: reqAddr,
      npi:     reqNpi,
      phone:   reqTel,
      fax:     reqFax,
    },
    providerServicing: {
      // NHS often has "same as requesting" — fall back to requesting values.
      name:    svcName    ?? reqName,
      address: svcAddr    ?? reqAddr,
      npi:     svcNpi     ?? reqNpi,
    },
    submission: {
      date:       dateOfRequest,
      issuerName: insurance,
    },
    review:  { type: 'Non-Urgent' },     // NHS form has no urgent flag
    setting: { outpatient: true },       // value block is anchored on Outpatient
  };

  if (dxCodes.length) out.dx = { codes: dxCodes };
  if (cpt || procDate || dxCodes.length) {
    out.services = [{
      code:           cpt,
      startDate:      procDate,
      endDate:        procDate,
      diagnosisCode:  dxCodes[0],
    }];
  }
  if (treatments && treatments !== '1') {
    out.notes = `No. of Treatments Requested: ${treatments}`;
  }

  // If patient memberId wasn't recognised but cardholder has one (NHS often
  // duplicates the same id in both fields), use that as a fallback.
  if (!out.patient!.memberId && subId) out.patient!.memberId = subId;

  // Tax IDs are captured but not currently modelled in the schema.
  void reqTaxId; void svcTaxId;

  return out;
}
