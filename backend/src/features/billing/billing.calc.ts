/** Philippine VAT, added on top of price-list prices when the clinic is VAT-registered. */
export const VAT_RATE = 0.12;
/** Senior citizen (RA 9994) and PWD (RA 10754) discount; their purchases are also VAT-exempt. */
export const SC_PWD_DISCOUNT_RATE = 0.2;

export const DISCOUNT_TYPES = ["none", "sc", "pwd"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export interface CalcLine {
  unitPrice: number;
  qty: number;
  hmoCoverable: boolean;
}

export interface CalcInput {
  lines: CalcLine[];
  discountType: DiscountType;
  /** Set when an HMO pays part of the bill. */
  hmo: boolean;
  vatRegistered: boolean;
}

export interface CalcLineResult {
  amount: number;
  discount: number;
  net: number;
}

export interface InvoiceTotals {
  lines: CalcLineResult[];
  /** Before discount and VAT. */
  subtotal: number;
  discountTotal: number;
  vatableSales: number;
  vatExemptSales: number;
  vat: number;
  /** What the invoice is for: net sales plus VAT. */
  total: number;
  /** The HMO's share; zero for SC/PWD bills, which the HMO doesn't take. */
  hmoDue: number;
  patientDue: number;
}

/** Rounds to centavos. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const sum = (values: number[]) => round2(values.reduce((a, b) => a + b, 0));

export function calculateInvoice({ lines, discountType, hmo, vatRegistered }: CalcInput): InvoiceTotals {
  const scPwd = discountType !== "none";
  const results = lines.map((l) => {
    const amount = round2(l.unitPrice * l.qty);
    const discount = scPwd ? round2(amount * SC_PWD_DISCOUNT_RATE) : 0;
    return { amount, discount, net: round2(amount - discount) };
  });
  const net = sum(results.map((r) => r.net));
  const vatApplies = vatRegistered && !scPwd;
  const vat = vatApplies ? round2(net * VAT_RATE) : 0;
  const total = round2(net + vat);
  const covered = sum(results.filter((_, i) => lines[i].hmoCoverable).map((r) => r.net));
  const hmoDue = hmo && !scPwd ? Math.min(total, round2(covered * (vatApplies ? 1 + VAT_RATE : 1))) : 0;
  return {
    lines: results,
    subtotal: sum(results.map((r) => r.amount)),
    discountTotal: sum(results.map((r) => r.discount)),
    vatableSales: vatApplies ? net : 0,
    vatExemptSales: vatRegistered && scPwd ? net : 0,
    vat,
    total,
    hmoDue,
    patientDue: round2(total - hmoDue),
  };
}
