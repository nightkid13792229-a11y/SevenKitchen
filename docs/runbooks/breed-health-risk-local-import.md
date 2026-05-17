# Breed Health Risk Local Import Runbook

This runbook keeps breed health risk content in a local review loop first. The miniapp only reads the backend API; reviewed knowledge-base rows are imported into backend tables after schema migration.

Before adding or changing breed health content, review the source hierarchy and inclusion rules in [Breed Health Risk Source Governance](./breed-health-risk-source-governance.md). Content should be approved in an audit table before import fixture data is changed.

## Local Review Flow

Use a local PostgreSQL `DATABASE_URL` before applying data.

```bash
cd backend
npm run prisma:generate:build
npx prisma migrate deploy
npm run import:breed-health-risks
npm run import:breed-health-risks:apply
npm run validate:breed-health-risk-sources
npm test -- --runInBand tests/prisma/import-breed-health-risks.spec.ts tests/scripts/validate-breed-health-risk-sources.spec.ts
```

Then start the local backend and open the miniapp in WeChat DevTools using a development build. Development config points the miniapp to `http://127.0.0.1:3011/api/v1`; production build points to `https://api.sevenkitchen.cloud/api/v1`.

```bash
cd backend
npm run start:dev
```

```bash
cd miniapp
npm run dev:mp-weixin
```

Open `miniapp/dist/dev/mp-weixin` in WeChat DevTools and check:

- 健康记录页 shows breed-specific items for 拉布拉多, 金毛, and 雪纳瑞(小型)/雪纳瑞（迷你）.
- Each published item shows at least one source row.
- Detail rows remain collapsed until the user expands them.
- The page keeps the disclaimer that this is educational material, not a diagnosis.

## Data Review Checklist

- Candidate concerns were reviewed against the source hierarchy in [Breed Health Risk Source Governance](./breed-health-risk-source-governance.md).
- Every published risk has source name, source title, URL, and accessed date.
- Source URLs are public and from approved Tier A, Tier B, or Tier C sources.
- Wording uses attention priority, not a guaranteed diagnostic risk level.
- Medical advice remains educational and asks users to consult a veterinarian for symptoms.
- Screenshots from WeChat DevTools are reviewed before production deployment.

## Production Migration After Approval

Do this only after local data import and content review are approved.

```bash
cd backend
npm run prisma:generate:build
npx prisma migrate deploy
npm run import:breed-health-risks
npm run import:breed-health-risks -- --apply --allow-remote
npm run validate:breed-health-risk-sources
```

Operational notes:

- Take a database backup before `migrate deploy`.
- Run the dry-run import against the production `DATABASE_URL` first.
- `--allow-remote` is intentionally not part of the package scripts, so production writes stay explicit.
- Deploy the backend before publishing the miniapp production build, otherwise the miniapp will show the temporary "资料库正在同步" empty state.
