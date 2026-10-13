-- StaySuite cloud schema (PostgreSQL / Supabase)
-- Mirrors src/domain/types.ts. Money is stored as BIGINT minor units (paise/cents) — never floats.
-- Every row belongs to a workspace; Row Level Security enforces roles and per-property access,
-- matching src/domain/permissions.ts so the same rules hold on web, iOS and Android.

create extension if not exists "pgcrypto";
create extension if not exists citext;

-- ── Workspaces & membership ──────────────────────────────────────────────

create type member_role as enum ('owner', 'manager', 'accountant', 'caretaker', 'cleaner');
create type member_status as enum ('invited', 'active', 'disabled');

create table workspaces (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  legal_name      text,
  email           text,
  phone           text,
  address         text,
  website         text,
  logo_path       text,                         -- storage bucket path
  brand_color     text not null default '#0f766e',
  currency        char(3) not null default 'INR',
  locale          text not null default 'en-IN',
  time_zone       text not null default 'Asia/Kolkata',
  week_starts_on  smallint not null default 1,
  tax_enabled     boolean not null default false,
  tax_label       text not null default 'GST',
  tax_rate        numeric(5,2) not null default 0 check (tax_rate between 0 and 50),
  tax_inclusive   boolean not null default false,
  tax_reg_no      text,
  invoice_prefix  text not null default 'INV',
  receipt_prefix  text not null default 'RCP',
  document_footer text,
  payment_instructions text,
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create table members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,  -- null until invite accepted
  name          text not null,
  email         citext not null,
  phone         text,
  role          member_role not null,
  property_ids  uuid[] not null default '{}',                      -- empty = all properties
  status        member_status not null default 'invited',
  invited_at    timestamptz not null default now(),
  unique (workspace_id, email)
);
create index on members (user_id);

-- ── Properties ───────────────────────────────────────────────────────────

create table properties (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  type          text not null check (type in ('cabin','boutique_hotel','homestay','guesthouse','villa','apartment','entire_home')),
  address       text, city text, description text,
  photo_paths   text[] not null default '{}',
  amenities     text[] not null default '{}',
  check_in_time time not null default '13:00',
  check_out_time time not null default '11:00',
  check_in_instructions text, house_rules text, wifi_name text, wifi_password text,
  color         text not null default 's1',
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

create table units (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete restrict,
  name          text not null,
  type          text not null,
  capacity      smallint not null check (capacity > 0),
  bedrooms      smallint not null default 1,
  base_rate     bigint not null check (base_rate >= 0),
  weekend_rate  bigint check (weekend_rate >= 0),
  cleaning_fee  bigint not null default 0 check (cleaning_fee >= 0),
  readiness     text not null default 'ready' check (readiness in ('ready','dirty','cleaning','inspect','out_of_order')),
  archived      boolean not null default false
);
create index on units (property_id);

create table rate_rules (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  unit_id       uuid references units(id) on delete cascade,
  name          text not null,
  kind          text not null check (kind in ('seasonal','special_offer','custom')),
  start_date    date not null,
  end_date      date not null,
  mode          text not null check (mode in ('fixed','percent')),
  value         bigint not null,           -- fixed: minor units; percent: whole percent
  min_nights    smallint not null default 1,
  active        boolean not null default true,
  check (end_date >= start_date)
);

create table property_documents (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  name          text not null,
  category      text not null,
  file_path     text,
  expires_on    date,
  notes         text,
  uploaded_at   timestamptz not null default now()
);

-- ── Guests ───────────────────────────────────────────────────────────────

create table guests (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  first_name    text not null,
  last_name     text,
  email         citext,
  phone         text,
  country       text, city text,
  id_type       text,
  id_last4      text check (id_last4 is null or length(id_last4) <= 4),  -- never store full ID numbers
  preferences   text, notes text,
  tags          text[] not null default '{}',
  vip           boolean not null default false,
  marketing_consent boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on guests (workspace_id, lower(first_name), lower(last_name));
create index on guests (workspace_id, phone);

-- ── Bookings ─────────────────────────────────────────────────────────────

create extension if not exists btree_gist;

create table bookings (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  code             text not null,
  property_id      uuid not null references properties(id),
  unit_id          uuid not null references units(id),
  guest_id         uuid not null references guests(id),
  check_in         date not null,
  check_out        date not null,
  adults           smallint not null check (adults >= 1),
  children         smallint not null default 0,
  status           text not null check (status in ('inquiry','tentative','confirmed','checked_in','checked_out','cancelled','no_show')),
  source           text not null,
  channel_ref      text,
  nights           jsonb not null,           -- [{date, rate, ruleId}] — price locked at booking time
  cleaning_fee     bigint not null default 0,
  extras           jsonb not null default '[]',
  discount         bigint not null default 0 check (discount >= 0),
  commission       bigint not null default 0,
  tax_rate         numeric(5,2) not null default 0,
  tax_inclusive    boolean not null default false,
  security_deposit bigint not null default 0,
  cancellation_fee bigint not null default 0,
  notes            text,
  arrival_time     time,
  review           jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  checked_in_at    timestamptz, checked_out_at timestamptz, cancelled_at timestamptz,
  unique (workspace_id, code),
  check (check_out > check_in),
  -- Database-level double-booking guard: no two inventory-holding stays may overlap on a unit.
  constraint no_double_booking exclude using gist (
    unit_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('tentative','confirmed','checked_in','checked_out'))
);
create index on bookings (workspace_id, check_in);
create index on bookings (guest_id);

-- ── Money ────────────────────────────────────────────────────────────────

create table recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  category      text not null,
  amount        bigint not null check (amount > 0),
  property_id   uuid references properties(id),
  vendor        text,
  method        text not null,
  frequency     text not null check (frequency in ('weekly','monthly','quarterly','yearly')),
  next_due      date not null,
  active        boolean not null default true,
  notes         text
);

create table transactions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  kind             text not null check (kind in ('payment','refund','deposit','deposit_return','income','expense')),
  date             date not null,
  amount           bigint not null check (amount > 0),     -- direction comes from kind
  method           text not null,
  property_id      uuid references properties(id),
  booking_id       uuid references bookings(id),
  guest_id         uuid references guests(id),
  purpose          text check (purpose in ('advance','partial','balance','full')),
  income_category  text,
  expense_category text,
  vendor           text, reference text, notes text,
  attachment_paths text[] not null default '{}',
  recurring_id     uuid references recurring_expenses(id) on delete set null,
  task_id          uuid,
  created_at       timestamptz not null default now(),
  created_by       uuid references members(id),
  check ((kind in ('payment','refund','deposit','deposit_return')) = (booking_id is not null)),
  check (kind <> 'expense' or expense_category is not null),
  check (kind <> 'income' or income_category is not null)
);
create index on transactions (workspace_id, date);
create index on transactions (booking_id);

-- Sequential, gap-free document numbers per workspace, type and year
create table document_counters (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind         text not null,
  year         int  not null,
  last_value   int  not null default 0,
  primary key (workspace_id, kind, year)
);

create or replace function next_document_number(p_workspace uuid, p_kind text, p_year int)
returns int language plpgsql as $$
declare v int;
begin
  insert into document_counters (workspace_id, kind, year, last_value) values (p_workspace, p_kind, p_year, 1)
  on conflict (workspace_id, kind, year) do update set last_value = document_counters.last_value + 1
  returning last_value into v;
  return v;
end $$;

create table documents (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  kind           text not null check (kind in ('invoice','receipt','refund_receipt','expense_voucher')),
  number         text not null,
  issue_date     date not null,
  due_date       date,
  booking_id     uuid references bookings(id),
  transaction_id uuid references transactions(id),
  guest_id       uuid references guests(id),
  property_id    uuid references properties(id),
  snapshot       jsonb not null,           -- immutable copy so re-downloads match the original
  void           boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (workspace_id, number)
);

-- ── Operations ───────────────────────────────────────────────────────────

create table tasks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  type          text not null check (type in ('cleaning','maintenance','inspection','other')),
  title         text not null,
  property_id   uuid not null references properties(id) on delete cascade,
  unit_id       uuid references units(id) on delete set null,
  booking_id    uuid references bookings(id) on delete set null,
  assignee_id   uuid references members(id) on delete set null,
  due_date      date not null,
  due_time      time,
  priority      text not null default 'medium',
  status        text not null default 'todo',
  checklist     jsonb not null default '[]',
  notes         text,
  photo_paths   text[] not null default '{}',
  cost          bigint not null default 0,
  expense_id    uuid references transactions(id) on delete set null,
  auto          boolean not null default false,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create unique index one_auto_clean_per_booking on tasks (booking_id) where auto and type = 'cleaning';

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null, trigger text not null, channel text not null, subject text, body text not null
);

create table channel_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null check (provider in ('airbnb','booking_com','expedia','agoda','ical')),
  unit_id uuid not null references units(id) on delete cascade,
  import_url text,
  status text not null default 'connected',
  last_sync_at timestamptz
);

create table activity_log (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references members(id),
  action text not null, entity text not null, entity_id uuid, summary text not null
);
create index on activity_log (workspace_id, at desc);

-- ── Row Level Security ───────────────────────────────────────────────────

create or replace function my_member(p_workspace uuid) returns members
language sql stable security definer set search_path = public as $$
  select * from members where workspace_id = p_workspace and user_id = auth.uid() and status = 'active' limit 1
$$;

create or replace function has_role(p_workspace uuid, roles member_role[]) returns boolean
language sql stable as $$ select (my_member(p_workspace)).role = any(roles) $$;

create or replace function can_see_property(p_workspace uuid, p_property uuid) returns boolean
language sql stable as $$
  select coalesce((select m.role = 'owner' or cardinality(m.property_ids) = 0 or p_property = any(m.property_ids)
                   from (select (my_member(p_workspace)).*) m where m.id is not null), false)
$$;

alter table workspaces enable row level security;
create policy ws_read on workspaces for select using (my_member(id) is not null);
create policy ws_write on workspaces for update using (has_role(id, '{owner,manager}'));

alter table members enable row level security;
create policy members_read on members for select using (my_member(workspace_id) is not null);
create policy members_write on members for all using (has_role(workspace_id, '{owner}'));

-- Properties, units, tasks: visible per property assignment
do $$ declare t text; begin
  foreach t in array array['properties','units','rate_rules','property_documents','tasks'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %1$s_read on %1$I for select using (
      can_see_property(workspace_id, %2$s))$p$, t, case when t = 'properties' then 'id' else 'property_id' end);
  end loop;
end $$;
create policy properties_write on properties for all using (has_role(workspace_id, '{owner,manager}'));
create policy units_write on units for all using (has_role(workspace_id, '{owner,manager}'));
create policy rate_rules_write on rate_rules for all using (has_role(workspace_id, '{owner,manager}'));
create policy property_documents_write on property_documents for all using (has_role(workspace_id, '{owner,manager}'));
create policy tasks_write on tasks for all using (has_role(workspace_id, '{owner,manager,caretaker,cleaner}') and can_see_property(workspace_id, property_id));

-- Bookings: everyone except cleaners
alter table bookings enable row level security;
create policy bookings_read on bookings for select using (has_role(workspace_id, '{owner,manager,accountant,caretaker}') and can_see_property(workspace_id, property_id));
create policy bookings_write on bookings for all using (has_role(workspace_id, '{owner,manager,caretaker}') and can_see_property(workspace_id, property_id));

-- Guests: contact details hidden from accountants & cleaners (use guests_public view for names only)
alter table guests enable row level security;
create policy guests_read on guests for select using (has_role(workspace_id, '{owner,manager,caretaker}'));
create policy guests_write on guests for all using (has_role(workspace_id, '{owner,manager,caretaker}'));
create view guests_public with (security_invoker = false) as
  select g.id, g.workspace_id, g.first_name, g.last_name, g.city, g.country from guests g
  where has_role(g.workspace_id, '{owner,manager,accountant,caretaker}');

-- Finance: owners, managers, accountants only
do $$ declare t text; begin
  foreach t in array array['transactions','recurring_expenses','documents','document_counters'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %1$s_all on %1$I for all using (has_role(workspace_id, '{owner,manager,accountant}'))$p$, t);
  end loop;
end $$;

alter table message_templates enable row level security;
create policy templates_all on message_templates for all using (has_role(workspace_id, '{owner,manager}'));
alter table channel_connections enable row level security;
create policy channels_all on channel_connections for all using (has_role(workspace_id, '{owner,manager}'));
alter table activity_log enable row level security;
create policy activity_read on activity_log for select using (has_role(workspace_id, '{owner,manager}'));
create policy activity_insert on activity_log for insert with check (my_member(workspace_id) is not null);
