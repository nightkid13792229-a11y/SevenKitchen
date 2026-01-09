# API Setup Guide

## Running the API Locally

1. **Start the application:**
   ```bash
   pnpm start:dev
   ```

2. **Access Swagger UI:**
   - URL: http://localhost:3000/api/docs
   - The Swagger UI provides interactive API documentation and testing

3. **API Base URL:**
   - All APIs are prefixed with `/api/v1`
   - Example: `POST /api/v1/dogs/calc-preview`

## Available Endpoints

### Dogs
- `POST /api/v1/dogs` - Create dog profile
- `PUT /api/v1/dogs/:id` - Update dog profile
- `GET /api/v1/dogs/:id` - Get dog detail
- `POST /api/v1/dogs/calc-preview` - Calculate energy requirement preview (dry-run)

### Recipes
- `GET /api/v1/recipes` - List public recipes
- `GET /api/v1/recipes/:id` - Get recipe detail

### Health
- `GET /api/v1/health` - Health check

## Testing

Run API-level tests:
```bash
pnpm test -- dogs.controller.spec.ts
```

Run all tests:
```bash
pnpm test
```

## Architecture Notes

- Controllers call Application Services only (no business logic in controllers)
- DTOs use class-validator for validation
- InMemory repositories are used for development (no database required)
- All endpoints return unified `ApiResponseDto` structure




