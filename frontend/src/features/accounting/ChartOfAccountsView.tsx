import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Plus, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { DECIMAL_INPUT_REGEX, fromScaledInt, toScaledInt } from '../../lib/decimal'
import { formatCurrency } from '../../lib/format'
import type { AccountNature, DrCr, LedgerDTO } from '../../lib/api'
import {
  useAccountGroups,
  useCreateLedger,
  useLedgers,
} from '../../hooks/useAccounting'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import {
  DataTable,
  type DataTableColumnDef,
  type LedgerColumnMeta,
} from '../../components/ui/DataTable'
import { Drawer } from '../../components/ui/Drawer'
import { Input } from '../../components/ui/Input'

const newLedgerSchema = z.object({
  group_id: z.string().min(1, 'Select an account group'),
  code: z.string().trim().min(1, 'Ledger code is required').max(32),
  name: z.string().trim().min(1, 'Ledger name is required').max(160),
  opening_balance: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || DECIMAL_INPUT_REGEX.test(v),
      'Enter valid non-negative amount (max 4 decimals)',
    ),
  opening_dr_cr: z.enum(['DR', 'CR']),
  party_gstin: z.string().trim().max(32).optional(),
  party_state_code: z.string().trim().max(8).optional(),
  credit_days: z.string().trim().optional(),
})

type NewLedgerFormInput = z.input<typeof newLedgerSchema>
type NewLedgerFormOutput = z.output<typeof newLedgerSchema>

const NATURE_TABS: Array<{ id: 'ALL' | AccountNature; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'ASSET', label: 'Assets' },
  { id: 'LIABILITY', label: 'Liabilities' },
  { id: 'EQUITY', label: 'Equity' },
  { id: 'INCOME', label: 'Income' },
  { id: 'EXPENSE', label: 'Expenses' },
]

export interface ChartOfAccountsViewProps {
  onOpenLedgerStatement: (ledgerId: number) => void
  onNotify: (message: string) => void
}

export function ChartOfAccountsView({
  onOpenLedgerStatement,
  onNotify,
}: ChartOfAccountsViewProps) {
  const [natureFilter, setNatureFilter] = useState<'ALL' | AccountNature>('ALL')
  const [groupFilter, setGroupFilter] = useState<string>('')
  const [searchText, setSearchText] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const groupsQuery = useAccountGroups()
  const ledgersQuery = useLedgers({
    nature: natureFilter === 'ALL' ? undefined : natureFilter,
    group_id: groupFilter ? Number(groupFilter) : undefined,
    search: searchText.trim() || undefined,
  })
  const createLedger = useCreateLedger()

  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data])
  const ledgers = useMemo(() => ledgersQuery.data ?? [], [ledgersQuery.data])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewLedgerFormInput, unknown, NewLedgerFormOutput>({
    resolver: zodResolver(newLedgerSchema),
    defaultValues: {
      group_id: '',
      code: '',
      name: '',
      opening_balance: '0.00',
      opening_dr_cr: 'DR',
      party_gstin: '',
      party_state_code: '',
      credit_days: '0',
    },
  })

  const openNewLedgerDrawer = () => {
    setServerError(null)
    setDrawerOpen(true)
  }

  const onSubmitNewLedger = async (data: NewLedgerFormOutput) => {
    setServerError(null)
    try {
      const created = await createLedger.mutateAsync({
        group_id: Number(data.group_id),
        code: data.code,
        name: data.name,
        opening_balance: fromScaledInt(toScaledInt(data.opening_balance), 4),
        opening_dr_cr: data.opening_dr_cr as DrCr,
        party_gstin: data.party_gstin || null,
        party_state_code: data.party_state_code || null,
        credit_days: Math.max(0, Number.parseInt(data.credit_days || '0', 10) || 0),
      })
      onNotify(`Created ledger ${created.code} · ${created.name}`)
      reset()
      setDrawerOpen(false)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to create ledger.')
    }
  }

  const columns = useMemo<DataTableColumnDef<LedgerDTO>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        meta: { align: 'left', mono: true, width: '96px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="code-mono text-[13px] font-medium text-muted-text">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Ledger Name',
        meta: { align: 'left', minWidth: '220px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-accent">
              {row.original.name}
            </p>
            {row.original.party_gstin ? (
              <p className="mt-0.5 code-mono text-[11.5px] text-muted-text">
                GSTIN: {row.original.party_gstin}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'group_name',
        header: 'Account Group',
        meta: { align: 'left', width: '180px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <span className="text-[13px] text-primary-text">{row.original.group_name}</span>
        ),
      },
      {
        accessorKey: 'group_nature',
        header: 'Nature',
        meta: { align: 'left', width: '112px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => (
          <Badge variant="neutral" icon={false}>
            {row.original.group_nature}
          </Badge>
        ),
      },
      {
        accessorKey: 'opening_balance',
        header: 'Opening (₹)',
        meta: { align: 'right', mono: true, width: '148px' } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const isZero = toScaledInt(row.original.opening_balance) === 0n
          return isZero ? (
            <span className="code-mono text-disabled-text">—</span>
          ) : (
            <span className="code-mono text-[13.5px] text-primary-text">
              {formatCurrency(row.original.opening_balance, { showSymbol: false })}
              <span className="ml-1 text-[11px] text-muted-text">
                {row.original.opening_dr_cr === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </span>
          )
        },
      },
      {
        accessorKey: 'closing_balance',
        header: 'Closing (₹)',
        meta: {
          align: 'right',
          mono: true,
          width: '156px',
          dividerLeft: true,
        } satisfies LedgerColumnMeta,
        cell: ({ row }) => {
          const isZero = toScaledInt(row.original.closing_balance) === 0n
          return isZero ? (
            <span className="code-mono text-disabled-text">0.00</span>
          ) : (
            <span className="code-mono text-[14px] font-semibold text-primary-text">
              {formatCurrency(row.original.closing_balance, { showSymbol: false })}
              <span className="ml-1 text-[11px] font-medium text-muted-text">
                {row.original.closing_dr_cr === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </span>
          )
        },
      },
    ],
    [],
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-xs uppercase text-muted-text">
            {groups.length} Tally Account Groups · {ledgers.length} Active Ledgers
          </p>
          <h1 className="mt-1 type-h1">Chart of Accounts</h1>
        </div>

        <Button
          variant="primary"
          leftIcon={<Plus className="h-4 w-4" strokeWidth={2} />}
          onClick={openNewLedgerDrawer}
        >
          New Ledger
        </Button>
      </div>

      <Card padding="none">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-md border border-border-input bg-muted p-[3px]">
              {NATURE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={natureFilter === tab.id}
                  onClick={() => setNatureFilter(tab.id)}
                  className={cn(
                    'h-8 rounded-sm px-2.5 text-[12px] transition-colors duration-[var(--dur-fast)] cursor-pointer',
                    natureFilter === tab.id
                      ? 'bg-surface font-semibold text-primary-text shadow-sm'
                      : 'font-medium text-muted-text hover:text-primary-text',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter by account group"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="h-9 rounded-sm border border-border-input bg-surface px-2.5 text-[13px] text-primary-text"
            >
              <option value="">All 28 Account Groups</option>
              {groups.map((grp) => (
                <option key={grp.id} value={grp.id}>
                  {grp.name} ({grp.ledger_count})
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-text"
              strokeWidth={1.75}
            />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search code, ledger, group..."
              aria-label="Search ledgers"
              className="h-9 w-full rounded-sm border border-border-input bg-surface pl-9 pr-3 text-[13px] text-primary-text placeholder:text-disabled-text"
            />
          </div>
        </CardHeader>

        <DataTable
          ariaLabel="Chart of Accounts Ledgers"
          data={ledgers}
          columns={columns}
          loading={ledgersQuery.isLoading}
          error={ledgersQuery.isError ? ledgersQuery.error.message : null}
          onRetry={() => ledgersQuery.refetch()}
          getRowId={(r) => String(r.id)}
          onRowActivate={(r) => onOpenLedgerStatement(r.id)}
          emptyTitle="No matching ledgers"
          emptyDescription="Adjust your group/nature filter or add a new ledger account."
          emptyAction={
            <Button variant="primary" onClick={openNewLedgerDrawer}>
              New Ledger
            </Button>
          }
        />
      </Card>

      {/* + New Ledger Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => {
          setServerError(null)
          setDrawerOpen(false)
        }}
        title="Create Ledger Account"
        subtitle="Assign to one of the 28 standard Tally Account Groups"
        widthClassName="w-full sm:max-w-[540px]"
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setServerError(null)
                setDrawerOpen(false)
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="new-ledger-form"
              variant="primary"
              loading={createLedger.isPending}
            >
              Create Ledger
            </Button>
          </div>
        }
      >
        <form
          id="new-ledger-form"
          onSubmit={handleSubmit(onSubmitNewLedger)}
          className="space-y-4"
          noValidate
        >
          {serverError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-[var(--status-danger-border)] bg-danger-bg px-3.5 py-2.5 text-[13px] font-medium text-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{serverError}</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-ledger-group"
              className="text-[13px] font-medium text-primary-text"
            >
              Under Account Group
            </label>
            <select
              id="new-ledger-group"
              {...register('group_id')}
              className={cn(
                'h-[var(--control-h)] w-full rounded-sm border bg-surface px-3 text-[14px] text-primary-text',
                errors.group_id ? 'border-danger' : 'border-border-input',
              )}
            >
              <option value="">Select Account Group...</option>
              {groups.map((grp) => (
                <option key={grp.id} value={grp.id}>
                  {grp.name} ({grp.nature})
                </option>
              ))}
            </select>
            {errors.group_id ? (
              <p className="text-[12px] font-medium text-danger">{errors.group_id.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Input
              label="Account Code"
              placeholder="e.g. 5210"
              className="tabular-mono"
              error={errors.code?.message}
              {...register('code')}
            />
            <Input
              wrapperClassName="sm:col-span-2"
              label="Ledger Name"
              placeholder="e.g. Travelling & Conveyance"
              error={errors.name?.message}
              {...register('name')}
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Input
              wrapperClassName="sm:col-span-2"
              label="Opening Balance (₹)"
              placeholder="0.00"
              inputMode="decimal"
              numeric
              error={errors.opening_balance?.message}
              {...register('opening_balance')}
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-ledger-drcr"
                className="text-[13px] font-medium text-primary-text"
              >
                Dr / Cr
              </label>
              <select
                id="new-ledger-drcr"
                {...register('opening_dr_cr')}
                className="h-[var(--control-h)] w-full rounded-sm border border-border-input bg-surface px-3 text-[14px] text-primary-text"
              >
                <option value="DR">Dr (Debit)</option>
                <option value="CR">Cr (Credit)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <Input
              wrapperClassName="sm:col-span-2"
              label="Party GSTIN (Optional)"
              placeholder="15-char GSTIN"
              className="tabular-mono"
              {...register('party_gstin')}
            />
            <Input
              label="State Code"
              placeholder="09"
              className="tabular-mono"
              {...register('party_state_code')}
            />
          </div>

          <Input
            label="Default Credit Days"
            type="number"
            min={0}
            className="tabular-mono"
            {...register('credit_days')}
          />
        </form>
      </Drawer>
    </div>
  )
}
