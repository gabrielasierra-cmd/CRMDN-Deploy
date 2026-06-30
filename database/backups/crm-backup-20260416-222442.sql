--
-- PostgreSQL database dump
--

-- Dumped from database version 16.3
-- Dumped by pg_dump version 16.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: material_movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.material_movement_type AS ENUM (
    'in',
    'out',
    'adjustment'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'scheduled',
    'in_progress',
    'done',
    'paid',
    'cancelled'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'cash',
    'card',
    'transfer',
    'mbway'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: allocation_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allocation_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    socios_percentage numeric(5,2) DEFAULT 20 NOT NULL,
    investimentos_percentage numeric(5,2) DEFAULT 40 NOT NULL,
    emergencias_percentage numeric(5,2) DEFAULT 30 NOT NULL,
    base_percentage numeric(5,2) DEFAULT 10 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT allocation_settings_check CHECK ((round((((socios_percentage + investimentos_percentage) + emergencias_percentage) + base_percentage), 2) = (100)::numeric))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    user_id uuid,
    action character varying(80) NOT NULL,
    entity character varying(80) NOT NULL,
    entity_id uuid,
    ip_address inet,
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    email character varying(190),
    phone character varying(25),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_vacations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_vacations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason character varying(200),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_vacations_check CHECK ((end_date >= start_date))
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    full_name character varying(120) NOT NULL,
    email character varying(190),
    phone character varying(25),
    salary_base numeric(12,2),
    hire_date date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employees_salary_base_check CHECK ((salary_base >= (0)::numeric))
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    category character varying(80) NOT NULL,
    description text,
    amount numeric(12,2) NOT NULL,
    expense_date date NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: financial_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    socios_amount numeric(12,2) NOT NULL,
    investimentos_amount numeric(12,2) NOT NULL,
    emergencias_amount numeric(12,2) NOT NULL,
    base_amount numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_allocations_base_amount_check CHECK ((base_amount >= (0)::numeric)),
    CONSTRAINT financial_allocations_check CHECK ((round((((socios_amount + investimentos_amount) + emergencias_amount) + base_amount), 2) = total_amount)),
    CONSTRAINT financial_allocations_emergencias_amount_check CHECK ((emergencias_amount >= (0)::numeric)),
    CONSTRAINT financial_allocations_investimentos_amount_check CHECK ((investimentos_amount >= (0)::numeric)),
    CONSTRAINT financial_allocations_socios_amount_check CHECK ((socios_amount >= (0)::numeric)),
    CONSTRAINT financial_allocations_total_amount_check CHECK ((total_amount > (0)::numeric))
);


--
-- Name: material_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    material_id uuid NOT NULL,
    movement_type public.material_movement_type NOT NULL,
    quantity numeric(14,3) NOT NULL,
    unit_cost numeric(12,2),
    reference_type character varying(30),
    reference_id uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT material_movements_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    sku character varying(80),
    unit character varying(20) DEFAULT 'unit'::character varying NOT NULL,
    current_stock numeric(14,3) DEFAULT 0 NOT NULL,
    min_stock numeric(14,3) DEFAULT 0 NOT NULL,
    unit_cost numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materials_current_stock_check CHECK ((current_stock >= (0)::numeric)),
    CONSTRAINT materials_min_stock_check CHECK ((min_stock >= (0)::numeric)),
    CONSTRAINT materials_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    client_id uuid NOT NULL,
    service_id uuid NOT NULL,
    employee_id uuid,
    status public.order_status DEFAULT 'scheduled'::public.order_status NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT orders_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(120) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    method public.payment_method NOT NULL,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    reference character varying(120),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id smallint NOT NULL,
    name character varying(40) NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: salaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    period_month date NOT NULL,
    base_amount numeric(12,2) NOT NULL,
    bonus_amount numeric(12,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    net_amount numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT salaries_base_amount_check CHECK ((base_amount >= (0)::numeric)),
    CONSTRAINT salaries_net_amount_check CHECK ((net_amount >= (0)::numeric))
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    description text,
    duration_minutes integer NOT NULL,
    price numeric(12,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT services_duration_minutes_check CHECK ((duration_minutes > 0)),
    CONSTRAINT services_price_check CHECK ((price >= (0)::numeric))
);


--
-- Name: user_organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_organizations (
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role_id smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(190) NOT NULL,
    full_name character varying(120) NOT NULL,
    password_hash text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Data for Name: allocation_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.allocation_settings (id, organization_id, socios_percentage, investimentos_percentage, emergencias_percentage, base_percentage, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, organization_id, user_id, action, entity, entity_id, ip_address, user_agent, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.clients (id, organization_id, name, email, phone, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: employee_vacations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_vacations (id, employee_id, start_date, end_date, reason, created_at) FROM stdin;
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employees (id, organization_id, full_name, email, phone, salary_base, hire_date, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expenses (id, organization_id, category, description, amount, expense_date, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: financial_allocations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.financial_allocations (id, organization_id, payment_id, total_amount, socios_amount, investimentos_amount, emergencias_amount, base_amount, created_at) FROM stdin;
\.


--
-- Data for Name: material_movements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.material_movements (id, organization_id, material_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: materials; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.materials (id, organization_id, name, sku, unit, current_stock, min_stock, unit_cost, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, organization_id, client_id, service_id, employee_id, status, scheduled_at, total_amount, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.organizations (id, name, created_at) FROM stdin;
1c4dc652-c44a-452c-8c34-8b7ab99f3036	QA Org	2026-04-15 11:45:32.686831+01
5640c802-da3f-4639-b392-e3cc1817d786	Org Teste	2026-04-16 21:33:54.909287+01
091fe08f-ab12-4d0f-a31d-1cf5f7ae7bd8	Org Teste	2026-04-16 21:34:42.934098+01
00ddc423-5c95-4e2e-a38b-5ad7d6b20663	gerente	2026-04-16 21:49:11.791821+01
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, order_id, amount, method, paid_at, reference, created_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) FROM stdin;
adedd981-bbc0-4ca2-bf64-64824260e318	0f060d8d-4b87-4aa3-a0f5-cb43ca8caf39	e8ac12c9b77372cb7b8de34c6088702d9d4c3f00d1d9a1e0cc68a7da74769b49	2026-05-15 11:45:32+01	\N	2026-04-15 11:45:32.706012+01
0ec1946e-7df2-49a3-8d4b-a77b8b3847f9	2001b633-f438-40ba-8752-c5c3c828f8fd	f65a6694770a7d8f09186ce0e64fc9ae4bb2e585cb4e139a21f55e5a53ca7ef4	2026-05-16 21:33:54+01	\N	2026-04-16 21:33:54.955003+01
29c016a0-5636-4b9a-a520-ddccaaba6edf	2001b633-f438-40ba-8752-c5c3c828f8fd	54b41b4d7499fef743d1f8ee8757cc3cc7f41dc06c2cde611067fc5e48f6175f	2026-05-16 21:33:55+01	\N	2026-04-16 21:33:55.749481+01
7660302b-8a51-4446-a057-6dc3a9fa9d75	afc3e44f-edb8-474c-aeaa-a2b64caca8b2	208833ba00e2e86e370cc9269162eee02d7f3fdbaabcdd23a3c5b6c2a40b8e7d	2026-05-16 21:34:42+01	\N	2026-04-16 21:34:42.964925+01
30faf23c-4034-4749-b541-ee686b568fa2	afc3e44f-edb8-474c-aeaa-a2b64caca8b2	f0f5caf7dbc4bd93fc7bd461feb9e8a3aea599a125a970478ed71cc4e92d72a4	2026-05-16 21:34:43+01	\N	2026-04-16 21:34:43.694868+01
be1f5f6a-6f86-4e6f-be1f-0513ff8345ef	6fe37bd4-7311-463e-b8b0-3c1fc14c023d	25c59f3ed02de997114d5531a0a70b2f3ea138002af6233003c3a058f904331c	2026-05-16 21:49:11+01	\N	2026-04-16 21:49:11.822814+01
7a21dea2-fc36-44f3-bb4e-2adf91b749c0	6fe37bd4-7311-463e-b8b0-3c1fc14c023d	996bb26d359f3bbeb21b675db7c66e74e66cf70c80defa6634111ac6fa534c8a	2026-05-16 21:49:12+01	\N	2026-04-16 21:49:12.508126+01
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (id, name) FROM stdin;
1	admin
2	staff
\.


--
-- Data for Name: salaries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salaries (id, organization_id, employee_id, period_month, base_amount, bonus_amount, discount_amount, net_amount, created_at) FROM stdin;
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.services (id, organization_id, name, description, duration_minutes, price, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_organizations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_organizations (user_id, organization_id, role_id, created_at) FROM stdin;
0f060d8d-4b87-4aa3-a0f5-cb43ca8caf39	1c4dc652-c44a-452c-8c34-8b7ab99f3036	1	2026-04-15 11:45:32.686831+01
2001b633-f438-40ba-8752-c5c3c828f8fd	5640c802-da3f-4639-b392-e3cc1817d786	1	2026-04-16 21:33:54.909287+01
afc3e44f-edb8-474c-aeaa-a2b64caca8b2	091fe08f-ab12-4d0f-a31d-1cf5f7ae7bd8	1	2026-04-16 21:34:42.934098+01
6fe37bd4-7311-463e-b8b0-3c1fc14c023d	00ddc423-5c95-4e2e-a38b-5ad7d6b20663	1	2026-04-16 21:49:11.791821+01
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, full_name, password_hash, is_active, created_at, updated_at) FROM stdin;
0f060d8d-4b87-4aa3-a0f5-cb43ca8caf39	qa.test+934847527@example.com	QA User	$2a$12$BDw9NwXm28tgoVs4brUpnuQHAgLfUa3qffih7QG5JqkT22kbh7Oq2	t	2026-04-15 11:45:32.686831+01	2026-04-15 11:45:32.686831+01
2001b633-f438-40ba-8752-c5c3c828f8fd	teste_1776371633687@mail.com	Teste User	$2a$12$udP2H33aI9SJ2PE/M9y3f.TJBGbiaik8AHTx2cjHjWCWW3d5B9.y6	t	2026-04-16 21:33:54.909287+01	2026-04-16 21:33:54.909287+01
afc3e44f-edb8-474c-aeaa-a2b64caca8b2	teste_1776371681774@mail.com	Teste User	$2a$12$essSP09m8PjVdrkY0o14j.AHGajOQVtE1io2ATor1zzCwXbIt1xve	t	2026-04-16 21:34:42.934098+01	2026-04-16 21:34:42.934098+01
6fe37bd4-7311-463e-b8b0-3c1fc14c023d	gabriela.rosero23@gmail.com	gabriela sierra	$2a$12$4XRPL4.8vC5GZVXLntJXBeIyAcfdfql6SUxGR6aOmloL0EKnn13yG	t	2026-04-16 21:49:11.791821+01	2026-04-16 21:49:11.791821+01
\.


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_id_seq', 2, true);


--
-- Name: allocation_settings allocation_settings_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_settings
    ADD CONSTRAINT allocation_settings_organization_id_key UNIQUE (organization_id);


--
-- Name: allocation_settings allocation_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_settings
    ADD CONSTRAINT allocation_settings_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: employee_vacations employee_vacations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_vacations
    ADD CONSTRAINT employee_vacations_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: financial_allocations financial_allocations_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_allocations
    ADD CONSTRAINT financial_allocations_payment_id_key UNIQUE (payment_id);


--
-- Name: financial_allocations financial_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_allocations
    ADD CONSTRAINT financial_allocations_pkey PRIMARY KEY (id);


--
-- Name: material_movements material_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_movements
    ADD CONSTRAINT material_movements_pkey PRIMARY KEY (id);


--
-- Name: materials materials_organization_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_organization_id_sku_key UNIQUE (organization_id, sku);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: salaries salaries_employee_id_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaries
    ADD CONSTRAINT salaries_employee_id_period_month_key UNIQUE (employee_id, period_month);


--
-- Name: salaries salaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaries
    ADD CONSTRAINT salaries_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: user_organizations user_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_organizations
    ADD CONSTRAINT user_organizations_pkey PRIMARY KEY (user_id, organization_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_logs_org_entity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_org_entity_created ON public.audit_logs USING btree (organization_id, entity, created_at DESC);


--
-- Name: idx_clients_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_org_created ON public.clients USING btree (organization_id, created_at DESC);


--
-- Name: idx_expenses_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_org_date ON public.expenses USING btree (organization_id, expense_date DESC);


--
-- Name: idx_fin_alloc_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_alloc_org_created ON public.financial_allocations USING btree (organization_id, created_at DESC);


--
-- Name: idx_fin_alloc_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_alloc_payment ON public.financial_allocations USING btree (payment_id);


--
-- Name: idx_material_org_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_org_name ON public.materials USING btree (organization_id, name);


--
-- Name: idx_orders_org_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_org_scheduled ON public.orders USING btree (organization_id, scheduled_at DESC);


--
-- Name: idx_payments_order_paid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_order_paid ON public.payments USING btree (order_id, paid_at DESC);


--
-- Name: idx_refresh_tokens_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user_active ON public.refresh_tokens USING btree (user_id, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_services_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_org_created ON public.services USING btree (organization_id, created_at DESC);


--
-- Name: allocation_settings allocation_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocation_settings
    ADD CONSTRAINT allocation_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: clients clients_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: employee_vacations employee_vacations_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_vacations
    ADD CONSTRAINT employee_vacations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employees employees_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: expenses expenses_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: financial_allocations financial_allocations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_allocations
    ADD CONSTRAINT financial_allocations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: financial_allocations financial_allocations_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_allocations
    ADD CONSTRAINT financial_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: material_movements material_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_movements
    ADD CONSTRAINT material_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: material_movements material_movements_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_movements
    ADD CONSTRAINT material_movements_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;


--
-- Name: material_movements material_movements_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_movements
    ADD CONSTRAINT material_movements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: materials materials_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: orders orders_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: orders orders_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: orders orders_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: orders orders_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: salaries salaries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaries
    ADD CONSTRAINT salaries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: salaries salaries_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaries
    ADD CONSTRAINT salaries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: services services_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_organizations user_organizations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_organizations
    ADD CONSTRAINT user_organizations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_organizations user_organizations_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_organizations
    ADD CONSTRAINT user_organizations_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: user_organizations user_organizations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_organizations
    ADD CONSTRAINT user_organizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

