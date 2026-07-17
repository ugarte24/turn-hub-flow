# PRD — SIGAT

**Producto:** SIGAT — Sistema Integral de Gestión de Atención por Turnos  
**Institución:** Jefatura de Recaudaciones  
**Versión del sistema:** `1.0.19` (auto — ver `package.json`)
**Repositorio:** `turn-hub-flow`  
**Fecha de este documento:** 2026-07-13  
**Estado:** MVP en producción local / listo para despliegue

---

## 1. Resumen ejecutivo

SIGAT organiza la atención presencial de contribuyentes. El ciudadano saca un turno con su CI, elige área y trámite; el operador llama y atiende desde un puesto; una pantalla TV muestra los llamados en vivo con anuncio por voz. Un administrador gestiona usuarios, puestos, trámites y configuración.

---

## 2. Objetivos

### 2.1 Objetivos de negocio
- Reducir filas físicas y disputas por orden de atención.
- Unificar la numeración de turnos por área y por día operativo.
- Dar visibilidad en tiempo real a ciudadanos (TV) y a la jefatura (dashboard).
- Permitir que operadores atiendan solo los trámites de su puesto.

### 2.2 Objetivos de producto
- Flujo kiosk simple (CI → área/trámite → ticket + QR).
- Panel de operador con cola FIFO y cambios de estado claros.
- Pantalla TV full-bleed con realtime y TTS en español.
- Panel admin para usuarios, puestos, trámites, settings y KPIs del día.

### 2.3 No objetivos (fuera de alcance actual)
- Multi-sede / multi-tenant.
- Impresión física de tickets o hardware de totem.
- Notificaciones SMS / WhatsApp / email al ciudadano.
- Reportes históricos multi-día o exportación contable.
- Integración AD/LDAP o SSO institucional.
- Cobro / pasarela de pagos.

---

## 3. Usuarios y actores

| Actor | Descripción | Acceso principal |
|---|---|---|
| **Contribuyente** | Ciudadano que necesita atención | `/ticket`, `/display`, `/` |
| **Operador** | Funcionario en ventanilla | `/auth` → `/operator` |
| **Administrador** | Gestiona catálogo, usuarios y jornada | `/admin/*` |
| **Pantalla TV** | Display pasivo en sala de espera | `/display` |

### Roles técnicos (`app_role`)
- `admin`
- `operator`

Un usuario autenticado puede tener rol(es) en `user_roles`. El layout oculta la navegación admin si no hay rol `admin`. Las mutaciones admin se validan en server functions con RPC `has_role`.

---

## 4. Alcance funcional

### 4.1 Landing (`/`)
- Presentación del producto SIGAT.
- CTAs: sacar turno, ver pantalla TV, ingreso institucional.
- Footer con copyright y **versión del sistema** (automática).

### 4.2 Kiosk / sacar turno (`/ticket`) — público
- Ingreso de CI (mín. 4 caracteres, alfanumérico / guión).
- Si ya existe turno activo (`waiting` | `calling` | `in_service`) → muestra el existente.
- Selección de área y trámite activos.
- Generación atómica vía RPC `generate_ticket`.
- Código tipo `V-023` (prefijo de área + número diario de 3 dígitos).
- QR con JSON `{ id, code, ci }`.
- Cancelación del turno propio solo en estado `waiting`.

### 4.3 Pantalla TV (`/display`) — público
- Reloj en vivo.
- Turno destacado en estado `calling` (fallback `in_service`).
- Listas de siguientes (waiting) y en atención.
- Suscripción Realtime a `tickets`.
- Anuncio por voz (Web Speech API, `es-ES`) al detectar nuevo llamado.

### 4.4 Autenticación (`/auth`)
- Login email/password (Supabase Auth).
- Redirección a `/operator` si hay sesión.
- Sesión persistente en `localStorage`.

### 4.5 Puesto de operador (`/operator`) — autenticado
- Selección de puesto de atención (persistida en `localStorage`).
- Llamar siguiente turno (FIFO por trámites del puesto, día La Paz).
- Acciones: repetir llamado, iniciar atención, finalizar, ausente, cancelar.
- Stats: en espera, turno actual, estado.
- Cola del día (preview).
- Bootstrap “Convertirme en administrador” si aún no existe ningún admin.

### 4.6 Administración

| Ruta | Función |
|---|---|
| `/admin` | Dashboard del día: emitidos, espera, atención, finalizados, ausentes, tiempo promedio, top trámites, ocupación de puestos; reset de numeración del día |
| `/admin/users` | Crear usuarios (email/password/rol), activar/desactivar, eliminar |
| `/admin/service-points` | CRUD puestos + asignación de trámites y operador |
| `/admin/procedures` | Ver áreas; CRUD de trámites |
| `/admin/settings` | Horario laboral, textos institucionales TV, flags de sonido/voz |

---

## 5. Modelo de dominio

### 5.1 Entidades

```
areas 1──* procedures
areas 1──* daily_counters (day, area_id)
procedures *──* service_points  (service_point_procedures)
service_points ··· operator_id → auth.users
tickets → area, procedure, service_point?, operator?
auth.users 1──1 profiles
auth.users 1──* user_roles
settings (key → JSONB)
```

### 5.2 Estados del ticket (`ticket_status`)

```
waiting → calling → in_service → finished
                 ↘ absent
waiting → cancelled
```

### 5.3 Áreas seed (prefijos)
| Código | Área |
|---|---|
| I | Inmueble |
| V | Vehículo |
| A | Actividades Económicas |
| T | Tasas |

### 5.4 Invariantes
1. Un CI → como máximo un ticket activo a la vez.
2. Numeración diaria por área (`CODE-###`) vía `daily_counters`.
3. Enrutamiento FIFO restringido a trámites del puesto.
4. Día operativo = timezone `America/La_Paz`.

---

## 6. Flujos principales

### 6.1 Sacar turno
1. Ciudadano abre `/ticket`.
2. Ingresa CI → se busca ticket activo.
3. Elige área + trámite → confirma.
4. RPC `generate_ticket` incrementa contador e inserta `waiting`.
5. Se muestra código + QR; espera llamado en TV.

### 6.2 Atender
1. Operador inicia sesión y elige puesto.
2. `callNextTicket` toma el `waiting` más antiguo aplicable → `calling`.
3. TV anuncia; operador inicia atención → `in_service`.
4. Cierre: `finished` / `absent` / `cancelled`.

### 6.3 Administración
1. Primer admin vía bootstrap o creación por otro admin.
2. Alta de operadores y puestos con trámites.
3. Monitoreo de jornada y reset de contadores si hace falta.

---

## 7. Arquitectura técnica

| Capa | Tecnología |
|---|---|
| App | React 19, TanStack Start/Router/Query, Vite 8 |
| UI | Tailwind CSS 4, Radix/shadcn, Lucide, Sonner |
| Validación | Zod |
| Backend in-app | Server Functions (`createServerFn`) |
| Datos / Auth / Realtime | Supabase (Postgres, Auth, RLS, Realtime, RPC) |
| Admin privilegiado | Cliente `service_role` (solo servidor) |
| Voz TV | Web Speech API |
| QR | librería `qrcode` |

### Variables de entorno
```
SUPABASE_URL / VITE_SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_PROJECT_ID / VITE_SUPABASE_PROJECT_ID
SUPABASE_SERVICE_ROLE_KEY   # solo servidor; no exponer al cliente
```

`.env` está en `.gitignore`. Usar `.env.example` como plantilla.

### Canales Realtime
- `tv-tickets` → `/display`
- `op-tickets` → `/operator`
- `admin-tickets` → `/admin`

Todos escuchan `postgres_changes` sobre `public.tickets`.

### Server functions (`src/lib/sigat.functions.ts`)
| Función | Quién | Acción |
|---|---|---|
| `generateTicket` | Público | Genera ticket |
| `findActiveTicketByCi` | Público | Busca activo por CI |
| `cancelTicketByCi` | Público* | Cancela si waiting |
| `callNextTicket` | Auth | Llama siguiente |
| `updateTicketStatus` | Auth | Cambia estado |
| `listOperators` | Admin | Lista usuarios |
| `createOperator` | Admin | Crea usuario Auth |
| `setUserActive` | Admin | Activa/desactiva |
| `deleteUser` | Admin | Elimina usuario |
| `upsertServicePoint` / `deleteServicePoint` | Admin | CRUD puestos |
| `upsertProcedure` / `deleteProcedure` | Admin | CRUD trámites |
| `bootstrapFirstAdmin` | Auth | Primer admin |
| `resetDailyCounters` | Admin | Reset numeración del día |

\*La cancelación anónima depende de políticas RLS; idealmente RPC `SECURITY DEFINER`.

---

## 8. Requisitos no funcionales

| Área | Requisito |
|---|---|
| Disponibilidad | App + Supabase; TV y kiosk deben recuperarse con refresh |
| Tiempo real | Propagación de llamados en segundos vía Realtime |
| Seguridad | RLS + `has_role`; service role solo en server; no commitear secretos |
| Localización | UI en español; TZ `America/La_Paz` |
| Accesibilidad TV | Tipografía grande, contraste alto, anuncio por voz |
| Versión | SemVer en `package.json`; bump automático en cada cambio (ver §10) |

---

## 9. Gaps conocidos / backlog

1. Enforzar `working_hours` al generar tickets.
2. Ligar settings `tv_display` / `sound` a la UI de `/display`.
3. CRUD de áreas (hoy solo seed).
4. Guard de rol `admin` en `beforeLoad` de rutas `/admin/*`.
5. Reportes históricos multi-día.
6. RPC explícita para cancelación pública de tickets.
7. Impresión física / multi-sede / notificaciones.

---

## 10. Versionado automático

El sistema usa **SemVer** (`MAJOR.MINOR.PATCH`) en `package.json`.

### Comportamiento
- En **cada commit Git**, el hook `.githooks/pre-commit` incrementa el **PATCH** (`1.0.0` → `1.0.1`).
- El script `scripts/bump-version.mjs` sincroniza:
  - `package.json` → `version`
  - `src/lib/version.ts` → `APP_VERSION` (usada en la UI)
  - `docs/PRD.md` → línea de versión del documento
- La UI muestra la versión real (ej. footer de landing: `SIGAT v1.0.3`).

### Activación del hook (una vez por máquina)
```bash
git config core.hooksPath .githooks
```
También se ejecuta en `npm install` vía script `prepare`.

### Bumps manuales
```bash
npm run version:bump          # +patch
npm run version:bump -- minor # +minor
npm run version:bump -- major # +major
```

### Política
| Tipo de cambio | Versión |
|---|---|
| Bugfix / cambio menor / commit habitual | PATCH (automático) |
| Feature nueva compatible | MINOR (manual) |
| Breaking change | MAJOR (manual) |

---

## 11. Criterios de aceptación (MVP)

- [x] Ciudadano saca turno con CI + área + trámite y recibe código.
- [x] No permite dos turnos activos para el mismo CI.
- [x] Operador llama siguiente según trámites del puesto.
- [x] TV actualiza en vivo y anuncia por voz.
- [x] Admin gestiona usuarios, puestos, trámites y settings.
- [x] Dashboard refleja métricas del día.
- [x] Numeración diaria por área.
- [x] `.env` fuera de Git; plantilla `.env.example`.
- [x] Versión visible y auto-actualizada en cada commit.

---

## 12. Glosario

| Término | Definición |
|---|---|
| **Ticket** | Turno con código, CI, área, trámite y estado |
| **Puesto / service point** | Ventanilla de atención |
| **Área** | Dominio tributario (I/V/A/T) |
| **Trámite / procedure** | Motivo concreto de atención |
| **Día operativo** | Fecha calendario en `America/La_Paz` |
| **Kiosk** | Interfaz pública para sacar turnos |
