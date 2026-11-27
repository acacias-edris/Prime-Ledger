import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buildQuery, requestJson } from '../lib/api'
import { ACCOUNTING_KEYS } from '../hooks/useAccounting'
import type { GstSupplyType } from '../lib/gstMath'

export type InvoiceType = 'SALES' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE'
export type InvoiceStatus = 'DRAFT' | 'POSTED' | 'CANCELLED'
export type ItemType = 'GOODS' | 'SERVICE'
export type ValuationMethod = 'FIFO' | 'WEIGHTED_AVG'
export type HsnSacType = 'HSN' | 'SAC'

export interface GstTaxSlabDTO {
  id: number
  company_id: number
  code: string
  name: string
  cgst_rate: string
  sgst_rate: string
  igst_rate: string
  cess_rate: string
  is_active: boolean
  created_at: string
}

export interface HsnSacCodeDTO {
  id: number
  company_id: number
  code: string
  code_type: HsnSacType
  description: string
  default_tax_slab_id: number | null
  default_tax_slab_code: string | null
  default_uqc: string
  is_active: boolean
}

export interface GstinValidationDTO {
  is_valid: boolean
  normalized: string
  state_code: string | null
  pan: string | null
  error: string | null
}

export interface UnitOfMeasureDTO {
  id: number
  company_id: number
  symbol: string
  formal_name: string
  uqc_code: string
  decimal_places: number
  is_active: boolean
}

export interface GodownDTO {
  id: number
  company_id: number
  code: string
  name: string
  address: string | null
  state_code: string | null
  is_default: boolean
  is_active: boolean
}

export interface GodownCreatePayload {
  code: string
  name: string
  address?: string | null
  state_code?: string | null
  is_default?: boolean
}

export interface InventoryItemDTO {
  id: number
  company_id: number
  sku: string
  name: string
  item_type: ItemType
  valuation_method: ValuationMethod
  unit_id: number
  unit_symbol: string
  unit_uqc: string
  unit_decimal_places: number
  hsn_sac_id: number | null
  hsn_sac_code: string | null
  default_tax_slab_id: number | null
  default_tax_slab_code: string | null
  default_tax_slab_name: string | null
  sales_ledger_id: number | null
  purchase_ledger_id: number | null
  cogs_ledger_id: number | null
  inventory_ledger_id: number | null
  standard_selling_price: string
  standard_purchase_cost: string
  reorder_level: string
  is_active: boolean
  created_at: string
}

export interface InventoryItemCreatePayload {
  sku: string
  name: string
  item_type: ItemType
  valuation_method: ValuationMethod
  unit_id: number
  hsn_sac_id?: number | null
  default_tax_slab_id?: number | null
  sales_ledger_id?: number | null
  purchase_ledger_id?: number | null
  cogs_ledger_id?: number | null
  inventory_ledger_id?: number | null
  standard_selling_price: string
  standard_purchase_cost: string
  reorder_level: string
}

export interface InventoryItemUpdatePayload {
  name?: string
  valuation_method?: ValuationMethod
  unit_id?: number
  hsn_sac_id?: number | null
  default_tax_slab_id?: number | null
  sales_ledger_id?: number | null
  purchase_ledger_id?: number | null
  cogs_ledger_id?: number | null
  inventory_ledger_id?: number | null
  standard_selling_price?: string
  standard_purchase_cost?: string
  reorder_level?: string
  is_active?: boolean
}

export interface StockSummaryRowDTO {
  item_id: number
  sku: string
  name: string
  item_type: ItemType
  valuation_method: ValuationMethod
  unit_symbol: string
  unit_uqc: string
  unit_decimal_places: number
  hsn_sac_code: string | null
  total_qty: string
  avg_rate: string
  closing_value: string
  reorder_level: string
  is_low_stock: boolean
}

export interface StockSummaryResponseDTO {
  items: StockSummaryRowDTO[]
  grand_total_value: string
  low_stock_count: number
}

export interface GodownStockRowDTO {
  godown_id: number
  godown_code: string
  godown_name: string
  item_id: number
  sku: string
  item_name: string
  valuation_method: ValuationMethod
  unit_symbol: string
  unit_decimal_places: number
  total_qty: string
  avg_rate: string
  closing_value: string
}

export interface InventoryLotDTO {
  id: number
  company_id: number
  item_id: number
  item_sku: string
  item_name: string
  godown_id: number
  godown_code: string
  godown_name: string
  source_invoice_id: number | null
  source_invoice_line_id: number | null
  batch_ref: string
  received_date: string
  expiry_date: string | null
  qty_in: string
  qty_available: string
  unit_cost: string
  lot_value: string
  created_at: string
}

export interface StockMovementDTO {
  id: number
  company_id: number
  item_id: number
  item_sku: string
  item_name: string
  godown_id: number
  godown_code: string
  godown_name: string
  invoice_id: number | null
  invoice_number: string | null
  invoice_line_id: number | null
  voucher_id: number | null
  movement_date: string
  direction: 'IN' | 'OUT'
  movement_reason: string
  quantity: string
  unit_cost: string
  total_cost: string
  running_qty: string
  running_avg_cost: string
  created_at: string
}

export interface HsnSummaryRowDTO {
  hsn_sac_code: string
  taxable_amount: string
  cgst_rate: string
  cgst_amount: string
  sgst_rate: string
  sgst_amount: string
  igst_rate: string
  igst_amount: string
  cess_rate: string
  cess_amount: string
  total_tax: string
}

export interface InvoiceListItemDTO {
  id: number
  company_id: number
  fiscal_year_id: number
  voucher_id: number | null
  voucher_number: string | null
  invoice_number: string
  invoice_type: InvoiceType
  supply_type: GstSupplyType
  invoice_date: string
  due_date: string | null
  party_ledger_id: number
  party_name_snapshot: string
  party_gstin_snapshot: string | null
  origin_state_code: string
  place_of_supply: string
  is_inter_state: boolean
  is_rcm: boolean
  taxable_total: string
  tax_total: string
  round_off: string
  grand_total: string
  total_cogs: string
  status: InvoiceStatus
  created_at: string
}

export interface InvoiceLineDetailDTO {
  id: number
  line_no: number
  item_id: number | null
  item_sku: string | null
  item_type: ItemType | null
  godown_id: number | null
  godown_code: string | null
  godown_name: string | null
  account_ledger_id: number | null
  description: string
  hsn_sac_code: string | null
  uqc_code: string
  quantity: string
  unit_price: string
  discount_pct: string
  discount_amount: string
  taxable_amount: string
  tax_slab_id: number | null
  tax_slab_code: string | null
  tax_slab_name: string | null
  cgst_rate: string
  sgst_rate: string
  igst_rate: string
  cess_rate: string
  cgst_amount: string
  sgst_amount: string
  igst_amount: string
  cess_amount: string
  line_total: string
  line_cogs: string
  batch_ref: string | null
  expiry_date: string | null
}

export interface InvoiceDetailDTO {
  id: number
  company_id: number
  fiscal_year_id: number
  voucher_id: number | null
  voucher_number: string | null
  invoice_number: string
  invoice_type: InvoiceType
  supply_type: GstSupplyType
  invoice_date: string
  due_date: string | null
  party_ledger_id: number
  party_name_snapshot: string
  party_gstin_snapshot: string | null
  party_state_code_snapshot: string | null
  origin_state_code: string
  place_of_supply: string
  is_inter_state: boolean
  is_rcm: boolean
  original_invoice_id: number | null
  supplier_invoice_no: string | null
  supplier_invoice_date: string | null
  subtotal: string
  total_discount: string
  taxable_total: string
  cgst_total: string
  sgst_total: string
  igst_total: string
  cess_total: string
  tax_total: string
  round_off: string
  grand_total: string
  total_cogs: string
  status: InvoiceStatus
  narration: string
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
  lines: InvoiceLineDetailDTO[]
  hsn_summary: HsnSummaryRowDTO[]
  amount_in_words: string
  seller_snapshot: {
    legal_name: string
    name: string
    gstin: string | null
    state_code: string
    country_code: string
    base_currency: string
  }
  party_snapshot: {
    ledger_id: number
    ledger_code: string
    name: string
    gstin: string | null
    state_code: string | null
  }
}

export interface InvoiceCreatePayload {
  status: 'DRAFT' | 'POSTED'
  invoice_type: InvoiceType
  supply_type: GstSupplyType
  invoice_date: string
  due_date?: string | null
  party_ledger_id: number
  place_of_supply?: string | null
  is_rcm: boolean
  enable_round_off: boolean
  original_invoice_id?: number | null
  supplier_invoice_no?: string | null
  supplier_invoice_date?: string | null
  narration: string
  lines: Array<{
    item_id?: number | null
    godown_id?: number | null
    account_ledger_id?: number | null
    description?: string | null
    hsn_sac_code?: string | null
    uqc_code?: string | null
    quantity: string
    unit_price: string
    discount_pct: string
    discount_amount: string
    tax_slab_id?: number | null
    batch_ref?: string | null
    expiry_date?: string | null
  }>
}

export const GST_INVENTORY_KEYS = {
  all: ['gst-inventory'] as const,
  slabs: () => [...GST_INVENTORY_KEYS.all, 'slabs'] as const,
  hsnSac: (params?: { q?: string; code_type?: HsnSacType }) =>
    [...GST_INVENTORY_KEYS.all, 'hsn-sac', params ?? {}] as const,
  units: () => [...GST_INVENTORY_KEYS.all, 'units'] as const,
  godowns: () => [...GST_INVENTORY_KEYS.all, 'godowns'] as const,
  items: (params?: { q?: string; item_type?: ItemType }) =>
    [...GST_INVENTORY_KEYS.all, 'items', params ?? {}] as const,
  stockSummary: (lowStockOnly = false) =>
    [...GST_INVENTORY_KEYS.all, 'stock-summary', lowStockOnly] as const,
  godownStock: (godownId?: number) =>
    [...GST_INVENTORY_KEYS.all, 'godown-stock', godownId ?? null] as const,
  itemLots: (itemId: number | null, godownId?: number, includeExhausted = false) =>
    [...GST_INVENTORY_KEYS.all, 'lots', itemId, godownId ?? null, includeExhausted] as const,
  itemLedger: (itemId: number | null, godownId?: number) =>
    [...GST_INVENTORY_KEYS.all, 'ledger', itemId, godownId ?? null] as const,
  invoices: (params?: Record<string, string | number | undefined>) =>
    [...GST_INVENTORY_KEYS.all, 'invoices', params ?? {}] as const,
  invoiceDetail: (invoiceId: number | null) =>
    [...GST_INVENTORY_KEYS.all, 'invoice', invoiceId] as const,
}

export const gstInventoryApi = {
  getTaxSlabs: () => requestJson<GstTaxSlabDTO[]>('/tax/india/slabs'),
  getHsnSacCodes: (params?: { q?: string; code_type?: HsnSacType }) =>
    requestJson<HsnSacCodeDTO[]>(`/tax/india/hsn-sac${buildQuery(params ?? {})}`),
  validateGstin: (gstin: string) =>
    requestJson<GstinValidationDTO>(`/tax/india/validate-gstin/${encodeURIComponent(gstin)}`),

  getUnits: () => requestJson<UnitOfMeasureDTO[]>('/inventory/units'),
  getGodowns: () => requestJson<GodownDTO[]>('/inventory/godowns'),
  createGodown: (payload: GodownCreatePayload) =>
    requestJson<GodownDTO>('/inventory/godowns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getItems: (params?: { q?: string; item_type?: ItemType }) =>
    requestJson<InventoryItemDTO[]>(`/inventory/items${buildQuery(params ?? {})}`),
  createItem: (payload: InventoryItemCreatePayload) =>
    requestJson<InventoryItemDTO>('/inventory/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateItem: (itemId: number, payload: InventoryItemUpdatePayload) =>
    requestJson<InventoryItemDTO>(`/inventory/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getStockSummary: (lowStockOnly = false) =>
    requestJson<StockSummaryResponseDTO>(
      `/inventory/stock-summary${buildQuery({ low_stock_only: lowStockOnly || undefined })}`,
    ),
  getGodownStock: (godownId?: number) =>
    requestJson<GodownStockRowDTO[]>(
      `/inventory/godown-stock${buildQuery({ godown_id: godownId })}`,
    ),
  getItemLots: (itemId: number, params?: { godown_id?: number; include_exhausted?: boolean }) =>
    requestJson<InventoryLotDTO[]>(
      `/inventory/items/${itemId}/lots${buildQuery(params ?? {})}`,
    ),
  getItemLedger: (itemId: number, params?: { godown_id?: number }) =>
    requestJson<StockMovementDTO[]>(
      `/inventory/items/${itemId}/ledger${buildQuery(params ?? {})}`,
    ),

  getInvoices: (params?: {
    invoice_type?: InvoiceType
    status?: InvoiceStatus
    party_ledger_id?: number
    from_date?: string
    to_date?: string
    q?: string
  }) => requestJson<InvoiceListItemDTO[]>(`/invoices${buildQuery(params ?? {})}`),

  getInvoiceDetail: (invoiceId: number) =>
    requestJson<InvoiceDetailDTO>(`/invoices/${invoiceId}`),

  createInvoice: (payload: InvoiceCreatePayload) =>
    requestJson<InvoiceDetailDTO>('/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  postDraftInvoice: (invoiceId: number) =>
    requestJson<InvoiceDetailDTO>(`/invoices/${invoiceId}/post`, {
      method: 'POST',
    }),

  cancelInvoice: (invoiceId: number, reason: string) =>
    requestJson<InvoiceDetailDTO>(`/invoices/${invoiceId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
}

export function useTaxSlabs() {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.slabs(),
    queryFn: gstInventoryApi.getTaxSlabs,
  })
}

export function useHsnSacCodes(params?: { q?: string; code_type?: HsnSacType }) {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.hsnSac(params),
    queryFn: () => gstInventoryApi.getHsnSacCodes(params),
  })
}

export function useUnits() {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.units(),
    queryFn: gstInventoryApi.getUnits,
  })
}

export function useGodowns() {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.godowns(),
    queryFn: gstInventoryApi.getGodowns,
  })
}

export function useCreateGodown() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: gstInventoryApi.createGodown,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GST_INVENTORY_KEYS.all })
    },
  })
}

export function useInventoryItems(params?: { q?: string; item_type?: ItemType }) {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.items(params),
    queryFn: () => gstInventoryApi.getItems(params),
  })
}

export function useCreateInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: gstInventoryApi.createItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GST_INVENTORY_KEYS.all })
    },
  })
}

export function useUpdateInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: number
      payload: InventoryItemUpdatePayload
    }) => gstInventoryApi.updateItem(itemId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GST_INVENTORY_KEYS.all })
    },
  })
}

export function useStockSummary(lowStockOnly = false) {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.stockSummary(lowStockOnly),
    queryFn: () => gstInventoryApi.getStockSummary(lowStockOnly),
  })
}

export function useGodownStock(godownId?: number) {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.godownStock(godownId),
    queryFn: () => gstInventoryApi.getGodownStock(godownId),
  })
}

export function useItemLots(
  itemId: number | null,
  options?: { godownId?: number; includeExhausted?: boolean },
) {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.itemLots(
      itemId,
      options?.godownId,
      options?.includeExhausted ?? false,
    ),
    queryFn: () =>
      gstInventoryApi.getItemLots(itemId!, {
        godown_id: options?.godownId,
        include_exhausted: options?.includeExhausted,
      }),
    enabled: itemId !== null,
  })
}

export function useItemStockLedger(itemId: number | null, godownId?: number) {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.itemLedger(itemId, godownId),
    queryFn: () =>
      gstInventoryApi.getItemLedger(itemId!, { godown_id: godownId }),
    enabled: itemId !== null,
  })
}

export function useInvoices(params?: {
  invoice_type?: InvoiceType
  status?: InvoiceStatus
  party_ledger_id?: number
  from_date?: string
  to_date?: string
  q?: string
}) {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.invoices(params),
    queryFn: () => gstInventoryApi.getInvoices(params),
  })
}

export function useInvoiceDetail(invoiceId: number | null) {
  return useQuery({
    queryKey: GST_INVENTORY_KEYS.invoiceDetail(invoiceId),
    queryFn: () => gstInventoryApi.getInvoiceDetail(invoiceId!),
    enabled: invoiceId !== null,
  })
}

export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: gstInventoryApi.createInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GST_INVENTORY_KEYS.all })
      qc.invalidateQueries({ queryKey: ACCOUNTING_KEYS.all })
    },
  })
}

export function usePostDraftInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: gstInventoryApi.postDraftInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GST_INVENTORY_KEYS.all })
      qc.invalidateQueries({ queryKey: ACCOUNTING_KEYS.all })
    },
  })
}

export function useCancelInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, reason }: { invoiceId: number; reason: string }) =>
      gstInventoryApi.cancelInvoice(invoiceId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GST_INVENTORY_KEYS.all })
      qc.invalidateQueries({ queryKey: ACCOUNTING_KEYS.all })
    },
  })
}
