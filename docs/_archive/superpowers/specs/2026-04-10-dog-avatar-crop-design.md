# Dog Avatar Crop Design

**Goal:** Add a shared fixed `1:1` avatar crop flow to the miniapp dog-create page and dog-profile-overview page before local preview or upload.

## Context

The miniapp already supports:

- local preview on the create page before profile creation
- immediate avatar replacement upload on the overview page
- a shared `dogApi.uploadAvatar` helper

What is missing is a user-controlled crop step between `chooseImage` and preview/upload. Right now the final avatar framing depends on the source image and `aspectFill`, which is not predictable for users.

## Chosen Approach

Use an in-page full-screen crop overlay that both pages can reuse.

- The crop ratio is fixed to `1:1`.
- The avatar still renders as a circle in page UI.
- The cropper exports a square JPG temp file.
- The create page stores the cropped temp file for later upload after dog creation.
- The overview page uses the cropped temp file as a transient local preview and uploads it immediately.

## UI and Interaction

### Shared cropper overlay

- Open after `uni.chooseImage` succeeds.
- Cover the page with a dark modal-style overlay.
- Show a centered square crop frame while keeping the full transformed image visible.
- Dim the area outside the crop frame so the final output area stays obvious.
- Let the user drag the image to reposition it.
- Let the user zoom with pinch gestures.
- Provide a reset action to return to the initial crop layout.
- Provide `取消` and `使用头像` actions.

### Create page

- Tap avatar placeholder or current preview.
- Choose image.
- Open cropper.
- On confirm, replace the page preview with the cropped temp file.
- Persist the cropped temp path into the draft state.
- After `POST /dogs` succeeds, upload the cropped temp file.

### Overview page

- Only active in the basic-info edit state.
- Tap avatar.
- Choose image.
- Open cropper.
- On confirm, show the cropped temp file immediately as local preview.
- Upload the cropped temp file right away.
- On success, replace the local preview with the saved remote avatar URL.
- On failure, clear the local preview and keep the previous avatar.

## Technical Design

### New component

`miniapp/src/components/dog-profile/DogAvatarCropper.vue`

Responsibilities:

- manage the crop overlay UI
- load image dimensions with `uni.getImageInfo`
- track drag and zoom state
- render the full interactive image on a larger stage behind dimmed outer masks
- export the crop result with `canvas`
- emit the cropped temp file path to the parent page

### New utility

`miniapp/src/utils/dog-avatar-crop.ts`

Responsibilities:

- calculate the initial image layout that covers the square frame
- clamp drag offsets so the frame is never exposed
- clamp scale into an allowed range
- compute the export rectangle in source-image coordinates

Keeping the math in a utility makes the component smaller and gives us a stable place for unit tests.

### Existing files to modify

- `miniapp/src/pages/dog-create/index.vue`
- `miniapp/src/pages/dog-profile-overview/index.vue`
- related regression specs

## Data Flow

### Create page

1. raw image temp path from `chooseImage`
2. pass into cropper
3. cropper exports cropped temp path
4. store cropped temp path in `formData.avatarTempFilePath`
5. render cropped temp path in local preview
6. upload cropped temp path after dog creation succeeds

### Overview page

1. raw image temp path from `chooseImage`
2. pass into cropper
3. cropper exports cropped temp path
4. set a local preview path immediately
5. upload cropped temp path with `dogApi.uploadAvatar`
6. replace local preview with saved remote avatar on success

## Error Handling

- choose-image cancel: no state change
- crop cancel: no state change
- image-info failure: show a toast and close cropper
- export failure: keep cropper open and show retry message
- create-page upload failure: dog creation still succeeds
- overview-page upload failure: revert to previous avatar
- stale temp file preview: fall back to placeholder or remote URL

## Testing

- unit tests for crop math in `dog-avatar-crop.spec.ts`
- regression test for the reusable cropper component file
- regression tests for create-page crop integration
- regression tests for overview-page crop integration

## Constraints

- no backend API changes
- no third-party crop dependency
- stay compatible with the current uni-app + mp-weixin stack
