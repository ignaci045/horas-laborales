# Horas Laborales

Una PWA personal para registrar jornadas y estimar sueldos. React + TypeScript + Vite, iconos Lucide, IndexedDB nativo y Service Worker generado con Workbox. Sin backend, cuentas, publicidad, telemetría ni fuentes externas.

## Desarrollo

Requiere Node.js 22.12 o posterior y npm.

```sh
npm ci
npm run dev
```

Abrí la dirección que muestra Vite. Para verificar la versión instalable y el modo offline:

```sh
npm test
npm run build
npm run preview
```

El Service Worker se genera en producción, no durante `npm run dev`. La app necesita HTTPS o localhost para instalarse y disponer del Service Worker. No abras `dist/index.html` directamente desde el explorador de archivos.

## Publicar gratis en GitHub Pages

1. Creá un repositorio en GitHub y subí **el contenido de esta carpeta a la raíz del repositorio**, incluido `package-lock.json` y `.github/workflows/deploy.yml`. No subas `node_modules`, `.npm-cache` ni `dist`.
2. Usá `main` como rama principal.
3. En Settings → Pages → Build and deployment elegí **GitHub Actions**.
4. Hacé push a `main` o ejecutá el workflow manualmente desde Actions.
5. El workflow ejecuta las pruebas, compila y publica. Encontrarás la URL en el entorno `github-pages`: normalmente `https://USUARIO.github.io/REPOSITORIO/`.

Vite usa `base: './'`; manifest, iconos, recursos y Service Worker se resuelven dentro del repositorio. No hace falta dominio personalizado ni configurar rutas del servidor: la navegación es interna, sin rutas profundas.

No se publicó un repositorio ni un sitio automáticamente. La compilación de producción está en `dist/` luego del build.

## Instalar y usar

- Android: abrí la URL HTTPS en Chrome, luego Configuración → Instalar aplicación o el menú del navegador.
- iPhone: abrí la URL en Safari → Compartir → Agregar a inicio.
- Escritorio: usá la opción de instalación del navegador donde esté disponible.
- Cargá la app una vez con conexión. Después podés registrar jornadas sin internet.
- Las nuevas versiones muestran un aviso para actualizar. Guardá los formularios antes de actualizar. No se recarga automáticamente en medio de una edición.

## Funcionalidades

- Inicio: reloj, entrada/salida, cronómetro basado en timestamps persistidos y totales diarios/semanales de jornadas finalizadas.
- Registro manual: fechas y horas explícitas de entrada y salida, descansos y notas. Para cruzar medianoche, elegí la fecha siguiente en Salida.
- Historial: períodos semanales y mensuales, edición y eliminación con confirmación.
- Calculadora: pago por hora o sueldo fijo; parámetros y moneda persistentes. Las horas manuales, extras, ajustes y fechas pertenecen al cálculo actual y se reinician al salir de esa sección.
- Configuración: temas, descanso sugerido, moneda, copias JSON y solicitud opcional de almacenamiento persistente.

## Reglas y decisiones

- Se guardan instantes absolutos en milisegundos; las fechas se presentan en la zona horaria del dispositivo. La semana comienza el lunes. Un cambio de zona horaria puede mover horas entre días; no se alteran los instantes guardados.
- La duración usa tiempo real transcurrido, incluido cualquier cambio de horario de verano. Las horas locales inexistentes se rechazan. En una hora repetida por un cambio de huso, el navegador elige su primera ocurrencia al cargar manualmente; el registro automático no tiene esa ambigüedad.
- El reloj del dispositivo es la referencia. Un cambio manual del reloj puede afectar registros y debe corregirse en el historial.
- No se permiten registros superpuestos, descansos negativos o iguales a la jornada, ni salidas futuras desde el formulario.
- Los descansos son minutos no trabajados. Al cruzar un límite diario/semanal/mensual, se distribuyen proporcionalmente porque no se conoce su horario exacto. Los totales recortan al período; las tarjetas conservan la duración completa.
- El cronómetro activo muestra tiempo transcurrido; el descanso se aplica al finalizar. Los resúmenes solo suman jornadas finalizadas.
- Los cálculos usan milisegundos sin redondeos intermedios. La interfaz de duración muestra minutos completos. Los conceptos monetarios se redondean a centavos antes de sumarse.
- En pago por hora con registros, las extras ingresadas se **separan** del total, no se agregan: 10 h registradas y 2 extras son 8 normales + 2 extras. En modo manual se cargan normales y extras por separado.
- El sueldo fijo no se prorratea. Sus extras se estiman como `sueldo / horas pactadas × horas extras × multiplicador`. No se infieren normas salariales; el recargo inicial es 1 (sin recargo).
- El importe es bruto estimado, no una liquidación oficial. No calcula impuestos ni deducciones legales.

## Integridad y privacidad

IndexedDB guarda el estado completo en una transacción. Una revisión comprobada dentro de la transacción evita sobrescrituras desde otra pestaña; BroadcastChannel actualiza las vistas abiertas. Un fallo de guardado muestra un error y conserva el estado anterior.

Los datos pertenecen a este navegador y origen. No se sincronizan entre teléfonos ni navegadores. Desinstalar, borrar almacenamiento, usar modo privado o cambiar de URL/origen puede impedir recuperar los datos. Exportá copias JSON periódicamente; el archivo contiene tus registros sin cifrar y conviene guardarlo de forma privada.

La importación admite versión 1, hasta 20 MB y 100.000 jornadas, valida tipos, fechas, superposiciones, identificadores y preferencias. Siempre pide confirmación antes de reemplazar el estado completo. Si hubo cambios en otra pestaña, no los sobrescribe silenciosamente.

## Archivos principales

- `src/App.tsx`: pantallas y componentes interactivos.
- `src/styles.css`: identidad visual, diseño adaptable y temas.
- `src/domain.ts`: cálculos, fechas y validación de copias.
- `src/storage.ts`: IndexedDB y control de concurrencia.
- `src/*.test.ts`: pruebas de lógica y persistencia.
- `vite.config.ts`: compilación, rutas relativas, manifest y Service Worker.
- `public/`: iconos locales SVG y PNG.
- `.github/workflows/deploy.yml`: pruebas y despliegue en Pages.

## Comprobación manual recomendada en tu teléfono

1. Iniciá una jornada, cerrá la app y reabrila: el cronómetro debe continuar.
2. Finalizala con un descanso válido y verificá los totales del historial.
3. Cargá una jornada de 22:00 a 06:00 del día siguiente con 30 minutos de descanso: 7 h 30 min.
4. Intentá cargar un horario superpuesto: debe rechazarlo.
5. Exportá una copia, probá cancelar una importación y después importala confirmando.
6. Activá modo avión después de una primera carga de producción: la app debe abrir y guardar.
7. Cambiá tema y reiniciá la app: debe conservarse.
8. Abrí dos pestañas, realizá cambios y comprobá que se reflejan sin perder registros.

La instalación real en Android/iOS y las particularidades de conservación de datos de cada navegador necesitan verificarse en esos dispositivos. Informes, nube, notificaciones y monetización quedan fuera de esta versión.
