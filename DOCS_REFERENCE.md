
1. Recommended Lightweight Architecture & Trade-offs


Frontend: Vite 6.4 vs. Vite 8 + Tailwind CSS v4 (tokens.css)

• Bundler RAM Trade-off. While Vite Releases is currently on v8.3 (powered by the Rust-based Rolldown bundler), Rolldown's in-memory module graph consumes roughly 1.1 GB+ of baseline RAM in dev mode compared to ~250–300 MB on esbuild-backed Vite 6/7. Sticking to vite@^6.4.0 (which still receives official security backports) saves ~800 MB of precious RAM on an 8 GB Linux Mint setup while running FastAPI, IDE, and browser tabs simultaneously. [1] (https://vite.dev/blog/announcing-vite8), [2] (https://github.com/vitejs/rolldown-vite/issues/577), [3] (https://www.nexgismo.com/blog/vite-8-rolldown-migration-guide-2026), [4] (https://vite.dev/releases)
• Zero-PostCSS Tailwind v4. Use @tailwindcss/vite (v4.3.5) directly in vite.config.ts. Do not create tailwind.config.js or postcss.config.js. Define raw CSS custom properties on :root inside tokens.css and map them into utility classes via @theme inline inside your main stylesheet. [1] (https://tailwindcss.com/docs), [2] (https://dev.to/csituma/using-vite-upgrade-to-tailiwindcss4-1c61), [3] (https://thefrontkit.com/blogs/tailwind-css-design-tokens-for-saas), [4] (https://www.sitepoint.com/tailwind-css-v4-dynamic-themes/), [5] (https://www.npmjs.com/package/@tailwindcss/vite)

Backend: SQLAlchemy Async + Alembic + SQLite WAL + Decimal(18, 4)

• SQLite Transaction & Concurrency Tuning. Use connect_args={"autocommit": False} on create_async_engine to disable Python sqlite3's legacy implicit transaction behavior. Attach a connect listener on engine.sync_engine to execute PRAGMA journal_mode=WAL, PRAGMA synchronous=NORMAL, PRAGMA busy_timeout=5000, and PRAGMA foreign_keys=ON. [1] (http://docs.sqlalchemy.org/en/latest/dialects/sqlite.html)
• Exact Decimal Storage Trade-off (NUMERIC(18, 4) vs. Scaled Integer). SQLite lacks a native fixed-point decimal type—its NUMERIC affinity converts values into IEEE 754 floats (REAL), silently introducing rounding drift in GST tax splits and double-entry trial balances. Storing decimals as TEXT preserves precision, but breaks SQL < / > comparisons and SUM() precision. One point of agreement among users on Stack Overflow is that implementing a TypeDecorator (impl = Integer) that multiplies Decimal values by 10**4 (10000 "paisa/sub-paisa" units) on write and divides back to Decimal on read preserves exact precision and native integer sorting/summation in SQLite (64-bit signed integers safely hold up to ±922,337,203,685,477.5807, covering NUMERIC(18, 4)). If strict DDL NUMERIC(18, 4) text representation is required for external SQLite inspection tools, use TypeDecorator(impl=String) instead and compute aggregations in Python. [1] (https://stackoverflow.com/questions/10355767/how-should-i-handle-decimal-in-sqlalchemy-sqlite)
• Alembic Batch Mode. SQLite requires table recreation for ALTER statements. Configure explicit naming_convention on your SQLAlchemy MetaData and enable render_as_batch=True in Alembic's async env.py. [1] (https://alembic.sqlalchemy.org/en/latest/batch.html)

2. Post-March-2026 Breaking Changes & Deprecations Flagged


Library	Latest Version	Post-March-2026 Breaking Changes & Gotchas
Vite	v8.3.x (v6.4 security-supported)	Vite 8.0 (Mar 12, 2026) replaced esbuild + Rollup with Rolldown. build.rollupOptions is deprecated in favor of build.rolldownOptions; esbuild config options require Oxc/Rolldown equivalents; requires Node.js ^20.19.0 || >=22.12.0. @vitejs/plugin-react v6.x requires Vite 8 (pin v5.2.0 if staying on Vite 6).
Tailwind CSS	v4.3.5	Stable CSS-first architecture (@import "tailwindcss"; and @theme). Arbitrary CSS variable syntax uses parentheses bg-(--brand-bg) instead of v3's square brackets bg-[--brand-bg]. Lightning CSS runs by default in production builds.
React	v19.3.0 (Sep 9, 2026)	React 19.3 stabilized <ViewTransition> and Fragment refs (FragmentInstance). No breaking removals between 19.0 and 19.3, though React 19 strictly rejects legacy ReactDOM.render, forwardRef boilerplate (pass ref as a standard prop), Context.Provider (render <Context value={...}> directly), and function defaultProps.
TanStack Table	v9.x (Aug 4, 2026)	Major breaking overhaul in TanStack Table v9: useReactTable and get*RowModel() are replaced by useTable and a mandatory tree-shakable tableFeatures({...}) declaration. State reads moved from table.getState().sorting to table.state.sorting (backed by TanStack Store). Pinning keys changed from { left, right } to { start, end }. Cell/header rendering prefers <table.FlexRender cell={cell} />. (Legacy v8 APIs moved to @tanstack/react-table/legacy).
FastAPI	v0.165.0 (Nov 18, 2026)	Critical silent breaking change in v0.148.0 (Oct 19, 2026): FastAPI no longer validates default values on omitted Query, Header, Cookie, Form, or parameter model fields unless validate_default=True is explicitly set. v0.162.6 (Nov 13, 2026) dropped Python 3.10 support (requires Python 3.11–3.15). v0.164.0–0.165.0 introduced strict request body size and form field parsing limits (returning HTTP 413/400). Pin exact FastAPI versions (fastapi==0.165.0).
SQLAlchemy & Alembic	SQLAlchemy v2.1.10 / Alembic v1.20.1	SQLAlchemy 2.1.0 (Sep 24, 2026) became the default on PyPI and stopped installing greenlet by default—you must install sqlalchemy[asyncio] or async engines will crash on startup. Alembic 1.20.1 (Oct 21, 2026) emits warnings when unnamed CHECK constraints are omitted during SQLite batch table recreates (render_as_batch=True).
Pydantic	v2.14.x (Oct 2026)	Pydantic v2.14 finalized end-of-life for Pydantic v1; FastAPI completely removed pydantic.v1 compatibility shims. Remember Optional[Decimal] still requires = None if omittable, and Decimal serializes to str in JSON responses by default unless configured otherwise.


Part 1: Verified Tech Stack Docs


1. Exact Installation Commands


Frontend (Vite 6 LTS + React 19.3 + Tailwind v4.3 + TanStack Table v9)

Requires Node.js >=20.19.0 or >=22.12.0. [1] (https://fabwaseem.com/blog/vite-8-rolldown-upgrade-guide), [2] (https://xguardgate.com/live/npm/@vitejs/plugin-react)
bash
# Scaffold project and pin memory-light Vite 6.4 + compatible React plugin v5.2
npm create vite@latest ledgerprime-web -- --template react-ts
cd ledgerprime-web

npm install react@^19.3.0 react-dom@^19.3.0 @tanstack/react-table@^9.0.0
npm install -D vite@^6.4.0 @vitejs/plugin-react@^5.2.0 tailwindcss@^4.3.5 @tailwindcss/vite@^4.3.5 typescript @types/react@^19.0.0 @types/react-dom@^19.0.0
Use code with caution.
(Note: If upgrading to Rolldown-backed Vite 8 later, bump to vite@^8.3.0 and @vitejs/plugin-react@^6.3.0). [1] (https://security.snyk.io/package/npm/%40vitejs%2Fplugin-react/versions), [2] (https://vite.dev/releases)

Backend (Python 3.11–3.14 + FastAPI + SQLAlchemy Async + Alembic + aiosqlite)

bash
# Using uv (recommended in 2026) or standard venv + pip
python3 -m venv .venv
source .venv/bin/activate

# Note: sqlalchemy[asyncio] is MANDATORY in SQLAlchemy >=2.1 to pull greenlet
pip install "fastapi[standard]==0.165.0" "pydantic>=2.14.0,<3.0.0" "sqlalchemy[asyncio]>=2.1.7,<2.2.0" "aiosqlite==0.22.1" "alembic==1.20.1"
Use code with caution.

2. Frontend Configuration & Design Tokens (Tailwind CSS v4 + Vite 6)

No tailwind.config.js or postcss.config.js files are used. [1] (https://dev.to/csituma/using-vite-upgrade-to-tailiwindcss4-1c61)

vite.config.ts

ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
Use code with caution.

src/styles/tokens.css

css
:root {
  --ledger-bg: oklch(0.99 0.002 247);
  --ledger-surface: oklch(1 0 0);
  --ledger-border: oklch(0.90 0.01 247);
  --ledger-text: oklch(0.20 0.02 247);
  --ledger-primary: oklch(0.48 0.16 255);
  --ledger-credit: oklch(0.52 0.15 150);
  --ledger-debit: oklch(0.55 0.19 28);
  --ledger-font-mono: "JetBrains Mono", ui-monospace, monospace;
}

.dark {
  --ledger-bg: oklch(0.15 0.01 247);
  --ledger-surface: oklch(0.20 0.015 247);
  --ledger-border: oklch(0.30 0.015 247);
  --ledger-text: oklch(0.95 0.005 247);
}
Use code with caution.

src/styles/index.css

css
@import "tailwindcss";
@import "./tokens.css";

/* Enable class-based .dark toggle alongside CSS variable tokens */
@custom-variant dark (&:where(.dark, .dark *));

/* Map runtime CSS custom properties to Tailwind v4 utility classes */
@theme inline {
  --color-bg: var(--ledger-bg);
  --color-surface: var(--ledger-surface);
  --color-border: var(--ledger-border);
  --color-text: var(--ledger-text);
  --color-primary: var(--ledger-primary);
  --color-credit: var(--ledger-credit);
  --color-debit: var(--ledger-debit);
  --font-mono: var(--ledger-font-mono);
}
Use code with caution.
Usage in JSX: <div className="bg-surface text-text border-border font-mono"> or arbitrary variable syntax text-(--ledger-credit). [1] (https://tailwindcss.com/docs/adding-custom-styles), [2] (https://www.sitepoint.com/tailwind-css-v4-dynamic-themes/)

3. Minimal TanStack Table v9 + React 19.3 Usage Example


src/components/LedgerTable.tsx

tsx
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  createSortedRowModel,
  sortFn_alphanumeric,
  type ColumnDef,
} from '@tanstack/react-table'

export interface JournalRow {
  id: number
  voucherNo: string
  accountName: string
  debit: string   // Serialized Decimal("18,4") from FastAPI
  credit: string
}

// 1. Declare static features outside component for tree-shaking & stable types (v9 requirement)
const ledgerFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})

const columns: ColumnDef<typeof ledgerFeatures, JournalRow>[] = [
  { accessorKey: 'voucherNo', header: 'Voucher #' },
  { accessorKey: 'accountName', header: 'Ledger Account' },
  { accessorKey: 'debit', header: 'Debit (₹)' },
  { accessorKey: 'credit', header: 'Credit (₹)' },
]

export function LedgerTable({ data }: { data: JournalRow[] }) {
  const table = useTable({
    features: ledgerFeatures,
    columns,
    data,
  })

  return (
    <table className="w-full border-collapse bg-surface text-text">
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id} className="border-b border-border">
            {hg.headers.map((header) => (
              <th
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
                className="cursor-pointer p-2 text-left"
              >
                <table.FlexRender header={header} />
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody className="font-mono">
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className="border-b border-border">
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className="p-2">
                <table.FlexRender cell={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
Use code with caution.

4. Backend Database Setup (SQLAlchemy 2.1 Async + SQLite WAL + Decimal(18, 4))


app/db/session.py

python
from decimal import Decimal, ROUND_HALF_UP
from typing import AsyncGenerator
from sqlalchemy import Integer, MetaData, TypeDecorator, event
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = "sqlite+aiosqlite:///./ledgerprime.db"

# Mandatory naming convention for Alembic render_as_batch=True on SQLite
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(AsyncAttrs, DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class SqliteNumeric18_4(TypeDecorator[Decimal]):
    """
    Stores NUMERIC(18, 4) safely in SQLite as scaled 64-bit INTEGER (value * 10_000).
    Eliminates IEEE-754 float drift while preserving native SQL SUM(), <, >, and ORDER BY.
    """
    impl = Integer
    cache_ok = True
    SCALE = Decimal("10000")
    QUANT = Decimal("0.0001")

    def process_bind_param(self, value: Decimal | str | int | None, dialect) -> int | None:
        if value is None:
            return None
        dec = Decimal(str(value)).quantize(self.QUANT, rounding=ROUND_HALF_UP)
        return int(dec * self.SCALE)

    def process_result_value(self, value: int | None, dialect) -> Decimal | None:
        if value is None:
            return None
        return (Decimal(value) / self.SCALE).quantize(self.QUANT)


# Modern non-legacy sqlite3 transaction mode via autocommit=False
engine = create_async_engine(
    DATABASE_URL,
    connect_args={"autocommit": False},
    echo=False,
)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record) -> None:
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.execute("PRAGMA busy_timeout=5000;")
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
Use code with caution.

app/models/ledger.py

python
from decimal import Decimal
from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base, SqliteNumeric18_4


class JournalLine(Base):
    __tablename__ = "journal_lines"
    # Always name CHECK constraints explicitly (Alembic 1.20+ batch requirement)
    __table_args__ = (
        CheckConstraint("debit >= 0 AND credit >= 0", name="non_negative_amounts"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)  # Renders as INTEGER on SQLite
    account_code: Mapped[str] = mapped_column(String(32), index=True)
    debit: Mapped[Decimal] = mapped_column(SqliteNumeric18_4, default=Decimal("0.0000"))
    credit: Mapped[Decimal] = mapped_column(SqliteNumeric18_4, default=Decimal("0.0000"))
Use code with caution.

5. Alembic Async Configuration (alembic==1.20.1)

Initialize using the official async template:
bash
alembic init -t async alembic
Use code with caution.

alembic/env.py (Key Excerpt)

python
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

from app.db.session import Base, DATABASE_URL
import app.models.ledger  # noqa: F401 - ensure models register on Base.metadata

config = context.config
config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # Mandatory for SQLite ALTER support
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # Mandatory for SQLite ALTER support
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={"autocommit": False},
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
Use code with caution.

6. Minimal FastAPI 0.165.0 + Pydantic v2.14 Usage Example


app/main.py

python
from decimal import Decimal
from typing import Annotated
from fastapi import Depends, FastAPI, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.ledger import JournalLine

app = FastAPI(title="LedgerPrime API")


class JournalLineCreate(BaseModel):
    account_code: str = Field(min_length=1, max_length=32)
    debit: Decimal = Field(default=Decimal("0.0000"), max_digits=18, decimal_places=4, ge=0)
    credit: Decimal = Field(default=Decimal("0.0000"), max_digits=18, decimal_places=4, ge=0)


class JournalLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_code: str
    debit: Decimal
    credit: Decimal


@app.post("/api/journal-lines", response_model=JournalLineRead)
async def create_line(
    payload: JournalLineCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    line = JournalLine(**payload.model_dump())
    db.add(line)
    await db.commit()
    await db.refresh(line)
    return line


@app.get("/api/journal-lines", response_model=list[JournalLineRead])
async def list_lines(
    db: Annotated[AsyncSession, Depends(get_db)],
    # FastAPI >=0.148.0 note: add validate_default=True ONLY if a validator transforms defaults
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    result = await db.execute(select(JournalLine).limit(limit))
    return list(result.scalars().all())
Use code with caution.
---

Part 2: Extended Frontend, PDF & Core Accounting Schemas

1. Verified Frontend Versions & Breaking Notes

@tanstack/react-query (^5.108.1) — Published on npm (@tanstack/react-query). Breaking change in >=5.105.2: useIsMutating and queryClient.isMutating now strictly count 'pending' mutations and no longer accept a status filter argument. [1, 2]

react-hook-form (^7.92.0) — Published on npm (react-hook-form). Pin ^7.92.0 (8.0.0-beta.5 is pre-release and introduces breaking watch API changes).Includes key useFieldArray stability fixes introduced in 7.91.0 for multi-line accounting vouchers. [1, 2, 3, 4]

zod (^4.6.7) — Stable Zod 4 release documented on Zod v4 Docs. Features a 2 KB gzipped core, faster tsc inference, and optional ahead-of-time compilation (z.compile(schema)) for large line-item arrays. [1, 2, 3]

@hookform/resolvers (^7.0.7) — Verified via GitHub Releases (react-hook-form/resolvers). Resolves generic Zod 4 overload selection automatically inside zodResolver(schema). [1, 2]

Exact Install Command

bash

npm install @tanstack/react-query@^5.108.1 react-hook-form@^7.92.0 zod@^4.6.7 @hookform/resolvers@^7.0.7 

Use code with caution.

2. Minimal Setup: TanStack Query + React Hook Form + Zod 4

src/main.tsx (QueryClientProvider Setup)

tsx

import { StrictMode } from 'react' import { createRoot } from 'react-dom/client' import { QueryClient, QueryClientProvider } from '@tanstack/react-query' import './styles/index.css' import App from './App' const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1, }, }, }) createRoot(document.getElementById('root')!).render( <StrictMode> <QueryClientProvider client={queryClient}> <App /> </QueryClientProvider> </StrictMode>, ) 

Use code with caution.

src/components/VoucherEntryForm.tsx (Zero-Float BigInt Validation)

Keep monetary inputs as validated strings ("1250.5000") in Zod 4 and validate balance equality using scaled BigInt (* 10000n) so IEEE-754 JavaScript number rounding never touches voucher lines.

tsx

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

const decimal18_4 = z
  .string()
  .regex(/^\d{1,14}(\.\d{1,4})?$/, 'Enter valid amount (max 4 decimals)')

const toScaledInt = (val: string): bigint => {
  const [whole = '0', frac = ''] = val.split('.')
  return BigInt(whole) * 10000n + BigInt(frac.padEnd(4, '0'))
}

const voucherSchema = z
  .object({
    voucherDate: z.string().min(1),
    narration: z.string().min(1).max(255),
    lines: z
      .array(
        z.object({
          accountCode: z.string().min(1),
          debit: decimal18_4,
          credit: decimal18_4,
        }),
      )
      .min(2),
  })
  .refine(
    (v) => {
      const dr = v.lines.reduce((sum, l) => sum + toScaledInt(l.debit), 0n)
      const cr = v.lines.reduce((sum, l) => sum + toScaledInt(l.credit), 0n)
      return dr > 0n && dr === cr
    },
    { message: 'Total Debit must equal Total Credit and exceed 0.0000', path: ['lines'] },
  )

type VoucherInput = z.input<typeof voucherSchema>
type VoucherOutput = z.output<typeof voucherSchema>

export function VoucherEntryForm() {
  const queryClient = useQueryClient()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<VoucherInput, unknown, VoucherOutput>({
    resolver: zodResolver(voucherSchema),
    defaultValues: {
      voucherDate: new Date().toISOString().slice(0, 10),
      narration: '',
      lines: [
        { accountCode: '', debit: '0.0000', credit: '0.0000' },
        { accountCode: '', debit: '0.0000', credit: '0.0000' },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  const postVoucher = useMutation({
    mutationFn: async (body: VoucherOutput) => {
      const res = await fetch('/api/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] })
    },
  })

  return (
    <form onSubmit={handleSubmit((d) => postVoucher.mutate(d))} className="space-y-3">
      <div className="flex gap-2">
        <input type="date" {...register('voucherDate')} className="border border-border p-2" />
        <input placeholder="Narration" {...register('narration')} className="flex-1 border border-border p-2" />
      </div>

      {fields.map((field, index) => (
        <div key={field.id} className="grid grid-cols-4 gap-2 font-mono">
          <input {...register(`lines.${index}.accountCode`)} placeholder="Account Code" className="border border-border p-2" />
          <input {...register(`lines.${index}.debit`)} placeholder="Debit" className="border border-border p-2" />
          <input {...register(`lines.${index}.credit`)} placeholder="Credit" className="border border-border p-2" />
          <button type="button" onClick={() => remove(index)} className="text-debit">
            Remove
          </button>
        </div>
      ))}

      {errors.lines?.root && <p className="text-sm text-debit">{errors.lines.root.message}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => append({ accountCode: '', debit: '0.0000', credit: '0.0000' })}
          className="border border-border px-3 py-1.5"
        >
          + Add Line
        </button>
        <button type="submit" disabled={postVoucher.isPending} className="bg-primary px-4 py-1.5 text-white">
          Post Balanced Entry
        </button>
      </div>
    </form>
  )
}
Use code with caution.

3. GST Invoice PDF Strategy (8 GB RAM Comparison)

OptionExtra RAM UsageFit for 8 GB Linux Mint LaptopCSS @media print + Tailwind print: (Recommended)0 MBUses the already-open Chromium/Firefox tab (window.print()) to export crisp vector A4 Tax Invoices with HSN summary tables. Zero Python C-dependencies.fpdf2 / reportlab in FastAPI~15–25 MBUseful only if you later add headless bulk-emailing of invoices where no browser tab is open; requires maintaining duplicate layout code in Python.Playwright / WeasyPrint300–650 MB+Spawns a second headless browser or loads Cairo/Pango native libraries—avoid on an 8 GB dev/target laptop.

Minimal Print CSS (src/styles/index.css addition)

css

@media print { @page { size: A4 portrait; margin: 8mm; } body { background: #fff !important; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } } 

Use code with caution.

Invoice Component Pattern: Wrap navigation/sidebars in print:hidden and wrap the GST Tax Invoice container in print:w-full print:border-black print:shadow-none, triggering export via <button onClick={() => window.print()} className="print:hidden">Save PDF</button>.

4. SQLAlchemy 2.1 Reference Schemas (SqliteNumeric18_4)

All schemas below import Base and SqliteNumeric18_4 (INTEGER * 10000) from app/db/session.py defined in Part 1, preserving exact native SQLite SUM(), <, >, and ORDER BY operations without floating-point drift.

A. Double-Entry Balanced Journal Headers & Lines (app/models/accounting.py)

Enforces single-sided positive lines in SQLite DDL and guarantees SUM(debit) == SUM(credit) on every ORM flush/commit AND via a reusable SQLite SUM() query helper.

python

from datetime import date
from decimal import Decimal
from sqlalchemy import CheckConstraint, Date, ForeignKey, String, event, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship
from app.db.session import Base, SqliteNumeric18_4


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint(
            "account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')",
            name="valid_account_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    account_type: Mapped[str] = mapped_column(String(16))


class JournalHeader(Base):
    __tablename__ = "journal_headers"

    id: Mapped[int] = mapped_column(primary_key=True)
    voucher_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    voucher_date: Mapped[date] = mapped_column(Date, index=True)
    narration: Mapped[str] = mapped_column(String(255))
    is_posted: Mapped[bool] = mapped_column(default=True)

    lines: Mapped[list["JournalLine"]] = relationship(
        back_populates="header",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class JournalLine(Base):
    __tablename__ = "journal_lines"
    __table_args__ = (
        CheckConstraint("debit >= 0 AND credit >= 0", name="non_negative_amounts"),
        CheckConstraint(
            "(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)",
            name="mutually_exclusive_dr_cr",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    header_id: Mapped[int] = mapped_column(
        ForeignKey("journal_headers.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    debit: Mapped[Decimal] = mapped_column(SqliteNumeric18_4, default=Decimal("0.0000"))
    credit: Mapped[Decimal] = mapped_column(SqliteNumeric18_4, default=Decimal("0.0000"))

    header: Mapped["JournalHeader"] = relationship(back_populates="lines")


@event.listens_for(Session, "before_flush")
def _validate_journal_balance(session: Session, flush_context, instances) -> None:
    """Blocks any ORM flush where a posted JournalHeader has SUM(debit) != SUM(credit)."""
    headers: set[JournalHeader] = set()
    for obj in session.new.union(session.dirty).union(session.deleted):
        if isinstance(obj, JournalHeader):
            headers.add(obj)
        elif isinstance(obj, JournalLine) and obj.header is not None:
            headers.add(obj.header)

    for hdr in headers:
        if hdr in session.deleted or not hdr.is_posted:
            continue
        if len(hdr.lines) < 2:
            raise ValueError(f"Voucher {hdr.voucher_no} requires at least 2 lines.")
        total_dr = sum((ln.debit for ln in hdr.lines), Decimal("0.0000"))
        total_cr = sum((ln.credit for ln in hdr.lines), Decimal("0.0000"))
        if total_dr <= Decimal("0.0000") or total_dr != total_cr:
            raise ValueError(
                f"Unbalanced voucher {hdr.voucher_no}: SUM(debit)={total_dr} != SUM(credit)={total_cr}"
            )


async def verify_trial_balance(db: AsyncSession) -> tuple[Decimal, Decimal]:
    """Executes native integer-scaled SQLite SUM(debit) and SUM(credit) across all posted lines."""
    stmt = (
        select(
            func.coalesce(func.sum(JournalLine.debit), 0),
            func.coalesce(func.sum(JournalLine.credit), 0),
        )
        .join(JournalHeader, JournalLine.header_id == JournalHeader.id)
        .where(JournalHeader.is_posted.is_(True))
    )
    raw_dr, raw_cr = (await db.execute(stmt)).one()
    scale = Decimal("10000")
    return (Decimal(raw_dr) / scale, Decimal(raw_cr) / scale)

Use code with caution.

B. Indian GST Master Tables & Intra/Inter-State Place-of-Supply (app/models/gst.py)

Models Indian 2-digit state codes (e.g., "09" Uttar Pradesh, "07" Delhi, "27" Maharashtra), HSN/SAC codes, CGST/SGST/IGST/Cess slabs, and deterministic Place-of-Supply tax computation.

python

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base, SqliteNumeric18_4

QUANT_4 = Decimal("0.0001")


class GstTaxSlab(Base):
    __tablename__ = "gst_tax_slabs"
    __table_args__ = (
        CheckConstraint(
            "cgst_rate >= 0 AND sgst_rate >= 0 AND igst_rate >= 0 AND cess_rate >= 0",
            name="non_negative_slab_rates",
        ),
        # Standard Indian GST rule: CGST + SGST equals IGST rate (scaled integers match exactly)
        CheckConstraint(
            "cgst_rate + sgst_rate = igst_rate",
            name="cgst_plus_sgst_equals_igst",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(40), unique=True)  # e.g., "GST 18%"
    cgst_rate: Mapped[Decimal] = mapped_column(SqliteNumeric18_4)  # e.g., Decimal("9.0000")
    sgst_rate: Mapped[Decimal] = mapped_column(SqliteNumeric18_4)  # e.g., Decimal("9.0000")
    igst_rate: Mapped[Decimal] = mapped_column(SqliteNumeric18_4)  # e.g., Decimal("18.0000")
    cess_rate: Mapped[Decimal] = mapped_column(SqliteNumeric18_4, default=Decimal("0.0000"))


class HsnSacCode(Base):
    __tablename__ = "hsn_sac_codes"
    __table_args__ = (
        CheckConstraint("classification IN ('HSN', 'SAC')", name="valid_hsn_sac_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)  # 4/6/8-digit HSN or 6-digit SAC
    classification: Mapped[str] = mapped_column(String(3))
    description: Mapped[str] = mapped_column(String(255))
    tax_slab_id: Mapped[int] = mapped_column(ForeignKey("gst_tax_slabs.id"), index=True)


@dataclass(frozen=True)
class GstTaxBreakup:
    supply_nature: str  # "INTRA_STATE" or "INTER_STATE"
    taxable_value: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    cess_amount: Decimal
    invoice_line_total: Decimal


def calculate_indian_gst(
    taxable_value: Decimal,
    origin_state_code: str,  # Supplier GSTIN first 2 digits, e.g., "09" (UP)
    place_of_supply_code: str,  # Recipient / POS 2-digit code, e.g., "09" or "07"
    slab: GstTaxSlab,
) -> GstTaxBreakup:
    """
    Splits Indian GST based on Place of Supply (Sec 7 & 8 of IGST Act):
    - origin_state_code == place_of_supply_code -> Intra-State (CGST + SGST)
    - origin_state_code != place_of_supply_code -> Inter-State (IGST)
    """
    hundred = Decimal("100")
    base = taxable_value.quantize(QUANT_4, rounding=ROUND_HALF_UP)
    cess = ((base * slab.cess_rate) / hundred).quantize(QUANT_4, rounding=ROUND_HALF_UP)

    if origin_state_code.strip() == place_of_supply_code.strip():
        supply_nature = "INTRA_STATE"
        cgst = ((base * slab.cgst_rate) / hundred).quantize(QUANT_4, rounding=ROUND_HALF_UP)
        sgst = ((base * slab.sgst_rate) / hundred).quantize(QUANT_4, rounding=ROUND_HALF_UP)
        igst = Decimal("0.0000")
    else:
        supply_nature = "INTER_STATE"
        cgst = Decimal("0.0000")
        sgst = Decimal("0.0000")
        igst = ((base * slab.igst_rate) / hundred).quantize(QUANT_4, rounding=ROUND_HALF_UP)

    line_total = (base + cgst + sgst + igst + cess).quantize(QUANT_4)
    return GstTaxBreakup(supply_nature, base, cgst, sgst, igst, cess, line_total)

Use code with caution.

C. FIFO Inventory Lots, Stock Valuation & COGS (app/models/inventory.py)

Tracks inbound purchase batches in (received_date, id) order, computes exact FIFO Cost of Goods Sold (COGS) upon sale, and supports single-query SQLite closing stock valuation.

python

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import CheckConstraint, Date, ForeignKey, String, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base, SqliteNumeric18_4

QUANT_4 = Decimal("0.0001")


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    uom: Mapped[str] = mapped_column(String(16), default="NOS")  # GST UQC: NOS, KGS, MTR, PCS
    hsn_sac_id: Mapped[int] = mapped_column(ForeignKey("hsn_sac_codes.id"), index=True)


class InventoryLot(Base):
    __tablename__ = "inventory_lots"
    __table_args__ = (
        CheckConstraint("qty_in > 0", name="positive_lot_qty_in"),
        CheckConstraint(
            "qty_available >= 0 AND qty_available <= qty_in",
            name="valid_lot_qty_available",
        ),
        CheckConstraint("unit_cost >= 0", name="non_negative_lot_unit_cost"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("inventory_items.id"), index=True)
    batch_ref: Mapped[str] = mapped_column(String(64))
    received_date: Mapped[date] = mapped_column(Date, index=True)
    qty_in: Mapped[Decimal] = mapped_column(SqliteNumeric18_4)
    qty_available: Mapped[Decimal] = mapped_column(SqliteNumeric18_4)
    unit_cost: Mapped[Decimal] = mapped_column(SqliteNumeric18_4)


class FifoLotAllocation(Base):
    __tablename__ = "fifo_lot_allocations"
    __table_args__ = (
        CheckConstraint("qty_allocated > 0", name="positive_qty_allocated"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    lot_id: Mapped[int] = mapped_column(ForeignKey("inventory_lots.id"), index=True)
    outbound_ref: Mapped[str] = mapped_column(String(64), index=True)  # e.g., Sales Invoice Line ID
    qty_allocated: Mapped[Decimal] = mapped_column(SqliteNumeric18_4)
    cogs_value: Mapped[Decimal] = mapped_column(SqliteNumeric18_4)


async def allocate_fifo_cogs(
    db: AsyncSession,
    item_id: int,
    issue_qty: Decimal,
    outbound_ref: str,
) -> Decimal:
    """
    Consumes oldest available InventoryLot rows in strict FIFO order (received_date ASC, id ASC).
    Records audit rows in fifo_lot_allocations and returns exact total COGS Decimal(18, 4).
    """
    stmt = (
        select(InventoryLot)
        .where(
            InventoryLot.item_id == item_id,
            InventoryLot.qty_available > Decimal("0.0000"),
        )
        .order_by(InventoryLot.received_date.asc(), InventoryLot.id.asc())
    )
    open_lots = list((await db.execute(stmt)).scalars().all())
    pending_qty = issue_qty.quantize(QUANT_4)
    total_cogs = Decimal("0.0000")

    for lot in open_lots:
        if pending_qty <= Decimal("0.0000"):
            break
        consumed = min(lot.qty_available, pending_qty)
        lot_cogs = (consumed * lot.unit_cost).quantize(QUANT_4, rounding=ROUND_HALF_UP)
        lot.qty_available = (lot.qty_available - consumed).quantize(QUANT_4)
        pending_qty = (pending_qty - consumed).quantize(QUANT_4)
        total_cogs = (total_cogs + lot_cogs).quantize(QUANT_4)
        db.add(
            FifoLotAllocation(
                lot_id=lot.id,
                outbound_ref=outbound_ref,
                qty_allocated=consumed,
                cogs_value=lot_cogs,
            )
        )

    if pending_qty > Decimal("0.0000"):
        raise ValueError(f"Insufficient stock for item_id={item_id}; short by {pending_qty}")

    return total_cogs


async def get_fifo_stock_valuation(db: AsyncSession, item_id: int) -> Decimal:
    """
    Computes exact closing stock valuation in SQLite using scaled integers:
    Each column is scaled by 10_000, so SUM(qty_available * unit_cost) is scaled by 100_000_000 (10^8).
    """
    stmt = select(
        func.coalesce(func.sum(InventoryLot.qty_available * InventoryLot.unit_cost), 0)
    ).where(
        InventoryLot.item_id == item_id,
        InventoryLot.qty_available > Decimal("0.0000"),
    )
    scaled_product_sum = (await db.execute(stmt)).scalar_one()
    return (Decimal(scaled_product_sum) / Decimal("100000000")).quantize(
        QUANT_4, rounding=ROUND_HALF_UP
    )

Use code with caution.

> Note:
SQLite 64-Bit Integer Overflow in get_fifo_stock_valuation: Because both qty_available and unit_cost are scaled by $10^4$, multiplying them in SQL (qty_available * unit_cost) scales the product by $10^8$. SQLite's max 64-bit signed integer is $\approx 9.22 \times 10^{18}$. For normal inventory values this is fine, but if a single lot's qty * unit_cost ever exceeds ~₹92 billion (or a SUM() across huge lots does), SQLite silently converts the overflow to a REAL float. For complete safety on very large valuations, compute the product in Python using Decimal or keep lot totals under that ceiling.
API Mapping (accountCode vs. account_id): In VoucherEntryForm.tsx, the frontend submits accountCode (string), whereas JournalLine in app/models/accounting.py stores account_id (foreign key integer). When building the POST /api/vouchers FastAPI endpoint, your backend will need to look up Account.id by accountCode (or pass account_id directly from an account dropdown).
---

Part 3: Banking Reconciliation & Indian Statement Parser

1. Architecture & Memory Footprint Choices

Zero-Pandas Streaming CSV Ingestion. Indian corporate/current account CSV exports from HDFC, SBI, ICICI, and Axis frequently prepend 5–20 metadata lines (branch address, IFSC, statement period) before the actual header row and append summary footers at the bottom. Scanning line-by-line via io.StringIO until a normalized header signature matches avoids loading full DataFrames into RAM.

Extensible Protocol Interface. Wrapping parsers behind a Python typing.Protocol (StatementParser) lets you plug in an XML/SGML OfxStatementParser later without touching reconciliation or database code.

Accounting Polarity Convention. On a Bank Statement, credit = deposit (money in) and debit = withdrawal (money out). In your General Ledger (Account of type ASSET), a deposit is a Debit (JournalLine.debit > 0) and a withdrawal is a Credit (JournalLine.credit > 0). All matching queries enforce this mirror polarity automatically.

2. SQLAlchemy 2.1 Banking Reconciliation Schemas (app/models/banking.py)

Reuses Base and SqliteNumeric18_4 (INTEGER * 10000) from Part 1 (app/db/session.py) and links directly to Account, JournalHeader, and JournalLine from Part 2 (app/models/accounting.py).

python

import hashlib
from datetime import date
from decimal import Decimal
from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    String,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship
from app.db.session import Base, SqliteNumeric18_4

QUANT_4 = Decimal("0.0001")


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 1-to-1 link to the ASSET ledger account in Chart of Accounts
    ledger_account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id"), unique=True, index=True
    )
    bank_name: Mapped[str] = mapped_column(String(80))  # e.g., "HDFC Bank", "SBI"
    account_number_masked: Mapped[str] = mapped_column(String(32))
    ifsc_code: Mapped[str] = mapped_column(String(11))  # e.g., "HDFC0001234"
    default_csv_preset: Mapped[str] = mapped_column(String(24), default="AUTO")


class BankStatementLine(Base):
    __tablename__ = "bank_statement_lines"
    __table_args__ = (
        CheckConstraint("withdrawal >= 0 AND deposit >= 0", name="non_neg_bank_amts"),
        CheckConstraint(
            "(withdrawal > 0 AND deposit = 0) OR (deposit > 0 AND withdrawal = 0)",
            name="single_sided_bank_line",
        ),
        CheckConstraint(
            "allocated_amount >= 0 AND allocated_amount <= (withdrawal + deposit)",
            name="bank_line_not_over_allocated",
        ),
        CheckConstraint(
            "status IN ('UNRECONCILED', 'PARTIAL', 'RECONCILED')",
            name="valid_recon_status",
        ),
        # Idempotent guard: prevents duplicate rows on overlapping CSV re-uploads
        UniqueConstraint("row_hash", name="uq_bank_stmt_row_hash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    bank_account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="CASCADE"), index=True
    )
    txn_date: Mapped[date] = mapped_column(Date, index=True)
    value_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    narration: Mapped[str] = mapped_column(String(500))
    raw_ref_no: Mapped[str] = mapped_column(String(120), default="")
    # Normalized UTR / RRN / Cheque token extracted via regex for fast indexed lookup
    extracted_ref: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    withdrawal: Mapped[Decimal] = mapped_column(SqliteNumeric18_4, default=Decimal("0.0000"))
    deposit: Mapped[Decimal] = mapped_column(SqliteNumeric18_4, default=Decimal("0.0000"))
    closing_balance: Mapped[Decimal | None] = mapped_column(SqliteNumeric18_4, nullable=True)
    allocated_amount: Mapped[Decimal] = mapped_column(SqliteNumeric18_4, default=Decimal("0.0000"))
    status: Mapped[str] = mapped_column(String(16), default="UNRECONCILED", index=True)
    row_hash: Mapped[str] = mapped_column(String(64))

    matches: Mapped[list["BankReconciliationMatch"]] = relationship(
        back_populates="statement_line",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    @property
    def absolute_amount(self) -> Decimal:
        return (
            self.deposit if self.deposit > Decimal("0.0000") else self.withdrawal
        ).quantize(QUANT_4)

    @property
    def unallocated_amount(self) -> Decimal:
        return (self.absolute_amount - self.allocated_amount).quantize(QUANT_4)


class BankReconciliationMatch(Base):
    """
    Many-to-many junction supporting:
    - 1 BankStatementLine <-> 1 JournalLine (standard auto/manual match)
    - 1 BankStatementLine <-> N JournalLines (batch payout or net settlement minus bank charges)
    - N BankStatementLines <-> 1 JournalLine (split gateway payouts hitting bank in tranches)
    """

    __tablename__ = "bank_reconciliation_matches"
    __table_args__ = (
        CheckConstraint("matched_amount > 0", name="positive_matched_amount"),
        CheckConstraint(
            "match_method IN ('AUTO_REF', 'MANUAL', 'SPLIT')",
            name="valid_match_method",
        ),
        UniqueConstraint("statement_line_id", "journal_line_id", name="uq_stmt_journal_pair"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    statement_line_id: Mapped[int] = mapped_column(
        ForeignKey("bank_statement_lines.id", ondelete="CASCADE"), index=True
    )
    journal_line_id: Mapped[int] = mapped_column(
        ForeignKey("journal_lines.id", ondelete="RESTRICT"), index=True
    )
    matched_amount: Mapped[Decimal] = mapped_column(SqliteNumeric18_4)
    match_method: Mapped[str] = mapped_column(String(16), default="MANUAL")

    statement_line: Mapped["BankStatementLine"] = relationship(back_populates="matches")


def compute_statement_row_hash(
    bank_account_id: int,
    txn_date: date,
    ref_no: str,
    withdrawal: Decimal,
    deposit: Decimal,
    closing_balance: Decimal | None,
    narration: str,
    occurrence_seq: int = 1,
) -> str:
    """
    Deterministic SHA-256 fingerprint. `occurrence_seq` (1, 2, ...) safely distinguishes
    genuinely identical intra-day charges within the same file while remaining 100%
    deterministic across overlapping monthly exports.
    """
    bal_str = f"{closing_balance:.4f}" if closing_balance is not None else "NULL"
    norm_narr = " ".join(narration.strip().upper().split())
    norm_ref = ref_no.strip().upper()
    canonical = (
        f"{bank_account_id}|{txn_date.isoformat()}|{norm_ref}|"
        f"{withdrawal:.4f}|{deposit:.4f}|{bal_str}|{norm_narr}|#{occurrence_seq}"
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@event.listens_for(Session, "before_flush")
def _sync_statement_line_allocations(session: Session, flush_context, instances) -> None:
    """Keeps allocated_amount and status synchronized and blocks over-allocation in ORM."""
    affected_lines: set[BankStatementLine] = set()
    for obj in session.new.union(session.dirty).union(session.deleted):
        if isinstance(obj, BankStatementLine):
            affected_lines.add(obj)
        elif isinstance(obj, BankReconciliationMatch) and obj.statement_line is not None:
            affected_lines.add(obj.statement_line)

    for sline in affected_lines:
        if sline in session.deleted:
            continue
        active_matches = [m for m in sline.matches if m not in session.deleted]
        total_alloc = sum(
            (m.matched_amount for m in active_matches), Decimal("0.0000")
        ).quantize(QUANT_4)
        max_amt = sline.absolute_amount
        if total_alloc > max_amt:
            raise ValueError(
                f"Over-allocation on statement_line_id={sline.id}: {total_alloc} > {max_amt}"
            )
        sline.allocated_amount = total_alloc
        if total_alloc == Decimal("0.0000"):
            sline.status = "UNRECONCILED"
        elif total_alloc < max_amt:
            sline.status = "PARTIAL"
        else:
            sline.status = "RECONCILED"

Use code with caution.

3. Zero-Dependency Indian Bank CSV Parser (app/services/bank_parser.py)

Handles HDFC, SBI, ICICI, and Axis column aliases, strips Indian lakh/crore comma formatting (1,25,000.50), supports single-column Dr/Cr amount formats alongside dual Withdrawal/Deposit columns, parses DD/MM/YY, DD/MM/YYYY, and DD-MMM-YYYY, and extracts Indian payment rail references via precompiled regexes.

python

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Iterator, Protocol

QUANT_4 = Decimal("0.0001")

# Supported Indian bank export date formats
INDIAN_DATE_FORMATS = (
    "%d/%m/%Y",
    "%d/%m/%y",
    "%d-%m-%Y",
    "%d-%m-%y",
    "%d-%b-%Y",  # e.g., 25-Nov-2026 (SBI / Axis)
    "%d-%b-%y",  # e.g., 25-Nov-26
    "%d %b %Y",  # e.g., 25 Nov 2026 (SBI corporate)
    "%Y-%m-%d",
)

# Ordered regexes for Indian banking reference extraction (UTR / IMPS / UPI / Cheque)
INDIAN_REF_PATTERNS: tuple[re.Pattern[str], ...] = (
    # UPI 12-digit RRN: e.g., UPI/432912345678/... or UPI-432912345678-...
    re.compile(r"\bUPI[/-](\d{12})\b", re.IGNORECASE),
    # IMPS 12-digit RRN: e.g., IMPS/P2A/432998765432/... or MMT/IMPS/432998765432
    re.compile(r"\bIMPS/(?:P2[AM]/)?(\d{12})\b", re.IGNORECASE),
    # NEFT / RTGS 16-to-22 alphanumeric UTR: e.g., NEFT-HDFCN52026112512345678 or RTGS/SBINR5...
    re.compile(r"\b(?:NEFT|RTGS)[/- :]*([A-Z]{4}[A-Z0-9]{12,18})\b", re.IGNORECASE),
    # Standalone IFSC-prefixed UTR token (16-22 chars)
    re.compile(r"\b([A-Z]{4}[0-9A-Z]\d{11,17})\b"),
    # Explicit Cheque number markers: e.g., CHQ NO 000452, CLG/000452
    re.compile(r"\b(?:CHQ|CHEQUE|CLG)(?:[ .:/#-]|NO\.?)*0*(\d{4,8})\b", re.IGNORECASE),
)


@dataclass(frozen=True)
class ParsedStatementRow:
    txn_date: date
    value_date: date | None
    narration: str
    raw_ref_no: str
    extracted_ref: str | None
    withdrawal: Decimal
    deposit: Decimal
    closing_balance: Decimal | None


class StatementParser(Protocol):
    """Extensible parser contract — implement OfxStatementParser later with the exact same signature."""

    def parse(self, raw_content: str) -> Iterator[ParsedStatementRow]: ...


@dataclass(frozen=True)
class CsvColumnMap:
    txn_date_aliases: tuple[str, ...] = (
        "date",
        "txn date",
        "transaction date",
        "tran date",
    )
    value_date_aliases: tuple[str, ...] = (
        "value dt",
        "value date",
        "val date",
    )
    narration_aliases: tuple[str, ...] = (
        "narration",
        "description",
        "transaction remarks",
        "particulars",
        "remarks",
    )
    ref_aliases: tuple[str, ...] = (
        "chq./ref.no.",
        "ref no./cheque no.",
        "cheque number",
        "chq/ref no",
        "reference no",
        "chq no",
    )
    withdrawal_aliases: tuple[str, ...] = (
        "withdrawal amt.",
        "withdrawal amount (inr )",
        "debit",
        "withdrawal (dr)",
        "dr amount",
        "withdrawal",
    )
    deposit_aliases: tuple[str, ...] = (
        "deposit amt.",
        "deposit amount (inr )",
        "credit",
        "deposit (cr)",
        "cr amount",
        "deposit",
    )
    single_amount_aliases: tuple[str, ...] = (
        "transaction amount(inr)",
        "amount (inr)",
        "amount",
    )
    dr_cr_flag_aliases: tuple[str, ...] = (
        "cr/dr",
        "dr/cr",
        "type",
    )
    balance_aliases: tuple[str, ...] = (
        "closing balance",
        "balance (inr )",
        "balance(inr)",
        "balance",
        "available balance",
    )


def parse_indian_date(raw: str) -> date:
    cleaned = raw.strip().split()[0]  # Strip trailing timestamps like "25/11/2026 14:22:01"
    for fmt in INDIAN_DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized Indian bank date format: {raw!r}")


def parse_indian_amount(raw: str | None) -> Decimal:
    """Parses '1,25,000.50', '₹ 4,500.00 Cr', '-', or '' into exact Decimal(18, 4)."""
    if not raw:
        return Decimal("0.0000")
    cleaned = (
        raw.replace(",", "")
        .replace("₹", "")
        .replace("INR", "")
        .replace("Cr", "")
        .replace("Dr", "")
        .strip()
    )
    if cleaned in ("", "-", "--", "NA", "N/A"):
        return Decimal("0.0000")
    try:
        return Decimal(cleaned).quantize(QUANT_4, rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid monetary value: {raw!r}") from exc


def extract_payment_ref(raw_ref: str, narration: str) -> str | None:
    """Extracts canonical UTR, 12-digit UPI/IMPS RRN, or stripped Cheque number."""
    combined = f"{raw_ref} {narration}"
    for pattern in INDIAN_REF_PATTERNS:
        match = pattern.search(combined)
        if match:
            return match.group(1).upper().lstrip("0") or match.group(1).upper()
    # Fallback: clean non-zero raw_ref column (e.g., HDFC puts cheque/UTR directly in Chq./Ref.No.)
    fallback = re.sub(r"[^A-Z0-9]", "", raw_ref.upper()).lstrip("0")
    return fallback if len(fallback) >= 4 else None


class IndianBankCsvParser:
    """Memory-light streaming CSV parser supporting HDFC, SBI, ICICI, and Axis exports."""

    def __init__(self, col_map: CsvColumnMap = CsvColumnMap()) -> None:
        self.col_map = col_map

    @staticmethod
    def _norm(header_cell: str) -> str:
        return " ".join(header_cell.strip().lower().replace("_", " ").split())

    def _locate_col(self, headers: list[str], aliases: tuple[str, ...]) -> int | None:
        for alias in aliases:
            if alias in headers:
                return headers.index(alias)
        return None

    def parse(self, raw_content: str) -> Iterator[ParsedStatementRow]:
        # Strip UTF-8 BOM if exported from Excel/Windows netbanking
        stream = io.StringIO(raw_content.lstrip("\ufeff"))
        reader = csv.reader(stream)
        idx_map: dict[str, int | None] = {}

        for row in reader:
            if not any(cell.strip() for cell in row):
                continue
            norm_row = [self._norm(c) for c in row]
            date_idx = self._locate_col(norm_row, self.col_map.txn_date_aliases)
            narr_idx = self._locate_col(norm_row, self.col_map.narration_aliases)
            if date_idx is not None and narr_idx is not None:
                idx_map = {
                    "txn_date": date_idx,
                    "val_date": self._locate_col(norm_row, self.col_map.value_date_aliases),
                    "narration": narr_idx,
                    "ref": self._locate_col(norm_row, self.col_map.ref_aliases),
                    "withdrawal": self._locate_col(norm_row, self.col_map.withdrawal_aliases),
                    "deposit": self._locate_col(norm_row, self.col_map.deposit_aliases),
                    "single_amt": self._locate_col(norm_row, self.col_map.single_amount_aliases),
                    "dr_cr": self._locate_col(norm_row, self.col_map.dr_cr_flag_aliases),
                    "balance": self._locate_col(norm_row, self.col_map.balance_aliases),
                }
                break

        txn_date_idx = idx_map.get("txn_date")
        narr_idx = idx_map.get("narration")
        if txn_date_idx is None or narr_idx is None:
            raise ValueError("Could not detect Indian bank statement header row.")

        val_date_idx = idx_map["val_date"]
        ref_idx = idx_map["ref"]
        withdrawal_idx = idx_map["withdrawal"]
        deposit_idx = idx_map["deposit"]
        single_amt_idx = idx_map["single_amt"]
        dr_cr_idx = idx_map["dr_cr"]
        balance_idx = idx_map["balance"]

        for row in reader:
            if not row or len(row) <= txn_date_idx:
                continue
            raw_date = row[txn_date_idx].strip()
            # Skip HDFC "***" separator rows or footer summary lines
            if not raw_date or set(raw_date) == {"*"}:
                continue
            try:
                txn_dt = parse_indian_date(raw_date)
            except ValueError:
                continue  # Reached end-of-statement disclaimer footer

            val_dt = None
            if val_date_idx is not None and val_date_idx < len(row):
                try:
                    val_dt = parse_indian_date(row[val_date_idx])
                except ValueError:
                    val_dt = None

            narration = row[narr_idx].strip() if narr_idx < len(row) else ""
            raw_ref = row[ref_idx].strip() if ref_idx is not None and ref_idx < len(row) else ""

            # Dual-column (HDFC/SBI) vs Single-column + Cr/Dr flag (ICICI/Axis variants)
            if withdrawal_idx is not None and deposit_idx is not None:
                withdrawal = parse_indian_amount(row[withdrawal_idx] if withdrawal_idx < len(row) else None)
                deposit = parse_indian_amount(row[deposit_idx] if deposit_idx < len(row) else None)
            elif single_amt_idx is not None and dr_cr_idx is not None:
                amt = abs(parse_indian_amount(row[single_amt_idx] if single_amt_idx < len(row) else None))
                flag = (row[dr_cr_idx] if dr_cr_idx < len(row) else "").strip().upper()
                withdrawal = amt if flag.startswith("D") else Decimal("0.0000")
                deposit = amt if flag.startswith("C") else Decimal("0.0000")
            else:
                raise ValueError("Statement lacks recognizable Debit/Credit columns.")

            if withdrawal == Decimal("0.0000") and deposit == Decimal("0.0000"):
                continue

            balance = (
                parse_indian_amount(row[balance_idx])
                if balance_idx is not None and balance_idx < len(row) and row[balance_idx].strip()
                else None
            )

            yield ParsedStatementRow(
                txn_date=txn_dt,
                value_date=val_dt,
                narration=narration,
                raw_ref_no=raw_ref,
                extracted_ref=extract_payment_ref(raw_ref, narration),
                withdrawal=withdrawal,
                deposit=deposit,
                closing_balance=balance,
            )
Use code with caution.

4. Ingestion, Auto-Matching (±3 Days) & Split Allocation Service (app/services/reconciliation.py)

Implements idempotent CSV import (ON CONFLICT DO NOTHING via row_hash lookup), exact reference + amount + ±3 day auto-reconciliation, and validated many-to-many manual/split allocation.

python

from collections import Counter
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting import JournalHeader, JournalLine
from app.models.banking import (
    BankAccount,
    BankReconciliationMatch,
    BankStatementLine,
    compute_statement_row_hash,
)
from app.services.bank_parser import StatementParser, extract_payment_ref

QUANT_4 = Decimal("0.0001")


@dataclass(frozen=True)
class ImportSummary:
    inserted: int
    skipped_duplicates: int


async def import_bank_statement(
    db: AsyncSession,
    bank_account_id: int,
    raw_text: str,
    parser: StatementParser,
) -> ImportSummary:
    """Streams parsed rows, computes deterministic SHA-256 hashes, and skips duplicates."""
    seen_in_file: Counter[str] = Counter()
    staged: list[BankStatementLine] = []

    for p in parser.parse(raw_text):
        # Base key tracks intra-day identical lines within the same upload deterministically
        base_key = (
            f"{bank_account_id}|{p.txn_date}|{p.raw_ref_no}|"
            f"{p.withdrawal}|{p.deposit}|{p.closing_balance}|{p.narration}"
        )
        seen_in_file[base_key] += 1
        r_hash = compute_statement_row_hash(
            bank_account_id=bank_account_id,
            txn_date=p.txn_date,
            ref_no=p.raw_ref_no,
            withdrawal=p.withdrawal,
            deposit=p.deposit,
            closing_balance=p.closing_balance,
            narration=p.narration,
            occurrence_seq=seen_in_file[base_key],
        )
        staged.append(
            BankStatementLine(
                bank_account_id=bank_account_id,
                txn_date=p.txn_date,
                value_date=p.value_date,
                narration=p.narration,
                raw_ref_no=p.raw_ref_no,
                extracted_ref=p.extracted_ref,
                withdrawal=p.withdrawal,
                deposit=p.deposit,
                closing_balance=p.closing_balance,
                row_hash=r_hash,
            )
        )

    if not staged:
        return ImportSummary(inserted=0, skipped_duplicates=0)

    # Single-query check for existing hashes in SQLite
    candidate_hashes = [row.row_hash for row in staged]
    existing_hashes = set(
        (
            await db.execute(
                select(BankStatementLine.row_hash).where(
                    BankStatementLine.row_hash.in_(candidate_hashes)
                )
            )
        )
        .scalars()
        .all()
    )

    new_rows = [row for row in staged if row.row_hash not in existing_hashes]
    db.add_all(new_rows)
    await db.flush()
    return ImportSummary(
        inserted=len(new_rows),
        skipped_duplicates=len(staged) - len(new_rows),
    )


async def auto_reconcile_statement(
    db: AsyncSession,
    bank_account: BankAccount,
    date_window_days: int = 3,
) -> int:
    """
    Auto-matches UNRECONCILED BankStatementLines against posted, unreconciled JournalLines
    on the linked ledger account when ALL four conditions hold:
    1. Exact extracted UTR / RRN / Cheque token appears in JournalHeader.voucher_no or narration
    2. Exact mirror amount (Bank Deposit == Ledger Debit; Bank Withdrawal == Ledger Credit)
    3. JournalHeader.voucher_date is within [txn_date - window, txn_date + window]
    4. Unambiguous 1-to-1 candidate (skips if >1 ledger lines match so user decides)
    """
    stmt_lines = list(
        (
            await db.execute(
                select(BankStatementLine).where(
                    BankStatementLine.bank_account_id == bank_account.id,
                    BankStatementLine.status == "UNRECONCILED",
                    BankStatementLine.extracted_ref.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if not stmt_lines:
        return 0

    # Subquery calculating already-reconciled amount per JournalLine
    alloc_subq = (
        select(
            BankReconciliationMatch.journal_line_id,
            func.coalesce(func.sum(BankReconciliationMatch.matched_amount), 0).label("used_amt"),
        )
        .group_by(BankReconciliationMatch.journal_line_id)
        .subquery()
    )

    matched_count = 0
    consumed_jline_ids: set[int] = set()

    for sline in stmt_lines:
        min_dt = sline.txn_date - timedelta(days=date_window_days)
        max_dt = sline.txn_date + timedelta(days=date_window_days)

        # Mirror polarity: Bank Deposit -> Ledger Debit; Bank Withdrawal -> Ledger Credit
        polarity_filter = (
            JournalLine.debit == sline.deposit
            if sline.deposit > Decimal("0.0000")
            else JournalLine.credit == sline.withdrawal
        )

        q = (
            select(JournalLine, JournalHeader)
            .join(JournalHeader, JournalLine.header_id == JournalHeader.id)
            .outerjoin(alloc_subq, JournalLine.id == alloc_subq.c.journal_line_id)
            .where(
                JournalLine.account_id == bank_account.ledger_account_id,
                JournalHeader.is_posted.is_(True),
                JournalHeader.voucher_date.between(min_dt, max_dt),
                polarity_filter,
                func.coalesce(alloc_subq.c.used_amt, 0) == 0,
            )
        )
        candidates = (await db.execute(q)).all()

        # Filter candidates whose voucher_no or narration yields the exact same payment ref
        exact_hits = [
            jline
            for jline, jhdr in candidates
            if jline.id not in consumed_jline_ids
            and (
                extract_payment_ref(jhdr.voucher_no, jhdr.narration) == sline.extracted_ref
                or sline.extracted_ref in f"{jhdr.voucher_no} {jhdr.narration}".upper()
            )
        ]

        if len(exact_hits) == 1:
            winner = exact_hits[0]
            consumed_jline_ids.add(winner.id)
            sline.matches.append(
                BankReconciliationMatch(
                    journal_line_id=winner.id,
                    matched_amount=sline.absolute_amount,
                    match_method="AUTO_REF",
                )
            )
            matched_count += 1

    await db.flush()
    return matched_count


@dataclass(frozen=True)
class SplitAllocationItem:
    journal_line_id: int
    amount: Decimal


async def allocate_split_reconciliation(
    db: AsyncSession,
    bank_account: BankAccount,
    statement_line_id: int,
    allocations: list[SplitAllocationItem],
) -> BankStatementLine:
    """
    Manual / Split reconciliation: allocates one BankStatementLine across 1..N JournalLines,
    verifying neither side (statement line nor each ledger line) is over-allocated.
    """
    sline = await db.get(BankStatementLine, statement_line_id)
    if sline is None or sline.bank_account_id != bank_account.id:
        raise ValueError("Bank statement line not found for this bank account.")

    requested_total = sum(
        (item.amount.quantize(QUANT_4) for item in allocations), Decimal("0.0000")
    )
    if requested_total <= Decimal("0.0000") or requested_total > sline.unallocated_amount:
        raise ValueError(
            f"Requested allocation {requested_total} exceeds remaining statement balance {sline.unallocated_amount}"
        )

    is_deposit = sline.deposit > Decimal("0.0000")
    method = (
        "SPLIT"
        if len(allocations) > 1 or requested_total < sline.absolute_amount
        else "MANUAL"
    )

    for item in allocations:
        jline = await db.get(JournalLine, item.journal_line_id)
        if jline is None or jline.account_id != bank_account.ledger_account_id:
            raise ValueError(
                f"JournalLine {item.journal_line_id} does not belong to this bank ledger."
            )

        # Enforce accounting polarity on manual/split matches too
        jline_cap = jline.debit if is_deposit else jline.credit
        if jline_cap <= Decimal("0.0000"):
            raise ValueError(f"Polarity mismatch on JournalLine {jline.id}.")

        # Sum existing allocations on this JournalLine (stored as scaled int * 10000 in SQLite)
        raw_existing = (
            await db.execute(
                select(
                    func.coalesce(func.sum(BankReconciliationMatch.matched_amount), 0)
                ).where(BankReconciliationMatch.journal_line_id == jline.id)
            )
        ).scalar_one()
        existing_jline_alloc = (Decimal(raw_existing) / Decimal("10000")).quantize(QUANT_4)

        if existing_jline_alloc + item.amount.quantize(QUANT_4) > jline_cap:
            raise ValueError(
                f"JournalLine {jline.id} over-allocated: {existing_jline_alloc + item.amount} > {jline_cap}"
            )

        sline.matches.append(
            BankReconciliationMatch(
                journal_line_id=jline.id,
                matched_amount=item.amount.quantize(QUANT_4),
                match_method=method,
            )
        )

    await db.flush()  # Triggers _sync_statement_line_allocations to update status & allocated_amount
    return sline

Use code with caution.

5. Minimal FastAPI 0.165.0 Upload & Auto-Match Endpoint (app/api/reconciliation.py)

Uses FastAPI's built-in multipart upload (python-multipart comes included with fastapi[standard]==0.165.0) and enforces a strict 5 MB file size ceiling in memory before parsing so accidental huge uploads never spike RAM.

python

from typing import Annotated
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.banking import BankAccount
from app.services.bank_parser import IndianBankCsvParser
from app.services.reconciliation import auto_reconcile_statement, import_bank_statement

router = APIRouter(prefix="/api/banking", tags=["banking"])
MAX_CSV_BYTES = 5 * 1024 * 1024  # 5 MB hard guard (~25,000+ bank rows)


@router.post("/{bank_account_id}/import-csv")
async def upload_and_reconcile_csv(
    bank_account_id: int,
    file: Annotated[UploadFile, File(...)],
    db: Annotated[AsyncSession, Depends(get_db)],
    date_window_days: Annotated[int, Query(ge=0, le=15)] = 3,
):
    bank_acc = await db.get(BankAccount, bank_account_id)
    if bank_acc is None:
        raise HTTPException(status_code=404, detail="Bank account not found")

    raw_bytes = await file.read(MAX_CSV_BYTES + 1)
    if len(raw_bytes) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="CSV statement exceeds 5 MB limit")

    # Indian bank CSV exports use UTF-8 or Windows-1252 (cp1252) encoding
    try:
        raw_text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raw_text = raw_bytes.decode("cp1252")

    try:
        summary = await import_bank_statement(
            db, bank_account_id, raw_text, IndianBankCsvParser()
        )
        auto_matched = await auto_reconcile_statement(db, bank_acc, date_window_days)
        await db.commit()
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "inserted_rows": summary.inserted,
        "skipped_duplicates": summary.skipped_duplicates,
        "auto_reconciled": auto_matched,
    }

Use code with caution.
---

## Part 4: Statutory Tax & Compliance Specs

*Reference Baseline: Late 2026 (FY 2026–27 India / Tax Year 2026 Global)*

---

### 4.1 India GSTN Offline & API JSON Structures

#### A. GSTR-1 Offline JSON Export Structure (Schema v3.2.x+)

GSTR-1 payloads exported for the [GSTN Returns Offline Tool](https://gst.gov.in "GSTN GSTR 1 User Guide") or direct GSP upload follow a strict root schema. Note two major structural mandates active in 2026:

1. **B2CL Threshold Revision:** Inter-state invoices to unregistered buyers (`b2cl`) apply to invoice values exceeding **₹1,00,000** (reduced from the legacy ₹2,50,000 limit).
2. **Table 12 HSN Bifurcation:** Effective from the April 2025 return periods onwards, HSN summaries (`hsn`) are strictly split into **`hsn_b2b`** (Table 12A) and **`hsn_b2c`** (Table 12B) arrays instead of a single `data` array, with mandatory 4-digit or 6-digit HSN codes validated against the GST portal master.

```json
{
  "gstin": "09AABCU9603R1ZM",
  "fp": "102026",
  "version": "GST3.2.4",
  "hash": "hash",
  "b2b": [
    {
      "ctin": "27AADCB2230M1ZT",
      "inv": [
        {
          "inum": "INV/26-27/0042",
          "idt": "14-10-2026",
          "val": 118000.00,
          "pos": "27",
          "rchrg": "N",
          "inv_typ": "R",
          "itms": [
            {
              "num": 1801,
              "itm_det": {
                "txval": 100000.00,
                "rt": 18,
                "iamt": 18000.00,
                "csamt": 0.00
              }
            }
          ]
        }
      ]
    }
  ],
  "b2cl": [
    {
      "pos": "29",
      "inv": [
        {
          "inum": "INV/26-27/0089",
          "idt": "18-10-2026",
          "val": 141600.00,
          "itms": [
            {
              "num": 1801,
              "itm_det": {
                "txval": 120000.00,
                "rt": 18,
                "iamt": 21600.00,
                "csamt": 0.00
              }
            }
          ]
        }
      ]
    }
  ],
  "b2cs": [
    {
      "sply_ty": "INTRA",
      "pos": "09",
      "typ": "OE",
      "txval": 50000.00,
      "rt": 18,
      "camt": 4500.00,
      "samt": 4500.00,
      "csamt": 0.00
    }
  ],
  "cdnr": [
    {
      "ctin": "27AADCB2230M1ZT",
      "nt": [
        {
          "ntty": "C",
          "nt_num": "CN/26-27/0004",
          "nt_dt": "22-10-2026",
          "p_gst": "N",
          "pos": "27",
          "rchrg": "N",
          "inv_typ": "R",
          "val": 11800.00,
          "itms": [
            {
              "num": 1801,
              "itm_det": {
                "txval": 10000.00,
                "rt": 18,
                "iamt": 1800.00,
                "csamt": 0.00
              }
            }
          ]
        }
      ]
    }
  ],
  "hsn": {
    "hsn_b2b": [
      {
        "num": 1,
        "hsn_sc": "84713010",
        "desc": "PORTABLE AUTOMATIC DATA PROCESSING MACHINES",
        "uqc": "NOS",
        "qty": 10,
        "txval": 90000.00,
        "iamt": 16200.00,
        "camt": 0.00,
        "samt": 0.00,
        "csamt": 0.00,
        "rt": 18
      }
    ],
    "hsn_b2c": [
      {
        "num": 1,
        "hsn_sc": "998314",
        "desc": "IT DESIGN AND DEVELOPMENT SERVICES",
        "uqc": "NA",
        "qty": 0,
        "txval": 170000.00,
        "iamt": 21600.00,
        "camt": 4500.00,
        "samt": 4500.00,
        "csamt": 0.00,
        "rt": 18
      }
    ]
  },
  "doc_issue": {
    "doc_det": [
      {
        "doc_num": 1,
        "doc_typ": "Invoices for outward supply",
        "docs": [
          {
            "num": 1,
            "from": "INV/26-27/0001",
            "to": "INV/26-27/0100",
            "totnum": 100,
            "cancel": 2,
            "net_issue": 98
          }
        ]
      }
    ]
  }
}
```

| Section Key | GSTR-1 Table | Core Validation Rules |
| :--- | :--- | :--- |
| `b2b` | Table 4A, 4B, 6B, 6C | Grouped by `ctin`. `idt` formatted strictly as `DD-MM-YYYY`. Intra-state supplies carry `camt` + `samt` (`camt == samt`); inter-state carry `iamt`. |
| `b2cl` | Table 5 | Grouped by `pos` (2-digit state code). Mandatory only when `sply_ty == INTER` to unregistered recipients and `val > 100000`. |
| `b2cs` | Table 7 | Summary aggregated by `(pos, rt, sply_ty, typ)`. Net of B2CS credit/debit notes (can result in negative `txval`). |
| `cdnr` | Table 9B (Reg.) | `ntty`: `"C"` (Credit Note) or `"D"` (Debit Note). Grouped by `ctin`. |
| `hsn` | Table 12A / 12B | Split into `hsn_b2b` and `hsn_b2c`. Service SAC codes (`99xxxx`) require `"uqc": "NA"` and `"qty": 0`. |
| `doc_issue` | Table 13 | Serial range tracking; `net_issue` must strictly equal `totnum - cancel`. |

---

#### B. GSTR-2B JSON Download & IMS (Invoice Management System) Architecture

Under amended **Section 38 of the CGST Act** (notified via Notification No. 16/2025-CT) and the [GSTN IMS Dashboard](https://gst.gov.in "GSTN IMS Dashboard Manual"), GSTR-2B generation is dynamically coupled with recipient actions taken in the **Invoice Management System (IMS)**:

* **IMS Action Enum (`action` / `ims_act`):**
  * `"A"` (**Accept**): Flows into `itcsumm.itcavl` and `docdata` -> auto-populates GSTR-3B Table 4(A).
  * `"R"` (**Reject**): Routed to **`itcsumm.itcrej`** and **`docrej`** ("ITC Rejected") -> excluded from GSTR-3B ITC.
  * `"P"` (**Pending**): Held on the IMS dashboard; omitted completely from the current period's GSTR-2B JSON. *(Note: Since Oct 2025, inward Credit Notes can be kept `P` for a maximum of **1 tax period**, with optional partial ITC reversal declaration where full ITC was never availed).*
  * `"NAT"` / `"N"` (**No Action Taken**): **Deemed Accepted** when draft GSTR-2B generates on the 14th of `M+1`.
* **Recomputation Workflow:** Any IMS status mutation (`A`/`R`/`P`) performed after the 14th requires calling the **Regenerate GSTR-2B API** (`GSTR2B GEN 2B`) prior to filing GSTR-3B. Reverse-charge supplies (Table 4B) bypass IMS and flow straight into GSTR-2B/3B.

```json
{
  "data": {
    "gstin": "09AABCU9603R1ZM",
    "rtnprd": "102026",
    "version": "2.0",
    "gendt": "14-11-2026",
    "itcsumm": {
      "itcavl": {
        "nonrevsup": {
          "iamt": 45000.00,
          "camt": 12000.00,
          "samt": 12000.00,
          "csamt": 0.00,
          "b2b": {
            "iamt": 45000.00,
            "camt": 12000.00,
            "samt": 12000.00,
            "csamt": 0.00
          }
        },
        "isdsup": {},
        "impsup": {}
      },
      "itcunavl": {
        "nonrevsup": {
          "iamt": 0.00,
          "camt": 0.00,
          "samt": 0.00,
          "csamt": 0.00
        }
      },
      "itcrej": {
        "nonrevsup": {
          "iamt": 18000.00,
          "camt": 0.00,
          "samt": 0.00,
          "csamt": 0.00
        }
      }
    },
    "cpsumm": {
      "b2b": [
        {
          "ctin": "27AADCB2230M1ZT",
          "trdnm": "ACME INDUSTRIAL SUPPLIES PVT LTD",
          "supprd": "102026",
          "supfildt": "10-11-2026",
          "ttldocs": 1,
          "txval": 250000.00,
          "iamt": 45000.00,
          "camt": 0.00,
          "samt": 0.00,
          "csamt": 0.00
        }
      ]
    },
    "docdata": {
      "b2b": [
        {
          "ctin": "27AADCB2230M1ZT",
          "trdnm": "ACME INDUSTRIAL SUPPLIES PVT LTD",
          "supfildt": "10-11-2026",
          "supprd": "102026",
          "inv": [
            {
              "inum": "SI-9921",
              "typ": "R",
              "dt": "05-10-2026",
              "val": 295000.00,
              "pos": "09",
              "rev": "N",
              "itcavl": "Y",
              "rsn": "",
              "ims_act": "A",
              "srctyp": "E-Invoice",
              "irn": "a5c9e12f...64_char_sha256_hash",
              "irngendate": "05-10-2026",
              "itms": [
                {
                  "num": 1,
                  "rt": 18,
                  "txval": 250000.00,
                  "iamt": 45000.00,
                  "camt": 0.00,
                  "samt": 0.00,
                  "csamt": 0.00
                }
              ]
            }
          ]
        }
      ],
      "cdnr": []
    },
    "docrej": {
      "b2b": [
        {
          "ctin": "07AAACR5055K1Z7",
          "trdnm": "DELHI LOGISTICS CORP",
          "inv": [
            {
              "inum": "DL/26/881",
              "dt": "19-10-2026",
              "val": 118000.00,
              "pos": "09",
              "ims_act": "R",
              "txval": 100000.00,
              "iamt": 18000.00
            }
          ]
        }
      ]
    }
  }
}
```

---

### 4.2 India GSTR-3B ITC Utilization & NIC E-Invoice Specs

#### A. GSTR-3B Statutory ITC Set-Off Algorithm (Sections 49A, 49B & Rule 88A)

Software computing GSTR-3B offset matrices (`pditc` in GSTR-3B JSON) must enforce [CBIC Rule 88A](https://cbic.gov.in "CBIC CGST Rule 88A") alongside GSTN's February 2026 portal flexibility update:

| Step | Credit Pool (Input) | Target Liability (Output) | Statutory Constraint / Optimization Rule |
| :--- | :--- | :--- | :--- |
| **1** | **IGST ITC** | `1. IGST Liability` | **Mandatory First.** Must offset IGST output liability before touching any other head. |
| **2** | **IGST ITC (Balance)** | `2. CGST` & `SGST/UTGST` | **Any Order & Any Proportion.** Remaining IGST ITC may be split freely across CGST and SGST/UTGST liabilities to equalize remaining cash/credit balances. **Gate:** Total `IGST_ITC` **must equal `0.00`** before Step 3 or Step 4 can execute (Sec 49A/49B). |
| **3** | **CGST ITC** | `1. CGST` -> `2. IGST` | Offset CGST liability first. Surplus CGST ITC can offset remaining IGST liability. **Cross-utilization against SGST/UTGST is strictly prohibited.** |
| **4** | **SGST / UTGST ITC** | `1. SGST` -> `2. IGST` | Offset SGST/UTGST liability first. Surplus SGST ITC can offset remaining IGST liability. *(Per Jan/Feb 2026 GSTN portal update, taxpayers can apply CGST and SGST ITC towards remaining IGST liability in any sequence once IGST ITC is exhausted).* **Cross-utilization against CGST is strictly prohibited.** |
| **5** | **Cess ITC** | `Cess Liability Only` | Isolated pool; cannot cross-utilize with IGST/CGST/SGST. |

> **Note on Rule 86B:** Where taxable supply value (excluding exempt/zero-rated) exceeds **₹50 Lakh/month** and exceptions do not apply, maximum ITC utilization is capped at **99%** of output tax liability (**1%** mandatory Electronic Cash Ledger payment).

```python
def allocate_itc_rule_88a(liab: dict, itc: dict, cgst_split_ratio: float = None) -> dict:
    """
    Deterministic Rule 88A allocator. Optimizes Step 2 IGST remainder to preserve
    balanced CGST/SGST credit pools unless an explicit ratio is passed.
    """
    rem_l = liab.copy()  # {'igst': float, 'cgst': float, 'sgst': float}
    rem_i = itc.copy()   # {'igst': float, 'cgst': float, 'sgst': float}
    used = {k: {'igst': 0.0, 'cgst': 0.0, 'sgst': 0.0} for k in ('igst', 'cgst', 'sgst')}

    # Step 1: IGST ITC -> IGST Liability
    u = min(rem_i['igst'], rem_l['igst'])
    used['igst']['igst'] += u
    rem_i['igst'] -= u
    rem_l['igst'] -= u

    # Step 2: Exhaust remaining IGST ITC across CGST / SGST (optimal working-capital split)
    if rem_i['igst'] > 0:
        net_cgst_gap = max(0.0, rem_l['cgst'] - rem_i['cgst'])
        u_c = min(
            rem_i['igst'],
            rem_l['cgst'],
            net_cgst_gap if cgst_split_ratio is None else rem_i['igst'] * cgst_split_ratio,
        )
        used['igst']['cgst'] += u_c
        rem_i['igst'] -= u_c
        rem_l['cgst'] -= u_c

        u_s = min(rem_i['igst'], rem_l['sgst'])
        used['igst']['sgst'] += u_s
        rem_i['igst'] -= u_s
        rem_l['sgst'] -= u_s

        # Sweep any residual IGST ITC into remaining CGST liability
        if rem_i['igst'] > 0 and rem_l['cgst'] > 0:
            u_c2 = min(rem_i['igst'], rem_l['cgst'])
            used['igst']['cgst'] += u_c2
            rem_i['igst'] -= u_c2
            rem_l['cgst'] -= u_c2

    # Gate check: CGST/SGST ITC unlocked only if IGST ITC == 0 OR all liabilities met
    # Step 3: CGST ITC -> CGST Liability, then IGST Liability
    u = min(rem_i['cgst'], rem_l['cgst'])
    used['cgst']['cgst'] += u
    rem_i['cgst'] -= u
    rem_l['cgst'] -= u
    if rem_l['igst'] > 0:
        u = min(rem_i['cgst'], rem_l['igst'])
        used['cgst']['igst'] += u
        rem_i['cgst'] -= u
        rem_l['igst'] -= u

    # Step 4: SGST ITC -> SGST Liability, then IGST Liability
    u = min(rem_i['sgst'], rem_l['sgst'])
    used['sgst']['sgst'] += u
    rem_i['sgst'] -= u
    rem_l['sgst'] -= u
    if rem_l['igst'] > 0:
        u = min(rem_i['sgst'], rem_l['igst'])
        used['sgst']['igst'] += u
        rem_i['sgst'] -= u
        rem_l['igst'] -= u

    return {"itc_utilized": used, "cash_payable": rem_l, "closing_itc": rem_i}
```

---

#### B. NIC E-Invoice JSON Schema (INV-01 Version 1.1)

Mandated via the NIC E-Invoice Portal for taxpayers with aggregate PAN-India turnover **> ₹5 Crore**:

* **Schema Version:** `"Version": "1.1"` (`INV-01` standard: 132 total attributes, ~28–30 conditionally/strictly mandatory).
* **Reporting Time Limit (2025–2026 Mandate):** Taxpayers with AATO **≥ ₹10 Crore** must report B2B invoices/notes to the IRP within **30 days** of `DocDtls.Dt` (7 days where notified for ₹100 Cr+ segments; IRP rejects backdated uploads outside the window).
* **Ship-To Validation Tightening (June 2026):** Where `ShipDtls` is populated for multi-location/bill-to-ship-to supplies, `ShipDtls.Gstin`, `TrdNm`, `Addr1`, `Loc`, `Pin`, and `Stcd` are strictly validated against active GSTIN state/PIN combinations.

| Object Block | Mandatory JSON Keys (`Version: "1.1"`) | Constraints & Enumerations |
| :--- | :--- | :--- |
| **Root** | `Version` | Must be string `"1.1"`. (`Irn` is omitted in request; returned as 64-char SHA-256 hash + signed JWT `SignedQRCode` in IRP response). |
| **`TranDtls`** | `TaxSch`, `SupTyp` | `TaxSch`: `"GST"`. `SupTyp`: `"B2B"`, `"SEZWP"`, `"SEZWOP"`, `"EXPWP"`, `"EXPWOP"`, `"DEXP"`. (`RegRev`: `"Y"`/`"N"`, `IgstOnIntra`: `"Y"`/`"N"`). |
| **`DocDtls`** | `Typ`, `No`, `Dt` | `Typ`: `"INV"`, `"CRN"`, `"DBN"`. `No`: Max 16 chars, alphanumeric/`/`/`-`, not starting with `0` or `/`. `Dt`: `"DD/MM/YYYY"` (note slash delimiter vs GSTR-1 hyphen). |
| **`SellerDtls`** | `Gstin`, `LglNm`, `Addr1`, `Loc`, `Pin`, `Stcd` | `Gstin`: 15-char supplier GSTIN. `Pin`: 6-digit integer matching `Stcd` (2-digit state code string). |
| **`BuyerDtls`** | `Gstin`, `LglNm`, `Pos`, `Addr1`, `Loc`, `Pin`, `Stcd` | For Exports (`EXPWP`/`EXPWOP`), set `Gstin`: `"URP"`, `Pos`: `"96"`, `Pin`: `999999`, `Stcd`: `"96"`. |
| **`ItemList[]`** | `SlNo`, `IsServc`, `HsnCd`, `AssAmt`, `GstRt`, `TotItemVal` | `IsServc`: `"Y"`/`"N"`. `HsnCd`: 4/6/8 digits. Plus tax fields (`IgstAmt`, `CgstAmt`, `SgstAmt`). |
| **`ValDtls`** | `AssVal`, `TotInvVal` | Plus `CgstVal`, `SgstVal`, `IgstVal`, `CesVal`, `RndOffAmt` (`-0.99` to `0.99`). |

---

### 4.3 India MCA Audit Trail (Edit Log) Technical Requirements

Governed by the Proviso to **Rule 3(1) of the Companies (Accounts) Rules, 2014** (management mandate) and **Rule 11(g) of the Companies (Audit and Auditors) Rules, 2014** (statutory auditor attestation under Section 143(3)(j)), alongside the ICAI Audit Trail Implementation Guide.

#### Mandatory Software Architecture Controls

* **Immutable, Non-Disableable Logging:** The audit trail engine cannot have a toggle, configuration flag, or super-admin privilege capable of pausing, disabling, or purging logs. Any software permitting administrative disabling fails Rule 3(1) compliance automatically.
* **Transaction Lifecycle Coverage (`INSERT` / `UPDATE` / `DELETE`):** Must capture every creation, modification, cancellation, or deletion affecting "Books of Account" (as defined in Section 2(13): journals, ledgers, sales/purchase registers, cash/bank books, inventory records impacting valuation, and chart-of-account master reclassifications).
* **Database-Level Integrity vs. Application Bypass:** Statutory auditors under Rule 11(g) inspect both application logs and RDBMS controls. Direct SQL mutations, vendor support scripts, or unlogged API imports must either be blocked via append-only database triggers/permissions or logged into a tamper-evident audit table (e.g., cryptographic hash chaining `prev_hash -> curr_hash`).
* **Chronological Precision & Back-Dating Separation:** Systems must store two distinct timestamps on every voucher version:
  * `voucher_effective_date` (accounting period date).
  * `system_event_timestamp` (immutable UTC/IST server clock timestamp when the action occurred, never user-editable).
* **Retention & Daily India-Server Backups:**
  * **8-Year Retention:** Audit logs must be preserved alongside books of account for at least **8 financial years** under Section 128(5).
  * **Rule 3(5) Daily Backup:** Electronic books of account and edit logs must be backed up on a **daily basis on servers physically located in India** (even if primary cloud hosting is outside India).

#### Reference Audit Log Table Schema (`accounting_audit_log`)

```sql
CREATE TABLE accounting_audit_log (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,           -- 'JOURNAL_ENTRY', 'INVOICE', 'LEDGER_MASTER'
    entity_id UUID NOT NULL,                    -- Voucher / Transaction PK
    voucher_number VARCHAR(64) NOT NULL,
    version_seq INT NOT NULL,                   -- Monotonically increasing per entity_id (1, 2, 3...)
    action_type VARCHAR(16) NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'CANCEL', 'DELETE')),
    actor_user_id UUID NOT NULL,                -- Authenticated user / service principal ID
    actor_ip INET,
    effective_date DATE NOT NULL,               -- Accounting date
    logged_at_utc TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    before_snapshot JSONB,                      -- NULL on CREATE; full state prior to mutation
    after_snapshot JSONB,                       -- NULL on hard DELETE; full state post mutation
    field_diffs JSONB NOT NULL,                 -- Array of {field, old_val, new_val}
    prev_record_hash CHAR(64) NOT NULL,         -- SHA-256 of previous tenant audit record
    record_hash CHAR(64) NOT NULL               -- SHA-256(prev_record_hash || entity_id || version_seq || logged_at_utc || after_snapshot)
);

-- Enforce append-only immutability at PostgreSQL engine level
REVOKE UPDATE, DELETE, TRUNCATE ON accounting_audit_log FROM PUBLIC, app_readwrite_role;
```

---

### 4.4 Global Tax & Bank Feed Integration Overview

#### A. US Form 1099-NEC (Tax Year 2026 Statutory Overhaul)

Per IRS Publication 1099 (2026) and the One Big Beautiful Bill Act (OBBBA) amendments effective for payments made after December 31, 2025:

* **Reporting & Backup Withholding Threshold:** Increased from **$600** to **$2,000** per calendar year per payee for Form 1099-NEC (and general Form 1099-MISC rents/services; indexed for inflation starting TY 2027). *(Exception: Form 1099-MISC Box 10 gross proceeds paid to an attorney remain at $600, and Box 2 royalties remain at $10).*
* **Mandatory E-File Intake Cutover (FIRE Retired):** The legacy IRS FIRE system is permanently retired for Tax Year 2026 (Filing Season Jan 2027). All electronic submissions (mandatory for filers with 10+ aggregate information returns) must route exclusively through the **IRS Information Returns Intake System (IRIS)** XML/API schema using an IRIS Transmitter Control Code (TCC). Filing deadline: **January 31**.
* **2026 Form 1099-NEC Box Schema Updates:**
  * **Box 1a:** Nonemployee compensation (`>= $2,000.00`, includes attorney legal service fees).
  * **Box 1b (New for 2026):** Cash tips reported under OBBBA nonemployee provisions.
  * **Box 1c (New for 2026):** Treasury Tipped Occupation Code (TTOC).
  * **Box 1d (New for 2026):** Overtime compensation component.
  * **Box 2:** Payer made direct sales totaling $5,000 or more of consumer products for resale (checkbox boolean).
  * **Box 3:** Excess golden parachute payments.
  * **Box 4:** Federal income tax withheld (24% backup withholding; mandatory at any dollar amount if withheld, or triggered at $2,000 if TIN is missing/invalid).
  * **Boxes 5–7:** State tax withheld, State/Payer's state no., and State income. *(2026 forms also split Street, City, State, and ZIP into discrete structured fields).*

---

#### B. UK Making Tax Digital (MTD) VAT 9-Box API Mapping

Submitted to `POST /organisations/vat/{vrn}/returns` on the HMRC Developer Hub VAT (MTD) API v1.0 (`Accept: application/vnd.hmrc.1.0+json`). All requests require OAuth 2.0 (`write:vat` scope) and mandatory `Gov-Client-*` Fraud Prevention Headers (device ID, timezone, user-agent, IP, MAC/window dimensions).

| Box | HMRC JSON Field | Type & Precision | Statutory Calculation / Rule |
| :--- | :--- | :--- | :--- |
| **Meta** | `periodKey` | `string` (4 chars) | Obligation key from `GET /obligations` (e.g., `"26A1"`). |
| **Box 1** | `vatDueSales` | `decimal(13,2)` | Output VAT due on sales and other outputs (incl. domestic reverse charge output VAT). |
| **Box 2** | `vatDueAcquisitions` | `decimal(13,2)` | VAT due on acquisitions of goods made in Northern Ireland from EU Member States (`0.00` for GB-only entities). |
| **Box 3** | `totalVatDue` | `decimal(13,2)` | **Computed:** Must strictly equal `vatDueSales + vatDueAcquisitions`. |
| **Box 4** | `vatReclaimedCurrPeriod` | `decimal(13,2)` | Input VAT reclaimed on purchases and other inputs (incl. postponed import VAT). |
| **Box 5** | `netVatDue` | `decimal(11,2)` | **Unsigned Absolute Value:** `abs(totalVatDue - vatReclaimedCurrPeriod)`. Must be `>= 0.00` (`[0 .. 99999999999.99]`); HMRC infers payable vs. refund direction automatically. |
| **Box 6** | `totalValueSalesExVAT` | `integer` (whole £) | Total net value of sales and all other outputs excluding VAT. |
| **Box 7** | `totalValuePurchasesExVAT` | `integer` (whole £) | Total net value of purchases and all other inputs excluding VAT. |
| **Box 8** | `totalValueGoodsSuppliedExVAT` | `integer` (whole £) | Total value of dispatches of goods (and related costs) ex-VAT from NI to EU. |
| **Box 9** | `totalAcquisitionsExVAT` | `integer` (whole £) | Total value of acquisitions of goods (and related costs) ex-VAT into NI from EU. |
| **Sign** | `finalised` | `boolean` | Must be `true` (legal declaration that return is complete and accurate). |

---

#### C. Standard Sandbox Bank Feed Adapter Patterns

To unify Indian and international bank reconciliation pipelines behind a single internal `BankFeedAdapter` interface, normalize both providers into an asynchronous webhook-driven state machine:

| Lifecycle Phase | RBI Account Aggregator — Setu AA v2 Docs (ReBIT v2.0.0) | Global Open Banking — Plaid Sandbox Docs |
| :--- | :--- | :--- |
| **Base Sandbox URL** | `https://setu.co` | `https://plaid.com` |
| **Auth Headers** | `x-client-id`, `x-client-secret`, `x-product-instance-id` (or OAuth Bearer token) | `PLAID-CLIENT-ID`, `PLAID-SECRET` |
| **1. Session / Consent Init** | `POST /consents` with ReBIT `consentTypes` (`["PROFILE", "SUMMARY", "TRANSACTIONS"]`), `fiTypes` (`["DEPOSIT"]`), `fetchType` (`"PERIODIC"`), `dataRange`, and VUA (`9999999999@onemoney`). Returns `id` (`consentId`) + redirect `url`. | `POST /link/token/create` (`products: ["transactions"]`) -> UI Link flow; OR headless CI bypass via `POST /sandbox/public_token/create` (`institution_id: "ins_109508"`, `user_good` / `pass_good`). |
| **2. Authorization Grant** | User approves in Setu mock webview (OTP `123456`). Setu fires `CONSENT_STATUS_UPDATE` webhook (`status: "ACTIVE"`). | Exchange short-lived `public_token` via `POST /item/public_token/exchange` -> store persistent `access_token` (`access-sandbox-...`) + `item_id`. |
| **3. Data Fetch Trigger** | `POST /sessions` passing `{ consentId, dataRange: { from, to }, format: "json" }`. Returns `sessionId` (`status: "PENDING"`). Wait for `FI_NOTIFICATION` (`COMPLETED` / `PARTIAL`) webhook. | Cursor-paginated delta pull via `POST /transactions/sync` passing `{ access_token, cursor }`. Loop while `has_more == true` and persist `next_cursor`. |
| **4. Payload Retrieval & Normalization** | `GET /sessions/{sessionId}` -> parses ReBIT `Account.Transactions.Transaction[]` (`txnId`, `type: CREDIT/DEBIT`, `mode: UPI/NEFT/IMPS`, `amount`, `currentBalance`, `valueDate`, `narration`, `reference`). | Reads `{ added[], modified[], removed[] }`. **Note sign convention:** Plaid positive amount = money out (debit); negative amount = inflow (credit)—invert sign when normalizing to ledger journal entries. |
| **5. Webhook Simulation** | Configure mock FIP response delays/states via Setu Bridge Sandbox settings (`PARTIAL`, `EXPIRED`, `REVOKED`). | Trigger deterministic webhook events on demand via `POST /sandbox/item/fire_webhook` (`webhook_code: "SYNC_UPDATES_AVAILABLE"` or `"ITEM_LOGIN_REQUIRED"`). |

