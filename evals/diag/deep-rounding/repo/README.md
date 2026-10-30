# billing

Invoices, refunds and reports for the shop.

## Layout
- `src/billing/`: invoices, line items, tax, refunds, the product catalog.
- `src/lib/money/`: cent arithmetic shared by billing.
- `src/lib/math/`: general number helpers, used by reports.
- `src/reports/`: monthly reports.
- `src/legacy/`: the pre-2024 money module. Deprecated; nothing imports it any more.

## Money rules
1. All amounts are integers in cents. Discount lines have a negative unit price.
2. A line's amount is unit cents × quantity.
3. Tax is computed **per line**, on the line amount, then rounded to whole cents **half away from zero**: 2.5 → 3,
   -2.5 → -3, 2.4 → 2, -2.4 → -2. A discount line's tax is negative.
4. An invoice total is the sum of line amounts plus the sum of line taxes.
5. A refund keeps part of the payment: the refund is the paid amount × the refund rate, negative (money going back),
   rounded the same way as tax.
6. Reports show averages with two decimals (`roundTo` in `src/lib/math`); they never touch cents.
