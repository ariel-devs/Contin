# Contin

Aplicación React con API Node.js para autenticar usuarios de SQL Server.

## Desarrollo

1. Instala dependencias con `npm install`.
2. Copia `.env.example` a `.env`. Configura `DB_SERVER` con el nombre del
   servidor SQL y `DB_DATABASE` con la base creada por `squema.sql`.
3. Para una instancia predeterminada, configura `DB_PORT` (normalmente `1433`).
   Para una instancia con nombre, configura `DB_INSTANCE` (por ejemplo,
   `SQLEXPRESS`) en lugar de `DB_PORT`.
4. Genera un valor secreto nuevo para `JWT_SECRET` (al menos 32 bytes).
5. Inicia el frontend y la API con `npm run dev`.

El backend se conecta a SQL Server con autenticación integrada de Windows,
usando la identidad de Windows que ejecuta `npm run dev` (o el servicio del
backend en producción). Esa identidad debe tener acceso a SQL Server y a la
base. `DB_SERVER` es el nombre del servidor/instancia, no el usuario de Windows.
El usuario y contraseña que se escriben en el formulario siguen siendo los
usuarios de la tabla `USUARIO`; son independientes de la autenticación usada
por el backend para conectarse a SQL Server.
Mantén `DB_ENCRYPT=true` en producción. Si el SQL Server local no admite la
conexión cifrada configurada, puedes usar `DB_ENCRYPT=false` solo en desarrollo.

El frontend reenvía `/api` a la API local. El endpoint `POST /api/auth/login`
recibe `{ "correo": "...", "contrasena": "..." }`, consulta la tabla `USUARIO`
y valida `contrasena_hash` con bcrypt. Una autenticación correcta devuelve un
token JWT con duración de una hora y los datos públicos del usuario.

Después de iniciar sesión, la aplicación carga las empresas asociadas al usuario:
si no hay ninguna, permite registrar la primera; si hay una, abre su Dashboard;
si hay varias, solicita elegir una. Las consultas de empresas, libros y resumen
requieren el token de sesión y verifican la propiedad de la empresa. En el
esquema actual los rangos de fechas y tipos contables están en `LIBRO`, por lo
que el selector de período usa los libros existentes, sin crear períodos
ficticios. Los indicadores y la actividad se calculan con partidas
contabilizadas del libro seleccionado; si no existen datos, se muestran estados
vacíos. Los importes se presentan sin símbolo de moneda porque el esquema no
define una moneda.

El módulo **Libro diario** consulta únicamente las partidas contabilizadas del
libro seleccionado y permite filtrar por fechas y número. El catálogo combina
cuentas predeterminadas con las cuentas de la empresa, conservando su jerarquía.
Al guardar una partida, la API asigna el siguiente número dentro del libro,
inserta el borrador y sus movimientos en una transacción y ejecuta el
procedimiento existente `dbo.sp_ContabilizarPartida` con `@IdPartida`; si falla
la contabilización, se revierte la transacción completa. No se modificó el
esquema ni se creó otro procedimiento. Los folios de presentación (`partida /
página`) se calculan al distribuir las partidas según la altura disponible de
cada hoja; la opción de impresión genera hojas A4 con «Vienen» y «Pasan».

La sección **Períodos contables** administra los registros de `LIBRO` asociados
a la empresa seleccionada. Crea períodos de tipo `DIARIO` en estado `ABIERTO`,
permite editar sus datos mientras no estén cerrados y evita cambiar el rango si
dejaría partidas existentes fuera del período. Al cerrar un período, el
procedimiento `dbo.sp_ContabilizarPartida` y la API existente impiden nuevas
contabilizaciones; los registros históricos siguen disponibles para consulta.
No se agregaron tablas ni procedimientos.

La sección **Catálogo de cuentas** consulta la jerarquía de
`CUENTA_PREDETERMINADA` y las cuentas de `CUENTA_PERSONALIZADA` de la empresa
seleccionada. El catálogo predeterminado es de solo lectura. Las cuentas
personalizadas se pueden crear, editar y desactivar; la API verifica propiedad
de la empresa, cuenta padre, clasificación, naturaleza y código único. Las
restricciones y triggers existentes siguen protegiendo la jerarquía y evitan
desactivar cuentas con movimientos contabilizados. No se requiere ejecutar un
nuevo script SQL si la base ya fue creada con `squema.sql`.

La columna `contrasena_hash` debe contener hashes bcrypt; nunca almacenes
contraseñas en texto plano. Para recuperar cuentas existentes cuyo valor aún
sea texto plano, un inicio de sesión correcto convierte ese valor a bcrypt y
lo guarda inmediatamente; los valores de relleno o hashes dañados deben
restablecerse manualmente. La sesión se conserva en `sessionStorage` durante la
pestaña actual, se descarta al cerrar sesión o cerrar la pestaña, y el token JWT
vence después de una hora.

## Comandos

- `npm run dev`: inicia API y frontend.
- `npm run build`: verifica TypeScript del frontend y backend y genera el build.
- `npm run lint`: ejecuta ESLint.
