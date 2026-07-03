---
name: FormLabel outside FormField
description: Using shadcn FormLabel outside a FormField context throws "useFormField should be used within <FormField>". Use plain <label> instead.
---

## Rule
When building dynamic field arrays with `useFieldArray`, the row sub-fields (Qty, Price, GST%, etc.) are rendered outside a `<FormField>` wrapper. Using `<FormLabel>` there crashes at runtime.

**Why:** shadcn's `FormLabel` calls `useFormField()` internally which reads from a React context that only exists inside `<FormField render={...}>`.

**How to apply:** In `useFieldArray` row renderers, replace `<FormLabel className="text-xs">Qty</FormLabel>` with `<label className="text-xs font-medium leading-none mb-1 block">Qty</label>`.
