export const PURCHASE_DRAFTS_KEY = "shopflow_purchase_drafts";

export type PurchaseDraft = {
  id: string;
  supplierName: string;
  purchaseDate: string;
  itemCount: number;
  savedAt: string;
  values: Record<string, unknown>;
  withGST: boolean;
};

export function readDrafts(): PurchaseDraft[] {
  try {
    const raw = localStorage.getItem(PURCHASE_DRAFTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PurchaseDraft[];
  } catch {
    return [];
  }
}

export function writeDrafts(drafts: PurchaseDraft[]): void {
  localStorage.setItem(PURCHASE_DRAFTS_KEY, JSON.stringify(drafts));
}

export function upsertDraft(draft: PurchaseDraft): void {
  const drafts = readDrafts();
  const idx = drafts.findIndex((d) => d.id === draft.id);
  if (idx >= 0) {
    drafts[idx] = draft;
  } else {
    drafts.push(draft);
  }
  writeDrafts(drafts);
}

export function removeDraft(id: string): void {
  writeDrafts(readDrafts().filter((d) => d.id !== id));
}
