# Staff-Assisted Orders And Dog Recipe History Design

## Goal

Add a mobile workflow where staff or admins can search customers and dogs, create offline-payment finished-food orders on behalf of customers, adjust the actual offline payment amount before shipment, and let both customers and staff see finished-food recipe history for each dog.

## Business Rules

- Staff and admins need a first-class workbench entry named `客户与狗狗`.
- Staff and admins can search by customer phone, customer nickname, dog name, or order id.
- Search results show customers first, then the dogs owned by each customer.
- A dog card offers `代客下单` and `成品食谱历史`.
- Assisted orders are finished-food orders only. Customer DIY sheets are excluded.
- Assisted orders do not require customer-side payment.
- Assisted orders are marked as offline-payment orders.
- Admins and staff can edit the actual received amount until the order is shipped.
- Shipment and later states lock the actual received amount.
- The system should preserve the system-calculated amount separately from the actual received amount so later accounting can compare expected and actual revenue.
- Payment amount edits must record an internal audit note with operator, old amount, new amount, and reason.
- Dog recipe history includes only finished-food order items, not DIY sheets.
- Dog recipe history is visible in the customer dog profile and in the staff customer/dog detail view.

## User Experience

### Staff Workbench

The workbench adds a `客户与狗狗` module beside existing order, inventory, recipe, and production modules. It opens a staff-only search page.

The search page has one search field and accepts customer phone, customer nickname, dog name, or order id. Results are grouped as customer cards. Each customer card shows basic customer information and a compact list of dogs.

Each dog row shows name, breed, current weight, and two actions:

- `代客下单`
- `成品食谱历史`

### Assisted Ordering

The assisted order flow starts from a selected dog. The page reuses the existing finished-food order configuration behavior where practical:

- selected dog is fixed to the dog chosen by staff
- customer context is carried explicitly
- staff chooses recipe, cycle days, package plan, source plan, production date, and address
- submitting creates an offline-payment order
- customer payment entry is not shown

After order creation, staff lands on the staff order detail page. The order is visible in the normal backend order list.

### Offline Payment Amount

The order detail/customer-service pages show:

- system-calculated amount
- actual offline received amount
- edit action before shipment

The edit modal asks for amount and reason. It is disabled once the order status is shipped, completed, or cancelled.

### Dog Finished-Food Recipe History

The customer dog profile page shows a `成品食谱历史` section. It lists past finished-food order items for that dog:

- recipe name
- order time
- order status
- ordered grams and package summary
- actual amount when available
- link to order detail

The staff customer/dog page uses the same data shape and offers the same list, with staff order detail links.

## API Design

### Staff Customer And Dog Search

`GET /api/v1/staff/customer-service/customers/search?keyword=...`

Requires staff or admin authentication. Returns customer cards with dogs.

### Staff Assisted Order Creation

`POST /api/v1/staff/customer-service/orders/assisted`

Requires staff or admin authentication.

Payload:

- `customerId`
- `dogId`
- `recipeId` or item payload matching existing order creation
- `addressId`
- `cycleDays`
- `packagePlan`
- `ingredientSourcePlan`
- `targetProductionDate`
- `actualAmount`
- `remark`

Behavior:

- validates that the dog and address belong to the selected customer
- creates an order using existing order draft logic
- marks the order as offline payment
- records actual received amount
- records a staff audit note

### Offline Amount Update

Extend the existing staff amount update behavior so offline-payment orders can update the actual received amount before shipment. The update must not be allowed after shipment.

### Dog Recipe History

`GET /api/v1/dogs/:dogId/finished-food-history`

Customer endpoint. Returns only the current user's dog history.

`GET /api/v1/staff/customer-service/dogs/:dogId/finished-food-history`

Staff endpoint. Returns the same shape for any customer dog visible to staff/admin.

## Data Model

No new table is required for the first implementation.

The existing order fields can hold the operational state:

- `paymentMethod = OFFLINE`
- `paymentStatus = SUCCESS` after offline collection is confirmed
- `amountTotal` stores the actual charged amount used by order operations
- the existing pricing snapshot and order item data preserve calculated pricing context
- `adminRemark` records audit lines for amount changes

If later accounting needs stricter reporting, a dedicated `actual_offline_amount` and `calculated_amount_snapshot` column can be added in a migration. This design intentionally avoids that migration until the workflow is validated.

## Error Handling

- Search with an empty keyword returns a friendly empty state instead of all customers.
- Assisted order creation fails if customer, dog, recipe, or address do not match.
- Assisted order creation fails when package plan or total grams violates existing minimum-order rules.
- Offline amount editing fails after shipment, completion, or cancellation.
- History gracefully shows an empty state when the dog has no finished-food orders.

## Testing

- Backend tests cover staff customer/dog search, assisted offline order creation, offline amount lock after shipment, and dog finished-food history filtering.
- Miniapp regression tests cover the workbench entry, search page route, assisted-order API contracts, amount edit copy, and customer/staff history sections.
- Miniapp build verification must run before completion because this changes `miniapp/`.
