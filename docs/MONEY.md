# Money types and units (FIN-BUG-001)

## Contract

| Domain | Prisma / DB type | Stored unit | Typical API shape |
|--------|------------------|-------------|-------------------|
| Commerce (products, cart, orders, refunds, `promotion_usages`) | `Int` | Whole LKR | JSON numbers (LKR) |
| Finance ledger (wallet, withdrawals, settlements, platform earnings, Jason ledger) | `Decimal(20,4)` | Integer **cents** | Cent strings |
| `delivery_jobs.totalDeliveryFees` | `Decimal(20,4)` | Integer **cents** | Whole-LKR strings (via boundary) |
| `delivery_payouts.amount` | `Decimal(20,4)` | Integer **cents** | `amount` / `amountLkr` as LKR numbers |

Fractional rupees in commerce (`Int` columns) are tracked separately as REG-BUG-002.

## Boundary

All `× 100` / `÷ 100` between commerce LKR and finance cents must go through [`backend/src/lib/moneyDecimal.ts`](../backend/src/lib/moneyDecimal.ts):

- `lkrToCents` / `centsToLkr` — in-process conversion
- `lkrToDecimal` — write whole-LKR commerce values into finance Decimal columns
- `centsToDecimal` — write integer cents into finance Decimal columns
- `decimalFieldToCentsNumber` / `decimalFieldToLkrNumber` — read finance Decimals
- `promoUsagePaybackLkr` — `promotion_usages.platformPaybackAmount` (Int LKR)
- `settlementPaybackCents` — settlement / platform earning payback Decimals (cents)

Wallet admin UIs divide cent strings by 100 for display; order UIs treat API numbers as whole LKR directly.
