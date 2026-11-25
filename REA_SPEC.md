# REA Feature Specification: Tally Keyboard Voucher Flow & QuickBooks Split-Screen Bank Recon

## Scope and Guardrails
- **Target Features (Scoped to 2 Core UX Flows):**
  1. Tally Prime keyboard-first voucher switching (`F4` Contra, `F5` Payment, `F6` Receipt, `F7` Journal, `F8` Sales, `F9` Purchase), `Alt+G` Go-To command palette, and Enter-key field progression without mouse clicks.
  2. QuickBooks split-screen Bank Feed matching drawer (left: imported bank statement lines; right: suggested book vouchers / quick-add rule match with instant reconciliation delta).
- **Out of Scope:** Proprietary TDL binary formats, Tally `.900` binary storage, or reverse-engineering commercial SaaS private endpoints.
- **Hardware Constraint:** Clean-room UI observation via Brave DevTools (optionally assisted by AWS Quick Chromium extension on public docs/demos) on 8 GB RAM Linux Mint.

## Bucket 1: Observations (Direct Verifiable Facts)
- Tally accountants post 50+ vouchers/hour because every voucher type maps to a single function key (`F4–F9`), ledgers auto-complete with arrow keys, and balance difference (`Dr != Cr`) blocks save until zeroed.
- QuickBooks users reconcile faster because bank lines display exact match badges ("1 Match Found: Payment #1042") with 1-click "Match" or "Add + Create Rule" actions.

## Bucket 2: Derivations (Logically Proven Mechanics)
- Voucher drawer keyboard handler must intercept `F4–F9` (with `preventDefault()`), `Alt+G`, `Esc`, and `Ctrl+Enter` safely only when no conflicting native input shortcut is active.
- Bank matching requires a deterministic scoring function: exact amount match (`+60`), date within ±3 days (`+25`), cheque/UTR reference substring match (`+15`).

## Bucket 3: Inferences (Educated Architectural Hypotheses)
- Keeping a unified `VoucherForm` schema that adapts line columns based on `voucher_type` (Journal/Payment/Receipt vs. Item Invoice) prevents duplicating 6 separate forms. (High confidence)

## Bucket 4: Unknowns and Validation Tests
- Browser interception of `F4`–`F9` varies slightly across Brave/Linux Mint (e.g., `F5` triggers page refresh if `e.preventDefault()` is missed). -> **Test Plan:** Bind `Alt+4` through `Alt+9` as universal backup chords alongside `F4–F9` and verify in Brave Linux Mint during Milestone 1.

## Clean-Room Implementation Spec
- Implement `frontend/src/hooks/useKeymap.ts` + `CommandPalette.tsx` (`Alt+G`) in Milestone 1, and `BankingReconWorkbench.tsx` with the deterministic match-scoring engine in Milestone 4.
