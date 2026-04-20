# Recipe Nutrition Report Design

## Goal

Allow staff to upload a PDF nutrition report for the current recipe record, and allow customers to download/open that report from the WeChat miniapp recipe detail page only when the report exists.

## Scope

- The report is bound to the current recipe record/version.
- If a recipe has no uploaded report, the miniapp detail page shows no report entry.
- Reports are PDF files uploaded through the admin web and stored in COS.

## Architecture

The existing `Recipe.nutritionReportUrl` Prisma field is the source of truth. The backend adds a dedicated admin upload endpoint for PDF reports and includes `nutritionReportUrl` in admin/public recipe detail responses. The admin web writes this URL as part of the normal recipe form save flow. The miniapp displays a conditional button and opens the PDF through `uni.downloadFile` and `uni.openDocument`.

## Data Flow

1. Staff selects a PDF on `admin-web/src/views/Recipes/RecipeForm.vue`.
2. Admin web uploads it to `POST /api/v1/admin/recipes/upload-nutrition-report`.
3. Backend validates that the file is a PDF and stores it under `recipe-nutrition-reports/` in COS.
4. Admin web stores the returned URL in `form.nutritionReportUrl`.
5. On save, backend persists the URL to `recipe.nutritionReportUrl`.
6. Miniapp loads `GET /api/v1/recipes/:id`; if `nutritionReportUrl` is present, it renders a report download entry.
7. Customer taps the entry; miniapp downloads and opens the PDF.

## Error Handling

- Backend rejects missing files and non-PDF files with a clear 400 response.
- Admin web rejects non-PDF files before upload and shows upload/delete errors.
- Miniapp shows a toast if the report cannot be downloaded or opened.

## Testing

- Backend tests cover admin upload validation and recipe detail response passthrough.
- Admin web build/type-check covers API/type/form integration.
- Miniapp regression test checks conditional rendering and PDF open code paths.
- Final verification includes backend focused tests, admin build, and miniapp build.
