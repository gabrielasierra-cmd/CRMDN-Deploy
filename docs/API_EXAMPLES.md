# API Examples

Base URL: `http://localhost:4000/api`

## Auth

### Register
`POST /auth/register`

Request:
```json
{
  "fullName": "Ana Silva",
  "email": "ana@empresa.pt",
  "password": "StrongPass123",
  "organizationName": "Ana Beauty Studio"
}
```

Response `201`:
```json
{
  "accessToken": "<jwt>",
  "accessTokenExpiresIn": "15m",
  "organizationId": "f37d8d9d-95c6-48fc-a7d5-977f3c9f3ce8",
  "role": "admin",
  "user": {
    "userId": "9e6ce272-b738-4d4d-95b1-594d72a5ce5f",
    "fullName": "Ana Silva",
    "email": "ana@empresa.pt"
  },
  "csrfToken": "<csrf>"
}
```

### Login
`POST /auth/login`

Request:
```json
{
  "email": "ana@empresa.pt",
  "password": "StrongPass123"
}
```

Response `200`: igual ao register.

### Refresh
`POST /auth/refresh`

Headers:
- `x-csrf-token: <csrfToken>`

Response `200`:
```json
{
  "accessToken": "<jwt>",
  "accessTokenExpiresIn": "15m",
  "organizationId": "f37d8d9d-95c6-48fc-a7d5-977f3c9f3ce8",
  "role": "admin",
  "csrfToken": "<new-csrf>"
}
```

### Logout
`POST /auth/logout`

Headers:
- `Authorization: Bearer <accessToken>`
- `x-csrf-token: <csrfToken>`

Response `204` sem corpo.

## Clients

### List
`GET /clients?page=1&pageSize=20`

Headers:
- `Authorization: Bearer <accessToken>`

Response `200`:
```json
{
  "items": [
    {
      "id": "4ecf73ac-868f-4f11-b2c2-4e37ef35b206",
      "name": "Maria Costa",
      "email": "maria@mail.com",
      "phone": "912345678",
      "notes": "Cliente premium",
      "created_at": "2026-04-14T09:54:11.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

### Create
`POST /clients`

Request:
```json
{
  "name": "Maria Costa",
  "email": "maria@mail.com",
  "phone": "912345678",
  "notes": "Cliente premium"
}
```

## Services

### Create
`POST /services`

Request:
```json
{
  "name": "Coloração",
  "description": "Serviço completo",
  "durationMinutes": 90,
  "price": 65
}
```

## Orders

### Create
`POST /orders`

Request:
```json
{
  "clientId": "4ecf73ac-868f-4f11-b2c2-4e37ef35b206",
  "serviceId": "24df7df5-a4de-4826-a727-7e0de3210b83",
  "employeeId": "61768e64-0559-4c7e-b671-5136a94e7282",
  "scheduledAt": "2026-04-20T14:00:00.000Z",
  "notes": "Levar produto anti-alergia"
}
```

## Payments

### Create
`POST /payments`

Request:
```json
{
  "orderId": "1d5a5c4e-cbf4-4f6d-b388-12488f2f6533",
  "amount": 65,
  "method": "mbway",
  "reference": "MB123456"
}
```

## Employees

### Create employee
`POST /employees`

Request:
```json
{
  "fullName": "Joao Mendes",
  "email": "joao@empresa.pt",
  "phone": "934567890",
  "salaryBase": 1250,
  "hireDate": "2026-02-01"
}
```

### Register vacation
`POST /employees/:employeeId/vacations`

Request:
```json
{
  "startDate": "2026-08-01",
  "endDate": "2026-08-15",
  "reason": "Ferias de verao"
}
```
