import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface CreditLimitErrorData {
  error: string;
  message?: string;
  creditLimit: number;
  outstanding: number;
  availableCredit: number;
  newAmount: number;
  projectedOutstanding: number;
  excessAmount: number;
}

const fmtINR = (v: number) =>
  `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface CreditLimitWarningProps {
  data: CreditLimitErrorData;
  isAdmin: boolean;
  adminOverride: boolean;
  onToggleOverride: (checked: boolean) => void;
}

export function CreditLimitWarning({
  data,
  isAdmin,
  adminOverride,
  onToggleOverride,
}: CreditLimitWarningProps) {
  return (
    <Alert variant="destructive" className="border-red-300 bg-red-50">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="font-semibold">Credit Limit Exceeded</AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <Row label="Credit Limit" value={fmtINR(data.creditLimit)} />
          <Row label="Current Outstanding" value={fmtINR(data.outstanding)} />
          <Row label="This Transaction" value={fmtINR(data.newAmount)} />
          <Row
            label="Projected Outstanding"
            value={fmtINR(data.projectedOutstanding)}
            highlight="over"
          />
          <Row
            label="Excess Amount"
            value={fmtINR(data.excessAmount)}
            highlight="over"
          />
        </div>

        {isAdmin ? (
          <div className="pt-2 border-t border-red-200 flex items-start gap-2">
            <Checkbox
              id="admin-override"
              checked={adminOverride}
              onCheckedChange={(c) => onToggleOverride(c === true)}
              className="mt-0.5 border-red-400 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
            />
            <div>
              <Label
                htmlFor="admin-override"
                className="text-sm font-semibold text-red-800 cursor-pointer flex items-center gap-1.5"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin Override — proceed past credit limit
              </Label>
              <p className="text-xs text-red-700 mt-0.5">
                Checking this box will allow the transaction even though the customer's credit limit would be exceeded.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-red-700 pt-1 border-t border-red-200">
            This transaction cannot proceed. Contact an admin to override the credit limit.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

function Row({
  label, value, highlight,
}: {
  label: string;
  value: string;
  highlight?: "over";
}) {
  return (
    <>
      <span className="text-red-700 font-medium">{label}</span>
      <span className={`font-bold ${highlight === "over" ? "text-red-800" : "text-red-700"}`}>
        {value}
        {highlight === "over" && (
          <Badge className="ml-1.5 bg-red-200 text-red-800 border-red-300 text-xs py-0 px-1.5 hover:bg-red-200">!</Badge>
        )}
      </span>
    </>
  );
}
