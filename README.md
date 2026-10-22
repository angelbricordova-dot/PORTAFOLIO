# Portafolio de Lamont

Sitio de portafolio con panel de administración, hecho para Netlify. No tiene paso de compilación: son archivos estáticos, una función serverless y Netlify Blobs para guardar los datos y las imágenes.

```
public/            lo que se publica (sitio en /, panel en /panel)
netlify/functions/ API: datos públicos, login, guardado y subida de archivos
scripts/           herramientas para regenerar iconos, fuentes y el personaje 3D
dev-server.mjs     servidor local para probar todo sin Netlify
```

## Publicar en Netlify

1. En Netlify: **Add new site → Import an existing project** y elige este repositorio. La configuración sale de `netlify.toml` (publica `public/`, funciones en `netlify/functions/`).
2. Antes del primer despliegue, en **Site configuration → Environment variables** crea:
   - `ADMIN_PASSWORD`: la contraseña con la que entrarás al panel. Usa una larga.
   - `SESSION_SECRET` (opcional): una cadena aleatoria para firmar las sesiones.
3. Despliega. Entra a `tu-sitio.netlify.app/panel`, inicia sesión y pulsa **Publicar cambios**.

> Arrastrar la carpeta a Netlify Drop **no** sirve: ese método no despliega funciones, y sin ellas no hay panel.

El formulario de contacto usa Netlify Forms. Los mensajes llegan en **Forms** dentro de Netlify; ahí también puedes activar avisos por correo.

## Entrar al panel

El panel está en **`tu-sitio/panel`** (también responde `/admin`). No hay ningún enlace al panel en el sitio público: se entra escribiendo la dirección. La contraseña es la variable `ADMIN_PASSWORD`.

Cualquier dirección que no exista muestra la página 404 personalizada (`public/404.html`).

## Cómo se usa el panel

- **Trabajos**: título, cliente, categoría, mes, descripción y etiquetas. Sube imágenes (se optimizan solas a WebP) o pega enlaces de YouTube, Vimeo, Drive o `.mp4`. Puedes elegir la portada, ordenar los medios, destacar un trabajo (tarjeta grande) u ocultarlo.
- **Bitácora mensual**: por cada mes anota clientes, entregas (videos, diseños, publicaciones, campañas), logro y notas privadas. El sitio calcula solo las cifras, la gráfica de actividad, los clientes más constantes, la racha y un texto de análisis. «Generar resumen» crea el texto del mes.
- **Testimonios**: publica mensajes de texto, **audios** de tus clientes (botón «Subir audio de un cliente»; sirve cualquier audio, incluidas las notas de voz de WhatsApp), capturas de sus mensajes y videos (enlace). Cada uno puede llevar estrellas, foto de la persona y destacarse. Además hay un **enlace para tus clientes** (`tu-sitio/#testimonio`): lo abren, escriben su testimonio y te llega al panel como «pendiente»; tú lo revisas, lo editas si quieres y lo publicas.
- **Clientes activos y plazas**: en **Clientes** marca con el botón ✓ a quienes son clientes **activos ahora** (o con la casilla al crear un trabajo). Aparecen al inicio del sitio en «Trabajando ahora con». Indica tus **plazas en total** y el sitio muestra cuántas te quedan libres (cada plaza libre lleva a Contacto); con 0 libres dice «Agenda completa por ahora». Si no defines las plazas, muestra «Abierto a nuevos clientes». Es público: no pongas ahí datos financieros (esos están en Finanzas).
- **Clientes, Perfil, Servicios, Categorías**: todo lo que se ve en el sitio se edita aquí. En Perfil también están los años de experiencia («+8»), las fotos y las redes sociales (Instagram, TikTok, YouTube, LinkedIn, Behance, X, Threads, Facebook y Twitch).
- **Finanzas** (privado): control de tus clientes, tu equipo, ingresos y gastos en dólares. Tiene cuatro pestañas:
  - **Resumen**: ganancia neta, ingresos cobrados, gastos pagados, lo que está por cobrar y por pagar, una gráfica de 12 meses (con vista de tabla) y la **ganancia real por cliente** (lo cobrado menos lo que costó atenderlo). Se filtra por mes, últimos 3 meses, año o todo.
  - **Movimientos**: registra ingresos (cada uno ligado a un cliente) y gastos. Un gasto, por ejemplo el pago a un trabajador, puede **repartirse entre varios clientes**; lo que no asignes cuenta como gasto general. Marca cada movimiento como cobrado/pagado o pendiente con un clic. Botones para **generar los cobros y sueldos mensuales** y para descargar CSV (formato Excel en español o estándar).
  - **Clientes**: estado (prospecto, activo, pausado, terminado), servicio, cómo te paga (mensual, por proyecto o por entrega) y notas. Puedes traer los clientes que ya tienes en el portafolio.
  - **Equipo**: cada trabajador con su forma de pago (mensual, por proyecto o por entrega), su tarifa habitual y, si atiende a varios clientes, su reparto habitual en porcentajes.
  - Los datos financieros **nunca se mezclan con los del sitio**: se guardan aparte, solo se leen con tu sesión de administrador y no se publican. Se guardan solos cada vez que cambias algo (no hace falta «Publicar cambios») y, si abres el panel en dos dispositivos, no se pisan entre sí.
  - La ganancia se calcula por **caja**: solo cuenta lo ya cobrado y lo ya pagado; lo pendiente se muestra aparte. Es un control tuyo, no un programa de contabilidad ni de impuestos.
- **Respaldo**: descarga e importa un `.json` con todos tus datos del sitio. Los datos financieros tienen su propio respaldo dentro de Finanzas → Resumen.
- Los cambios no se ven en el sitio hasta que pulsas **Publicar cambios** (o `Ctrl/Cmd + S`). Si cierras la pestaña sin publicar, el borrador se recupera al volver.

## Compresión automática de archivos

Todo lo que subes desde el panel se optimiza **en tu navegador, antes de subirlo**, para que el servidor guarde y sirva archivos livianos:

- **Imágenes** → WebP, sin ampliarlas, hasta un peso objetivo según su uso (portadas ~500 KB, capturas de chat ~650 KB con texto legible, fotos de perfil ~380 KB, logos ~120 KB, avatares ~70 KB).
- **Audios** (WhatsApp `.opus`, MP3, M4A, WAV…) → MP3 mono de calidad de voz, entre 32 y 64 kbps según el original. Un minuto pesa unos 240–480 KB y suena en todos los dispositivos, iPhone incluido. Si el navegador no puede leer el formato, se sube tal cual (si pesa menos de 5 MB).
- Los archivos se sirven con caché de larga duración en el CDN de Netlify, así que la función casi no se ejecuta al verlos. Los datos del sitio se cachean 20 segundos en el CDN.
- El codificador de MP3 es `lamejs` (se copia a `public/assets/js/vendor/` con `npm run assets`).

## Límites que conviene conocer

- Después de comprimir, cada archivo puede pesar hasta **5 MB** (límite de las funciones de Netlify); un audio puede durar hasta unos 20 minutos. Los GIF y los videos MP4 no se comprimen: para videos usa enlaces de YouTube o Vimeo. Para videos largos usa enlaces de YouTube o Vimeo.
- Quitar una imagen de un trabajo no la borra del almacenamiento; no afecta al sitio.
- El formulario público de testimonios limita a 3 envíos por hora por visitante y guarda como máximo 60 pendientes; nada se publica sin tu aprobación.
- Un solo administrador: si dos personas publican a la vez, gana el último en guardar.

## Probar en local

```bash
npm install
npm run dev          # http://localhost:8888  ·  panel en /panel  ·  clave local: lamont
```

Los datos locales se guardan en `.data/` (no se sube a Git). Define `ADMIN_PASSWORD` para usar otra clave.

## Cambiar fotos y logo

Desde el panel, en **Perfil y contacto → Imágenes**: sube la foto principal (centro de la portada) y el logo (esquina superior izquierda; mejor un PNG con fondo transparente). «Usar la original» vuelve a las imágenes que vienen en el proyecto (`public/assets/img/lamont.webp` y `logo.webp`).

Si cambias fuentes o iconos del sitio: `npm run assets` regenera `public/assets/fonts` e `icons.svg`.

Para recortar otro avatar y dejarlo con fondo transparente: `pip install pillow numpy scipy` y luego `python3 scripts/make-logo.py avatar.png`.

El sitio tiene modo diurno y nocturno (botón de la luna junto al menú); recuerda la elección de cada visitante y, la primera vez, usa la preferencia de su dispositivo.
