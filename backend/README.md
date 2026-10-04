
# EventVault Backend

REST API for EventVault, a collaborative event-finance platform with organization membership, event wallets, financial transactions, transaction reversals, and audit logs.

## Tech Stack

- Node.js
- TypeScript
- Express
- PostgreSQL
- Prisma ORM
- Zod validation
- JWT authentication
- Argon2 password hashing
- Vitest and Supertest for testing

## Prerequisites

Install the following before running the backend:

- Node.js and npm
- PostgreSQL
- Git

## Setup

Run these commands from the backend directory:

```powershell
npm.cmd install
```

Create a `.env` file in the backend directory:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/eventvault"
JWT_SECRET="replace-with-a-random-secret-of-at-least-32-characters"
JWT_EXPIRES_IN="15m"
PORT=5000
```

Replace the database credentials with your local PostgreSQL configuration. Do not commit `.env` or share its secrets.

Generate the Prisma client and apply migrations:

```powershell
npx.cmd prisma generate
npx.cmd prisma migrate dev
```

If the database has not been initialized and no migrations exist, create the initial migration using the project's current Prisma workflow.

## Run the API

Start the development server:

```powershell
npm.cmd run dev
```

Build TypeScript:

```powershell
npm.cmd run build
```

Run the automated test suite:

```powershell
npm.cmd test
```

The default port is `5000`.

## Base URL

```text
http://localhost:5000
```

Versioned API prefix:

```text
/api/v1
```

## Health Check

### `GET /health`

Checks API availability and the database connection.

Successful response: `200 OK`

```json
{
  "success": true,
  "service": "EventVault API",
  "status": "healthy",
  "database": "connected"
}
```

Database or health-check failure returns `503 Service Unavailable`.

## Authentication

Protected endpoints require a JWT access token in the request header:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Register

`POST /api/v1/auth/register`

Request body:

```json
{
  "name": "Sanchit Handa",
  "email": "sanchit@example.com",
  "password": "a-long-password"
}
```

Validation:
- `name`: trimmed, 2–100 characters.
- `email`: valid email, maximum 255 characters; normalized to lowercase.
- `password`: 12–128 characters.
- Additional fields are rejected.

Successful response: `201 Created`

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {}
  }
}
```

The `user` object contains the registered user information returned by the service. Registration does not return an access token.

Common errors:
- `400`: validation failed.
- `409`: an account with this email already exists.
- `500`: internal server error.

### Login

`POST /api/v1/auth/login`

Submit the account email and password.

```json
{
  "email": "sanchit@example.com",
  "password": "a-long-password"
}
```

A successful login returns the authenticated user and an access token in the response's `data` object. Use `data.accessToken` as the bearer token for protected endpoints.

The configured token lifetime defaults to `15m`.

### Get Current User

`GET /api/v1/auth/me`

Requires authentication.

Returns information about the currently authenticated user.

## Organizations

All organization endpoints require authentication.

### Create Organization

`POST /api/v1/organizations`

Request body:

```json
{
  "name": "College Fest Committee"
}
```

Validation:
- `name`: trimmed, 2–150 characters.
- Additional fields are rejected.

Successful response: `201 Created`

```json
{
  "success": true,
  "message": "Organization created successfully",
  "data": {
    "organization": {}
  }
}
```

The creator is assigned the organization `OWNER` role with active membership.

### List My Organizations

`GET /api/v1/organizations`

Returns organizations in which the authenticated user has active membership.

Successful response:

```json
{
  "success": true,
  "data": {
    "organizations": []
  }
}
```

The organization list includes membership information and organization counts.

## Events

All event endpoints use the following URL structure:

```text
/api/v1/organizations/:organizationId/events
```

All endpoints in this section require authentication.

### Create Event

`POST /api/v1/organizations/:organizationId/events`

Request body:

```json
{
  "name": "Annual College Fest",
  "description": "Finance management for the annual fest",
  "startDate": "2026-11-10T09:00:00+05:30",
  "endDate": "2026-11-12T22:00:00+05:30",
  "currency": "INR"
}
```

Only `name` is required. Optional fields are `description`, `startDate`, `endDate`, and `currency`.

Validation:
- `name`: trimmed, 2–150 characters.
- `description`: maximum 2,000 characters.
- Dates: timezone-aware ISO date-time strings.
- `endDate` must not precede `startDate`.
- `currency`: three letters, normalized to uppercase; defaults to `INR`.
- Additional fields are rejected.

Creating an event creates its wallet. The event starts in `DRAFT` status.

### List Organization Events

`GET /api/v1/organizations/:organizationId/events`

Returns events belonging to the specified organization for an authorized organization member.

### Activate Event

`PATCH /api/v1/organizations/:organizationId/events/:eventId/status`

Activates a draft event. Only organization owners and administrators can create or activate events under the current authorization rules.

Only the `DRAFT` → `ACTIVE` transition is currently supported by this endpoint.

### Event Membership

#### Add Member

`POST /api/v1/organizations/:organizationId/events/:eventId/members`

Request body:

```json
{
  "userId": "USER_UUID",
  "role": "ORGANIZER"
}
```

`userId` is required. `role` is optional and defaults to `ORGANIZER`.

Supported roles:
- `ADMIN`
- `FINANCE_MANAGER`
- `ORGANIZER`
- `VIEWER`

The target user must be active. Only organization owners/administrators or authorized event administrators can manage event membership. Assigning the `ADMIN` role requires organization-owner or organization-admin authority.

#### List Members

`GET /api/v1/organizations/:organizationId/events/:eventId/members`

Returns event members other than removed memberships. Access is available to authorized active organization or event members.

#### Update Member

`PATCH /api/v1/organizations/:organizationId/events/:eventId/members/:memberId`

Example request:

```json
{
  "role": "FINANCE_MANAGER",
  "transactionEnabled": true
}
```

At least one supported field must be provided:
- `role`
- `transactionEnabled`

Authorization rules prevent unauthorized role changes and removal or demotion of the last active event administrator.

#### Remove Member

`DELETE /api/v1/organizations/:organizationId/events/:eventId/members/:memberId`

Removes the member from active event membership and disables their transaction permission. The operation is recorded in the audit log.

The current implementation prevents self-removal and removal of the last active event administrator.

## Wallet and Transactions

### Get Wallet Balance

`GET /api/v1/organizations/:organizationId/events/:eventId/wallet`

Requires active event membership.

The response includes balance and income/expense totals represented in paise as strings. Consult the returned `data` object for the exact fields.

### Create Transaction

`POST /api/v1/organizations/:organizationId/events/:eventId/transactions`

Request body:

```json
{
  "type": "EXPENSE",
  "amountPaise": 125000,
  "category": "Food",
  "description": "Refreshments for volunteers"
}
```

Fields:
- `type`: `INCOME` or `EXPENSE`.
- `amountPaise`: positive whole number of paise, no greater than `Number.MAX_SAFE_INTEGER`.
- `category`: trimmed, 1–100 characters.
- `description`: optional, trimmed, maximum 2,000 characters.
- Additional fields are rejected.

**Money representation:** `amountPaise` is denominated in paise, not rupees. For example, `125000` paise equals ₹1,250.00. The create-transaction response serializes `amountPaise` as a string.

Financial transactions require active event membership, an active event and wallet, and an eligible event role. Transactions can be disabled for individual members. Expenses that exceed the available wallet balance are rejected.

### List Transactions

`GET /api/v1/organizations/:organizationId/events/:eventId/transactions`

Query parameters:

| Parameter | Required | Default | Constraints |
|---|---|---|---|
| `page` | No | `1` | Integer ≥ 1 |
| `limit` | No | `20` | Integer from 1 to 100 |
| `type` | No | — | `INCOME` or `EXPENSE` |
| `category` | No | — | Trimmed, 1–100 characters |

Example:

```text
/api/v1/organizations/ORG_UUID/events/EVENT_UUID/transactions?page=1&limit=20&type=EXPENSE&category=Food
```

The response contains paginated transaction data. Transaction amounts are serialized as strings.

### Reverse Transaction

`POST /api/v1/organizations/:organizationId/events/:eventId/transactions/:transactionId/reverse`

Request body:

```json
{
  "reason": "Incorrect amount entered"
}
```

Validation:
- `reason`: trimmed, 3–500 characters.
- Additional fields are rejected.

A successful reversal returns `201 Created` and a reversal transaction in `data`, with `amountPaise` serialized as a string.

A reversal creates a compensating ledger entry rather than deleting the original transaction. A reversal cannot itself be reversed, and an original transaction cannot be reversed twice. A reversal that would leave the wallet with insufficient funds is rejected.

Only event members with the `ADMIN` or `FINANCE_MANAGER` role can reverse transactions, subject to the remaining authorization and wallet-state checks.

## Audit Logs

### List Event Audit Logs

`GET /api/v1/organizations/:organizationId/events/:eventId/audit-logs`

Query parameters:

| Parameter | Required | Default | Constraints |
|---|---|---|---|
| `page` | No | `1` | Integer ≥ 1 |
| `limit` | No | `20` | Integer from 1 to 100 |
| `action` | No | — | String, 1–100 characters |
| `actorId` | No | — | UUID |
| `entityType` | No | — | String, 1–100 characters |

Example:

```text
/api/v1/organizations/ORG_UUID/events/EVENT_UUID/audit-logs?page=1&limit=20&action=EVENT_CREATED
```

Audit-log access is restricted to active organization owners/administrators and active event administrators/finance managers. Ordinary event organizers and viewers do not have audit-log access under the current policy.

## Response and Error Conventions

Most endpoints use a JSON envelope such as:

```json
{
  "success": true,
  "data": {}
}
```

Error responses generally use:

```json
{
  "success": false,
  "message": "Description of the error"
}
```

Some validation errors also include an `errors` field. The exact error structure can differ between endpoints.

Common HTTP statuses:

| Status | Meaning |
|---|---|
| `200` | Request succeeded |
| `201` | Resource created or reversal recorded |
| `400` | Invalid input or route parameters |
| `401` | Authentication required or invalid |
| `403` | Authenticated user lacks permission |
| `404` | Resource not found within the requested scope |
| `409` | State conflict, duplicate reversal, or insufficient funds |
| `500` | Internal server error |
| `503` | Health check failed |

## Security and Data Integrity

- Protected routes require JWT authentication.
- Organization and event identifiers are checked together to prevent cross-organization access.
- Financial writes use database transactions and wallet-row locking to help prevent concurrent overspending.
- Financial entries are represented as ledger records; reversals use compensating entries.
- Audit records are written for supported operations.
- Sensitive configuration belongs in environment variables and must not be committed.

## Current Scope

The API currently covers authentication, organizations, events, event membership, wallet balances, transactions, reversals, and audit logs.

The event status endpoint currently supports activation from `DRAFT` to `ACTIVE`; other lifecycle transitions are not documented as available API operations.

The frontend can now be built against these endpoints. Any response-field uncertainty should be resolved from the actual controller/service output or an API test rather than assumed in the UI.