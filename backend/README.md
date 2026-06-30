# CRM Backend

## Setup
1. Copiar `.env.example` para `.env`
2. Instalar dependências:
   - `npm install`
3. Migrar base de dados:
   - `npm run db:migrate`
   - `npm run db:seed`
4. Executar API:
   - `npm run dev`

## Segurança implementada
- `bcrypt` para passwords
- JWT access + refresh token rotativo
- Cookie HttpOnly para refresh token
- CSRF token para endpoints de sessão
- RBAC (`admin`, `staff`)
- `helmet`, `rate-limit`, validação Zod

## Endpoints
Consultar `../docs/API_EXAMPLES.md`
