#!/usr/bin/env bash
# Build the demo project the website tour is filmed on: a small, clean TypeScript
# shop. `main` has the cart; branch `feature/discount-codes` adds discount codes —
# with the bug the review finds (no rounding, no clamp, and a VIP rule of 120%).
#
#   scripts/demo/fixtures/make-shop.sh <dir>     # wipes and recreates <dir>
#
# Line numbers matter: the tour points at cart.ts:6 (line total), :7 (rule lookup)
# and :11 (the return). Keep them stable if you edit the sources.
set -euo pipefail
dir="${1:?usage: make-shop.sh <dir>}"
rm -rf "$dir"
mkdir -p "$dir/src"
cd "$dir"

git init -q -b main
git config user.name "Maya Chen"
git config user.email "maya@acme.dev"

cat >package.json <<'EOF'
{
  "name": "acme-shop",
  "version": "0.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p .",
    "test": "node --test dist"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
EOF

cat >tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "rootDir": "src",
    "outDir": "dist",
    "skipLibCheck": true
  },
  "include": ["src"]
}
EOF

cat >.gitignore <<'EOF'
node_modules/
dist/
.reado/
.mcp.json
.claude/
EOF

cat >README.md <<'EOF'
# acme-shop

Cart and checkout for the Acme storefront.

- `src/cart.ts` — cart totals
- `src/money.ts` — money helpers (integer cents)
EOF

cat >src/types.ts <<'EOF'
export interface CartItem {
  sku: string
  name: string
  /** Unit price in dollars. */
  price: number
  qty: number
}

export interface DiscountRule {
  /** Fraction off the total: 0.1 is 10% off. */
  percent: number
  label: string
}
EOF

cat >src/money.ts <<'EOF'
/** Round a dollar amount to whole cents. */
export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100
}

/** Keep a value inside [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
}
EOF

cat >src/cart.ts <<'EOF'
import type { CartItem } from "./types.js"

/** Sum of every line: unit price times quantity. */
export function subtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0)
}

export function itemCount(items: CartItem[]): number {
  return items.reduce((n, i) => n + i.qty, 0)
}
EOF
git add -A
git commit -q -m "cart: subtotal and item count"

git checkout -q -b feature/discount-codes

cat >src/discounts.ts <<'EOF'
import type { DiscountRule } from "./types.js"

/** Active promo codes, keyed by the code the customer types at checkout. */
export const DISCOUNTS: Record<string, DiscountRule> = {
  WELCOME10: { percent: 0.1, label: "Welcome — 10% off" },
  SPRING25: { percent: 0.25, label: "Spring sale — 25% off" },
  VIP: { percent: 1.2, label: "VIP — 20% off" },
}
EOF

cat >src/cart.ts <<'EOF'
import type { CartItem } from "./types.js"
import { DISCOUNTS } from "./discounts.js"

// Apply a discount code to the cart and return the amount due.
export function applyDiscount(items: CartItem[], code: string): number {
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)
  const rule = DISCOUNTS[code.trim().toUpperCase()]
  if (!rule) return total

  // percent off, applied to the running total
  return total - total * rule.percent
}

/** Sum of every line: unit price times quantity. */
export function subtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0)
}

export function itemCount(items: CartItem[]): number {
  return items.reduce((n, i) => n + i.qty, 0)
}
EOF
git add -A
git commit -q -m "checkout: discount codes"
echo "acme-shop ready at $dir (branch feature/discount-codes, reviewing against main)"
