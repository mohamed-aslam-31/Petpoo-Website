---
name: OpenAPI code generation path
description: Workspace-specific Orval input resolution behavior for shared API client generation.
---

Orval must receive the OpenAPI file through an absolute path resolved from the generator config directory; its relative `./openapi.yaml` target can fail when invoked through the workspace package filter.

**Why:** A failed generation cleans the generated client directories before reporting the unresolved input, temporarily removing shared API types.

**How to apply:** Keep the input target config-relative and absolute, and restore or regenerate generated outputs immediately if a generation attempt fails after cleaning.