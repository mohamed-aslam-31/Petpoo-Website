import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CreditCard, TrendingDown, AlertCircle, CheckCircle2 } from "lucide-react";

export interface CreditStatusData {
  creditLimit: number;
  outstanding: number;
  availableCredit: number;
  creditStatus: "within_limit" | "over_limit" | "no_limit";
}

const fmtINR = (v: number) =>
  `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface CreditLimitStatusProps {
  data: CreditStatusData;
  /** Show as 4 small inline stats (default false = stacked card layout) */
  compact?: boolean;
  /** Show projected outstanding for an in-progress transaction */
  projectedAmount?: number;
}

export function CreditLimitStatus({ data, compact, projectedAmount }: CreditLimitStatusProps) {
  const { creditLimit, outstanding, availableCredit, creditStatus } = data;

  const isUnlimited = creditStatus === "no_limit";
  const isOverLimit = creditStatus === "over_limit";
  const projectedOutstanding = projectedAmount != null ? outstanding + projectedAmount : null;
  const wouldExceed =
    projectedOutstanding != null && !isUnlimited && projectedOutstanding > creditLimit;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5 text-violet-500" />
          <span className="text-muted-foreground">Limit:</span>
          <span className="font-semibold">{isUnlimited ? "Unlimited" : fmtINR(creditLimit)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-muted-foreground">Outstanding:</span>
          <span className="font-semibold text-amber-700">{fmtINR(outstanding)}</span>
        </div>
        {!isUnlimited && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Available:</span>
            <span className={`font-semibold ${availableCredit <= 0 ? "text-red-600" : "text-green-700"}`}>
              {fmtINR(availableCredit)}
            </span>
          </div>
        )}
        <CreditStatusBadge status={creditStatus} />
        {projectedOutstanding != null && (
          <div className={`flex items-center gap-1.5 ${wouldExceed ? "text-red-700" : "text-green-700"}`}>
            {wouldExceed
              ? <AlertCircle className="h-3.5 w-3.5" />
              : <CheckCircle2 className="h-3.5 w-3.5" />}
            <span className="text-xs">
              Projected: {fmtINR(projectedOutstanding)}
              {wouldExceed && ` (+${fmtINR(projectedOutstanding - creditLimit)} over)`}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard
        label="Credit Limit"
        value={isUnlimited ? "Unlimited" : fmtINR(creditLimit)}
        color="text-violet-700"
        bg="bg-violet-50"
        icon={<CreditCard className="h-4 w-4 text-violet-600" />}
      />
      <StatCard
        label="Outstanding"
        value={fmtINR(outstanding)}
        color={outstanding > 0 ? "text-amber-700" : "text-green-700"}
        bg={outstanding > 0 ? "bg-amber-50" : "bg-green-50"}
        icon={<TrendingDown className={`h-4 w-4 ${outstanding > 0 ? "text-amber-600" : "text-green-600"}`} />}
      />
      {!isUnlimited && (
        <StatCard
          label="Available Credit"
          value={fmtINR(availableCredit)}
          color={availableCredit <= 0 ? "text-red-700" : "text-green-700"}
          bg={availableCredit <= 0 ? "bg-red-50" : "bg-green-50"}
          icon={<CreditCard className={`h-4 w-4 ${availableCredit <= 0 ? "text-red-600" : "text-green-600"}`} />}
        />
      )}
      <StatCard
        label="Credit Status"
        value={
          <CreditStatusBadge status={creditStatus} />
        }
        color=""
        bg="bg-slate-50"
        icon={isOverLimit
          ? <AlertCircle className="h-4 w-4 text-red-500" />
          : <CheckCircle2 className="h-4 w-4 text-green-500" />}
      />
    </div>
  );
}

function StatCard({
  label, value, color, bg, icon,
}: {
  label: string;
  value: ReactNode;
  color: string;
  bg: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3 flex items-center gap-2.5">
      <div className={`p-1.5 rounded-md ${bg}`}>{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className={`text-sm font-bold ${color}`}>{value}</div>
      </div>
    </div>
  );
}

export function CreditStatusBadge({
  status,
}: {
  status: "within_limit" | "over_limit" | "no_limit";
}) {
  if (status === "no_limit") {
    return <Badge variant="secondary" className="text-xs">No Limit</Badge>;
  }
  if (status === "over_limit") {
    return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs">Over Limit</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 text-xs">Within Limit</Badge>;
}
