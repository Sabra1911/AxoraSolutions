# Guion de demostración para una MIPYME

## Caso de uso

**Comercio Demo Andino S.A.S.** es una empresa ficticia creada para demostración. Supongamos que opera una tienda de barrio y quiere mejorar la visibilidad de la entrada y la caja con cámaras, y revisar un panel decorativo detrás del mostrador. No se presentan precios finales ni medidas que no hayan sido verificadas.

## Preparación

- Inicie sesión con una cuenta de cliente de prueba. Si se ejecutó el seed, puede usar `cliente@demo.local` y la contraseña definida localmente en `backend/.env` como `SEED_PASSWORD`.
- Confirme que el backend está activo y que la IA aparece configurada. La disponibilidad de Gemini depende de la clave, la cuota y el acceso del proyecto.
- Use una foto propia o preparada para la demo, sin personas, documentos, pantallas con datos personales ni información de clientes.
- No ejecute el seed sobre una base de producción. Las empresas y cotizaciones de muestra son ficticias.
- `SEED_PASSWORD` se usa para los usuarios de demostración creados por el seed; no es la contraseña de un usuario existente ni cambiarla restablece cuentas.

## Recorrido principal

1. Abra **Diseñador de espacios** y cree una propuesta nueva.
2. Cargue una foto del interior de la tienda. La fotografía queda guardada de forma privada en el servidor; cargarla no la envía a Gemini.
3. En **Servicios**, seleccione cámaras de seguridad y panel decorativo. Copie estos textos en sus campos de **Especificaciones**:

   **Cámaras de seguridad**
   > Se requieren dos cámaras interiores: una dirigida a la entrada principal y otra a la caja. Confirmar ubicación, altura, cableado y conexión de red durante la visita técnica.

   **Panel decorativo**
   > Se desea un panel decorativo tipo PVC/WPC, de acabado claro, en la pared detrás del mostrador. Confirmar medidas, material y acabado durante la visita técnica.

   En **Observaciones del espacio**, puede usar:

   > Es un local comercial pequeño de una planta, con área de ventas, estanterías y mostrador de caja. Queremos mejorar la supervisión visual de la entrada y el acabado de la pared detrás del mostrador. Conservar la distribución y los elementos visibles. No realizar cambios estructurales. Validar medidas, puntos eléctricos, red y materiales antes de preparar la cotización.

4. Marque el consentimiento para enviar la foto y esas especificaciones a Google Gemini. Pulse **Analizar espacio y servicios**.
5. Revise la descripción, los elementos visibles y las observaciones técnicas. Explique que las sugerencias son conceptuales y que los precios del catálogo son referencias, no una cotización aprobada.
6. Marque el consentimiento de nuevo y genere la propuesta visual. Compare el antes y el después; compruebe que representa el mismo espacio y que solo intenta mostrar los cambios seleccionados.
7. Si la empresa desea avanzar, seleccione **Solicitar cotización con la última versión**. Esto crea una solicitud con la foto original y la propuesta visual adjuntas. El equipo de MS debe validar materiales, cantidades, instalación y precio antes de emitir una cotización formal.

## Guion breve para presentar

> “Esta es una empresa de demostración, no un cliente real. La persona responsable sube una foto de su local y elige qué adecuaciones quiere evaluar. Solo después de dar consentimiento, Gemini describe lo que se alcanza a ver y genera una referencia visual de los cambios seleccionados. La imagen no mide el espacio ni reemplaza la visita técnica. Si la idea le sirve, la aplicación envía una solicitud con las imágenes para que el equipo revise el alcance y prepare una cotización formal.”

## Comprobaciones que puede mostrar

| Prueba | Resultado esperado |
| --- | --- |
| Cargar JPG, PNG o WEBP permitido | La foto se guarda como borrador y se muestra en la propuesta. |
| Intentar analizar sin elegir servicios o sin consentimiento | La acción no se habilita; no se envía la foto a Gemini. |
| Analizar con consentimiento y Gemini disponible | Se muestra un análisis en español ligado a los servicios elegidos. |
| Generar una versión | Se guarda una imagen conceptual y aparece el comparador antes/después. |
| Solicitar cotización con la versión generada | Se crea una solicitud con la foto original y la propuesta adjuntas. |
| Probar un archivo no permitido o mayor a 5 MB | La carga se rechaza con un mensaje; no se guarda como propuesta. |
| Usar otra cuenta de empresa | No debe poder consultar propuestas de una empresa distinta. |
| Alcanzar el límite de Gemini | La app informa que revise cuota o facturación; no debe presentar el fallo como un análisis exitoso. |

## Evidencia para la presentación

Prepare capturas de la propuesta antes y después, los servicios seleccionados, el análisis, el estado de la solicitud y el registro de la solicitud en **Solicitudes**. Oculte correos, nombres de usuario, tokens y cualquier dato real. No muestre la clave de Gemini ni afirme que una imagen conceptual es una obra ejecutada.
