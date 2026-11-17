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



create or replace function public.import_legacy_data(p_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_loan jsonb;
  v_movement jsonb;
  v_old_id text;
  v_new_id bigint;
  v_id_map jsonb := '{}'::jsonb;
  v_loan_count integer := 0;
  v_movement_count integer := 0;
  v_person text;
  v_type text;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Solo el administrador puede importar respaldos.';
  end if;
  if p_data is null
    or jsonb_typeof(p_data->'loans') is distinct from 'array'
    or jsonb_typeof(p_data->'movs') is distinct from 'array'
    or jsonb_array_length(p_data->'loans') < 22
    or jsonb_array_length(p_data->'movs') < 21 then
    raise exception using errcode = '22023', message = 'Selecciona el respaldo actualizado con al menos 22 préstamos y 21 movimientos.';
  end if;
  if exists (select 1 from public.loans)
    or exists (select 1 from public.movements) then
    raise exception using errcode = '23505', message = 'La base de datos ya contiene préstamos o movimientos; no se importó nada.';
  end if;

  for v_loan in
    select value from jsonb_array_elements(p_data->'loans')
  loop
    v_old_id := v_loan->>'id';
    v_person := v_loan->>'person';
    if v_old_id is null or v_old_id !~ '^[0-9]+$'
      or v_person is null or v_person not in ('mama', 'papa')
      or v_loan->>'principal' is null
      or v_loan->>'total' is null
      or v_loan->>'interest' is null
      or v_loan->>'pct' is null
      or v_loan->>'wp' is null
      or v_loan->>'wt' is null
      or v_loan->>'sd' is null
      or v_loan->>'active' is null then
      raise exception using errcode = '22023', message = 'El respaldo contiene un préstamo con identificador o persona inválidos.';
    end if;
    if v_id_map ? v_old_id then
      raise exception using errcode = '22023', message = 'El respaldo contiene identificadores de préstamo duplicados.';
    end if;

    insert into public.loans (
      owner_id, person, name, principal, total, interest, pct,
      wp, wt, sd, pw, pa, active, note
    ) values (
      auth.uid(),
      v_person,
      coalesce(v_loan->>'name', case when v_person = 'mama' then 'Mamá' else 'Papá' end),
      (v_loan->>'principal')::numeric,
      (v_loan->>'total')::numeric,
      (v_loan->>'interest')::numeric,
      (v_loan->>'pct')::numeric,
      (v_loan->>'wp')::numeric,
      (v_loan->>'wt')::integer,
      (v_loan->>'sd')::date,
      coalesce((v_loan->>'pw')::integer, 0),
      coalesce((v_loan->>'pa')::numeric, 0),
      coalesce((v_loan->>'active')::boolean, true),
      coalesce(v_loan->>'note', '')
    )
    returning id into v_new_id;

    v_id_map := v_id_map || jsonb_build_object(v_old_id, v_new_id);
    v_loan_count := v_loan_count + 1;
  end loop;

  for v_movement in
    select value from jsonb_array_elements(p_data->'movs')
  loop
    v_old_id := v_movement->>'loanId';
    v_type := v_movement->>'type';
    if v_old_id is null or not (v_id_map ? v_old_id)
      or v_type is null or v_type not in ('prestamo', 'pago')
      or v_movement->>'date' is null
      or v_movement->>'amount' is null then
      raise exception using errcode = '22023', message = 'El respaldo contiene un movimiento con préstamo o tipo inválido.';
    end if;

    insert into public.movements (
      loan_id, movement_date, person, name, movement_type, amount, bal, note
    ) values (
      (v_id_map->>v_old_id)::bigint,
      (v_movement->>'date')::date,
      v_movement->>'person',
      v_movement->>'name',
      v_type,
      (v_movement->>'amount')::numeric,
      (v_movement->>'bal')::numeric,
      coalesce(v_movement->>'note', '')
    );
    v_movement_count := v_movement_count + 1;
  end loop;

  return jsonb_build_object('loans', v_loan_count, 'movements', v_movement_count);
end;
$$;

revoke all on function public.import_legacy_data(jsonb) from public, anon;
grant execute on function public.import_legacy_data(jsonb) to authenticated;
