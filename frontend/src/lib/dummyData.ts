import type { SupportedCurrency } from './format'

export type VoucherType =
  | 'CONTRA'
  | 'PAYMENT'
  | 'RECEIPT'
  | 'JOURNAL'
  | 'SALES'
  | 'PURCHASE'

export type VoucherLifecycleStatus =
  | 'POSTED'
  | 'DRAFT'
  | 'POST_DATED'
  | 'OPTIONAL'
  | 'CANCELLED'

export type ComplianceReconStatus =
  | 'MATCHED'
  | 'RECONCILED'
  | 'PENDING_BRS'
  | 'GSTR2B_MISMATCH'
  | 'E_INVOICE_IRN'
  | 'POST_DATED'
  | 'CANCELLED'

export interface LedgerAccount {
  code: string
  name: string
  group: string
  nature: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'
  currency: SupportedCurrency
}

export interface VoucherEntryLine {
  accountCode: string
  accountName: string
  debit: string
  credit: string
}

export interface DayBookVoucher {
  id: string
  voucherDate: string // YYYY-MM-DD
  voucherNo: string
  voucherType: VoucherType
  particulars: string
  narration: string
  referenceNo?: string
  currency: SupportedCurrency
  foreignAmount?: string
  exchangeRate?: string
  debit: string // Base INR debit column in Day Book ("0.0000" when nil)
  credit: string // Base INR credit column in Day Book ("0.0000" when nil)
  lifecycleStatus: VoucherLifecycleStatus
  complianceStatus: ComplianceReconStatus
  complianceLabel: string
  lines: VoucherEntryLine[]
}

export interface ComplianceDueItem {
  id: string
  filing: string
  period: string
  dueDate: string
  status: 'danger' | 'warning' | 'neutral' | 'success'
  statusText: string
  urgentPill?: boolean
}

export interface VoucherTypeMeta {
  type: VoucherType
  label: string
  shortKey: string
  backupChord: string
  prefix: string
  defaultDebitCode: string
  defaultCreditCode: string
}

export const COMPANY_PROFILE = {
  legalName: 'Bharat Hardware & Exports Pvt. Ltd.',
  fiscalYear: 'FY 2026–27',
  periodLabel: 'Nov 2026',
  // Synthetic placeholder GSTIN strictly for local dummy previews
  gstin: '09AABCB0000F1Z5',
  stateLabel: '09 · Uttar Pradesh',
  baseCurrency: 'INR' as SupportedCurrency,
} as const

export interface WorkspaceNavMeta {
  id: string
  label: string
  milestoneTag?: string
}

export const WORKSPACE_NAV_META: readonly WorkspaceNavMeta[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'vouchers', label: 'Vouchers', milestoneTag: 'M2' },
  { id: 'reports', label: 'Reports', milestoneTag: 'M2' },
  { id: 'inventory', label: 'Inventory', milestoneTag: 'M3' },
  { id: 'banking', label: 'Banking & BRS', milestoneTag: 'M4' },
  { id: 'tax', label: 'GST & Tax', milestoneTag: 'M5' },
  { id: 'automation', label: 'Automation', milestoneTag: 'M7' },
]

export const VOUCHER_TYPE_META: Record<VoucherType, VoucherTypeMeta> = {
  CONTRA: {
    type: 'CONTRA',
    label: 'Contra',
    shortKey: 'F4',
    backupChord: 'Alt+4',
    prefix: 'CNT/26-27/',
    defaultDebitCode: '1010',
    defaultCreditCode: '1001',
  },
  PAYMENT: {
    type: 'PAYMENT',
    label: 'Payment',
    shortKey: 'F5',
    backupChord: 'Alt+5',
    prefix: 'PAY/26-27/',
    defaultDebitCode: '2001',
    defaultCreditCode: '1010',
  },
  RECEIPT: {
    type: 'RECEIPT',
    label: 'Receipt',
    shortKey: 'F6',
    backupChord: 'Alt+6',
    prefix: 'RCP/26-27/',
    defaultDebitCode: '1010',
    defaultCreditCode: '1101',
  },
  JOURNAL: {
    type: 'JOURNAL',
    label: 'Journal',
    shortKey: 'F7',
    backupChord: 'Alt+7',
    prefix: 'JRN/26-27/',
    defaultDebitCode: '5201',
    defaultCreditCode: '2201',
  },
  SALES: {
    type: 'SALES',
    label: 'Sales',
    shortKey: 'F8',
    backupChord: 'Alt+8',
    prefix: 'INV/26-27/',
    defaultDebitCode: '1101',
    defaultCreditCode: '4001',
  },
  PURCHASE: {
    type: 'PURCHASE',
    label: 'Purchase',
    shortKey: 'F9',
    backupChord: 'Alt+9',
    prefix: 'PUR/26-27/',
    defaultDebitCode: '5001',
    defaultCreditCode: '2001',
  },
}

export const VOUCHER_TYPE_ORDER: VoucherType[] = [
  'CONTRA',
  'PAYMENT',
  'RECEIPT',
  'JOURNAL',
  'SALES',
  'PURCHASE',
]

export const SYNTHETIC_LEDGERS: LedgerAccount[] = [
  { code: '1001', name: 'Cash-in-Hand (Head Office)', group: 'Cash-in-Hand', nature: 'ASSET', currency: 'INR' },
  { code: '1010', name: 'HDFC Bank Current A/c · 4821', group: 'Bank Accounts', nature: 'ASSET', currency: 'INR' },
  { code: '1012', name: 'SBI EEFC USD Current A/c · 9104', group: 'Bank Accounts', nature: 'ASSET', currency: 'USD' },
  { code: '1101', name: 'Apex Industrial Electricals Pvt. Ltd.', group: 'Sundry Debtors', nature: 'ASSET', currency: 'INR' },
  { code: '1102', name: 'Western Valves & Fittings LLP', group: 'Sundry Debtors', nature: 'ASSET', currency: 'INR' },
  { code: '1103', name: 'Nordic Fasteners AB (Sweden)', group: 'Sundry Debtors (Export)', nature: 'ASSET', currency: 'USD' },
  { code: '1201', name: 'Inventory — Finished Goods', group: 'Stock-in-Hand', nature: 'ASSET', currency: 'INR' },
  { code: '2001', name: 'Mahavir Copper Industries', group: 'Sundry Creditors', nature: 'LIABILITY', currency: 'INR' },
  { code: '2002', name: 'Kalyani Freight & Logistics', group: 'Sundry Creditors', nature: 'LIABILITY', currency: 'INR' },
  { code: '2101', name: 'Output CGST 9%', group: 'Duties & Taxes', nature: 'LIABILITY', currency: 'INR' },
  { code: '2102', name: 'Output SGST 9%', group: 'Duties & Taxes', nature: 'LIABILITY', currency: 'INR' },
  { code: '2103', name: 'Output IGST 18%', group: 'Duties & Taxes', nature: 'LIABILITY', currency: 'INR' },
  { code: '2111', name: 'Input CGST 9%', group: 'Duties & Taxes (ITC)', nature: 'ASSET', currency: 'INR' },
  { code: '2112', name: 'Input SGST 9%', group: 'Duties & Taxes (ITC)', nature: 'ASSET', currency: 'INR' },
  { code: '2113', name: 'Input IGST 18%', group: 'Duties & Taxes (ITC)', nature: 'ASSET', currency: 'INR' },
  { code: '2201', name: 'TDS Payable — Sec 194C / 194I', group: 'Statutory Liabilities', nature: 'LIABILITY', currency: 'INR' },
  { code: '4001', name: 'Sales — Electrical Hardware', group: 'Sales Accounts', nature: 'INCOME', currency: 'INR' },
  { code: '4002', name: 'Export Sales (LUT — Zero Rated)', group: 'Sales Accounts', nature: 'INCOME', currency: 'USD' },
  { code: '5001', name: 'Purchases — Copper & Alloys', group: 'Purchase Accounts', nature: 'EXPENSE', currency: 'INR' },
  { code: '5101', name: 'Freight & Forwarding Inward', group: 'Direct Expenses', nature: 'EXPENSE', currency: 'INR' },
  { code: '5201', name: 'Office Rent & Warehouse Utilities', group: 'Indirect Expenses', nature: 'EXPENSE', currency: 'INR' },
  { code: '5301', name: 'Round Off', group: 'Indirect Expenses', nature: 'EXPENSE', currency: 'INR' },
]

export const BASE_FINANCIAL_KPIS = {
  cashAndBank: '1482450.0000',
  cashAndBankDelta: '+6.4% vs Oct',
  sundryReceivables: '2245800.0000',
  receivablesNote: '4 bills aging > 30d',
  sundryPayables: '918620.0000',
  payablesNote: 'Next payout in 5 days',
  netGstItcSurplus: '114350.0000',
  gstPositionNote: 'Net ITC Available · Rule 88A',
} as const

export const COMPLIANCE_SNAPSHOT = {
  bankAccountLabel: 'HDFC Bank Current A/c · 4821',
  unreconciledBankLines: 7,
  unreconciledNetVariance: '-184250.0000',
  lastBankSync: '26-Nov-2026 · 10:15 IST',
  gstr2bMatchPercent: 91.4,
  gstr2bMatchedCount: 32,
  gstr2bTotalCount: 35,
  gstr2bMismatchCount: 2,
  gstr2bMissingCount: 1,
  dueDates: [
    {
      id: 'due-tds',
      filing: 'TDS Challan (ITNS 281)',
      period: 'Nov 2026',
      dueDate: '07-Dec-2026',
      status: 'warning',
      statusText: 'Due in 11d',
      urgentPill: true,
    },
    {
      id: 'due-gstr1',
      filing: 'GSTR-1 Outward Return',
      period: 'Nov 2026',
      dueDate: '11-Dec-2026',
      status: 'neutral',
      statusText: 'Due in 15d',
    },
    {
      id: 'due-ims',
      filing: 'GSTR-2B Auto-Draft & IMS',
      period: 'Nov 2026',
      dueDate: '14-Dec-2026',
      status: 'neutral',
      statusText: 'Auto-drafts',
    },
    {
      id: 'due-gstr3b',
      filing: 'GSTR-3B Summary & Set-Off',
      period: 'Nov 2026',
      dueDate: '20-Dec-2026',
      status: 'success',
      statusText: 'ITC Surplus',
    },
  ] satisfies ComplianceDueItem[],
}

export const INITIAL_VOUCHERS: DayBookVoucher[] = [
  {
    id: 'v-001',
    voucherDate: '2026-11-26',
    voucherNo: 'INV/26-27/0042',
    voucherType: 'SALES',
    particulars: 'Apex Industrial Electricals Pvt. Ltd.',
    narration: 'Copper Wire Coil 2.5mm (240 coils) · Intra-State CGST 9% + SGST 9%',
    referenceNo: 'PO-APEX-8841',
    currency: 'INR',
    debit: '283200.0000',
    credit: '0.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'E_INVOICE_IRN',
    complianceLabel: 'IRN Verified',
    lines: [
      { accountCode: '1101', accountName: 'Apex Industrial Electricals Pvt. Ltd.', debit: '283200.0000', credit: '0.0000' },
      { accountCode: '4001', accountName: 'Sales — Electrical Hardware', debit: '0.0000', credit: '240000.0000' },
      { accountCode: '2101', accountName: 'Output CGST 9%', debit: '0.0000', credit: '21600.0000' },
      { accountCode: '2102', accountName: 'Output SGST 9%', debit: '0.0000', credit: '21600.0000' },
    ],
  },
  {
    id: 'v-002',
    voucherDate: '2026-11-25',
    voucherNo: 'PUR/26-27/0118',
    voucherType: 'PURCHASE',
    particulars: 'Mahavir Copper Industries',
    narration: 'Electrolytic Copper Rod 8mm · Batch LOT-20261125 · ITC Eligible',
    referenceNo: 'MCI/26/9412',
    currency: 'INR',
    debit: '0.0000',
    credit: '413000.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'MATCHED',
    complianceLabel: '2B Matched',
    lines: [
      { accountCode: '5001', accountName: 'Purchases — Copper & Alloys', debit: '350000.0000', credit: '0.0000' },
      { accountCode: '2111', accountName: 'Input CGST 9%', debit: '31500.0000', credit: '0.0000' },
      { accountCode: '2112', accountName: 'Input SGST 9%', debit: '31500.0000', credit: '0.0000' },
      { accountCode: '2001', accountName: 'Mahavir Copper Industries', debit: '0.0000', credit: '413000.0000' },
    ],
  },
  {
    id: 'v-003',
    voucherDate: '2026-11-24',
    voucherNo: 'EXP/26-27/0009',
    voucherType: 'SALES',
    particulars: 'Nordic Fasteners AB (Sweden)',
    narration: 'Export under LUT (Zero-Rated) · FX @ ₹84.4000',
    referenceNo: 'SB-902145',
    currency: 'USD',
    foreignAmount: '4500.0000',
    exchangeRate: '84.4000',
    debit: '379800.0000',
    credit: '0.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'E_INVOICE_IRN',
    complianceLabel: 'LUT Export · IRN',
    lines: [
      { accountCode: '1103', accountName: 'Nordic Fasteners AB (Sweden)', debit: '379800.0000', credit: '0.0000' },
      { accountCode: '4002', accountName: 'Export Sales (LUT — Zero Rated)', debit: '0.0000', credit: '379800.0000' },
    ],
  },
  {
    id: 'v-004',
    voucherDate: '2026-11-23',
    voucherNo: 'RCP/26-27/0061',
    voucherType: 'RECEIPT',
    particulars: 'Western Valves & Fittings LLP',
    narration: 'RTGS settlement against INV/26-27/0034 · UTR HDFCR5202611230091',
    referenceNo: 'HDFCR5202611230091',
    currency: 'INR',
    debit: '195000.0000',
    credit: '0.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'PENDING_BRS',
    complianceLabel: 'BRS Pending',
    lines: [
      { accountCode: '1010', accountName: 'HDFC Bank Current A/c · 4821', debit: '195000.0000', credit: '0.0000' },
      { accountCode: '1102', accountName: 'Western Valves & Fittings LLP', debit: '0.0000', credit: '195000.0000' },
    ],
  },
  {
    id: 'v-005',
    voucherDate: '2026-11-22',
    voucherNo: 'PUR/26-27/0119',
    voucherType: 'PURCHASE',
    particulars: 'Kalyani Freight & Logistics',
    narration: 'Inter-State GTA Haulage (Delhi → Hathras) · IGST variance ₹1,260.00 in 2B',
    referenceNo: 'KFL/26/402',
    currency: 'INR',
    debit: '0.0000',
    credit: '74340.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'GSTR2B_MISMATCH',
    complianceLabel: '2B Variance',
    lines: [
      { accountCode: '5101', accountName: 'Freight & Forwarding Inward', debit: '63000.0000', credit: '0.0000' },
      { accountCode: '2113', accountName: 'Input IGST 18%', debit: '11340.0000', credit: '0.0000' },
      { accountCode: '2002', accountName: 'Kalyani Freight & Logistics', debit: '0.0000', credit: '73080.0000' },
      { accountCode: '2201', accountName: 'TDS Payable — Sec 194C / 194I', debit: '0.0000', credit: '1260.0000' },
    ],
  },
  {
    id: 'v-006',
    voucherDate: '2026-11-21',
    voucherNo: 'PAY/26-27/0084',
    voucherType: 'PAYMENT',
    particulars: 'Mahavir Copper Industries',
    narration: 'NEFT part payout against MCI/26/8801 · Matched via bank statement',
    referenceNo: 'HDFCN5202611214421',
    currency: 'INR',
    debit: '0.0000',
    credit: '250000.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'RECONCILED',
    complianceLabel: 'Reconciled',
    lines: [
      { accountCode: '2001', accountName: 'Mahavir Copper Industries', debit: '250000.0000', credit: '0.0000' },
      { accountCode: '1010', accountName: 'HDFC Bank Current A/c · 4821', debit: '0.0000', credit: '250000.0000' },
    ],
  },
  {
    id: 'v-007',
    voucherDate: '2026-11-20',
    voucherNo: 'JRN/26-27/0019',
    voucherType: 'JOURNAL',
    particulars: 'Office Rent & Warehouse Utilities',
    narration: 'Nov 2026 godown lease accrual with 10% TDS u/s 194I',
    referenceNo: 'RENT-NOV-26',
    currency: 'INR',
    debit: '85000.0000',
    credit: '85000.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'MATCHED',
    complianceLabel: 'TDS Logged',
    lines: [
      { accountCode: '5201', accountName: 'Office Rent & Warehouse Utilities', debit: '85000.0000', credit: '0.0000' },
      { accountCode: '2201', accountName: 'TDS Payable — Sec 194C / 194I', debit: '0.0000', credit: '8500.0000' },
      { accountCode: '2002', accountName: 'Kalyani Freight & Logistics', debit: '0.0000', credit: '76500.0000' },
    ],
  },
  {
    id: 'v-008',
    voucherDate: '2026-11-19',
    voucherNo: 'CNT/26-27/0007',
    voucherType: 'CONTRA',
    particulars: 'HDFC Bank Current A/c · 4821',
    narration: 'Counter cash deposit to HDFC branch · Deposit slip #4091',
    referenceNo: 'SLIP-4091',
    currency: 'INR',
    debit: '45000.0000',
    credit: '45000.0000',
    lifecycleStatus: 'POSTED',
    complianceStatus: 'RECONCILED',
    complianceLabel: 'Reconciled',
    lines: [
      { accountCode: '1010', accountName: 'HDFC Bank Current A/c · 4821', debit: '45000.0000', credit: '0.0000' },
      { accountCode: '1001', accountName: 'Cash-in-Hand (Head Office)', debit: '0.0000', credit: '45000.0000' },
    ],
  },
  {
    id: 'v-009',
    voucherDate: '2026-12-05',
    voucherNo: 'PAY/26-27/0085',
    voucherType: 'PAYMENT',
    particulars: 'Kalyani Freight & Logistics',
    narration: 'Post-dated Cheque #000482 maturing 05-Dec-2026 (excluded from cash balance)',
    referenceNo: 'CHQ-000482',
    currency: 'INR',
    debit: '0.0000',
    credit: '38500.0000',
    lifecycleStatus: 'POST_DATED',
    complianceStatus: 'POST_DATED',
    complianceLabel: 'Post-dated',
    lines: [
      { accountCode: '2002', accountName: 'Kalyani Freight & Logistics', debit: '38500.0000', credit: '0.0000' },
      { accountCode: '1010', accountName: 'HDFC Bank Current A/c · 4821', debit: '0.0000', credit: '38500.0000' },
    ],
  },
  {
    id: 'v-010',
    voucherDate: '2026-11-18',
    voucherNo: 'INV/26-27/0039',
    voucherType: 'SALES',
    particulars: 'Western Valves & Fittings LLP',
    narration: 'Cancelled due to duplicate PO quantity — preserved for GSTR-1 Table 13',
    referenceNo: 'PO-WVF-112',
    currency: 'INR',
    debit: '64900.0000',
    credit: '0.0000',
    lifecycleStatus: 'CANCELLED',
    complianceStatus: 'CANCELLED',
    complianceLabel: 'Cancelled',
    lines: [
      { accountCode: '1102', accountName: 'Western Valves & Fittings LLP', debit: '64900.0000', credit: '0.0000' },
      { accountCode: '4001', accountName: 'Sales — Electrical Hardware', debit: '0.0000', credit: '55000.0000' },
      { accountCode: '2103', accountName: 'Output IGST 18%', debit: '0.0000', credit: '9900.0000' },
    ],
  },
]
