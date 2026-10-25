import { estimateMonthlyCost, type Design } from '@/core';
import { fmtUsd } from '@/lib/format';

export function CostPanel({ design }: { design: Design }) {
  const { totalUsd, lines } = estimateMonthlyCost(design);
  const billable = lines.filter((l) => l.monthlyUsd > 0);
  return (
    <div className="p-4">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Estimated monthly cost</div>
        <div className="font-num text-3xl font-semibold text-text">{fmtUsd(totalUsd)}</div>
      </div>
      {billable.length === 0 ? (
        <p className="text-sm text-muted">Add components to see their cost.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="pb-2 font-medium">Component</th>
              <th className="pb-2 text-right font-medium">Replicas</th>
              <th className="pb-2 text-right font-medium">$/mo</th>
            </tr>
          </thead>
          <tbody>
            {billable.map((l) => (
              <tr key={l.nodeId} className="border-t border-line">
                <td className="py-2 pr-2 text-text">{l.label}</td>
                <td className="py-2 text-right font-num text-muted">{l.replicas}</td>
                <td className="py-2 text-right font-num">{fmtUsd(l.monthlyUsd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td className="pt-2">Total</td>
              <td />
              <td className="pt-2 text-right font-num">{fmtUsd(totalUsd)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      <p className="mt-4 text-[11px] text-muted/80">Autoscaled services are billed at their baseline replica count. Challenges have a budget, so reliability has to be worth what it costs.</p>
    </div>
  );
}
