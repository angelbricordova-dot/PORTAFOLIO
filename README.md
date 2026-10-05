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
- **Clientes, Perfil, Servicios, Categorías**: todo lo que se ve en el sitio se edita aquí.
- **Respaldo**: descarga e importa un `.json` con todos tus datos.
- Los cambios no se ven en el sitio hasta que pulsas **Publicar cambios** (o `Ctrl/Cmd + S`). Si cierras la pestaña sin publicar, el borrador se recupera al volver.

## Límites que conviene conocer

- Cada archivo subido puede pesar hasta **5 MB** (límite de las funciones de Netlify). Sirve para imágenes y clips cortos. Para videos largos usa enlaces de YouTube o Vimeo.
- Quitar una imagen de un trabajo no la borra del almacenamiento; no afecta al sitio.
- Un solo administrador: si dos personas publican a la vez, gana el último en guardar.

## Probar en local

```bash
npm install
npm run dev          # http://localhost:8888  ·  panel en /admin  ·  clave local: lamont
```

Los datos locales se guardan en `.data/` (no se sube a Git). Define `ADMIN_PASSWORD` para usar otra clave.

## Regenerar el personaje 3D

```bash
pip install pillow numpy scipy
python3 scripts/make-avatar.py ruta/a/la-hoja-de-personaje.png   # recorta las 5 vistas y la cabeza
npm run assets                                                     # fuentes e iconos
```
