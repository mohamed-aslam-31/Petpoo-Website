import { useQuery } from "@tanstack/react-query";

export interface CreditStatus {
  creditLimit: number;
  outstanding: number;
  availableCredit: number;
  creditStatus: "within_limit" | "over_limit" | "no_limit";
}

export function useCreditStatus(customerId: number | null | undefined) {
  return useQuery<CreditStatus>({
    queryKey: ["credit-status", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/credit-status`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to fetch credit status");
      }
      return res.json();
    },
    enabled: !!customerId && customerId > 0,
    staleTime: 30_000,
  });
}
