import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  accountingApi,
  type AccountNature,
  type ApiVoucherStatus,
  type ApiVoucherType,
  type LedgerCreatePayload,
  type VoucherCreatePayload,
} from '../lib/api'

export const ACCOUNTING_KEYS = {
  all: ['accounting'] as const,
  company: () => [...ACCOUNTING_KEYS.all, 'company'] as const,
  kpis: () => [...ACCOUNTING_KEYS.all, 'kpis'] as const,
  groups: () => [...ACCOUNTING_KEYS.all, 'groups'] as const,
  ledgers: (params?: { group_id?: number; nature?: AccountNature; search?: string }) =>
    [...ACCOUNTING_KEYS.all, 'ledgers', params ?? {}] as const,
  dayBook: (params?: {
    from_date?: string
    to_date?: string
    voucher_type?: ApiVoucherType
    status?: ApiVoucherStatus
    search?: string
  }) => [...ACCOUNTING_KEYS.all, 'dayBook', params ?? {}] as const,
  ledgerStatement: (ledgerId: number | null, params?: { from_date?: string; to_date?: string }) =>
    [...ACCOUNTING_KEYS.all, 'ledgerStatement', ledgerId, params ?? {}] as const,
  trialBalance: (params?: { from_date?: string; to_date?: string; include_zero?: boolean }) =>
    [...ACCOUNTING_KEYS.all, 'trialBalance', params ?? {}] as const,
  profitLoss: (params?: { from_date?: string; to_date?: string }) =>
    [...ACCOUNTING_KEYS.all, 'profitLoss', params ?? {}] as const,
  balanceSheet: (params?: { as_of_date?: string }) =>
    [...ACCOUNTING_KEYS.all, 'balanceSheet', params ?? {}] as const,
}

export function useCompanyContext() {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.company(),
    queryFn: accountingApi.getCompanyContext,
  })
}

export function useDashboardKPIs() {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.kpis(),
    queryFn: accountingApi.getDashboardKPIs,
  })
}

export function useAccountGroups() {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.groups(),
    queryFn: accountingApi.getAccountGroups,
  })
}

export function useLedgers(params?: {
  group_id?: number
  nature?: AccountNature
  search?: string
}) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.ledgers(params),
    queryFn: () => accountingApi.getLedgers(params),
  })
}

export function useDayBook(params?: {
  from_date?: string
  to_date?: string
  voucher_type?: ApiVoucherType
  status?: ApiVoucherStatus
  search?: string
}) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.dayBook(params),
    queryFn: () => accountingApi.getDayBook(params),
  })
}

export function useLedgerStatement(
  ledgerId: number | null,
  params?: { from_date?: string; to_date?: string },
) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.ledgerStatement(ledgerId, params),
    queryFn: () => accountingApi.getLedgerStatement(ledgerId!, params),
    enabled: ledgerId !== null,
  })
}

export function useTrialBalance(params?: {
  from_date?: string
  to_date?: string
  include_zero?: boolean
}) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.trialBalance(params),
    queryFn: () => accountingApi.getTrialBalance(params),
  })
}

export function useProfitLoss(params?: { from_date?: string; to_date?: string }) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.profitLoss(params),
    queryFn: () => accountingApi.getProfitLoss(params),
  })
}

export function useBalanceSheet(params?: { as_of_date?: string }) {
  return useQuery({
    queryKey: ACCOUNTING_KEYS.balanceSheet(params),
    queryFn: () => accountingApi.getBalanceSheet(params),
  })
}

export function useCreateLedger() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: LedgerCreatePayload) => accountingApi.createLedger(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEYS.all })
    },
  })
}

export function useCreateVoucher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: VoucherCreatePayload) => accountingApi.createVoucher(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEYS.all })
    },
  })
}

export function useCancelVoucher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      voucherId,
      createReversal,
      reason,
    }: {
      voucherId: number
      createReversal?: boolean
      reason?: string
    }) =>
      accountingApi.cancelVoucher(voucherId, {
        create_reversal: createReversal,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTING_KEYS.all })
    },
  })
}
