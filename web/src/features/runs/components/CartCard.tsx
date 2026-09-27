import { Badge, Card, Icon, Money } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import type { Cart } from "@/types/domain";

/** The seller's signed offer, exactly as it would be paid. */
export function CartCard({ cart }: { cart: Cart }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm text-muted">Cart from</span>
          <h3 className="font-display text-lg font-semibold">{cart.sellerName}</h3>
        </div>
        {cart.sellerSignatureValid ? (
          <Badge tone="crypto">Signed by seller</Badge>
        ) : (
          <Badge tone="bad">Signature invalid</Badge>
        )}
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Items in the cart</caption>
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="pb-2 font-semibold">Item</th>
            <th className="pb-2 pl-3 text-right font-semibold">Qty</th>
            <th className="pb-2 pl-3 text-right font-semibold">Price</th>
            <th className="pb-2 pl-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-y border-line">
          {cart.lines.map((l) => (
            <tr key={l.sku}>
              <td className="py-2.5 pr-2">
                <span className="font-semibold">{l.name}</span>
                <span className="block text-xs text-muted">
                  {[l.brand, l.model].filter(Boolean).join(" ") || "No brand"}
                  {l.packSize > 1 ? ` · pack of ${l.packSize}` : ""}
                </span>
              </td>
              <td className="py-2.5 pl-3 text-right tabular-nums">{l.quantity}</td>
              <td className="py-2.5 pl-3 text-right whitespace-nowrap"><Money amountMinor={l.unitPriceMinor} /></td>
              <td className="py-2.5 pl-3 text-right font-semibold whitespace-nowrap"><Money amountMinor={l.lineTotalMinor} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="pt-2.5 text-muted">Delivery</td>
            <td className="pt-2.5 text-right">{cart.deliveryFeeMinor ? <Money amountMinor={cart.deliveryFeeMinor} /> : "Free"}</td>
          </tr>
          <tr>
            <td colSpan={3} className="pt-1.5 font-semibold">Total</td>
            <td className="pt-1.5 text-right font-display text-xl font-bold"><Money amountMinor={cart.totalMinor} /></td>
          </tr>
        </tfoot>
      </table>

      <div className="grid gap-3 rounded-lg bg-surface-2/70 p-3 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <Icon name="clock" className="mt-0.5 size-4 text-muted" />
          <div className="flex flex-col">
            <span className="text-muted">Delivery by</span>
            <span className="font-semibold">{formatDateTime(cart.deliveryBy)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Icon name="bank" className="mt-0.5 size-4 text-muted" />
          <div className="flex min-w-0 flex-col">
            <span className="text-muted">Paid to</span>
            <span className="truncate font-semibold">{cart.payee.nameOnAccount}</span>
            <span className="text-xs text-muted">{cart.payee.bankName} {cart.payee.accountNumberMasked}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
