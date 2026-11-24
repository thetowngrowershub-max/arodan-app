-- Rider bank payouts.
-- Riders add a Nigerian bank account in the rider app; the API checks it with Paystack and saves the
-- Paystack transfer recipient. Their balance is paid out by Paystack transfer, either when they tap
-- "Withdraw" or in the nightly automatic run (server/src/payouts.js).
--
-- A rider's balance is everything not yet paid out:
--   + what they earned on each drop (rider_earnings.amount)
--   + errand purchases they paid for with their own money (rider_earnings.errand_spend)
--   − cash they collected at the door on pay-on-delivery orders (rider_earnings.cash_collected)
--   ± adjustments by Arodan ops (rider_adjustments), e.g. cash handed in at the office, a bonus or a tip.
-- Each payout settles every unpaid line at once, so nothing is paid twice. A failed payout releases them again.

alter table public.rider_earnings add column errand_spend int not null default 0;
alter table public.rider_earnings add column cash_collected int not null default 0;

-- Fill the two new columns from the order whenever a drop is recorded (and for drops already recorded).
create function public.on_rider_earning_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = new.order_id;
  new.errand_spend := coalesce(o.errand_purchases, 0);
  new.cash_collected := case when o.payment_method = 'pod' then o.total else 0 end;
  return new;
end $$;
create trigger rider_earning_fill before insert on public.rider_earnings
for each row execute function public.on_rider_earning_insert();

update public.rider_earnings e set errand_spend = o.errand_purchases,
  cash_collected = case when o.payment_method = 'pod' then o.total else 0 end
from public.orders o where o.id = e.order_id;

create table public.rider_bank_accounts (
  rider_id uuid primary key references public.riders (id) on delete cascade,
  bank_code text not null,
  bank_name text not null,
  account_number text not null check (account_number ~ '^\d{10}$'),
  account_name text not null, -- as the bank has it (from Paystack's account check)
  recipient_code text not null, -- Paystack transfer recipient (RCP_…)
  -- Changing the account holds payouts for 24 hours, in case someone else got into the rider's phone.
  payouts_from timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rider_payouts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique, -- sent to Paystack; makes retries safe (Paystack refuses a reused reference)
  rider_id uuid not null references public.riders (id),
  amount int not null check (amount > 0),
  status text not null default 'processing' check (status in ('processing', 'paid', 'failed')),
  trigger text not null check (trigger in ('rider', 'auto', 'admin')),
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  recipient_code text not null,
  transfer_code text, -- Paystack's TRF_…
  failure_reason text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on public.rider_payouts (rider_id, created_at desc);
create index on public.rider_payouts (status) where status = 'processing';
-- At most one payout in flight per rider.
create unique index rider_payouts_one_processing on public.rider_payouts (rider_id) where status = 'processing';

create table public.rider_adjustments (
  id bigint generated always as identity primary key,
  rider_id uuid not null references public.riders (id),
  amount int not null check (amount <> 0), -- positive: Arodan owes the rider more; negative: less
  note text not null,
  created_by uuid references public.profiles (id),
  at timestamptz not null default now(),
  payout_id uuid references public.rider_payouts (id)
);
create index on public.rider_adjustments (rider_id) where payout_id is null;

alter table public.rider_earnings add column payout_id uuid references public.rider_payouts (id);
create index on public.rider_earnings (rider_id) where payout_id is null;

-- Days the automatic run has happened (stops two servers paying the same day twice).
create table public.payout_runs (day date primary key, at timestamptz not null default now());

-- Payout settings (merged into the existing riderPayout block; also in db/seed.sql for new databases).
-- autoPayoutHour: Lagos hour of the nightly run (missing = 21, null = no nightly run).
update public.pricing_config set config = jsonb_set(config, '{riderPayout}',
  coalesce(config -> 'riderPayout', '{}') || '{"minWithdrawal": 1000, "autoPayoutHour": 21}'::jsonb)
where id = 1;

alter table public.rider_bank_accounts enable row level security;
alter table public.rider_payouts enable row level security;
alter table public.rider_adjustments enable row level security;
alter table public.payout_runs enable row level security;
create policy "own bank account" on public.rider_bank_accounts for select using (rider_id = auth.uid());
create policy "own payouts" on public.rider_payouts for select using (rider_id = auth.uid());
create policy "own adjustments" on public.rider_adjustments for select using (rider_id = auth.uid());

-- ───────────────────────── Balance ─────────────────────────
create function public.rider_balance(p_rider uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with e as (
    select coalesce(sum(amount), 0)::int as earned, coalesce(sum(errand_spend), 0)::int as errand_spend,
           coalesce(sum(cash_collected), 0)::int as cash, count(*)::int as drops
    from rider_earnings where rider_id = p_rider and payout_id is null
  ), a as (
    select coalesce(sum(amount), 0)::int as adj from rider_adjustments where rider_id = p_rider and payout_id is null
  )
  select jsonb_build_object('earned', e.earned, 'errandSpend', e.errand_spend, 'cashCollected', e.cash,
                            'adjustments', a.adj, 'drops', e.drops, 'available', e.earned + e.errand_spend - e.cash + a.adj)
  from e, a
$$;

create function public.rider_payout_json(p public.rider_payouts) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', p.id, 'amount', p.amount, 'status', p.status, 'trigger', p.trigger,
    'bankName', p.bank_name, 'accountNumber', '******' || right(p.account_number, 4), 'accountName', p.account_name,
    'failureReason', p.failure_reason, 'createdAt', p.created_at, 'paidAt', p.paid_at)
$$;

-- Everything the rider app's wallet screen shows (for the signed-in rider).
create function public.rider_wallet() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r riders := public.current_rider();
  b rider_bank_accounts;
  c jsonb := coalesce((select config -> 'riderPayout' from pricing_config where id = 1), '{}');
begin
  select * into b from rider_bank_accounts where rider_id = r.id;
  return jsonb_build_object(
    'balance', public.rider_balance(r.id),
    'minWithdrawal', coalesce((c ->> 'minWithdrawal')::int, 1000),
    'autoPayoutHour', case when c ? 'autoPayoutHour' then (c ->> 'autoPayoutHour')::int else 21 end,
    'bankAccount', case when b.rider_id is null then null else jsonb_build_object(
      'bankCode', b.bank_code, 'bankName', b.bank_name, 'accountNumber', '******' || right(b.account_number, 4),
      'accountName', b.account_name, 'payoutsFrom', b.payouts_from) end,
    'payouts', coalesce((select jsonb_agg(public.rider_payout_json(p) order by p.created_at desc)
                         from (select * from rider_payouts where rider_id = r.id order by created_at desc limit 20) p), '[]'::jsonb));
end $$;

-- ───────────────────────── Bank account ─────────────────────────
-- Called by the API (not the app) after Paystack has confirmed the account and made the recipient.
create function public.rider_set_bank_account(p_rider uuid, p_bank_code text, p_bank_name text, p_account_number text,
                                              p_account_name text, p_recipient_code text) returns void
language plpgsql security definer set search_path = public as $$
declare old rider_bank_accounts;
begin
  select * into old from rider_bank_accounts where rider_id = p_rider;
  insert into rider_bank_accounts (rider_id, bank_code, bank_name, account_number, account_name, recipient_code, payouts_from)
  values (p_rider, p_bank_code, p_bank_name, p_account_number, p_account_name, p_recipient_code, now())
  on conflict (rider_id) do update set bank_code = excluded.bank_code, bank_name = excluded.bank_name,
    account_number = excluded.account_number, account_name = excluded.account_name, recipient_code = excluded.recipient_code,
    payouts_from = case when rider_bank_accounts.bank_code = excluded.bank_code and rider_bank_accounts.account_number = excluded.account_number
                        then rider_bank_accounts.payouts_from else now() + interval '24 hours' end,
    updated_at = now();
  if old.rider_id is not null and (old.bank_code <> p_bank_code or old.account_number <> p_account_number) then
    perform push_queue(p_rider, 'rider', 'Bank account changed',
      'Payouts now go to ' || p_bank_name || ' ******' || right(p_account_number, 4) || ', starting in 24 hours. Not you? Call Arodan support now.',
      '{"type":"wallet"}');
  end if;
end $$;

-- ───────────────────────── Payouts ─────────────────────────
-- Start a payout of the rider's whole available balance. Returns the payout, or raises a reason it can't happen.
-- The API then asks Paystack to send the money and records the result with rider_payout_finish().
create function public.rider_payout_create(p_rider uuid, p_trigger text) returns public.rider_payouts
language plpgsql security definer set search_path = public as $$
declare
  r riders;
  b rider_bank_accounts;
  bal int;
  minw int := coalesce((select (config -> 'riderPayout' ->> 'minWithdrawal')::int from pricing_config where id = 1), 1000);
  p rider_payouts;
  pid uuid := gen_random_uuid();
begin
  select * into r from riders where id = p_rider for update; -- one payout decision per rider at a time
  if not found then raise exception 'Rider not found'; end if;
  if not r.active then raise exception 'This rider account is paused. Call Arodan support.'; end if;
  select * into b from rider_bank_accounts where rider_id = r.id;
  if not found then raise exception 'Add your bank account first'; end if;
  if b.payouts_from > now() then
    raise exception 'Your new bank account can receive payouts from %', to_char(b.payouts_from at time zone 'Africa/Lagos', 'FMHH12:MI am "on" Dy FMDD Mon');
  end if;
  if exists (select 1 from rider_payouts where rider_id = r.id and status = 'processing') then
    raise exception 'A payout is already on its way';
  end if;
  bal := (public.rider_balance(r.id) ->> 'available')::int;
  if bal < minw then raise exception 'You can withdraw once your balance reaches ₦%', to_char(minw, 'FM999,999,990'); end if;

  insert into rider_payouts (id, reference, rider_id, amount, trigger, bank_name, account_number, account_name, recipient_code)
  values (pid, 'arodan_po_' || replace(pid::text, '-', ''), r.id, bal, p_trigger, b.bank_name, b.account_number, b.account_name, b.recipient_code)
  returning * into p;
  update rider_earnings set payout_id = p.id where rider_id = r.id and payout_id is null;
  update rider_adjustments set payout_id = p.id where rider_id = r.id and payout_id is null;
  return p;
end $$;

-- Record what Paystack said. 'paid' is final; 'failed' puts the money back in the rider's balance.
-- A payout that was paid and then reversed by the bank is also marked failed and its lines released.
create function public.rider_payout_finish(p_id uuid, p_status text, p_transfer_code text default null, p_reason text default null)
returns public.rider_payouts language plpgsql security definer set search_path = public as $$
declare p rider_payouts;
begin
  select * into p from rider_payouts where id = p_id for update;
  if not found then raise exception 'payout not found'; end if;
  if p_status not in ('processing', 'paid', 'failed') then raise exception 'bad status'; end if;
  if p.status = p_status or p.status = 'failed' then
    -- Nothing new (webhooks can arrive more than once); just keep the transfer code.
    update rider_payouts set transfer_code = coalesce(p_transfer_code, transfer_code), updated_at = now() where id = p.id returning * into p;
    return p;
  end if;
  update rider_payouts set status = p_status, transfer_code = coalesce(p_transfer_code, transfer_code),
    failure_reason = case when p_status = 'failed' then left(coalesce(p_reason, 'Transfer failed'), 300) else failure_reason end,
    paid_at = case when p_status = 'paid' then now() else paid_at end, updated_at = now()
  where id = p.id returning * into p;

  if p_status = 'paid' then
    perform push_queue(p.rider_id, 'rider', 'Payout sent',
      '₦' || to_char(p.amount, 'FM999,999,990') || ' is on its way to ' || p.bank_name || ' ******' || right(p.account_number, 4) || '.',
      '{"type":"wallet"}');
  elsif p_status = 'failed' then
    update rider_earnings set payout_id = null where payout_id = p.id;
    update rider_adjustments set payout_id = null where payout_id = p.id;
    perform push_queue(p.rider_id, 'rider', 'Payout did not go through',
      '₦' || to_char(p.amount, 'FM999,999,990') || ' is back in your Arodan balance. Check your bank details or try again later.',
      '{"type":"wallet"}');
  end if;
  return p;
end $$;

-- Riders due an automatic payout: available balance at least the minimum, bank account ready.
create function public.riders_due_payout() returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id from riders r join rider_bank_accounts b on b.rider_id = r.id
  where r.active and b.payouts_from <= now()
    and not exists (select 1 from rider_payouts p where p.rider_id = r.id and p.status = 'processing')
    and (public.rider_balance(r.id) ->> 'available')::int
        >= coalesce((select (config -> 'riderPayout' ->> 'minWithdrawal')::int from pricing_config where id = 1), 1000)
$$;

-- ───────────────────────── Admin ─────────────────────────
create function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'Admins only'; end if;
end $$;

-- e.g. a rider hands in ₦12,500 of pay-on-delivery cash at the office: amount 12500, note 'Cash handed in'.
create function public.admin_rider_adjustment(p_rider uuid, p_amount int, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  if not exists (select 1 from riders where id = p_rider) then raise exception 'Rider not found'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a note saying what this is for'; end if;
  insert into rider_adjustments (rider_id, amount, note, created_by) values (p_rider, p_amount, left(trim(p_note), 200), auth.uid());
  return public.rider_balance(p_rider);
end $$;

create function public.admin_rider_balances() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('riderId', r.id, 'name', r.display_name, 'phone', r.phone,
      'balance', public.rider_balance(r.id), 'hasBankAccount', exists (select 1 from rider_bank_accounts b where b.rider_id = r.id))
    order by r.display_name) from riders r), '[]'::jsonb);
end $$;

create function public.admin_payouts(p_status text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((select jsonb_agg(public.rider_payout_json(p) || jsonb_build_object('riderId', p.rider_id, 'rider', r.display_name,
      'reference', p.reference, 'transferCode', p.transfer_code) order by p.created_at desc)
    from (select * from rider_payouts where p_status = '' or status = p_status order by created_at desc limit 200) p
    join riders r on r.id = p.rider_id), '[]'::jsonb);
end $$;

-- ───────────────────────── Permissions ─────────────────────────
do $grants$ declare f text; begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute $q$revoke insert, update, delete on public.rider_bank_accounts, public.rider_payouts, public.rider_adjustments, public.payout_runs from anon, authenticated$q$;
    execute $q$revoke select on public.payout_runs from anon, authenticated$q$;
    -- The rider's bank details are only shown masked, through rider_wallet().
    execute $q$revoke select on public.rider_bank_accounts from anon, authenticated$q$;
    foreach f in array array['rider_wallet()', 'admin_rider_adjustment(uuid, int, text)', 'admin_rider_balances()', 'admin_payouts(text)'] loop
      execute format('revoke all on function public.%s from public, anon', f);
      execute format('grant execute on function public.%s to authenticated', f);
    end loop;
    -- Only the API server itself (not a signed-in user) may move money.
    foreach f in array array['rider_balance(uuid)', 'rider_set_bank_account(uuid, text, text, text, text, text)',
                             'rider_payout_create(uuid, text)', 'rider_payout_finish(uuid, text, text, text)', 'riders_due_payout()'] loop
      execute format('revoke all on function public.%s from public, anon, authenticated', f);
    end loop;
  end if;
end $grants$;
