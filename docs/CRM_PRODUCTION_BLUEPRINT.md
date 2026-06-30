# CRM Production Blueprint

## 1) Arquitetura completa

### Stack escolhida
- Backend: Node.js + Express + TypeScript
- Base de dados: PostgreSQL
- API: REST (`/api/...`)
- Auth: JWT access token + refresh token em cookie HttpOnly
- Validação: Zod

### Justificação
- Express + TypeScript acelera entrega e mantém arquitetura em camadas clara.
- PostgreSQL oferece consistência transacional, integridade referencial e escalabilidade vertical/horizontal com read replicas.
- REST simplifica integração com o frontend atual em JavaScript vanilla.

### Diagrama lógico (texto)
1. `Frontend (HTML/CSS/JS)` chama `API REST`.
2. `Routes/Controllers` recebem request e aplicam validação + auth.
3. `Services` implementam regras de negócio (RBAC, fluxo de pedidos/pagamentos).
4. `Repositories` fazem queries SQL parametrizadas no PostgreSQL.
5. `DB` aplica constraints, FKs e índices para consistência/performance.
6. `Audit logs` e `refresh_tokens` suportam segurança e rastreabilidade.

### Camadas
- `controllers`: parsing HTTP + resposta
- `services`: lógica de negócio
- `repositories`: acesso a dados SQL
- `models`: tipos/interfaces e schema DB
- `middleware`: auth, RBAC, validação, CSRF, erro

## 2) Modelo de base de dados profissional

### Entidades principais
- Segurança: `users`, `roles`, `organizations`, `user_organizations`, `refresh_tokens`
- CRM: `clients`, `services`, `orders`, `payments`
- RH: `employees`, `employee_vacations`, `salaries`
- Financeiro/Stock: `expenses`, `materials`, `material_movements`
- Governança: `audit_logs`

### Relações críticas
- `users` N:N `organizations` via `user_organizations` (multi-utilizador e multi-tenant)
- `organizations` 1:N `clients`, `services`, `orders`, `employees`, `expenses`, `materials`
- `orders` pertence a `client` + `service` + opcional `employee`
- `payments` 1:N por `order`
- `employee_vacations` 1:N por `employee`
- `salaries` 1:N por `employee` com unicidade por mês

### SQL
- Ficheiro: [`001_init.sql`](/c:/Users/HP/Desktop/CRMDN/database/migrations/001_init.sql)
- Seed de roles: [`002_seed.sql`](/c:/Users/HP/Desktop/CRMDN/database/migrations/002_seed.sql)

## 3) Auth completo (implementado)

### Funcionalidades
- Registo: `POST /api/auth/register`
- Login: `POST /api/auth/login`
- Refresh: `POST /api/auth/refresh`
- Logout: `POST /api/auth/logout`

### Segurança implementada
- Password hashing com `bcrypt` (12 rounds)
- Access token (curta duração) + refresh token (cookie HttpOnly)
- Rotação e revogação de refresh tokens (hash em DB)
- RBAC com roles `admin`/`staff`
- Validação de input com Zod
- SQL injection mitigado por queries parametrizadas
- XSS hardening com `helmet` + CSP
- CSRF para rotas de sessão com double-submit token (`csrf_token`)

### Código-chave
- Controller/Auth endpoints: [`auth.controller.ts`](/c:/Users/HP/Desktop/CRMDN/backend/src/modules/auth/auth.controller.ts)
- Service de auth: [`auth.service.ts`](/c:/Users/HP/Desktop/CRMDN/backend/src/modules/auth/auth.service.ts)
- Middleware auth: [`auth.middleware.ts`](/c:/Users/HP/Desktop/CRMDN/backend/src/middleware/auth.middleware.ts)
- Middleware RBAC: [`rbac.middleware.ts`](/c:/Users/HP/Desktop/CRMDN/backend/src/middleware/rbac.middleware.ts)

## 4) Migração do sistema atual

### Estratégia
1. Congelar escrita no frontend antigo.
2. Exportar `localStorage` para JSON (`legacy-export.json`).
3. Executar migração DB (`001_init.sql` + `002_seed.sql`).
4. Importar JSON legado para PostgreSQL com script.
5. Validar contagens por módulo (clientes/serviços/gastos/etc.).
6. Ativar frontend novo usando API.

### Script real
- Importador: [`import-legacy.ts`](/c:/Users/HP/Desktop/CRMDN/backend/scripts/import-legacy.ts)
- Execução:
  - `cd backend`
  - `npm run legacy:import -- ../database/legacy/legacy-export.json`

## 5) API REST completa

### Auth
- `POST /api/auth/register` cria organização + utilizador admin
- `POST /api/auth/login` autentica e devolve token
- `POST /api/auth/refresh` renova sessão
- `POST /api/auth/logout` invalida refresh token

### Clientes
- `GET /api/clients?page=1&pageSize=20`
- `POST /api/clients`
- `PUT /api/clients/:clientId`

### Serviços
- `GET /api/services`
- `POST /api/services` (admin)

### Pedidos
- `GET /api/orders`
- `POST /api/orders`

### Pagamentos
- `GET /api/payments`
- `POST /api/payments`

### Funcionários
- `GET /api/employees`
- `POST /api/employees` (admin)
- `POST /api/employees/:employeeId/vacations` (admin)

Exemplos completos: [`API_EXAMPLES.md`](/c:/Users/HP/Desktop/CRMDN/docs/API_EXAMPLES.md)

## 6) Performance e escalabilidade

- Índices compostos por tenant e data (já no schema SQL)
- Paginação em todos os endpoints de listagem
- Pool de ligações PostgreSQL configurado
- Preparado para cache Redis:
  - cache de leitura para dashboards
  - invalidation por evento de escrita
- Escala horizontal:
  - API stateless com JWT
  - múltiplas instâncias atrás de load balancer

## 7) Estratégia de testes

- Unit tests:
  - `AuthService` (login/register/refresh)
  - `middleware` (`authenticate`, `authorize`)
  - validações Zod
- Integração:
  - fluxo completo auth + CRUD principal com Supertest + DB de teste
- Ferramentas:
  - Jest + Supertest
  - Test DB isolada por `NODE_ENV=test`

## 8) Plano de implementação por fases

### Fase 1 - Setup backend
- Criar estrutura em camadas
- Configurar env, segurança base, conexão PostgreSQL
- Criar migrações e seed

### Fase 2 - Auth system
- Implementar registo/login/refresh/logout
- Adicionar middleware auth + RBAC + CSRF
- Integrar sessão no frontend

### Fase 3 - Core CRM modules
- Entregar CRUD clientes/serviços/pedidos/pagamentos/funcionários
- Garantir isolamento por organização (`organization_id`)
- Adicionar auditoria e regras de negócio

### Fase 4 - Integração frontend
- Substituir `localStorage` por chamadas API
- Implementar tratamento de erro e refresh token automático
- Converter dashboards para dados reais do backend

### Fase 5 - Segurança e otimização
- Testes automáticos + hardening adicional
- Observabilidade (logs estruturados + métricas)
- Deploy com CI/CD e backups

## 9) Estrutura final do projeto

```text
CRMDN/
├─ backend/
│  ├─ src/
│  │  ├─ config/
│  │  ├─ db/
│  │  ├─ middleware/
│  │  ├─ modules/
│  │  │  ├─ auth/
│  │  │  ├─ clients/
│  │  │  ├─ services/
│  │  │  ├─ orders/
│  │  │  ├─ payments/
│  │  │  ├─ employees/
│  │  │  └─ users/
│  │  ├─ routes/
│  │  ├─ types/
│  │  ├─ utils/
│  │  ├─ app.ts
│  │  └─ server.ts
│  ├─ scripts/
│  ├─ tests/
│  ├─ package.json
│  └─ tsconfig.json
├─ database/
│  └─ migrations/
├─ docs/
└─ frontend (ficheiros atuais HTML/CSS/JS)
```

## 10) Melhorias extra recomendadas

- Logs estruturados (`pino`) com correlação por request id
- Tabela `audit_logs` já pronta para trilha de ações
- Backups automáticos diários + retenção + restore testado
- Deploy com Docker Compose (API + Postgres + Redis + Nginx)
- CI/CD com lint, testes e migration checks em pull request
