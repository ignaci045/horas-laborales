# Verificación de la versión 1.0

Fecha: 11 de noviembre de 2026.

## Resultado

- 26 pruebas automatizadas aprobadas en Vitest: 25 de dominio y una de persistencia/concurrencia con múltiples comprobaciones.
- Compilación de TypeScript y Vite correcta.
- Manifest, iconos PNG de 192/512 px y Service Worker generados. Precaché de 11 recursos, aproximadamente 306 KiB.
- Respuesta HTTP 200 en la vista previa de producción.
- Sin errores ni advertencias de ejecución registrados durante la revisión del navegador.

## Operaciones verificadas en navegador

- Carga manual de jornada 09/11 22:00 a 10/11 06:00, con 30 minutos de descanso: resultado de 7 h 30 min.
- Rechazo de una salida igual a la entrada.
- Inicio automático, recarga del navegador y recuperación de jornada activa.
- Finalización y guardado de la jornada automática.
- Cálculo por hora, separación de extras y multiplicador 1,5.
- Tema oscuro y claro, con conservación al recargar.
- Diseño móvil en un viewport de 390 × 844 y navegación inferior.
- Aviso de actualización de Service Worker, aplicación de la actualización y conservación de registros.
- Recarga de la aplicación después de detener el servidor local, servida por la caché; guardado de preferencias con el servidor apagado.

La vista previa local contiene dos jornadas creadas durante estas pruebas. No forman parte del código ni de la distribución: una instalación en un origen nuevo comienza sin registros.

## Límites de esta verificación

No se realizó instalación física en Android ni iPhone, ni publicación en una cuenta de GitHub. La exportación/importación y las reglas de validación se probaron por código; no se automatizó el selector de archivos en todos los navegadores. La prueba sin servidor valida la caché local, no todas las condiciones de red o restricciones de almacenamiento de cada teléfono.

El workflow de Pages está preparado, pero solo puede comprobarse en GitHub después de subir el repositorio y habilitar Pages. El README contiene los pasos y las comprobaciones manuales recomendadas.
