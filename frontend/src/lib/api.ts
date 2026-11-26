export type AccountNature = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'
export type DrCr = 'DR' | 'CR'
export type ApiVoucherType =
  | 'CONTRA'
  | 'PAYMENT'
  | 'RECEIPT'
  | 'JOURNAL'
  | 'SALES'
  | 'PURCHASE'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
export type ApiVoucherStatus = 'DRAFT' | 'POSTED' | 'CANCELLED'

export interface FiscalYearDTO {
  id: number
  company_id: number
  label: string
  start_date: string
  end_date: string
  is_locked: boolean
}

export interface CompanyContextDTO {
  id: number
  name: string
  legal_name: string
  country_code: string
  state_code: string
  gstin: string | null
  base_currency: string
  number_format: string
  fy_start_month: number
  active_fiscal_year: FiscalYearDTO
}

export interface AccountGroupDTO {
  id: number
  company_id: number
  code: string
  name: string
  parent_id: number | null
  nature: AccountNature
  is_primary: boolean
  affects_gross_profit: boolean
  display_order: number
  ledger_count: number
  closing_balance: string
  closing_dr_cr: DrCr
}

export interface LedgerDTO {
  id: number
  company_id: number
  group_id: number
  group_name: string
  group_nature: AccountNature
  code: string
  name: string
  opening_balance: string
  opening_dr_cr: DrCr
  closing_balance: string
  closing_dr_cr: DrCr
  party_gstin: string | null
  party_state_code: string | null
  credit_days: number
  is_system_ledger: boolean
  is_active: boolean
}

export interface LedgerCreatePayload {
  group_id: number
  code: string
  name: string
  opening_balance: string
  opening_dr_cr: DrCr
  party_gstin?: string | null
  party_state_code?: string | null
  credit_days?: number
}

export interface VoucherLineDTO {
  id: number
  ledger_id: number
  ledger_code: string
  ledger_name: string
  debit_amount: string
  credit_amount: string
  line_narration: string | null
}

export interface VoucherDTO {
  id: number
  company_id: number
  fiscal_year_id: number
  voucher_number: string
  voucher_type: ApiVoucherType
  voucher_date: string
  reference_no: string | null
  narration: string
  status: ApiVoucherStatus
  reversed_voucher_id: number | null
  particulars: string
  total_debit: string
  total_credit: string
  created_at: string
  updated_at: string
  lines: VoucherLineDTO[]
}

export interface VoucherCreatePayload {
  voucher_type: ApiVoucherType
  voucher_date: string
  voucher_number?: string | null
  reference_no?: string | null
  narration: string
  status?: ApiVoucherStatus
  lines: Array<{
    ledger_id?: number
    account_code?: string
    debit_amount: string
    credit_amount: string
    line_narration?: string | null
  }>
}

export interface VoucherCancelResponseDTO {
  original_voucher: VoucherDTO
  reversal_voucher: VoucherDTO | null
  action: 'CANCELLED' | 'REVERSED'
}

export interface DashboardKPIsDTO {
  company_name: string
  fiscal_year_label: string
  cash_and_bank_balance: string
  cash_and_bank_dr_cr: DrCr
  sundry_debtors: string
  sundry_debtors_dr_cr: DrCr
  sundry_creditors: string
  sundry_creditors_dr_cr: DrCr
  net_gst_position: string
  net_gst_dr_cr: DrCr
  total_vouchers: number
  posted_vouchers: number
  draft_vouchers: number
  cancelled_vouchers: number
  trial_balance_balanced: boolean
}

export interface DayBookReportDTO {
  from_date: string | null
  to_date: string | null
  total_count: number
  posted_count: number
  excluded_count: number
  posted_total_debit: string
  posted_total_credit: string
  vouchers: VoucherDTO[]
}

export interface LedgerStatementRowDTO {
  voucher_id: number
  voucher_date: string
  voucher_number: string
  voucher_type: ApiVoucherType
  particulars: string
  reference_no: string | null
  narration: string
  debit_amount: string
  credit_amount: string
  running_balance: string
  running_dr_cr: DrCr
}

export interface LedgerStatementDTO {
  ledger_id: number
  ledger_code: string
  ledger_name: string
  group_name: string
  group_nature: AccountNature
  from_date: string
  to_date: string
  opening_balance: string
  opening_dr_cr: DrCr
  period_debit: string
  period_credit: string
  closing_balance: string
  closing_dr_cr: DrCr
  entries: LedgerStatementRowDTO[]
}

export interface TrialBalanceRowDTO {
  ledger_id: number
  ledger_code: string
  ledger_name: string
  group_id: number
  group_name: string
  nature: AccountNature
  opening_debit: string
  opening_credit: string
  period_debit: string
  period_credit: string
  closing_debit: string
  closing_credit: string
}

export interface TrialBalanceGroupSummaryDTO {
  group_id: number
  group_name: string
  nature: AccountNature
  opening_debit: string
  opening_credit: string
  period_debit: string
  period_credit: string
  closing_debit: string
  closing_credit: string
}

export interface TrialBalanceReportDTO {
  from_date: string
  to_date: string
  rows: TrialBalanceRowDTO[]
  groups: TrialBalanceGroupSummaryDTO[]
  total_opening_debit: string
  total_opening_credit: string
  total_period_debit: string
  total_period_credit: string
  total_debit: string
  total_credit: string
  difference: string
  is_balanced: boolean
}

export interface StatementLineItemDTO {
  ledger_id: number
  ledger_code: string
  ledger_name: string
  group_name: string
  amount: string
}

export interface ProfitLossReportDTO {
  from_date: string
  to_date: string
  direct_income: StatementLineItemDTO[]
  direct_expenses: StatementLineItemDTO[]
  total_direct_income: string
  total_direct_expenses: string
  gross_profit: string
  indirect_income: StatementLineItemDTO[]
  indirect_expenses: StatementLineItemDTO[]
  total_indirect_income: string
  total_indirect_expenses: string
  net_profit: string
}

export interface BalanceSheetSectionGroupDTO {
  group_id: number
  group_name: string
  nature: AccountNature
  total: string
  ledgers: StatementLineItemDTO[]
}

export interface BalanceSheetReportDTO {
  as_of_date: string
  assets: BalanceSheetSectionGroupDTO[]
  liabilities: BalanceSheetSectionGroupDTO[]
  equity: BalanceSheetSectionGroupDTO[]
  current_period_net_profit: string
  total_assets: string
  total_liabilities: string
  total_equity: string
  total_liabilities_and_equity: string
  difference: string
  is_balanced: boolean
}

export class ApiError extends Error {
  readonly status: number
  readonly errorCode?: string

  constructor(message: string, status: number, errorCode?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errorCode = errorCode
  }
}

const API_BASE = '/api/v1'

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      qs.set(k, String(v))
    }
  }
  const encoded = qs.toString()
  return encoded ? `?${encoded}` : ''
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    let errorCode: string | undefined
    try {
      const payload = (await res.json()) as {
        message?: string
        error_code?: string
        detail?: string | Array<{ msg?: string; loc?: Array<string | number> }>
      }
      if (payload.message) {
        message = payload.message
        errorCode = payload.error_code
      } else if (typeof payload.detail === 'string') {
        message = payload.detail
      } else if (Array.isArray(payload.detail) && payload.detail.length > 0) {
        message = payload.detail.map((d) => d.msg ?? 'Validation error').join('; ')
      }
    } catch {
      // Fall back to HTTP status text
    }
    throw new ApiError(message, res.status, errorCode)
  }

  return (await res.json()) as T
}

export const accountingApi = {
  getCompanyContext: () => requestJson<CompanyContextDTO>('/company'),

  getDashboardKPIs: () => requestJson<DashboardKPIsDTO>('/reports/dashboard-kpis'),

  getAccountGroups: () => requestJson<AccountGroupDTO[]>('/account-groups'),

  getLedgers: (params?: { group_id?: number; nature?: AccountNature; search?: string }) =>
    requestJson<LedgerDTO[]>(`/ledgers${buildQuery(params ?? {})}`),

  createLedger: (payload: LedgerCreatePayload) =>
    requestJson<LedgerDTO>('/ledgers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDayBook: (params?: {
    from_date?: string
    to_date?: string
    voucher_type?: ApiVoucherType
    status?: ApiVoucherStatus
    search?: string
  }) => requestJson<DayBookReportDTO>(`/reports/day-book${buildQuery(params ?? {})}`),

  createVoucher: (payload: VoucherCreatePayload) =>
    requestJson<VoucherDTO>('/vouchers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelVoucher: (
    voucherId: number,
    options: { create_reversal?: boolean; reason?: string } = {},
  ) =>
    requestJson<VoucherCancelResponseDTO>(`/vouchers/${voucherId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        create_reversal: options.create_reversal ?? false,
        reason: options.reason ?? null,
      }),
    }),

  getLedgerStatement: (
    ledgerId: number,
    params?: { from_date?: string; to_date?: string },
  ) =>
    requestJson<LedgerStatementDTO>(
      `/reports/ledger/${ledgerId}${buildQuery(params ?? {})}`,
    ),

  getTrialBalance: (params?: {
    from_date?: string
    to_date?: string
    include_zero?: boolean
  }) =>
    requestJson<TrialBalanceReportDTO>(
      `/reports/trial-balance${buildQuery(params ?? {})}`,
    ),

  getProfitLoss: (params?: { from_date?: string; to_date?: string }) =>
    requestJson<ProfitLossReportDTO>(
      `/reports/profit-loss${buildQuery(params ?? {})}`,
    ),

  getBalanceSheet: (params?: { as_of_date?: string }) =>
    requestJson<BalanceSheetReportDTO>(
      `/reports/balance-sheet${buildQuery(params ?? {})}`,
    ),
}
