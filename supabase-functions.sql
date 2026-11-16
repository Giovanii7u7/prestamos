create or replace function public.create_loan(
  p_owner_id uuid,
  p_person text,
  p_principal numeric,
  p_pct numeric,
  p_weekly numeric,
  p_start date,
  p_note text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
  v_total numeric(12,2);
  v_interest numeric(12,2);
  v_weeks integer;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Solo el administrador puede registrar préstamos.';
  end if;
  if p_owner_id is null or not exists (
    select 1 from public.profiles
    where id = p_owner_id and role = 'client'
  ) then
    raise exception using errcode = '22023', message = 'Selecciona un perfil de cliente válido.';
  end if;
  if p_principal is null or p_principal <= 0
    or p_pct is null or p_pct < 0
    or p_weekly is null or p_weekly <= 0
    or p_start is null then
    raise exception using errcode = '22023', message = 'Revisa los datos del préstamo.';
  end if;

  v_total := round(p_principal * (1 + p_pct / 100), 0);
  v_interest := v_total - p_principal;
  v_weeks := ceil(v_total / p_weekly);

  insert into public.loans (
    owner_id, person, name, principal, total, interest, pct,
    wp, wt, sd, pw, pa, active, note
  ) values (
    p_owner_id, p_person, p_person, p_principal, v_total, v_interest, p_pct,
    p_weekly, v_weeks, p_start, 0, 0, true, coalesce(p_note, '')
  )
  returning id into v_id;

  insert into public.movements (
    loan_id, movement_date, person, name, movement_type, amount, bal, note
  ) values (
    v_id, p_start, p_person, p_person, 'prestamo', -p_principal, null,
    coalesce(nullif(p_note, ''), 'Préstamo registrado')
  );

  return v_id;
end;
$$;

create or replace function public.register_payment(
  p_loan_id bigint,
  p_amount numeric,
  p_movement_date date,
  p_note text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_loan public.loans%rowtype;
  v_new_paid numeric(12,2);
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Solo el administrador puede registrar pagos.';
  end if;
  if p_amount is null or p_amount <= 0 or p_movement_date is null then
    raise exception using errcode = '22023', message = 'Revisa el monto y la fecha del pago.';
  end if;

  select * into v_loan
  from public.loans
  where id = p_loan_id
  for update;

  if not found or not v_loan.active then
    raise exception using errcode = '22023', message = 'El préstamo no existe o ya está liquidado.';
  end if;
  if p_amount > v_loan.total - v_loan.pa then
    raise exception using errcode = '22023', message = 'El pago no puede superar el saldo pendiente.';
  end if;

  v_new_paid := v_loan.pa + p_amount;

  update public.loans
  set pa = v_new_paid,
      pw = coalesce(pw, 0) + 1,
      active = v_new_paid < total
  where id = p_loan_id;

  insert into public.movements (
    loan_id, movement_date, person, name, movement_type, amount, bal, note
  ) values (
    p_loan_id, p_movement_date, v_loan.person, v_loan.name, 'pago',
    p_amount, v_loan.total - v_new_paid, coalesce(p_note, '')
  );
end;
$$;

revoke all on function public.create_loan(uuid, text, numeric, numeric, numeric, date, text) from public, anon;
revoke all on function public.register_payment(bigint, numeric, date, text) from public, anon;
grant execute on function public.create_loan(uuid, text, numeric, numeric, numeric, date, text) to authenticated;
grant execute on function public.register_payment(bigint, numeric, date, text) to authenticated;
