# Build Output Directory Reference

## Important: Which Directory to Open?

When opening the project in WeChat Developer Tools, you **MUST** open the **compiled output directory**, not the source directory.

### ✅ Correct Directory (Open This)

**Development:**
```
<project-root>/miniapp/dist/dev/mp-weixin
```

**Production:**
```
<project-root>/miniapp/dist/build/mp-weixin
```

### ❌ Wrong Directory (Do NOT Open)

```
<project-root>/miniapp/          ← Source directory
<project-root>/miniapp/pages/    ← Source pages
```

## How to Get the Build Output

### Option 1: Use Helper Script (Recommended)

```bash
cd miniapp
bash scripts/mp-weixin-dev.sh
```

The script will:
- Build the project
- Show you the exact absolute path to open
- Optionally open WeChat DevTools automatically

### Option 2: Manual Build

```bash
cd miniapp
npm install          # First time only
npm run dev:mp-weixin  # Development build
# or
npm run build:mp-weixin # Production build
```

Then open:
- `dist/dev/mp-weixin` (development)
- `dist/build/mp-weixin` (production)

## Verify Build Output

After building, the output directory should contain:

```
dist/dev/mp-weixin/
├── app.json          ← Must exist
├── app.js            ← Must exist
├── app.wxss          ← Must exist
├── pages/            ← Must exist
│   ├── dog-profile-list/
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   └── ... (other pages)
└── utils/
    ├── api.js
    └── config.js
```

If `app.json` is missing, the build failed. Check the build output for errors.

## Common Error: "app.json not found"

**Error Message:**
```
Simulator startup failed: app.json not found in project root
```

**Cause:**
You opened the source directory (`miniapp/`) instead of the build output (`dist/dev/mp-weixin`).

**Solution:**
1. Run the build: `bash scripts/mp-weixin-dev.sh`
2. Open the directory shown in the output (should be `dist/dev/mp-weixin`)
3. Make sure you're opening the absolute path, not a relative path


