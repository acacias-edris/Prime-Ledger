import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Edit3,
  Layers,
  MapPin,
  Package,
  Plus,
  Warehouse,
  X,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { DECIMAL_INPUT_REGEX, fromScaledInt, toScaledInt } from '../../lib/decimal'
import { formatCurrency, formatDisplayDate } from '../../lib/format'
import { formatQuantityWithDecimals, INDIAN_GST_STATES } from '../../lib/gstMath'
import { useLedgers } from '../../hooks/useAccounting'
import {
  useCreateGodown,
  useCreateInventoryItem,
  useGodowns,
  useGodownStock,
  useHsnSacCodes,
  useInventoryItems,
  useItemLots,
  useItemStockLedger,
  useStockSummary,
  useTaxSlabs,
  useUnits,
  useUpdateInventoryItem,
  type GodownStockRowDTO,
  type InventoryItemDTO,
  type InventoryLotDTO,
  type ItemType,
  type StockMovementDTO,
  type StockSummaryRowDTO,
  type ValuationMethod,
} from '../../api/gstInventory'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
} from '../../components/ui/DataTable'
import { Drawer } from '../../components/ui/Drawer'
import { Input } from '../../components/ui/Input'

type InventoryTab = 'summary' | 'items' | 'godowns' | 'lots-ledger'

const nonNegDecimalSchema = z
  .string()
  .trim()
  .refine(
    (v) => v === '' || DECIMAL_INPUT_REGEX.test(v),
    'Enter valid non-negative decimal',
  )

const itemFormSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(64),
  name: z.string().trim().min(1, 'Item name is required').max(160),
  item_type: z.enum(['GOODS', 'SERVICE']),
  valuation_method: z.enum(['FIFO', 'WEIGHTED_AVG']),
  unit_id: z.string().min(1, 'Unit is required'),
  hsn_sac_id: z.string(),
  default_tax_slab_id: z.string(),
  standard_selling_price: nonNegDecimalSchema,
  standard_purchase_cost: nonNegDecimalSchema,
  reorder_level: nonNegDecimalSchema,
  sales_ledger_id: z.string(),
  purchase_ledger_id: z.string(),
  cogs_ledger_id: z.string(),
  inventory_ledger_id: z.string(),
})

type ItemFormInput = z.input<typeof itemFormSchema>
type ItemFormOutput = z.output<typeof itemFormSchema>

const godownFormSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(32),
  name: z.string().trim().min(1, 'Name is required').max(120),
  address: z.string().trim().max(255),
  state_code: z.string().trim().max(8),
  is_default: z.boolean(),
})

type GodownFormInput = z.input<typeof godownFormSchema>
type GodownFormOutput = z.output<typeof godownFormSchema>

export interface InventoryPageProps {
  onNotify: (message: string) => void
}

export function InventoryPage({ onNotify }: InventoryPageProps) {
  const [activeTab, setActiveTab] = useState<InventoryTab>('summary')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [selectedGodownId, setSelectedGodownId] = useState<number | undefined>(undefined)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [lotGodownFilter, setLotGodownFilter] = useState<number | undefined>(undefined)
  const [includeExhausted, setIncludeExhausted] = useState(false)

  // Item Drawer state
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItemDTO | null>(null)
  const [itemServerError, setItemServerError] = useState<string | null>(null)

  // Godown Modal state
  const [godownModalOpen, setGodownModalOpen] = useState(false)
  const [godownServerError, setGodownServerError] = useState<string | null>(null)

  const summaryQuery = useStockSummary(lowStockOnly)
  const itemsQuery = useInventoryItems()
  const godownsQuery = useGodowns()
  const unitsQuery = useUnits()
  const hsnQuery = useHsnSacCodes()
  const slabsQuery = useTaxSlabs()
  const ledgersQuery = useLedgers()
  const godownStockQuery = useGodownStock(selectedGodownId)

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const godowns = useMemo(() => godownsQuery.data ?? [], [godownsQuery.data])
  const units = useMemo(() => unitsQuery.data ?? [], [unitsQuery.data])
  const hsnCodes = useMemo(() => hsnQuery.data ?? [], [hsnQuery.data])
  const slabs = useMemo(() => slabsQuery.data ?? [], [slabsQuery.data])
  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])

  const effectiveItemId =
    selectedItemId ?? items.find((i) => i.item_type === 'GOODS')?.id ?? items[0]?.id ?? null

  const lotsQuery = useItemLots(effectiveItemId, {
    godownId: lotGodownFilter,
    includeExhausted,
  })
  const movementsQuery = useItemStockLedger(effectiveItemId, lotGodownFilter)

  const createItem = useCreateInventoryItem()
  const updateItem = useUpdateInventoryItem()
  const createGodown = useCreateGodown()

  const {
    register: registerItem,
    handleSubmit: handleSubmitItem,
    reset: resetItem,
    formState: { errors: itemErrors },
  } = useForm<ItemFormInput, unknown, ItemFormOutput>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      sku: '',
      name: '',
      item_type: 'GOODS',
      valuation_method: 'FIFO',
      unit_id: '',
      hsn_sac_id: '',
      default_tax_slab_id: '',
      standard_selling_price: '0.00',
      standard_purchase_cost: '0.00',
      reorder_level: '0.00',
      sales_ledger_id: '',
      purchase_ledger_id: '',
      cogs_ledger_id: '',
      inventory_ledger_id: '',
    },
  })

  const {
    register: registerGodown,
    handleSubmit: handleSubmitGodown,
    reset: resetGodown,
    formState: { errors: godownErrors },
  } = useForm<GodownFormInput, unknown, GodownFormOutput>({
    resolver: zodResolver(godownFormSchema),
    defaultValues: {
      code: '',
      name: '',
      address: '',
      state_code: '09',
      is_default: false,
    },
  })

  const openNewItemDrawer = () => {
    setEditingItem(null)
    setItemServerError(null)
    resetItem({
      sku: '',
      name: '',
      item_type: 'GOODS',
      valuation_method: 'FIFO',
      unit_id: units[0]?.id ? String(units[0].id) : '',
      hsn_sac_id: hsnCodes[0]?.id ? String(hsnCodes[0].id) : '',
      default_tax_slab_id: slabs[3]?.id ? String(slabs[3].id) : '',
      standard_selling_price: '0.00',
      standard_purchase_cost: '0.00',
      reorder_level: '10.00',
      sales_ledger_id: '',
      purchase_ledger_id: '',
      cogs_ledger_id: '',
      inventory_ledger_id: '',
    })
    setItemDrawerOpen(true)
  }

  const openEditItemDrawer = (item: InventoryItemDTO) => {
    setEditingItem(item)
    setItemServerError(null)
    resetItem({
      sku: item.sku,
      name: item.name,
      item_type: item.item_type,
      valuation_method: item.valuation_method,
      unit_id: String(item.unit_id),
      hsn_sac_id: item.hsn_sac_id ? String(item.hsn_sac_id) : '',
      default_tax_slab_id: item.default_tax_slab_id
        ? String(item.default_tax_slab_id)
        : '',
      standard_selling_price: item.standard_selling_price,
      standard_purchase_cost: item.standard_purchase_cost,
      reorder_level: item.reorder_level,
      sales_ledger_id: item.sales_ledger_id ? String(item.sales_ledger_id) : '',
      purchase_ledger_id: item.purchase_ledger_id ? String(item.purchase_ledger_id) : '',
      cogs_ledger_id: item.cogs_ledger_id ? String(item.cogs_ledger_id) : '',
      inventory_ledger_id: item.inventory_ledger_id ? String(item.inventory_ledger_id) : '',
    })
    setItemDrawerOpen(true)
  }

  const onSubmitItem = async (data: ItemFormOutput) => {
    setItemServerError(null)
    try {
      if (editingItem) {
        const updated = await updateItem.mutateAsync({
          itemId: editingItem.id,
          payload: {
            name: data.name,
            valuation_method: data.valuation_method as ValuationMethod,
            unit_id: Number(data.unit_id),
            hsn_sac_id: data.hsn_sac_id ? Number(data.hsn_sac_id) : null,
            default_tax_slab_id: data.default_tax_slab_id
              ? Number(data.default_tax_slab_id)
              : null,
            standard_selling_price: fromScaledInt(toScaledInt(data.standard_selling_price), 4),
            standard_purchase_cost: fromScaledInt(toScaledInt(data.standard_purchase_cost), 4),
            reorder_level: fromScaledInt(toScaledInt(data.reorder_level), 4),
            sales_ledger_id: data.sales_ledger_id ? Number(data.sales_ledger_id) : null,
            purchase_ledger_id: data.purchase_ledger_id
              ? Number(data.purchase_ledger_id)
              : null,
            cogs_ledger_id: data.cogs_ledger_id ? Number(data.cogs_ledger_id) : null,
            inventory_ledger_id: data.inventory_ledger_id
              ? Number(data.inventory_ledger_id)
              : null,
          },
        })
        onNotify(`Updated item ${updated.sku} · ${updated.name}`)
      } else {
        const created = await createItem.mutateAsync({
          sku: data.sku,
          name: data.name,
          item_type: data.item_type as ItemType,
          valuation_method: data.valuation_method as ValuationMethod,
          unit_id: Number(data.unit_id),
          hsn_sac_id: data.hsn_sac_id ? Number(data.hsn_sac_id) : null,
          default_tax_slab_id: data.default_tax_slab_id
            ? Number(data.default_tax_slab_id)
            : null,
          standard_selling_price: fromScaledInt(toScaledInt(data.standard_selling_price), 4),
          standard_purchase_cost: fromScaledInt(toScaledInt(data.standard_purchase_cost), 4),
          reorder_level: fromScaledInt(toScaledInt(data.reorder_level), 4),
          sales_ledger_id: data.sales_ledger_id ? Number(data.sales_ledger_id) : null,
          purchase_ledger_id: data.purchase_ledger_id
            ? Number(data.purchase_ledger_id)
            : null,
          cogs_ledger_id: data.cogs_ledger_id ? Number(data.cogs_ledger_id) : null,
          inventory_ledger_id: data.inventory_ledger_id
            ? Number(data.inventory_ledger_id)
            : null,
        })
        onNotify(`Created item ${created.sku} · ${created.name}`)
      }
      setItemDrawerOpen(false)
    } catch (err) {
      setItemServerError(err instanceof Error ? err.message : 'Failed to save item.')
    }
  }

  const onSubmitGodown = async (data: GodownFormOutput) => {
    setGodownServerError(null)
    try {
      const created = await createGodown.mutateAsync({
        code: data.code,
        name: data.name,
        address: data.address || null,
        state_code: data.state_code || null,
        is_default: data.is_default,
      })
      onNotify(`Created godown ${created.code} · ${created.name}`)
      resetGodown()
      setGodownModalOpen(false)
    } catch (err) {
      setGodownServerError(err instanceof Error ? err.message : 'Failed to create godown.')
    }
  }

  const summaryColumns = useMemo<DataTableColumnDef<StockSummaryRowDTO>[]>(
    () => [
      {
        accessorKey: 'sku',
        header: 'SKU',
        meta: { align: 'left', mono: true, width: '112px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] font-medium text-muted-text">
            {row.original.sku}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Stock Item',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-accent">
              {row.original.name}
            </p>
            <p className="mt-0.5 code-mono text-[11.5px] text-muted-text">
              HSN: {row.original.hsn_sac_code ?? '—'} · {row.original.unit_uqc}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'valuation_method',
        header: 'Valuation',
        meta: { align: 'left', width: '124px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <Badge variant="neutral" icon={false}>
            {row.original.valuation_method === 'WEIGHTED_AVG' ? 'WAC' : 'FIFO'}
          </Badge>
        ),
      },
      {
        accessorKey: 'total_qty',
        header: 'Qty On Hand',
        meta: { align: 'right', mono: true, width: '132px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13.5px] font-semibold text-primary-text">
            {formatQuantityWithDecimals(
              row.original.total_qty,
              row.original.unit_decimal_places,
            )}{' '}
            <span className="text-[11px] font-normal text-muted-text">
              {row.original.unit_symbol}
            </span>
          </span>
        ),
      },
      {
        accessorKey: 'avg_rate',
        header: 'Avg Rate (₹)',
        meta: { align: 'right', mono: true, width: '128px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] text-primary-text">
            {formatCurrency(row.original.avg_rate, { showSymbol: false })}
          </span>
        ),
      },
      {
        accessorKey: 'closing_value',
        header: 'Closing Value (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '150px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13.5px] font-semibold text-primary-text">
            {formatCurrency(row.original.closing_value, { showSymbol: false })}
          </span>
        ),
      },
      {
        accessorKey: 'reorder_level',
        header: 'Reorder Lvl',
        meta: { align: 'right', mono: true, width: '112px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12.5px] text-muted-text">
            {formatQuantityWithDecimals(
              row.original.reorder_level,
              row.original.unit_decimal_places,
            )}
          </span>
        ),
      },
      {
        accessorKey: 'is_low_stock',
        header: 'Status',
        meta: { align: 'center', width: '126px' } satisfies LedgerColumnMeta,
        cell: ({ row }) =>
          row.original.is_low_stock ? (
            <Badge
              variant="warning"
              icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />}
            >
              Low Stock
            </Badge>
          ) : (
            <Badge
              variant="success"
              icon={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />}
            >
              In Stock
            </Badge>
          ),
      },
    ],
    [],
  )

  const itemMasterColumns = useMemo<DataTableColumnDef<InventoryItemDTO>[]>(
    () => [
      {
        accessorKey: 'sku',
        header: 'SKU',
        meta: { align: 'left', mono: true, width: '112px' } satisfies LedgerColumnMeta,
      },
      {
        accessorKey: 'name',
        header: 'Item Name',
        meta: { align: 'left', minWidth: '210px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="font-medium text-primary-text">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'item_type',
        header: 'Type',
        meta: { align: 'left', width: '96px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <Badge variant={row.original.item_type === 'SERVICE' ? 'accent' : 'neutral'} icon={false}>
            {row.original.item_type}
          </Badge>
        ),
      },
      {
        accessorKey: 'valuation_method',
        header: 'Costing',
        meta: { align: 'left', width: '100px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12px] text-muted-text">
            {row.original.item_type === 'SERVICE'
              ? 'N/A'
              : row.original.valuation_method === 'WEIGHTED_AVG'
                ? 'WAC'
                : 'FIFO'}
          </span>
        ),
      },
      {
        accessorKey: 'hsn_sac_code',
        header: 'HSN / SAC',
        meta: { align: 'left', mono: true, width: '104px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12.5px] text-primary-text">
            {row.original.hsn_sac_code ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'default_tax_slab_code',
        header: 'GST Slab',
        meta: { align: 'left', mono: true, width: '96px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12.5px] text-muted-text">
            {row.original.default_tax_slab_code ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'standard_selling_price',
        header: 'Sell Price (₹)',
        meta: { align: 'right', mono: true, width: '126px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px]">
            {formatCurrency(row.original.standard_selling_price, { showSymbol: false })}
          </span>
        ),
      },
      {
        accessorKey: 'standard_purchase_cost',
        header: 'Buy Cost (₹)',
        meta: { align: 'right', mono: true, width: '126px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] text-muted-text">
            {formatCurrency(row.original.standard_purchase_cost, { showSymbol: false })}
          </span>
        ),
      },
      {
        id: 'edit',
        header: 'Edit',
        enableSorting: false,
        meta: { align: 'right', width: '80px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              openEditItemDrawer(row.original)
            }}
            leftIcon={<Edit3 className="h-3.5 w-3.5" strokeWidth={1.75} />}
          >
            Edit
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const godownStockColumns = useMemo<DataTableColumnDef<GodownStockRowDTO>[]>(
    () => [
      {
        accessorKey: 'godown_name',
        header: 'Godown / Warehouse',
        meta: { align: 'left', minWidth: '180px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-primary-text">{row.original.godown_name}</p>
            <p className="code-mono text-[11.5px] text-muted-text">{row.original.godown_code}</p>
          </div>
        ),
      },
      {
        accessorKey: 'sku',
        header: 'SKU',
        meta: { align: 'left', mono: true, width: '104px' } satisfies LedgerColumnMeta,
      },
      {
        accessorKey: 'item_name',
        header: 'Item Name',
        meta: { align: 'left', minWidth: '200px' } satisfies LedgerColumnMeta,
      },
      {
        accessorKey: 'total_qty',
        header: 'Qty On Hand',
        meta: { align: 'right', mono: true, width: '132px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono font-medium">
            {formatQuantityWithDecimals(
              row.original.total_qty,
              row.original.unit_decimal_places,
            )}{' '}
            <span className="text-[11px] text-muted-text">{row.original.unit_symbol}</span>
          </span>
        ),
      },
      {
        accessorKey: 'closing_value',
        header: 'Closing Value (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '148px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono font-semibold text-primary-text">
            {formatCurrency(row.original.closing_value, { showSymbol: false })}
          </span>
        ),
      },
    ],
    [],
  )

  const lotColumns = useMemo<DataTableColumnDef<InventoryLotDTO>[]>(
    () => [
      {
        accessorKey: 'batch_ref',
        header: 'Batch / Lot Ref',
        meta: { align: 'left', mono: true, width: '164px' } satisfies LedgerColumnMeta,
      },
      {
        accessorKey: 'godown_code',
        header: 'Godown',
        meta: { align: 'left', mono: true, width: '108px' } satisfies LedgerColumnMeta,
      },
      {
        accessorKey: 'received_date',
        header: 'Received',
        meta: { align: 'left', mono: true, width: '116px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12.5px] text-muted-text">
            {formatDisplayDate(row.original.received_date)}
          </span>
        ),
      },
      {
        accessorKey: 'expiry_date',
        header: 'Expiry',
        meta: { align: 'left', mono: true, width: '112px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12.5px] text-muted-text">
            {row.original.expiry_date ? formatDisplayDate(row.original.expiry_date) : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'qty_in',
        header: 'Qty In',
        meta: { align: 'right', mono: true, width: '104px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] text-muted-text">
            {formatQuantityWithDecimals(row.original.qty_in, 2)}
          </span>
        ),
      },
      {
        accessorKey: 'qty_available',
        header: 'Qty Available',
        meta: { align: 'right', mono: true, width: '124px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const empty = toScaledInt(row.original.qty_available) === 0n
          return (
            <span
              className={cn(
                'code-mono text-[13px] font-semibold',
                empty ? 'text-disabled-text' : 'text-primary-text',
              )}
            >
              {formatQuantityWithDecimals(row.original.qty_available, 2)}
            </span>
          )
        },
      },
      {
        accessorKey: 'unit_cost',
        header: 'Unit Cost (₹)',
        meta: { align: 'right', mono: true, width: '124px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px]">
            {formatCurrency(row.original.unit_cost, { showSymbol: false })}
          </span>
        ),
      },
      {
        accessorKey: 'lot_value',
        header: 'Lot Value (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '132px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] font-semibold">
            {formatCurrency(row.original.lot_value, { showSymbol: false })}
          </span>
        ),
      },
    ],
    [],
  )

  const movementColumns = useMemo<DataTableColumnDef<StockMovementDTO>[]>(
    () => [
      {
        accessorKey: 'movement_date',
        header: 'Date',
        meta: { align: 'left', mono: true, width: '112px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12.5px] text-muted-text">
            {formatDisplayDate(row.original.movement_date)}
          </span>
        ),
      },
      {
        accessorKey: 'invoice_number',
        header: 'Invoice Ref',
        meta: { align: 'left', mono: true, width: '148px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[12.5px] font-medium text-primary-text">
            {row.original.invoice_number ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'movement_reason',
        header: 'Reason',
        meta: { align: 'left', width: '150px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="text-[12.5px] text-primary-text">
            {row.original.movement_reason.replace(/_/g, ' ')}
          </span>
        ),
      },
      {
        accessorKey: 'direction',
        header: 'Dir',
        meta: { align: 'center', width: '88px' } satisfies LedgerColumnMeta,
        cell: ({ row }) =>
          row.original.direction === 'IN' ? (
            <Badge
              variant="success"
              icon={<ArrowDownLeft className="h-3 w-3" strokeWidth={2} />}
            >
              IN
            </Badge>
          ) : (
            <Badge
              variant="warning"
              icon={<ArrowUpRight className="h-3 w-3" strokeWidth={2} />}
            >
              OUT
            </Badge>
          ),
      },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        meta: { align: 'right', mono: true, width: '100px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] font-medium">
            {formatQuantityWithDecimals(row.original.quantity, 2)}
          </span>
        ),
      },
      {
        accessorKey: 'unit_cost',
        header: 'Unit Cost (₹)',
        meta: { align: 'right', mono: true, width: '118px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px]">
            {formatCurrency(row.original.unit_cost, { showSymbol: false })}
          </span>
        ),
      },
      {
        accessorKey: 'total_cost',
        header: 'Total Cost (₹)',
        meta: { align: 'right', mono: true, width: '124px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] font-semibold">
            {formatCurrency(row.original.total_cost, { showSymbol: false })}
          </span>
        ),
      },
      {
        accessorKey: 'running_qty',
        header: 'Running Qty',
        meta: {
          align: 'right',
          mono: true,
          width: '112px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] font-medium">
            {formatQuantityWithDecimals(row.original.running_qty, 2)}
          </span>
        ),
      },
      {
        accessorKey: 'running_avg_cost',
        header: 'Avg Rate (₹)',
        meta: { align: 'right', mono: true, width: '120px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] text-muted-text">
            {formatCurrency(row.original.running_avg_cost, { showSymbol: false })}
          </span>
        ),
      },
    ],
    [],
  )

  const summary = summaryQuery.data

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            Perpetual FIFO &amp; Weighted Average Inventory Engine
          </p>
          <h1 className="mt-1 type-h1">Inventory &amp; Stock Valuation</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            leftIcon={<Warehouse className="h-4 w-4" strokeWidth={1.75} />}
            onClick={() => {
              setGodownServerError(null)
              setGodownModalOpen(true)
            }}
          >
            New Godown
          </Button>
          <Button
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" strokeWidth={2} />}
            onClick={openNewItemDrawer}
          >
            New Item
          </Button>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div
        role="tablist"
        aria-label="Inventory Sections"
        className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border-input bg-muted p-[3px]"
      >
        {(
          [
            { id: 'summary', label: 'Stock Summary', icon: Package },
            { id: 'items', label: 'Item Master', icon: Layers },
            { id: 'godowns', label: 'Godowns', icon: Warehouse },
            { id: 'lots-ledger', label: 'FIFO Lots & Stock Ledger', icon: MapPin },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-sm px-3 text-[13px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                active
                  ? 'bg-surface font-semibold text-primary-text shadow-sm'
                  : 'font-medium text-muted-text hover:text-primary-text',
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* TAB 1: Stock Summary */}
      {activeTab === 'summary' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 rounded-md border border-border-subtle bg-surface shadow-[var(--shadow-card)]">
            <div className="px-6 py-5">
              <p className="type-xs uppercase text-muted-text">Active Goods SKUs</p>
              <p className="mt-2 type-kpi">{summary?.items.length ?? 0}</p>
            </div>
            <div className="border-t md:border-t-0 md:border-l border-border-subtle px-6 py-5">
              <p className="type-xs uppercase text-muted-text">
                Total Closing Valuation (Stock-in-Hand)
              </p>
              <p className="mt-2 type-kpi">
                {formatCurrency(summary?.grand_total_value ?? '0.0000')}
              </p>
            </div>
            <div className="border-t md:border-t-0 md:border-l border-border-subtle px-6 py-5">
              <p className="type-xs uppercase text-muted-text">Low Stock Alerts</p>
              <div className="mt-2 flex items-center gap-2.5">
                <p className="type-kpi">{summary?.low_stock_count ?? 0}</p>
                {(summary?.low_stock_count ?? 0) > 0 ? (
                  <Badge
                    variant="warning"
                    icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />}
                  >
                    Reorder Needed
                  </Badge>
                ) : (
                  <Badge
                    variant="success"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />}
                  >
                    Healthy Stock
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Card padding="none">
            <CardHeader>
              <div>
                <CardTitle>Closing Stock Valuation Summary</CardTitle>
                <p className="mt-0.5 text-[12.5px] text-muted-text">
                  Click any item row to inspect its FIFO batches and chronological movement ledger.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-[13px] font-medium text-primary-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(e) => setLowStockOnly(e.target.checked)}
                  className="h-4 w-4 rounded-sm border border-border-input accent-[var(--accent-primary)]"
                />
                <span>Low stock only</span>
              </label>
            </CardHeader>

            <DataTable
              ariaLabel="Stock Summary Table"
              data={summary?.items ?? []}
              columns={summaryColumns}
              loading={summaryQuery.isLoading}
              error={summaryQuery.isError ? summaryQuery.error.message : null}
              onRetry={() => summaryQuery.refetch()}
              getRowId={(r) => String(r.item_id)}
              onRowActivate={(r) => {
                setSelectedItemId(r.item_id)
                setActiveTab('lots-ledger')
              }}
              footer={
                summary ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="border-t-2 border-border-strong px-3 py-2.5 text-[14px] font-bold text-primary-text"
                    >
                      Grand Total Closing Stock Valuation ({summary.items.length} items)
                    </td>
                    <td className="grand-total-num-cell border-l border-border-row px-3 py-2.5 pr-4 text-right code-mono text-[14px] font-bold text-primary-text">
                      {formatCurrency(summary.grand_total_value, { showSymbol: false })}
                    </td>
                    <td colSpan={2} className="border-t-2 border-border-strong" />
                  </tr>
                ) : undefined
              }
            />
          </Card>
        </div>
      ) : null}

      {/* TAB 2: Item Master */}
      {activeTab === 'items' ? (
        <Card padding="none">
          <CardHeader>
            <div>
              <CardTitle>Goods &amp; Services Catalog</CardTitle>
              <p className="mt-0.5 text-[12.5px] text-muted-text">
                {items.length} active SKUs configured with HSN/SAC codes and GST slabs.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
              onClick={openNewItemDrawer}
            >
              Add Item
            </Button>
          </CardHeader>
          <DataTable
            ariaLabel="Inventory Item Master"
            data={items}
            columns={itemMasterColumns}
            loading={itemsQuery.isLoading}
            error={itemsQuery.isError ? itemsQuery.error.message : null}
            onRetry={() => itemsQuery.refetch()}
            getRowId={(r) => String(r.id)}
            onRowActivate={(r) => openEditItemDrawer(r)}
          />
        </Card>
      ) : null}

      {/* TAB 3: Godowns */}
      {activeTab === 'godowns' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {godowns.map((g) => {
              const active = selectedGodownId === g.id
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGodownId(active ? undefined : g.id)}
                  className={cn(
                    'rounded-md border p-4 text-left transition-colors duration-[var(--dur-fast)] cursor-pointer',
                    active
                      ? 'border-accent bg-row-selected'
                      : 'border-border-subtle bg-surface hover:bg-row-hover',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="code-mono text-[12px] font-semibold text-accent">
                      {g.code}
                    </span>
                    {g.is_default ? <Badge variant="success">Default</Badge> : null}
                  </div>
                  <p className="mt-1.5 text-[15px] font-semibold text-primary-text">{g.name}</p>
                  <p className="mt-1 text-[12.5px] text-muted-text">
                    {g.address || 'No street address'} · State {g.state_code ?? '—'}
                  </p>
                </button>
              )
            })}
          </div>

          <Card padding="none">
            <CardHeader>
              <div>
                <CardTitle>Godown-Wise Stock Breakdown</CardTitle>
                <p className="mt-0.5 text-[12.5px] text-muted-text">
                  {selectedGodownId
                    ? 'Filtered to selected warehouse (click card again to view all).'
                    : 'Showing stock across all active warehouses.'}
                </p>
              </div>
              {selectedGodownId ? (
                <Button variant="secondary" size="sm" onClick={() => setSelectedGodownId(undefined)}>
                  Show All Godowns
                </Button>
              ) : null}
            </CardHeader>

            <DataTable
              ariaLabel="Godown Stock Breakdown"
              data={godownStockQuery.data ?? []}
              columns={godownStockColumns}
              loading={godownStockQuery.isLoading}
              error={godownStockQuery.isError ? godownStockQuery.error.message : null}
              onRetry={() => godownStockQuery.refetch()}
              getRowId={(r) => `${r.godown_id}-${r.item_id}`}
            />
          </Card>
        </div>
      ) : null}

      {/* TAB 4: FIFO Lot & Stock Ledger Viewer */}
      {activeTab === 'lots-ledger' ? (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="lot-item-select"
                    className="text-[12.5px] font-medium text-muted-text"
                  >
                    Inventory Item
                  </label>
                  <select
                    id="lot-item-select"
                    value={effectiveItemId ?? ''}
                    onChange={(e) => setSelectedItemId(Number(e.target.value))}
                    className="h-[var(--control-h)] min-w-[260px] rounded-sm border border-border-input bg-surface px-3 text-[13.5px] font-medium text-primary-text"
                  >
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.sku} · {it.name} ({it.valuation_method})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="lot-godown-select"
                    className="text-[12.5px] font-medium text-muted-text"
                  >
                    Godown Filter
                  </label>
                  <select
                    id="lot-godown-select"
                    value={lotGodownFilter ?? ''}
                    onChange={(e) =>
                      setLotGodownFilter(e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="h-[var(--control-h)] min-w-[200px] rounded-sm border border-border-input bg-surface px-3 text-[13.5px] text-primary-text"
                  >
                    <option value="">All Godowns</option>
                    {godowns.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.code} · {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 pb-2 text-[13px] font-medium text-primary-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeExhausted}
                  onChange={(e) => setIncludeExhausted(e.target.checked)}
                  className="h-4 w-4 rounded-sm border border-border-input accent-[var(--accent-primary)]"
                />
                <span>Show Exhausted Lots</span>
              </label>
            </div>
          </Card>

          <Card padding="none">
            <CardHeader>
              <CardTitle>Cost Lots Queue (`InventoryLot`)</CardTitle>
            </CardHeader>
            <DataTable
              ariaLabel="Inventory Lots"
              data={lotsQuery.data ?? []}
              columns={lotColumns}
              density="compact"
              loading={lotsQuery.isLoading}
              error={lotsQuery.isError ? lotsQuery.error.message : null}
              onRetry={() => lotsQuery.refetch()}
              getRowId={(r) => String(r.id)}
              emptyTitle="No lots for this item"
              emptyDescription="Post a Purchase Invoice for this item or toggle 'Show Exhausted Lots'."
            />
          </Card>

          <Card padding="none">
            <CardHeader>
              <CardTitle>Chronological Stock Movement Ledger (`StockMovement`)</CardTitle>
            </CardHeader>
            <DataTable
              ariaLabel="Stock Movement Ledger"
              data={movementsQuery.data ?? []}
              columns={movementColumns}
              density="compact"
              loading={movementsQuery.isLoading}
              error={movementsQuery.isError ? movementsQuery.error.message : null}
              onRetry={() => movementsQuery.refetch()}
              getRowId={(r) => String(r.id)}
              emptyTitle="No stock movements recorded"
              emptyDescription="Movements appear automatically when Purchase, Sales, Credit Note, or Debit Note invoices post."
            />
          </Card>
        </div>
      ) : null}

      {/* Item Create / Edit Slide-Over Drawer */}
      <Drawer
        open={itemDrawerOpen}
        onClose={() => setItemDrawerOpen(false)}
        title={editingItem ? `Edit Item · ${editingItem.sku}` : 'Create Inventory Item'}
        subtitle="Configure HSN/SAC, GST slab, FIFO or Weighted Average costing, and GL overrides"
        widthClassName="w-full sm:max-w-[580px]"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setItemDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="inventory-item-form"
              variant="primary"
              loading={createItem.isPending || updateItem.isPending}
            >
              {editingItem ? 'Save Changes' : 'Create Item'}
            </Button>
          </div>
        }
      >
        <form
          id="inventory-item-form"
          onSubmit={handleSubmitItem(onSubmitItem)}
          className="space-y-4"
          noValidate
        >
          {itemServerError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-3.5 py-2.5 text-[13px] font-medium text-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{itemServerError}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Input
              label="SKU / Code"
              disabled={Boolean(editingItem)}
              placeholder="e.g. CWC-25"
              className="tabular-mono"
              error={itemErrors.sku?.message}
              {...registerItem('sku')}
            />
            <Input
              wrapperClassName="sm:col-span-2"
              label="Item Description"
              placeholder="e.g. Copper Wire Coil 2.5mm"
              error={itemErrors.name?.message}
              {...registerItem('name')}
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-type-select" className="text-[13px] font-medium text-primary-text">
                Item Type
              </label>
              <select
                id="item-type-select"
                disabled={Boolean(editingItem)}
                {...registerItem('item_type')}
                className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-3 text-[13.5px] text-primary-text disabled:bg-muted"
              >
                <option value="GOODS">Goods (Tracked Stock)</option>
                <option value="SERVICE">Service (No Stock)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-val-select" className="text-[13px] font-medium text-primary-text">
                Valuation Method
              </label>
              <select
                id="item-val-select"
                {...registerItem('valuation_method')}
                className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-3 text-[13.5px] text-primary-text"
              >
                <option value="FIFO">FIFO (First-In First-Out)</option>
                <option value="WEIGHTED_AVG">Weighted Average (WAC)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-unit-select" className="text-[13px] font-medium text-primary-text">
                Unit of Measure
              </label>
              <select
                id="item-unit-select"
                {...registerItem('unit_id')}
                className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-3 text-[13.5px] text-primary-text"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.symbol} ({u.uqc_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-hsn-select" className="text-[13px] font-medium text-primary-text">
                HSN / SAC Code
              </label>
              <select
                id="item-hsn-select"
                {...registerItem('hsn_sac_id')}
                className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-3 text-[13px] text-primary-text"
              >
                <option value="">None</option>
                {hsnCodes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.code} ({h.code_type}) · {h.description}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="item-slab-select" className="text-[13px] font-medium text-primary-text">
                Default GST Slab
              </label>
              <select
                id="item-slab-select"
                {...registerItem('default_tax_slab_id')}
                className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-3 text-[13px] text-primary-text"
              >
                <option value="">None (0%)</option>
                {slabs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Input
              label="Selling Price (₹)"
              numeric
              inputMode="decimal"
              error={itemErrors.standard_selling_price?.message}
              {...registerItem('standard_selling_price')}
            />
            <Input
              label="Purchase Cost (₹)"
              numeric
              inputMode="decimal"
              error={itemErrors.standard_purchase_cost?.message}
              {...registerItem('standard_purchase_cost')}
            />
            <Input
              label="Reorder Level"
              numeric
              inputMode="decimal"
              error={itemErrors.reorder_level?.message}
              {...registerItem('reorder_level')}
            />
          </div>

          <div className="rounded-md border border-border-subtle bg-canvas p-3.5 space-y-3">
            <p className="type-xs uppercase text-muted-text">
              Optional GL Ledger Overrides (Defaults to Company System Ledgers)
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ['sales_ledger_id', 'Sales Ledger'],
                  ['purchase_ledger_id', 'Purchase Ledger'],
                  ['cogs_ledger_id', 'COGS Ledger'],
                  ['inventory_ledger_id', 'Inventory Asset Ledger'],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="flex flex-col gap-1">
                  <label className="text-[12px] font-medium text-muted-text">{label}</label>
                  <select
                    {...registerItem(field)}
                    className="h-9 w-full rounded-sm border border-border-input bg-surface px-2.5 text-[12.5px] text-primary-text"
                  >
                    <option value="">Use System Default</option>
                    {ledgers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} · {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Drawer>

      {/* New Godown Modal */}
      {godownModalOpen ? (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center px-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-godown-title"
        >
          <div
            className="fixed inset-0 bg-backdrop"
            onClick={() => setGodownModalOpen(false)}
            aria-hidden="true"
          />
          <form
            onSubmit={handleSubmitGodown(onSubmitGodown)}
            className="relative z-10 w-full max-w-[460px] rounded-lg border border-border-strong bg-raised p-5 text-primary-text shadow-md space-y-4"
            noValidate
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 id="new-godown-title" className="type-h2">
                  Create Godown / Warehouse
                </h2>
                <p className="mt-0.5 text-[12.5px] text-muted-text">
                  Track inventory lots independently per warehouse location.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGodownModalOpen(false)}
                aria-label="Close modal"
                className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-text hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            {godownServerError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-3 py-2 text-[12.5px] font-medium text-danger"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>{godownServerError}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label="Code"
                placeholder="e.g. WH-02"
                className="tabular-mono"
                error={godownErrors.code?.message}
                {...registerGodown('code')}
              />
              <Input
                wrapperClassName="sm:col-span-2"
                label="Godown Name"
                placeholder="e.g. Faridabad Depot"
                error={godownErrors.name?.message}
                {...registerGodown('name')}
              />
            </div>

            <Input
              label="Address (Optional)"
              placeholder="Street / Industrial Area"
              {...registerGodown('address')}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-primary-text">State</label>
                <select
                  {...registerGodown('state_code')}
                  className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-2.5 text-[13px] text-primary-text"
                >
                  {INDIAN_GST_STATES.map((st) => (
                    <option key={st.code} value={st.code}>
                      {st.code} · {st.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2 pb-2.5 text-[13px] font-medium text-primary-text cursor-pointer">
                <input
                  type="checkbox"
                  {...registerGodown('is_default')}
                  className="h-4 w-4 rounded-sm border border-border-input accent-[var(--accent-primary)]"
                />
                <span>Set as Default Godown</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setGodownModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={createGodown.isPending}>
                Create Godown
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
