let supabaseClient;
let currentUser;
let currentProfile;
let clients = [];
let loans = [];
let movements = [];
let authNotice = '';
let legacyImportData = null;
let passwordSetupRequired = false;

const byId = (id) => document.getElementById(id);
const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const money = (value) => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2
}).format(Number(value) || 0);
const dateText = (value) => {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};
const longDateText = (value) => {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

function message(element, text, kind = 'error') {
  element.textContent = text;
  element.className = text ? kind : '';
}

function showLogin(text = authNotice) {
  byId('login-panel').classList.remove('hidden');
  byId('password-setup-panel').classList.add('hidden');
  byId('admin-panel').classList.add('hidden');
  byId('client-panel').classList.add('hidden');
  byId('user-label').classList.add('hidden');
  byId('sign-out').classList.add('hidden');
  message(byId('login-message'), text);
}

function showPasswordSetup(text = '') {
  byId('login-panel').classList.add('hidden');
  byId('password-setup-panel').classList.remove('hidden');
  byId('admin-panel').classList.add('hidden');
  byId('client-panel').classList.add('hidden');
  message(byId('password-setup-message'), text);
}

function option(value, label) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  return item;
}

function appendText(parent, tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value == null ? '' : String(value);
  parent.append(element);
  return element;
}

function moneyLine(parent, label, value) {
  const line = document.createElement('p');
  line.className = 'muted';
  line.textContent = `${label}: ${money(value)}`;
  parent.append(line);
}

async function loadProfile(user) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data || !['admin', 'client'].includes(data.role)) {
    throw new Error('Tu cuenta todavía no tiene un perfil habilitado. Contacta al administrador.');
  }
  return data;
}

async function openSession(user) {
  if (!user) {
    currentUser = null;
    currentProfile = null;
    if (passwordSetupRequired) {
      showLogin('El enlace de invitación venció o ya se utilizó. Pide al administrador que te envíe otra invitación.');
      return;
    }
    showLogin();
    return;
  }
  if (currentUser?.id === user.id && currentProfile) return;

  currentUser = user;
  byId('login-panel').classList.add('hidden');
  byId('password-setup-panel').classList.add('hidden');
  byId('user-label').textContent = user.email || '';
  byId('user-label').classList.remove('hidden');
  byId('sign-out').classList.remove('hidden');
  message(byId('login-message'), '');

  try {
    currentProfile = await loadProfile(user);
    if (currentProfile.role === 'admin') {
      byId('admin-panel').classList.remove('hidden');
      byId('client-panel').classList.add('hidden');
      await loadAdminData();
    } else {
      byId('client-panel').classList.remove('hidden');
      byId('admin-panel').classList.add('hidden');
      await loadClientData();
    }
  } catch (error) {
    const text = error.message || 'No se pudo cargar tu cuenta.';
    authNotice = text;
    await supabaseClient.auth.signOut();
    showLogin(authNotice);
  }
}

async function loadAdminData() {
  const [profilesResult, loansResult, movementsResult] = await Promise.all([
    supabaseClient.from('profiles').select('id, full_name').eq('role', 'client').order('full_name'),
    supabaseClient.from('loans').select('*').order('id', { ascending: false }),
    supabaseClient.from('movements').select('*').order('movement_date', { ascending: false })
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (loansResult.error) throw loansResult.error;
  if (movementsResult.error) throw movementsResult.error;

  clients = profilesResult.data || [];
  loans = loansResult.data || [];
  movements = movementsResult.data || [];
  fillSelect(byId('loan-owner'), clients, 'Elige un cliente');
  renderAdminLoans();
  renderAdminMovements();
  fillPaymentLoans();
}

async function loadClientData() {
  const [loansResult, movementsResult] = await Promise.all([
    supabaseClient.from('loans').select('id, principal, total, pct, wp, wt, sd, pw, pa, active').order('id', { ascending: false }),
    supabaseClient.from('movements').select('id, loan_id, movement_date, movement_type, amount, bal').order('movement_date', { ascending: false })
  ]);
  if (loansResult.error) throw loansResult.error;
  if (movementsResult.error) throw movementsResult.error;

  loans = loansResult.data || [];
  movements = movementsResult.data || [];
  renderClientLoans();
  renderClientMovements();
}

function fillSelect(select, items, placeholder) {
  select.replaceChildren(option('', placeholder));
  items.forEach((item) => select.append(option(item.id, item.full_name)));
  select.disabled = items.length === 0;
}

function renderAdminLoans() {
  const root = byId('tab-loans');
  root.replaceChildren();
  appendText(root, 'h2', '', `Préstamos (${loans.length})`);
  if (!clients.length) {
    appendText(root, 'p', 'muted', 'Aún no hay cuentas de clientes. Cuando estén creadas, asígnales el perfil "client" para poder registrar sus préstamos.');
  }
  const clientById = new Map(clients.map((client) => [client.id, client.full_name]));
  loans.forEach((loan) => {
    const card = document.createElement('article');
    card.className = 'card';
    const header = document.createElement('div');
    header.className = 'loan-title';
    const title = document.createElement('div');
    appendText(title, 'h3', '', `${clientById.get(loan.owner_id) || loan.name || 'Cliente'} — Préstamo #${loan.id}`);
    appendText(title, 'p', 'muted', loan.active ? 'Activo' : 'Liquidado');
    header.append(title);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Editar';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Eliminar';
    actions.append(edit, remove);
    header.append(actions);
    card.append(header);

    const percent = loan.total > 0 ? Math.min(100, Math.round((loan.pa / loan.total) * 100)) : 0;
    const progress = document.createElement('div');
    progress.className = 'progress';
    const fill = document.createElement('span');
    fill.style.width = `${percent}%`;
    progress.append(fill);
    card.append(progress);
    appendText(card, 'p', 'money', `${money(loan.pa)} cobrado · ${percent}%`);
    moneyLine(card, 'Prestado', loan.principal);
    moneyLine(card, 'Pendiente', Math.max(0, loan.total - loan.pa));
    moneyLine(card, 'Total / interés', `${money(loan.total)} / ${loan.pct}%`);
    moneyLine(card, 'Pago semanal', loan.wp);
    appendText(card, 'p', 'muted', `Inicio: ${dateText(loan.sd)} · Semanas pagadas: ${loan.pw}/${loan.wt}`);
    appendText(card, 'p', 'muted', loan.note || '');

    const editor = document.createElement('form');
    editor.className = 'inline-form hidden';
    editor.addEventListener('submit', (event) => updateLoan(event, loan.id, editor));
    const ownerSelect = document.createElement('select');
    ownerSelect.name = 'owner_id';
    fillSelect(ownerSelect, clients, 'Elige un cliente');
    if (!clients.some((client) => client.id === loan.owner_id)) {
      ownerSelect.append(option(
        loan.owner_id,
        loan.owner_id === currentUser.id
          ? `${currentProfile.full_name} (temporal)`
          : loan.name || 'Propietario actual'
      ));
      ownerSelect.disabled = false;
    }
    ownerSelect.value = loan.owner_id;
    addEditField(editor, 'Cliente', ownerSelect);
    addEditField(editor, 'Monto prestado', makeInput('principal', loan.principal));
    addEditField(editor, 'Interés (%)', makeInput('pct', loan.pct));
    addEditField(editor, 'Pago semanal', makeInput('wp', loan.wp));
    addEditField(editor, 'Fecha de inicio', makeInput('sd', loan.sd, 'date'));
    addEditField(editor, 'Ya pagado', makeInput('pa', loan.pa));
    const activeSelect = document.createElement('select');
    activeSelect.name = 'active';
    activeSelect.append(option('true', 'Activo'), option('false', 'Liquidado'));
    activeSelect.value = String(loan.active);
    addEditField(editor, 'Estado', activeSelect);
    addEditField(editor, 'Nota', makeInput('note', loan.note || '', 'text'));
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'primary';
    save.textContent = 'Guardar cambios';
    editor.append(save);
    card.append(editor);
    edit.addEventListener('click', () => editor.classList.toggle('hidden'));
    remove.addEventListener('click', () => deleteLoan(loan.id));
    root.append(card);
  });
}

function makeInput(name, value, type = 'number') {
  const input = document.createElement('input');
  input.name = name;
  input.type = type;
  input.value = value == null ? '' : String(value);
  if (type === 'number') {
    input.min = '0';
    input.step = '0.01';
    input.required = true;
  }
  if (name === 'note') input.maxLength = 500;
  return input;
}

function addEditField(form, labelText, input) {
  const wrapper = document.createElement('div');
  const label = document.createElement('label');
  label.textContent = labelText;
  wrapper.append(label, input);
  form.append(wrapper);
}

function renderAdminMovements() {
  const root = byId('admin-movements');
  root.replaceChildren();
  if (!movements.length) {
    appendText(root, 'p', 'muted', 'Todavía no hay movimientos.');
    return;
  }
  const loanNames = new Map(loans.map((loan) => [loan.id, loan.name || 'Cliente']));
  movements.forEach((movement) => {
    const row = document.createElement('div');
    row.className = 'movement';
    appendText(row, 'span', 'muted', dateText(movement.movement_date));
    appendText(row, 'span', '', `${loanNames.get(movement.loan_id) || 'Cliente'} · #${movement.loan_id} · ${movement.note || movement.movement_type}`);
    appendText(row, 'strong', '', money(movement.amount));
    root.append(row);
  });
}

function renderClientLoans() {
  const pendingRoot = byId('client-pending-loans');
  const paidRoot = byId('client-paid-loans');
  pendingRoot.replaceChildren();
  paidRoot.replaceChildren();

  const pendingLoans = [];
  const paidLoans = [];
  loans.forEach((loan) => {
    const remaining = Math.max(0, Number(loan.total) - Number(loan.pa));
    if (!loan.active || remaining === 0) paidLoans.push(loan);
    else pendingLoans.push(loan);
  });

  if (!pendingLoans.length) {
    appendText(pendingRoot, 'p', 'muted', 'No tienes préstamos por pagar.');
  } else {
    pendingLoans.forEach((loan) => renderClientLoan(pendingRoot, loan, false));
  }
  if (!paidLoans.length) {
    appendText(paidRoot, 'p', 'muted', 'Aún no tienes préstamos pagados.');
  } else {
    paidLoans.forEach((loan) => renderClientLoan(paidRoot, loan, true));
  }
}

function renderClientLoan(root, loan, paid) {
    const card = document.createElement('article');
    card.className = `card client-loan ${paid ? 'paid' : 'pending'}`;
    appendText(card, 'h3', '', `Préstamo #${loan.id}`);
    appendText(card, 'span', `client-status ${paid ? 'paid' : 'pending'}`, paid ? 'Pagado' : 'Por pagar');
    const total = Number(loan.total) || 0;
    const paidAmount = Number(loan.pa) || 0;
    const remaining = Math.max(0, total - paidAmount);
    const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((paidAmount / total) * 100))) : 0;
    const progress = document.createElement('div');
    progress.className = 'progress';
    const fill = document.createElement('span');
    fill.style.width = `${percent}%`;
    progress.append(fill);
    card.append(progress);
    appendText(card, 'p', 'muted', `${percent}% pagado`);
    moneyLine(card, 'Monto prestado', loan.principal);
    moneyLine(card, 'Total acordado', loan.total);
    moneyLine(card, 'Pagado', paidAmount);
    if (!paid) moneyLine(card, 'Saldo pendiente', remaining);

    const highlights = document.createElement('div');
    highlights.className = 'client-highlights';
    const weekly = document.createElement('div');
    weekly.className = 'client-highlight';
    appendText(weekly, 'span', 'client-highlight-label', 'Pago semanal');
    appendText(weekly, 'strong', 'client-highlight-value', money(loan.wp));
    const startDate = document.createElement('div');
    startDate.className = 'client-highlight';
    appendText(startDate, 'span', 'client-highlight-label', 'Fecha de inicio');
    appendText(startDate, 'strong', 'client-highlight-value date', longDateText(loan.sd));
    highlights.append(weekly, startDate);
    card.append(highlights);
    root.append(card);
}

function renderClientMovements() {
  const root = byId('client-movements');
  root.replaceChildren();
  if (!movements.length) {
    appendText(root, 'p', 'muted', 'Todavía no hay movimientos.');
    return;
  }
  movements.forEach((movement) => {
    const row = document.createElement('div');
    row.className = 'movement';
    appendText(row, 'span', 'muted', dateText(movement.movement_date));
    const isPayment = movement.movement_type === 'pago';
    appendText(row, 'span', '', `Préstamo #${movement.loan_id} · ${isPayment ? 'Pago recibido' : 'Préstamo registrado'}`);
    appendText(row, 'strong', '', money(isPayment ? movement.amount : Math.abs(movement.amount)));
    root.append(row);
  });
}

function fillPaymentLoans() {
  const activeLoans = loans.filter((loan) => loan.active);
  byId('payment-loan').replaceChildren(
    option('', activeLoans.length ? 'Elige un préstamo' : 'No hay préstamos activos'),
    ...activeLoans.map((loan) => option(loan.id, `#${loan.id} · ${loan.name || ''} · ${money(loan.total - loan.pa)} pendiente`))
  );
}

async function updateLoan(event, id, form) {
  event.preventDefault();
  const values = new FormData(form);
  const existingLoan = loans.find((loan) => loan.id === id);
  const selectedOwnerId = values.get('owner_id');
  const owner = clients.find((client) => client.id === selectedOwnerId);
  const keepAdminOwner = selectedOwnerId === currentUser.id
    && existingLoan?.owner_id === currentUser.id;
  const principal = Number(values.get('principal'));
  const pct = Number(values.get('pct'));
  const weekly = Number(values.get('wp'));
  const paid = Number(values.get('pa'));
  if (weekly <= 0 || paid > principal * (1 + pct / 100)) {
    setAdminMessage('Revisa el pago semanal y el monto pagado.', 'error');
    return;
  }
  if (!owner && !keepAdminOwner) {
    setAdminMessage('Selecciona un perfil de cliente válido.', 'error');
    return;
  }
  const ownerName = owner?.full_name || existingLoan.name || existingLoan.person;
  const total = Math.round(principal * (1 + pct / 100));
  const { error } = await supabaseClient.from('loans').update({
    owner_id: owner?.id || currentUser.id,
    person: owner?.full_name || existingLoan.person,
    name: ownerName,
    principal,
    pct,
    total,
    interest: total - principal,
    wp: weekly,
    wt: Math.ceil(total / weekly),
    sd: values.get('sd'),
    pa: paid,
    pw: Math.floor(paid / weekly),
    active: values.get('active') === 'true',
    note: values.get('note')
  }).eq('id', id);
  if (error) {
    setAdminMessage(error.message);
    return;
  }
  setAdminMessage('Préstamo actualizado.', 'success');
  await refreshAdminData();
}

async function deleteLoan(id) {
  if (!window.confirm(`¿Eliminar el préstamo #${id} y sus movimientos?`)) return;
  const { error } = await supabaseClient.from('loans').delete().eq('id', id);
  if (error) {
    setAdminMessage(error.message);
    return;
  }
  setAdminMessage('Préstamo eliminado.', 'success');
  await refreshAdminData();
}

function setAdminMessage(text, kind = 'error') {
  message(byId('admin-message'), text, kind);
}

async function refreshAdminData() {
  try {
    await loadAdminData();
  } catch (error) {
    setAdminMessage(error.message || 'No se pudieron actualizar los datos.');
  }
}

function previewLegacyImport(file) {
  const preview = byId('import-preview');
  const button = byId('import-button');
  legacyImportData = null;
  button.disabled = true;
  if (!file) {
    preview.textContent = '';
    return;
  }

  file.text().then((text) => {
    const data = JSON.parse(text);
    if (!Array.isArray(data.loans) || !Array.isArray(data.movs)) {
      throw new Error('El archivo debe tener arreglos "loans" y "movs", y al menos un préstamo.');
    }
    if (data.loans.length < 22 || data.movs.length < 21) {
      throw new Error('Este archivo parece ser la copia antigua. Selecciona el respaldo actualizado (22 o más préstamos y 21 o más movimientos).');
    }
    legacyImportData = data;
    preview.textContent = `Archivo listo: ${data.loans.length} préstamos y ${data.movs.length} movimientos. Verifica que sea el respaldo actualizado antes de importar.`;
    button.disabled = false;
    message(byId('admin-message'), '');
  }).catch((error) => {
    preview.textContent = '';
    legacyImportData = null;
    setAdminMessage(error instanceof SyntaxError
      ? 'El archivo no contiene JSON válido.'
      : error.message || 'No se pudo leer el archivo.');
  });
}

async function importLegacyData(event) {
  event.preventDefault();
  if (!legacyImportData) {
    setAdminMessage('Selecciona y revisa el archivo de respaldo primero.');
    return;
  }
  const loanCount = legacyImportData.loans.length;
  const movementCount = legacyImportData.movs.length;
  if (!window.confirm(
    `Se importarán ${loanCount} préstamos y ${movementCount} movimientos bajo tu cuenta de administrador. ¿Continuar?`
  )) return;

  const form = event.currentTarget;
  busy(form, true);
  const { data, error } = await supabaseClient.rpc('import_legacy_data', {
    p_data: legacyImportData
  });
  busy(form, false);
  if (error) {
    setAdminMessage(error.message || 'No se pudo importar el respaldo.');
    return;
  }

  legacyImportData = null;
  form.reset();
  byId('import-preview').textContent = '';
  setAdminMessage(
    `Importación completada: ${data.loans} préstamos y ${data.movements} movimientos.`,
    'success'
  );
  await refreshAdminData();
  document.querySelector('[data-tab="loans"]').click();
}

function busy(form, state) {
  form.querySelectorAll('button').forEach((button) => { button.disabled = state; });
}

function setDefaultDates() {
  byId('loan-date').value = today();
  byId('payment-date').value = today();
}

async function start() {
  if (!window.APP_CONFIG?.supabaseUrl || !window.APP_CONFIG?.supabaseKey) {
    showLogin('Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en las variables de entorno de Netlify.');
    return;
  }
  if (!window.supabase?.createClient) {
    showLogin('No se pudo cargar el cliente de Supabase.');
    return;
  }

  supabaseClient = window.supabase.createClient(
    window.APP_CONFIG.supabaseUrl,
    window.APP_CONFIG.supabaseKey
  );
  setDefaultDates();

  byId('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    busy(form, true);
    authNotice = '';
    message(byId('login-message'), '');
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: byId('email').value.trim(),
      password: byId('password').value
    });
    if (error) message(byId('login-message'), error.message);
    busy(form, false);
  });

  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = byId(button.dataset.passwordToggle);
      const isVisible = input.type === 'text';
      input.type = isVisible ? 'password' : 'text';
      button.textContent = isVisible ? 'Mostrar' : 'Ocultar';
      button.setAttribute('aria-pressed', String(!isVisible));
      button.setAttribute('aria-label', `${isVisible ? 'Mostrar' : 'Ocultar'} contraseña`);
    });
  });

  byId('password-setup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = byId('new-password').value;
    if (password !== byId('confirm-password').value) {
      message(byId('password-setup-message'), 'Las contraseñas no coinciden.');
      return;
    }

    busy(form, true);
    message(byId('password-setup-message'), '');
    const { data, error } = await supabaseClient.auth.updateUser({ password });
    busy(form, false);
    if (error) {
      message(byId('password-setup-message'), error.message);
      return;
    }

    passwordSetupRequired = false;
    window.history.replaceState({}, document.title, window.location.pathname);
    form.reset();
    await openSession(data.user);
  });

  byId('sign-out').addEventListener('click', async () => {
    authNotice = '';
    const { error } = await supabaseClient.auth.signOut();
    if (error) message(byId('login-message'), error.message);
  });

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
      ['loans', 'new-loan', 'payment', 'movements', 'import'].forEach((tab) => {
        byId(`tab-${tab}`).classList.toggle('hidden', tab !== button.dataset.tab);
      });
    });
  });

  byId('backup-file').addEventListener('change', (event) => {
    previewLegacyImport(event.currentTarget.files[0]);
  });
  byId('import-form').addEventListener('submit', importLegacyData);

  byId('new-loan-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    busy(form, true);
    const owner = clients.find((client) => client.id === byId('loan-owner').value);
    const principal = Number(byId('loan-principal').value);
    const pct = Number(byId('loan-interest').value);
    const weekly = Number(byId('loan-weekly').value);
    const total = Math.round(principal * (1 + pct / 100));
    const { error } = await supabaseClient.rpc('create_loan', {
      p_owner_id: owner?.id,
      p_person: owner?.full_name,
      p_principal: principal,
      p_pct: pct,
      p_weekly: weekly,
      p_start: byId('loan-date').value,
      p_note: byId('loan-note').value.trim()
    });
    busy(form, false);
    if (error) {
      setAdminMessage(error.message);
      return;
    }
    form.reset();
    setDefaultDates();
    byId('loan-interest').value = '25';
    setAdminMessage('Préstamo registrado.', 'success');
    await refreshAdminData();
    document.querySelector('[data-tab="loans"]').click();
  });

  byId('payment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    busy(form, true);
    const { error } = await supabaseClient.rpc('register_payment', {
      p_loan_id: Number(byId('payment-loan').value),
      p_amount: Number(byId('payment-amount').value),
      p_movement_date: byId('payment-date').value,
      p_note: byId('payment-note').value.trim()
    });
    busy(form, false);
    if (error) {
      setAdminMessage(error.message);
      return;
    }
    form.reset();
    setDefaultDates();
    setAdminMessage('Pago registrado.', 'success');
    await refreshAdminData();
  });

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const queryParams = new URLSearchParams(window.location.search);
  passwordSetupRequired = ['invite', 'recovery'].includes(
    hashParams.get('type') || queryParams.get('type')
  );

  supabaseClient.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY'
        || (passwordSetupRequired && session?.user)) {
        showPasswordSetup();
        return;
      }
      openSession(session?.user || null);
    }, 0);
  });
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    showLogin(error.message);
    return;
  }
  if (passwordSetupRequired && data.session?.user) {
    showPasswordSetup();
    return;
  }
  await openSession(data.session?.user || null);
}

window.addEventListener('DOMContentLoaded', () => {
  start().catch((error) => {
    showLogin(error.message || 'Ocurrió un error al iniciar la aplicación.');
  });
});
