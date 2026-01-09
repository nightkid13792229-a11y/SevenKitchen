# Database Setup Instructions

## Current Status
✅ `.env` file has been updated with correct DATABASE_URL:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sevenkitchen"
```

## To Start PostgreSQL Database

### Option 1: Using Docker (Recommended)
1. Install Docker Desktop from https://www.docker.com/products/docker-desktop
2. Start Docker Desktop
3. Run from the `/backend` directory:
   ```bash
   docker compose up -d
   ```
4. Verify the database is running:
   ```bash
   docker compose ps
   ```

### Option 2: Using Local PostgreSQL
If you have PostgreSQL installed locally, ensure it's running on port 5432 and create the database:
```bash
createdb sevenkitchen
# Or using psql:
psql -U postgres -c "CREATE DATABASE sevenkitchen;"
```

## After Database is Running

Run the migration:
```bash
pnpm prisma migrate dev --name init_schema
```




