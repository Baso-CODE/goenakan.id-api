// src/config/permissions.ts

export const PERMISSION_MODULES = [
  "analytics",
  "cashflow",
  "client",
  "contact_message",
  "currency",
  "department",
  "finance",
  "logistic",
  "invoice",
  "invoice_note",
  "shipment_note_category",
  "order",

  // Product
  "product",
  "product_attribute",
  "product_category",
  "item_category",
  "item_name",
  "material_type",
  "supplier_cogs",
  "product_tag",

  "purchase_channel",
  "purchase_order",

  // Quotation
  "quotation",
  "quotation_note_category",

  "replacement_order",
  "role",
  "sales",
  "user",

  // Vendor
  "vendor",
  "vendor_category",
  "vendor_item",
  "contact_platform",

  // Content
  "article",
  "article_banner",
  "article_category",
  "article_seo",
  "banner_product",
  "popup_banner",
  "best_price_guarantee",
  "brand_client",
  "client_logo",
  "event_category",
  "faq",
  "hero",
  "policy",
  "portfolio",
  "app_setting",
  "success_story",

  "sample_history",
] as const;

export const PERMISSION_ACTIONS = [
  "read",
  "create",
  "update",
  "delete",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionName = `${PermissionAction}_${PermissionModule}`;
