# Bot de WhatsApp - Incidencias de Informatica

Bot de WhatsApp basado en un **arbol de navegacion tipo IVR** (menus numericos) que permite a los usuarios reportar incidencias de informatica, consultar el estado de sus tickets y solicitar contacto con un tecnico. Toda la informacion capturada se persiste **en tiempo real** en PostgreSQL: cada paso del formulario se guarda de inmediato en la sesion del usuario, y al confirmar se crea el ticket definitivo.

Construido sobre **WhatsApp Cloud API** (Meta oficial) + **Node.js / Express** + **PostgreSQL**.

## Indice

1. [Como funciona](#como-funciona)
2. [Arbol de navegacion](#arbol-de-navegacion)
3. [Estructura del proyecto](#estructura-del-proyecto)
4. [Requisitos previos](#requisitos-previos)
5. [Configuracion de WhatsApp Cloud API](#configuracion-de-whatsapp-cloud-api)
6. [Instalacion y ejecucion](#instalacion-y-ejecucion)
7. [Base de datos](#base-de-datos)
8. [Probar el webhook localmente (ngrok)](#probar-el-webhook-localmente-ngrok)
9. [Como extender el arbol de menus](#como-extender-el-arbol-de-menus)
10. [Despliegue con Docker](#despliegue-con-docker)
11. [Notas de seguridad](#notas-de-seguridad)

---

## Como funciona

1. El usuario escribe al numero de WhatsApp Business conectado al bot.
2. Meta reenvia cada mensaje al **webhook** (`POST /webhook`) configurado en este proyecto.
3. El **motor de navegacion** (`src/bot/engine.js`) recupera (o crea) la sesion del usuario en PostgreSQL, identifica en que nodo del arbol se encuentra y procesa la respuesta:
   - Si el nodo es un **menu**, valida que el numero recibido corresponda a una opcion.
   - Si el nodo es de **captura de datos**, guarda el texto recibido en el campo correspondiente.
   - Si el nodo es de **confirmacion**, interpreta `1` (si) / `2` (no).
   - Cada vez que se captura un dato, la sesion se actualiza **inmediatamente** en la base de datos (persistencia en tiempo real), por lo que si la conversacion se interrumpe no se pierde el progreso.
4. Al confirmar un reporte, se genera un ticket con codigo correlativo (`INC-000001`, `INC-000002`, ...) en la tabla `tickets`.
5. El bot responde con el/los mensaje(s) correspondientes usando la Graph API de WhatsApp.

Comandos globales disponibles en cualquier punto de la conversacion:

- `menu` o `inicio` -> vuelve al menu principal.
- `cancelar` -> cancela el flujo actual y vuelve al menu principal.

## Arbol de navegacion

```
root (menu principal)
├── 1) Reportar incidencia
│    ├── Categoria (Hardware / Software / Red / Correo / Otro)
│    ├── Prioridad (Alta / Media / Baja)
│    ├── Area o departamento (texto libre)
│    ├── Ubicacion fisica (texto libre)
│    ├── Descripcion del problema (texto libre)
│    ├── Nombre completo (texto libre)
│    ├── Confirmacion (1=Si / 2=No)
│    │    ├── Si -> crea ticket en PostgreSQL -> vuelve al menu
│    │    └── No -> cancela -> vuelve al menu
├── 2) Consultar estado de ticket
│    ├── Solicita codigo de ticket
│    └── Muestra estado, categoria, prioridad y fechas -> vuelve al menu
├── 3) Hablar con un tecnico
│    └── Marca la sesion como "esperando_tecnico" y notifica al usuario
└── 0) Salir
     └── Mensaje de despedida (cualquier mensaje posterior reinicia la conversacion)
```

Toda esta logica esta declarada de forma **configurable** en [`src/bot/menuTree.js`](src/bot/menuTree.js): agregar o modificar preguntas no requiere tocar el motor de navegacion.

## Estructura del proyecto

```
whatsapp-conred-bot/
├── src/
│   ├── index.js                 # Punto de entrada (Express)
│   ├── config/
│   │   ├── env.js               # Carga y valida variables de entorno
│   │   └── db.js                # Pool de PostgreSQL
│   ├── db/
│   │   ├── schema.sql           # Definicion de tablas (sessions, tickets, conversation_log)
│   │   └── migrate.js           # Script para aplicar el esquema manualmente
│   ├── bot/
│   │   ├── menuTree.js          # Definicion del arbol de navegacion (editar aqui el contenido)
│   │   ├── engine.js            # Motor que procesa mensajes y recorre el arbol
│   │   ├── sessionStore.js      # Persistencia de sesiones y bitacora en tiempo real
│   │   └── ticketService.js     # Creacion y consulta de tickets
│   ├── whatsapp/
│   │   ├── client.js            # Cliente HTTP hacia la Graph API de WhatsApp
│   │   └── verifySignature.js   # Verificacion de firma del webhook (opcional)
│   ├── routes/
│   │   ├── webhook.js           # GET (verificacion) y POST (mensajes entrantes)
│   │   └── health.js            # Endpoint de salud (verifica conexion a BD)
│   └── utils/
│       ├── logger.js
│       └── format.js
├── docker-compose.yml            # PostgreSQL + bot listos para levantar con un comando
├── Dockerfile
├── package.json
└── .env.example
```

## Requisitos previos

- Node.js 18 o superior.
- PostgreSQL 13+ (local, Docker, o un proveedor administrado).
- Una cuenta de **Meta for Developers** con una app de tipo *Business* que tenga el producto **WhatsApp** agregado.
- (Opcional para pruebas locales) [ngrok](https://ngrok.com/) u otra herramienta de tunel HTTPS, ya que Meta exige que el webhook sea accesible por HTTPS publico.

## Configuracion de WhatsApp Cloud API

1. Entra a [developers.facebook.com/apps](https://developers.facebook.com/apps) y crea una app de tipo **Business**.
2. Agrega el producto **WhatsApp** a la app.
3. En **WhatsApp > Configuracion de la API**, copia:
   - `Temporary access token` (o genera uno permanente con un System User) -> `WHATSAPP_TOKEN`
   - `Phone number ID` -> `WHATSAPP_PHONE_NUMBER_ID`
4. Define tu propio `WHATSAPP_VERIFY_TOKEN` (cualquier cadena secreta que tu inventes) y anotala; la usaras tambien al configurar el webhook en el panel de Meta.
5. (Recomendado) Copia el **App Secret** de la app (en *Configuracion basica*) -> `WHATSAPP_APP_SECRET`, para que el bot valide que las peticiones al webhook realmente vienen de Meta.
6. Una vez el servidor este corriendo y accesible por HTTPS (ver seccion de ngrok), en **WhatsApp > Configuracion > Webhook**:
   - URL de callback: `https://<tu-dominio-o-tunel>/webhook`
   - Token de verificacion: el mismo valor de `WHATSAPP_VERIFY_TOKEN`
   - Suscribete al campo **messages**.
7. En **WhatsApp > Numeros de telefono de la API**, agrega tu numero de pruebas (o el numero de produccion verificado) y agrega los numeros destinatarios permitidos si estas en modo de desarrollo.

## Instalacion y ejecucion

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env con tus credenciales de WhatsApp y tu cadena de conexion a PostgreSQL

# 3. Aplicar el esquema de base de datos
npm run migrate

# 4. Iniciar el servidor
npm start
# El servidor tambien aplica el esquema automaticamente al arrancar (es idempotente),
# por lo que "npm run migrate" es opcional si ya ejecutaste "npm start" una vez.
```

El servidor queda escuchando en `http://localhost:3000` (o el `PORT` que definas). Puedes verificar que todo este bien con:

```bash
curl http://localhost:3000/health
```

## Base de datos

El esquema (`src/db/schema.sql`) crea tres tablas:

- **`sessions`**: una fila por numero de telefono con el nodo actual del arbol y los datos capturados hasta el momento (columna `data`, tipo `JSONB`). Se actualiza en cada mensaje -> persistencia en tiempo real del progreso.
- **`tickets`**: las incidencias confirmadas, con codigo correlativo (`ticket_code`), categoria, prioridad, area, ubicacion, descripcion y estado (`abierto`, `en_proceso`, `resuelto`, `cerrado`).
- **`conversation_log`**: bitacora de todos los mensajes entrantes y salientes, para auditoria y trazabilidad.

Puedes conectarte con `psql` usando el mismo `DATABASE_URL` del `.env` para revisar los datos:

```bash
psql "$DATABASE_URL" -c "SELECT ticket_code, category, priority, status, created_at FROM tickets ORDER BY created_at DESC;"
```

Para cambiar el estado de un ticket manualmente (por ejemplo, cuando un tecnico lo resuelve):

```sql
UPDATE tickets SET status = 'resuelto' WHERE ticket_code = 'INC-000001';
```

## Probar el webhook localmente (ngrok)

```bash
# En una terminal: levanta el bot
npm start

# En otra terminal: expone el puerto 3000 con ngrok
ngrok http 3000
```

Copia la URL HTTPS que te da ngrok (por ejemplo `https://abcd1234.ngrok-free.app`) y configurala como *Callback URL* en el panel de Meta, agregando `/webhook` al final: `https://abcd1234.ngrok-free.app/webhook`.

Luego, desde el numero de WhatsApp de pruebas que agregaste en Meta, envia un mensaje (por ejemplo `hola`) al numero del bot y deberias recibir el menu principal.

## Como extender el arbol de menus

Todo el contenido del bot vive en [`src/bot/menuTree.js`](src/bot/menuTree.js). Para agregar una pregunta nueva:

1. Agrega un nodo nuevo con un `id` unico y el `type` correspondiente (`menu`, `input`, `confirm`, `action` o `end`).
2. Enlaza el nodo anterior para que su `next` (o la opcion de menu correspondiente) apunte al nuevo `id`.
3. Si el nodo captura un dato de texto libre, define `field` con el nombre de la propiedad donde se guardara dentro de `session.data`.
4. Si necesitas ejecutar logica de negocio (consultar o escribir en la base de datos), crea un nodo `type: 'action'` y registra su handler en `actionHandlers` dentro de `src/bot/engine.js`.

No es necesario modificar el motor (`engine.js`) para agregar preguntas simples de menu o captura de texto: el arbol es interpretado dinamicamente.

## Despliegue con Docker

El proyecto incluye un `docker-compose.yml` que levanta PostgreSQL y el bot juntos:

```bash
cp .env.example .env
# Edita .env con tus credenciales de WhatsApp (deja DATABASE_URL como esta, docker-compose lo sobreescribe)

docker compose up --build
```

Esto expone el bot en `http://localhost:3000` (usa ngrok u otro tunel/proxy con HTTPS para exponerlo a Meta si lo corres localmente; si lo despliegas en un servidor con dominio propio, apunta el webhook directamente a `https://tu-dominio.com/webhook`).

## Notas de seguridad

- Define `WHATSAPP_APP_SECRET` en produccion para que el bot valide la firma `X-Hub-Signature-256` de cada peticion y rechace mensajes que no provengan realmente de Meta.
- No subas tu archivo `.env` a control de versiones (ya esta excluido en `.gitignore`).
- Los tokens temporales de WhatsApp Cloud API expiran en 24 horas; para produccion, genera un token permanente con un **System User** en Meta Business Suite.
- Considera agregar autenticacion/roles si expones endpoints adicionales para que el equipo tecnico consulte o actualice tickets (no incluido en esta version, pensada como base extensible).
