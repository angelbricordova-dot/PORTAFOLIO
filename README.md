# Portafolio de Lamont

Sitio de portafolio con panel de administración, hecho para Netlify. No tiene paso de compilación: son archivos estáticos, una función serverless y Netlify Blobs para guardar los datos y las imágenes.

```
public/            lo que se publica (sitio en /, panel en /admin)
netlify/functions/ API: datos públicos, login, guardado y subida de archivos
scripts/           herramientas para regenerar iconos, fuentes y el personaje 3D
dev-server.mjs     servidor local para probar todo sin Netlify
```

## Publicar en Netlify

1. En Netlify: **Add new site → Import an existing project** y elige este repositorio. La configuración sale de `netlify.toml` (publica `public/`, funciones en `netlify/functions/`).
2. Antes del primer despliegue, en **Site configuration → Environment variables** crea:
   - `ADMIN_PASSWORD`: la contraseña con la que entrarás al panel. Usa una larga.
   - `SESSION_SECRET` (opcional): una cadena aleatoria para firmar las sesiones.
3. Despliega. Entra a `tu-sitio.netlify.app/admin`, inicia sesión y pulsa **Publicar cambios**.

> Arrastrar la carpeta a Netlify Drop **no** sirve: ese método no despliega funciones, y sin ellas no hay panel.

El formulario de contacto usa Netlify Forms. Los mensajes llegan en **Forms** dentro de Netlify; ahí también puedes activar avisos por correo.

## Cómo se usa el panel

- **Trabajos**: título, cliente, categoría, mes, descripción y etiquetas. Sube imágenes (se optimizan solas a WebP) o pega enlaces de YouTube, Vimeo, Drive o `.mp4`. Puedes elegir la portada, ordenar los medios, destacar un trabajo (tarjeta grande) u ocultarlo.
- **Bitácora mensual**: por cada mes anota clientes, entregas (videos, diseños, publicaciones, campañas), logro y notas privadas. El sitio calcula solo las cifras, la gráfica de actividad, los clientes más constantes, la racha y un texto de análisis. «Generar resumen» crea el texto del mes.
- **Testimonios**: publica mensajes de texto, **audios** de tus clientes (MP3, M4A, OGG/OPUS hasta 5 MB), capturas de sus mensajes y videos (enlace). Cada uno puede llevar estrellas, foto de la persona y destacarse. Además hay un **enlace para tus clientes** (`tu-sitio/#testimonio`): lo abren, escriben su testimonio y te llega al panel como «pendiente»; tú lo revisas, lo editas si quieres y lo publicas. Para audios de WhatsApp (`.opus`) conviene convertirlos a MP3/M4A si quieres que también suenen en iPhone.
- **Clientes, Perfil, Servicios, Categorías**: todo lo que se ve en el sitio se edita aquí. En Perfil también están los años de experiencia («+8»), las fotos y las redes sociales (Instagram, TikTok, YouTube, LinkedIn, Behance, X, Threads, Facebook y Twitch).
- **Respaldo**: descarga e importa un `.json` con todos tus datos.
- Los cambios no se ven en el sitio hasta que pulsas **Publicar cambios** (o `Ctrl/Cmd + S`). Si cierras la pestaña sin publicar, el borrador se recupera al volver.

## Límites que conviene conocer

- Cada archivo subido puede pesar hasta **5 MB** (límite de las funciones de Netlify). Sirve para imágenes y clips cortos. Para videos largos usa enlaces de YouTube o Vimeo.
- Quitar una imagen de un trabajo no la borra del almacenamiento; no afecta al sitio.
- El formulario público de testimonios limita a 3 envíos por hora por visitante y guarda como máximo 60 pendientes; nada se publica sin tu aprobación.
- Un solo administrador: si dos personas publican a la vez, gana el último en guardar.

## Probar en local

```bash
npm install
npm run dev          # http://localhost:8888  ·  panel en /admin  ·  clave local: lamont
```

Los datos locales se guardan en `.data/` (no se sube a Git). Define `ADMIN_PASSWORD` para usar otra clave.

## Cambiar fotos y logo

Desde el panel, en **Perfil y contacto → Imágenes**: sube la foto principal (centro de la portada) y el logo (esquina superior izquierda; mejor un PNG con fondo transparente). «Usar la original» vuelve a las imágenes que vienen en el proyecto (`public/assets/img/lamont.webp` y `logo.webp`).

Si cambias fuentes o iconos del sitio: `npm run assets` regenera `public/assets/fonts` e `icons.svg`.

Para recortar otro avatar y dejarlo con fondo transparente: `pip install pillow numpy scipy` y luego `python3 scripts/make-logo.py avatar.png`.

El sitio tiene modo diurno y nocturno (botón de la luna junto al menú); recuerda la elección de cada visitante y, la primera vez, usa la preferencia de su dispositivo.
