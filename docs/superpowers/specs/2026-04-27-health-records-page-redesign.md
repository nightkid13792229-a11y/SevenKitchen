# Health Records Page Redesign

Date: 2026-04-27

## Context

The miniapp health records page has repeated persistence issues because the UI behaves like single-record editing while the data layer saves entire health record arrays through `PUT /dogs/:dogId`. This mismatch can overwrite unrelated records, make saved records appear missing, and force the frontend to guess whether a returned dog profile contains the latest record.

This redesign replaces array-level health record saving with per-record CRUD and updates the page interaction model to match that data model.

## Goals

- Make each health record save affect only one record.
- Prevent saving a checkup from clearing medical history, allergies, or other sections.
- Keep the page easy for new users by using clear categories and inline editing.
- Preserve the diet reminder feature while separating it from health record persistence.
- Support attachment upload, preview, delete, and recognizable attachment names for all record categories.

## Non-Goals

- Do not add advanced filtering, search, charts, or timeline analytics in this iteration.
- Do not redesign the home page entry beyond keeping the existing health record entry working.
- Do not migrate health records into a new database model; use the existing medical, checkup, and allergy record tables.

## Product Decisions

### Page Structure

Use a health records center layout:

- Top area: dog selector.
- Main category control: `病史`, `体检`, `过敏`.
- Current category content: record cards for that category.
- Add action: `新增病史`, `新增体检`, or `新增过敏`, depending on the active category.
- Diet reminder: an independent card on the same page with its own save button.

### Category Colors

Use light category colors for recognition without turning the page into three separate themes:

- `病史`: warm coral/red accent for illness and treatment.
- `体检`: teal/blue-green accent for health assessment.
- `过敏`: amber/orange accent for warnings and risk.

Use these colors on selected tab state, card accent strip, and small type badges. Keep primary action buttons in the app's normal green style.

### Record Editing

Use inline card expansion:

- Record cards are collapsed by default.
- Tapping `编辑` expands that card into a form.
- Tapping `新增...` creates a draft card and expands it immediately.
- Each expanded card owns its own actions: `保存这一条`, `撤销`, and `删除`.
- Remove any global `保存记录` action for medical, checkup, and allergy records.

This makes the interaction match the data model: one visible card, one save request, one persisted record.

### Diet Reminder

Keep diet reminder on the health records page as an independent card:

- It only edits `pickyFoods`.
- It uses its own `保存饮食提醒` button.
- It does not trigger health record save logic.
- It does not read or write medical, checkup, or allergy record arrays.

## Data Model And API

### Health Records

Stop using `dogApi.updateHealthRecords()` and `PUT /dogs/:dogId` for health records.

Use existing health record resources instead:

- Medical:
  - `GET /dogs/:dogId/medical-records`
  - `POST /dogs/:dogId/medical-records`
  - `PUT /dogs/:dogId/medical-records/:id`
  - `DELETE /dogs/:dogId/medical-records/:id`
- Checkup:
  - `GET /dogs/:dogId/checkups`
  - `POST /dogs/:dogId/checkups`
  - `PUT /dogs/:dogId/checkups/:id`
  - `DELETE /dogs/:dogId/checkups/:id`
- Allergy:
  - `GET /dogs/:dogId/allergies`
  - `POST /dogs/:dogId/allergies`
  - `PUT /dogs/:dogId/allergies/:id`
  - `DELETE /dogs/:dogId/allergies/:id`

### Backend Compatibility Fixes

Apply these backend adjustments so the existing UI can use the independent APIs cleanly:

- Checkup type must be free text, not a fixed enum, because the product decision is to keep low-friction custom input.
- Medical update DTO must accept `attachments`.
- Medical response DTO must expose `attachments`.
- Checkup UI `notes` maps to backend `findings`.
- Medical `status` is not shown in the current UI; new medical records default to `TREATING`.

### Attachments

All three categories support attachments:

- Medical: medical history photos, prescriptions, lab reports.
- Checkup: exam reports and checkup documents.
- Allergy: allergy tests, reaction photos, and related records.

Attachment behavior:

- Support image and PDF uploads.
- Show uploaded attachment rows inside the expanded card.
- Each row shows a type label, recognizable file name, and actions.
- Prefer the local file name when available.
- Fall back to a decoded file name from the returned URL.
- Support preview and delete.
- Persist attachment URLs with the corresponding single record.

## Frontend State Model

Health record state should be explicit and category-scoped:

- `activeRecordType`: `medical`, `checkup`, or `allergy`.
- `recordsByType`: lists loaded from independent APIs.
- `draftByKey`: inline form state for expanded records.
- `expandedRecordKey`: active expanded card.
- `savingRecordKey`: per-card save state.
- `loadingByType`: loading state for each category.
- `dietReminderDraft` and `savedPickyFoods`: independent diet reminder state.

Avoid:

- Merging health arrays from dog profile responses.
- Caching health record arrays in dog profile cache.
- Matching saved records from `profile.medicalRecords`, `profile.checkupRecords`, or `profile.allergyRecords`.
- Sending whole record arrays to save one edited record.

## Data Flow

### Page Load

1. Load dog list.
2. Select requested dog or the first dog.
3. Load dog detail only for dog-level fields such as `pickyFoods`.
4. Load medical, checkup, and allergy lists from independent APIs.
5. Render active category.

### Add Record

1. User taps `新增...`.
2. Create a local draft card for the active category.
3. Expand the draft card.
4. User saves.
5. Send `POST` to that category endpoint.
6. Replace the draft card with the returned persisted record.

### Edit Record

1. User taps `编辑`.
2. Expand the card with a draft copied from the persisted record.
3. User saves.
4. Send `PUT` to that record endpoint.
5. Replace only that record with the returned record.

### Delete Record

1. User taps `删除`.
2. Confirm deletion.
3. Send `DELETE` to that record endpoint.
4. Remove only that record from the current category list.

### Save Diet Reminder

1. User edits diet reminder card.
2. Send dog profile update with `pickyFoods` only.
3. Update saved diet reminder state.
4. Do not touch health record lists.

## Error Handling

- If a record save fails, keep the expanded draft open and show a concise toast.
- If a record delete fails, keep the record visible.
- If loading one category fails, show retry for that category without hiding other loaded categories.
- If switching dogs while a card has unsaved changes, confirm before discarding.
- If attachment upload fails, keep the record draft and show an upload-specific error.
- If attachment preview fails, keep the record state unchanged and show a preview-specific error.

## UI Details

- Record cards show title, date, short summary, attachment count, and type badge.
- Empty state is category-specific:
  - `还没有病史记录`
  - `还没有体检记录`
  - `还没有过敏记录`
- Empty state includes the current category add action.
- Expanded card uses compact form labels and fixed-height controls where appropriate.
- Save button text is `保存这一条`.
- Saved collapsed card action is `编辑`.
- Dirty expanded card action includes `撤销`.
- Delete is visually secondary/destructive and requires confirmation.

## Testing Plan

Backend tests:

- Checkup type accepts free text.
- Medical create and update preserve attachments.
- Medical response includes attachments.
- Create, update, delete operations affect only one record.

Frontend unit/regression tests:

- Health record API methods call the independent endpoints.
- Creating a medical record does not send checkup or allergy arrays.
- Creating a checkup record does not clear medical records.
- Saving diet reminder does not call health record APIs.
- Editing an existing record updates only that record in local state.
- Deleting a record removes only that record.
- Attachment display shows file names and preview/delete actions.
- Switching dogs with unsaved record drafts prompts before discarding.

Manual acceptance:

- Add medical, checkup, and allergy records; return home and re-enter; all records remain.
- Edit one checkup; existing medical records remain.
- Delete one allergy; medical and checkup records remain.
- Upload image and PDF attachments for each category; names display and preview works.
- Save diet reminder; health records remain unchanged.
- Switch between dogs; no records cross from one dog to another.

## Rollout

Implement behind the existing health records page path. No new navigation entry is required.

Deployment order:

1. Backend compatibility fixes.
2. Frontend API adapter for independent health record CRUD.
3. Health records page state and component refactor.
4. Miniapp production build.
5. Manual acceptance in WeChat Developer Tools.
6. Backend deployment only if backend compatibility fixes are included.

## Open Decisions

All decisions needed for implementation are resolved:

- Page structure: segmented categories plus cards.
- Edit pattern: inline card expansion.
- Diet reminder: independent card on the same page.
- Checkup type: free text.
- Category colors: light accents by category.
- Attachments: supported for all three categories with file names, preview, and delete.
