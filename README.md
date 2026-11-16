# MisPréstamos

La aplicación de escritorio existente sigue usando `main.js` e `index.html`. La versión web para Railway usa `server.js`, `web.html` y `app.js`; el servidor web no sirve `data.json` ni expone las rutas antiguas `/data`.

## Preparar Supabase

1. En Supabase, conserva habilitado el inicio de sesión por correo y contraseña. No habilites el registro público.
2. Ejecuta `supabase-functions.sql` en **SQL Editor** después del esquema y las políticas iniciales. Las funciones registran préstamos y pagos con transacciones y comprueban que quien las invoque sea administrador.
3. La cuenta administrativa debe tener una fila en `public.profiles` con `role = 'admin'`. Cada cliente necesitará una cuenta de autenticación y su fila en `public.profiles` con `role = 'client'`.
4. No importes el JSON hasta crear los clientes y revisar qué préstamos corresponden a cada perfil.

La clave que se usa en el navegador es la clave **Publishable** (o la antigua clave `anon`). Nunca configures `service_role` ni una clave `secret` en la aplicación.

## Ejecutar localmente

Configura estas variables en la terminal antes de iniciar el servidor:

```powershell
$env:SUPABASE_URL = "https://TU-PROYECTO.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "TU-CLAVE-PUBLISHABLE"
npm start
```

Abre `http://localhost:3000`. Las variables no se guardan en los archivos del proyecto.

## Railway

Despliega este proyecto como servicio Node.js desde un repositorio Git. Railway ejecuta `npm start` y proporciona el puerto mediante `PORT`. En **Variables** agrega:

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_PUBLISHABLE_KEY`: clave Publishable (o usa `SUPABASE_ANON_KEY` para la clave antigua `anon`).

La aplicación web usa autenticación por contraseña y RLS para que cada cliente solo reciba sus propios préstamos y movimientos. El portal de cliente omite las notas internas. Antes de importar datos reales, prueba con cuentas diferentes y confirma que la separación entre clientes funciona.
