import * as XLSX from 'xlsx';
import type { ParsedBulkLeadRow } from '../types';

/**
 * Bulk lead import — turns a user-supplied spreadsheet (.xlsx / .xls / .csv)
 * into the row shape POST /leads/bulk-upload accepts.
 *
 * Why this exists: the previous importer read the file with
 * `FileReader.readAsText()` and split on commas. An Excel file is a zip, so
 * its bytes became "leads" (names like `xl/styles.xml`), and CSV cells with
 * quoted commas were split apart. Both formats now go through SheetJS, which
 * handles xlsx binary and CSV quoting correctly.
 *
 * Columns are matched by header name (case/punctuation-insensitive, with
 * common synonyms). If the first row has no recognisable headers the legacy
 * positional order is assumed: Name, Phone, Email, Property type, Location,
 * Notes.
 */

export const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.txt'] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');

/** Order matters: it is also the positional fallback and the template column order. */
const COLUMNS: { key: keyof ParsedBulkLeadRow; header: string; aliases: string[] }[] = [
  {
    key: 'customer_name',
    header: 'Name',
    aliases: ['name', 'customername', 'customer', 'fullname', 'leadname', 'clientname'],
  },
  {
    key: 'phone',
    header: 'Phone',
    aliases: [
      'phone',
      'phonenumber',
      'mobile',
      'mobilenumber',
      'contact',
      'contactnumber',
      'phoneno',
      'mobileno',
    ],
  },
  { key: 'email', header: 'Email', aliases: ['email', 'emailid', 'emailaddress', 'mail'] },
  {
    key: 'property_type',
    header: 'Property type',
    aliases: ['propertytype', 'type', 'interestedin', 'requirement', 'category'],
  },
  {
    key: 'location',
    header: 'Location',
    aliases: ['location', 'preferredlocation', 'area', 'city', 'locality'],
  },
  {
    key: 'notes',
    header: 'Notes',
    aliases: ['notes', 'note', 'remarks', 'remark', 'comments', 'comment'],
  },
];

export interface SkippedRow {
  /** 1-based row number as the user sees it in Excel. */
  row: number;
  reason: string;
}

export interface LeadImportResult {
  rows: ParsedBulkLeadRow[];
  skipped: SkippedRow[];
  /** true when columns were matched by header names, false when positional order was assumed. */
  headerMatched: boolean;
  sheetName: string;
}

export class LeadImportError extends Error {}

const normaliseHeader = (v: unknown) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  // Excel stores a phone typed as digits as a Number; String() of an integer
  // below 1e21 never uses exponent notation, so 9876543210 stays intact.
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v).trim();
  return String(v).trim();
};

/**
 * Reduce a phone cell to the 10-digit number the CRM stores.
 * Accepts "+91 98765 43210", "0987-654-3210", "9876543210.0" etc.
 * Returns null when no 10-digit number can be recovered.
 */
export const normalisePhone = (raw: string): string | null => {
  let digits = raw.replace(/\.0+$/, '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
};

const fileExtension = (name: string) => {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
};

/** Map a header row to column indexes. Returns null when name+phone aren't both found. */
const matchHeaders = (
  headerRow: unknown[],
): Partial<Record<keyof ParsedBulkLeadRow, number>> | null => {
  const map: Partial<Record<keyof ParsedBulkLeadRow, number>> = {};
  headerRow.forEach((cell, idx) => {
    const h = normaliseHeader(cell);
    if (!h) return;
    const col = COLUMNS.find((c) => c.aliases.includes(h));
    if (col && map[col.key] === undefined) map[col.key] = idx;
  });
  return map.customer_name !== undefined && map.phone !== undefined ? map : null;
};

/** Parse an already-loaded workbook. Exposed for tests; callers use parseLeadImportFile. */
export const parseLeadWorkbook = (workbook: XLSX.WorkBook): LeadImportResult => {
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new LeadImportError('The file has no sheets.');

  // header:1 → array of arrays; blankrows:false drops fully empty lines.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: true,
  });
  if (grid.length === 0) throw new LeadImportError('The file is empty.');

  const headerMap = matchHeaders(grid[0]);
  const headerMatched = headerMap !== null;
  const columnIndex: Partial<Record<keyof ParsedBulkLeadRow, number>> =
    headerMap ?? Object.fromEntries(COLUMNS.map((c, i) => [c.key, i]));

  // Without a recognised header row, still skip row 1 if it merely *looks*
  // like a header (no digits in the phone position) rather than a lead.
  let start = 0;
  if (headerMatched) start = 1;
  else if (grid.length > 1 && !/\d/.test(cellText(grid[0][columnIndex.phone ?? 1]))) start = 1;

  const rows: ParsedBulkLeadRow[] = [];
  const skipped: SkippedRow[] = [];
  const seenPhones = new Set<string>();

  for (let i = start; i < grid.length; i++) {
    const line = grid[i];
    const excelRow = i + 1;
    const get = (key: keyof ParsedBulkLeadRow) => {
      const idx = columnIndex[key];
      return idx === undefined ? '' : cellText(line[idx]);
    };

    const rawName = get('customer_name');
    const rawPhone = get('phone');
    if (!rawName && !rawPhone) continue; // stray formatting-only row

    // A lead with a real phone number is never worth losing over a blank
    // name column — default to "Unknown" and keep it. Phone stays mandatory
    // below: a name with no contactable number isn't a usable lead at all.
    const customer_name = rawName || 'Unknown';
    const phone = rawPhone ? normalisePhone(rawPhone) : null;
    if (!phone) {
      skipped.push({
        row: excelRow,
        reason: rawPhone
          ? `Phone "${rawPhone}" is not a valid 10-digit mobile number`
          : 'Phone is missing',
      });
      continue;
    }
    if (seenPhones.has(phone)) {
      skipped.push({ row: excelRow, reason: `Duplicate phone ${phone} within this file` });
      continue;
    }
    seenPhones.add(phone);

    const email = get('email');
    rows.push({
      customer_name,
      phone,
      email,
      property_type: get('property_type'),
      location: get('location'),
      notes: get('notes'),
    });
  }

  return { rows, skipped, headerMatched, sheetName };
};

/** Read a File from an <input type="file"> and parse it. */
export const parseLeadImportFile = async (file: File): Promise<LeadImportResult> => {
  const ext = fileExtension(file.name);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new LeadImportError(
      `"${file.name}" is not a supported file. Please upload an Excel (.xlsx) or CSV file.`,
    );
  }
  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    // SheetJS sniffs the real format from the bytes, so a CSV renamed to
    // .xlsx (or vice versa) still parses.
    workbook = XLSX.read(buffer, { type: 'array', raw: true });
  } catch {
    throw new LeadImportError(`"${file.name}" could not be read as a spreadsheet.`);
  }
  return parseLeadWorkbook(workbook);
};

/** Build the downloadable template so column names never have to be guessed. */
export const buildLeadImportTemplate = (): Blob => {
  const sheet = XLSX.utils.aoa_to_sheet([
    COLUMNS.map((c) => c.header),
    ['Ravi Kumar', '9876543210', 'ravi@example.com', 'Villa', 'Miyapur', 'Walk-in enquiry'],
    ['Priya Sharma', '9123456780', '', 'Plot', 'Kokapet', ''],
  ]);
  sheet['!cols'] = COLUMNS.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Leads');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};
