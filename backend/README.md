# Shopping barcode increment

## Link an unrecognized barcode to an older saved item

In Shopping Mode, scan or enter the barcode, choose **Link barcode to a saved item**, search the complete saved catalog, select an item and (where available) a variant, then tap **Link & Add to Cart**. The existing purchase endpoint saves the UPC alias even without a price. The saved category and master/variant IDs are retained; no duplicate master item is created.

This frontend increment reuses `webGetRecipeItemChoices`, `webGetItemVariants`, `webAddOrMergeItem`, and `webShoppingScanPurchase`; Apps Script remains at version 92. Search and variant responses are ignored after cancellation, a new scan, or a newer choice. Test with `node --test backend/*.test.mjs worker/proxy.test.mjs`.

Deployed to the existing Apps Script web app as version 92 on October 29, 2026. The deployment ID and access settings are unchanged.

`ShoppingUpcAliases.gs` is a new companion module. Two small edits connect it to the existing project:

1. In `grocery backend.gs`, add `webResolveShoppingUpc: webResolveShoppingUpc,` to the `familyCenterRpc_` allowlist.
2. In `ShoppingMode_v1.gs`, inside `webShoppingScanPurchase`, immediately before `SpreadsheetApp.flush()`, add:

```javascript
if (isPurchased) shoppingRememberUpc_(found.values, upc, source);
```

The caller already holds the script lock. The helper does not acquire another lock. It stores the UPC even when no price is available. `UPC Aliases` is created automatically on the first valid purchase scan, with UPC, Item_ID, Variant_ID, Source, Updated columns. IDs and UPCs are stored as text. Existing sheets are not migrated or rewritten.

Lookup checks saved aliases, then Items column L and Item Variants column F. Inactive products are excluded. UPC-A and zero-prefixed EAN-13 share an alias; Kroger's company/item UPC core is supported for master matches. Ambiguous matches require a product choice. Existing master items and variants are added with `webAddOrMergeItem`, preserving their identity.

Frontend order: current weekly list, saved master/alias lookup, Kroger, manual entry. A saved alias that identifies an existing weekly row purchases that row. Lookup failures require a rescan rather than creating duplicates.

Validation: `node --test backend/shopping-upc.test.mjs worker/proxy.test.mjs`; inline frontend and Apps Script module syntax checks; deployed read-only lookup and existing API checks. Physical camera scanning and a real purchase write still need testing on family devices.

Rollback: restore Apps Script deployment version 91 and frontend commit `1c30481233f77877ce421a9d5b5c0f2626ac079b`. Keep the alias sheet for later reuse.
