<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode (for humans - long-running, auto-reload)
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

### Non-blocking scripts for Cursor/CI

These scripts are designed to terminate quickly and are safe for automated tools:

```bash
# Boot the app once, verify startup, then exit (for Cursor/CI)
$ pnpm run start:once

# Health check - checks if app is healthy (tries running server first, then boots if needed)
$ pnpm run start:check
```

**Usage guidelines:**
- **Humans**: Use `pnpm start:dev` for development (watch mode, auto-reload)
- **Cursor/CI**: Use `pnpm start:once` to verify the app can boot, or `pnpm start:check` for health verification
- **Never** run `pnpm start:dev` in automated scripts - it blocks indefinitely

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Prisma Persistence (Opt-In)

**Important**: Prisma is opt-in only. Memory repositories are the default and require no database.

### Prerequisites for Prisma Mode:
- PostgreSQL `DATABASE_URL` environment variable
- At least one repo switch set to `prisma`:
  - `ORDER_REPO=prisma` - Use Prisma for Order persistence
  - `ADDRESS_REPO=prisma` - Use Prisma for Address persistence
  - `DOG_REPO=prisma` - Use Prisma for Dog persistence (if implemented)
  - `RECIPE_REPO=prisma` - Use Prisma for Recipe persistence (if implemented)
  - `SHIPPING_REPO=prisma` - Use Prisma for Shipping persistence (if implemented)

### Verification:

**Memory mode (default - no Prisma):**
```bash
# Should boot cleanly with zero Prisma-related errors
cd backend && pnpm start:dev
```

**Prisma mode:**
```bash
# Must set DATABASE_URL when any repo switch is set to prisma
cd backend && DATABASE_URL="postgres://user:pass@host:port/db" ORDER_REPO=prisma ADDRESS_REPO=prisma pnpm start:dev
```

**Error handling:**
- If Prisma is enabled but `DATABASE_URL` is missing/empty, startup fails fast with a clear error message.
- If Prisma is not enabled, `PrismaService` is never instantiated and no Prisma-related code runs.

### Prisma Order Persistence (Phase 8.1 Part 1)

Prerequisites:
- PostgreSQL DATABASE_URL
- `ORDER_REPO=prisma`

Commands:
```bash
# Apply migration
DATABASE_URL=postgres://user:pass@host:5432/db npx prisma migrate deploy

# Start backend in Prisma mode
ORDER_REPO=prisma DATABASE_URL=postgres://user:pass@host:5432/db pnpm start:dev

# Run persistence smoke test
ORDER_REPO=prisma DATABASE_URL=postgres://user:pass@host:5432/db bash scripts/phase8_1_part1_persistence_smoke.sh
```

Scope (Phase 8.1):
- Persists the Order aggregate only (Order + OrderItem) plus `pricing_breakdown_snapshot`.
- OrderItem is part of Order and has no independent lifecycle or APIs.
- `pricing_breakdown_snapshot` is the sole pricing source; priceExplanation is derived/read-only.

## Prisma Address Persistence (Phase 8.2 Part A)

Prerequisites:
- PostgreSQL DATABASE_URL
- `ADDRESS_REPO=prisma` (Order can remain memory or prisma; this phase only adds Address persistence)

Commands:
```bash
# Apply migration
DATABASE_URL=postgres://user:pass@host:5432/db npx prisma migrate deploy

# Start backend with address prisma mode (order optional)
ADDRESS_REPO=prisma DATABASE_URL=postgres://user:pass@host:5432/db pnpm start:dev

# Run address persistence smoke test
ADDRESS_REPO=prisma ORDER_REPO=prisma DATABASE_URL=postgres://user:pass@host:5432/db bash scripts/phase8_2_partA_address_persistence_smoke.sh
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
