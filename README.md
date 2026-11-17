# MisPréstamos

La aplicación de escritorio existente sigue usando `main.js` e `index.html`. La versión web usa `web.html` y `app.js`; no publica `data.json` ni las rutas antiguas `/data`.

## Preparar Supabase

1. En Supabase, conserva habilitado el inicio de sesión por correo y contraseña. No habilites el registro público.
2. Ejecuta `supabase-functions.sql` en **SQL Editor** después del esquema y las políticas iniciales. Las funciones registran préstamos y pagos con transacciones y comprueban que quien las invoque sea administrador.
3. La cuenta administrativa debe tener una fila en `public.profiles` con `role = 'admin'`. Cada cliente necesitará una cuenta de autenticación y su fila en `public.profiles` con `role = 'client'`.
4. El administrador puede importar `data.json` desde la sección **Importar respaldo**. Usa el archivo actualizado de `%APPDATA%\prestamos\data.json`, no la copia antigua de la carpeta extraída. La función requiere al menos 22 préstamos y 21 movimientos y solo acepta la importación si la base de datos no tiene préstamos ni movimientos; asigna temporalmente todos los registros a la cuenta administradora. Después, crea los perfiles de clientes y reasigna cada préstamo desde el panel antes de dar acceso a los clientes.

La clave que se usa en el navegador es la clave **Publishable** (o la antigua clave `anon`). Nunca configures `service_role` ni una clave `secret` en la aplicación.

## Netlify

El repositorio incluye `netlify.toml` y una función que entrega la configuración pública de Supabase sin guardar credenciales en el código.

1. En Netlify, importa el repositorio privado de GitHub `prestamos`.
2. Usa el comando de compilación `npm run build` y el directorio de publicación `dist`. Netlify puede leer estos valores directamente de `netlify.toml`.
3. En **Site configuration → Environment variables**, agrega `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` (o la antigua clave `SUPABASE_ANON_KEY`).
4. No agregues claves `service_role` o `secret`. Después de agregar variables, vuelve a desplegar el sitio.
5. Comprueba `/health` no aplica en Netlify. Abre `/.netlify/functions/config`: debe devolver el URL y la clave Publishable en JSON, nunca una clave secreta. Luego abre la URL del sitio para iniciar sesión.

Netlify recibe solo la carpeta `dist`; la base de datos queda en Supabase. Los archivos `data.json`, `main.js` y la aplicación Electron no forman parte del sitio publicado.

## Instalar en Android

Después de publicar los cambios en Netlify, abre la URL pública del sitio en Chrome para Android, inicia sesión y usa el menú de Chrome → **Instalar aplicación** o **Agregar a pantalla principal**. El icono y el nombre se definen en `public/manifest.webmanifest`.

## Ejecutar localmente

Configura estas variables en la terminal antes de iniciar el servidor:

```powershell
$env:SUPABASE_URL = "https://TU-PROYECTO.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "TU-CLAVE-PUBLISHABLE"
npm start
```

Para probar la versión Express local, abre `http://localhost:3000`. Las variables no se guardan en los archivos del proyecto.

## Railway (alternativa)

La versión Express también se puede ejecutar como servicio Node.js desde Railway. Railway ejecuta `npm start` y proporciona el puerto mediante `PORT`. En **Variables** agrega:

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_PUBLISHABLE_KEY`: clave Publishable (o usa `SUPABASE_ANON_KEY` para la clave antigua `anon`).

La aplicación web usa autenticación por contraseña y RLS para que cada cliente solo reciba sus propios préstamos y movimientos. El portal de cliente omite las notas internas. Antes de importar datos reales, prueba con cuentas diferentes y confirma que la separación entre clientes funciona.
