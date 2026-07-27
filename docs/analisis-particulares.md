# Análisis: Sección de Clases Particulares

> Fecha del análisis: 21 de abril de 2026

---

## Resumen ejecutivo

La idea tiene sentido estratégico a mediano plazo, pero hoy tiene un problema de escala: con 30-100 usuarios diarios de una sola facultad, el volumen es insuficiente para que un marketplace de tutores genere valor real para ninguna de las dos partes. El modelo de cobrar fee upfront al tutor es el punto más frágil — difícil de justificar sin demanda probada. La recomendación es validar el interés primero (con una encuesta o landing estática) antes de construir cualquier cosa, y si hay señal, lanzar una versión completamente gratuita para generar supply. El cobro viene después.

---

## Análisis de viabilidad

### A favor

- **Audiencia 100% alineada.** Todos los usuarios son estudiantes universitarios. La demanda de tutores es real y recurrente (parciales, finales, recuperatorios).
- **Integración natural con el catálogo existente.** El schema ya tiene una jerarquía `university → faculty → career → subject`. Un tutor puede vincularse directamente a materias del catálogo, lo que es una ventaja enorme frente a plataformas genéricas de tutorías.
- **Diferenciación por contexto.** Un tutor de Análisis Matemático II de FACET-UNICEN es infinitamente más útil que uno genérico de "matemáticas". Esa especificidad es lo que puede hacer ganar esta feature.
- **Bajo costo de construcción en v1.** No requiere pagos in-app, no requiere chat, no requiere nada complejo. Es esencialmente un directorio filtrable.

### En contra

- **Problema de cold start bilateral (marketplace chicken-and-egg).** Con ~50-100 usuarios diarios de UNA facultad, la demanda real de tutores en un día/semana dado es baja. Pocos tutores se registran porque hay pocos estudiantes buscando. Pocos estudiantes buscan porque hay pocos tutores. El problema se resuelve con escala, que llega con la expansión de facultades — pero eso todavía no ocurrió.
- **Competencia sin fricción.** En Argentina, los tutores se consiguen por grupos de WhatsApp de la facu, Instagram, carteles en el edificio, y boca a boca. El costo de cambio para el tutor de esas alternativas a pagar una fee es alto.
- **Ciclo de demanda estacional.** La demanda de tutores se concentra en semanas previas a parciales y finales. Fuera de esos picos, la sección puede estar muerta, lo que hace que el tutor que pagó su fee sienta que no recibió nada.

### Veredicto de viabilidad

**Viable a mediano plazo, prematuro hoy con una sola facultad.** El momento ideal para lanzar esta feature es cuando la expansión de facultades esté activa y el tráfico diario sea 5-10x el actual. Dicho esto, hay una forma de arrancar ahora con riesgo mínimo: lanzar gratuito, validar demanda, y cobrar después.

---

## MVP — Funcionalidades incluidas y excluidas

### Incluir en v1

**Perfil de tutor (publicación)**

- Nombre y foto (opcional)
- Contacto directo: WhatsApp, email, o Instagram (el estudiante contacta por fuera de la app — sin mensajería in-app)
- Materias que da, vinculadas al catálogo existente de `subjects` (FK directa — esta es la ventaja clave)
- Descripción libre breve (140 caracteres)
- Precio aproximado por hora (rango: "$X–$Y")
- Modalidad: virtual, presencial, o ambas
- Ciudad/zona si es presencial

**Listado de tutores (búsqueda)**

- Filtro por materia (el más importante)
- Filtro por modalidad
- Ordenamiento por fecha de publicación (los más nuevos primero)
- Vista de tarjeta con los datos clave y botón "Contactar" (abre WhatsApp/email/Instagram)

**Gestión básica**

- Tutor puede editar y desactivar su perfil
- Admin puede dar de baja un perfil con motivo

### Excluir de v1 (con justificación)

| Feature                                      | Por qué no en v1                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Mensajería in-app                            | Complejidad alta, bajo valor si el volumen es pequeño. WhatsApp resuelve esto.                           |
| Sistema de pagos in-app (MercadoPago/Stripe) | Requiere integración de pagos, compliance, y soporte. No vale la pena hasta tener volumen.               |
| Reviews y ratings                            | Requieren masa crítica de interacciones para ser útiles. Con poco volumen, la mayoría tendría 0 reviews. |
| Calendario de disponibilidad                 | Complejidad innecesaria. El tutor puede aclararlo en la descripción o al contacto.                       |
| Verificación de identidad o credenciales     | Útil más adelante para generar confianza. En v1, el tutor es responsable de su propia reputación.        |
| Match/recomendación automática               | Requiere datos de comportamiento del usuario. No hay suficiente para entrenar o reglas simples útiles.   |
| Notificaciones push                          | Infraestructura que no existe en la app aún.                                                             |

---

## Modelo de negocio — Riesgos y alternativas

### Modelo propuesto: fee upfront para publicar

**Riesgos principales:**

1. **"¿Por qué pagaría si no hay estudiantes?"** El tutor racional no paga por aparecer en una plataforma donde no hay demanda demostrada. Necesitás demanda primero, fee después. Es el orden incorrecto.

2. **Precio en Argentina.** En contexto de inflación, fijar un precio en ARS que sea razonable para el tutor y sustentable para la plataforma es difícil. Demasiado bajo y no vale la pena operarlo; demasiado alto y no se registra nadie.

3. **Sin verificación = riesgo reputacional.** Si cualquiera paga y se publica, van a haber tutores malos. Un estudiante que tuvo mala experiencia con un tutor de la plataforma también pierde confianza en la plataforma para sus recursos. Esto puede contaminar el core del producto.

4. **Churn alto.** Si el tutor paga un mes y no recibe contactos, no renueva. Sin masa crítica, la retención es imposible.

### Alternativas recomendadas

**Opción A — Gratuito + cobro diferido (recomendada para el estado actual)**
Lanzar completamente gratis. Cuando se alcance un volumen mínimo (ej. 10+ tutores activos por facultad), introducir el cobro para los slots destacados ("aparecer primero"). Los tutores que ya están no pagan, pero los nuevos que quieran destacarse sí. Esto resuelve el cold start y construye supply antes de monetizar.

**Opción B — Suscripción mensual baja**
En lugar de una fee única, cobrar una suscripción mensual baja (equivalente a 1-2 USD). Reduce la barrera de entrada, genera revenue recurrente, y filtra perfiles inactivos automáticamente (quien no renueva, se desactiva). Más fácil de operar que fee por publicación.

**Opción C — Modelo freemium por visibilidad**
Publicar es gratis siempre. Aparecer destacado, con más materias asociadas, o con badge de "verificado" cuesta. Esto genera supply masivo y monetiza a los tutores que ven resultados.

**Opción D — Completamente gratuito, monetizar con el volumen general**
Si la plataforma crece a 10k+ usuarios diarios, la sección de tutores agrega valor a la propuesta global (retención, diferenciación), sin necesitar revenue propio. El valor está en el ecosistema, no en la feature aislada.

> **Recomendación concreta:** Opción A en el corto plazo. Opción B una vez que haya 50+ tutores activos en la plataforma.

---

## Integración con la app actual

### Punto de entrada natural

La integración más limpia es desde la página de materia: "¿Buscás ayuda con esta materia? Encontrá un tutor." Un link al listado pre-filtrado por esa materia. El usuario está exactamente en el contexto correcto y la transición es fluida.

Secundariamente, una sección en el nav principal: "Tutores" o "Clases particulares".

### Cambios de schema necesarios (mínimos)

```
tutors (nueva tabla)
  id, userId (FK → users), displayName, contactType, contactValue,
  description, priceMin, priceMax, currency, modality, city,
  isActive, createdAt, updatedAt

tutor_subjects (tabla de relación)
  tutorId (FK → tutors), subjectId (FK → subjects)
  PK: (tutorId, subjectId)
```

No hay cambios a tablas existentes. Todo es aditivo.

### Riesgos de integración

- **Contaminación de marca.** Si la calidad de los tutores es mala, puede erosionar la confianza en la plataforma completa. Mitigación: moderar perfiles en v1 (admin puede dar de baja), y separar visualmente la sección como "comunidad" vs. la curaduría de recursos que hace el equipo.
- **Distracción del core.** La plataforma principal (recursos académicos) funciona y tiene usuarios. Agregar una feature que requiere gestión activa (moderar tutores, manejar quejas) tiene un costo operativo real. Hay que decidir si vale la pena ese overhead con el tamaño actual del equipo.
- **SEO/discoverabilidad.** Si se implementa server-side rendering en algún punto, los perfiles de tutores podrían ser indexables ("Tutor de Cálculo II UNICEN FACET"), lo que sería un canal de adquisición de usuarios con 0 costo.

---

## Métricas de validación

### Antes de construir (validación de idea)

| Métrica                          | Cómo medirla                                                                                | Umbral para proceder                  |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| Intención de búsqueda de tutores | Encuesta a usuarios actuales: "¿Buscaste o contrataste un tutor en el último cuatrimestre?" | >30% responde "sí"                    |
| Intención de publicar            | Encuesta/landing a tutores potenciales: "¿Publicarías tu perfil gratis?"                    | >20 respuestas positivas en 2 semanas |

### Post-lanzamiento (v1 gratuita)

| Métrica                                     | Qué indica                 | Target 30 días                 |
| ------------------------------------------- | -------------------------- | ------------------------------ |
| Tutores registrados activos                 | Supply del marketplace     | ≥15 para la facultad principal |
| Clicks en botón "Contactar"                 | Demanda real (intent)      | ≥50 clicks únicos              |
| Ratio clicks/perfiles vistos                | Calidad del match          | ≥15%                           |
| Tutores que actualizan su perfil en 30 días | Engagement del lado supply | ≥50% de los registrados        |
| Quejas o reportes de perfiles               | Calidad del contenido      | 0 casos graves                 |

### Para decidir si monetizar

- Al menos 3 tutores consultados estarían dispuestos a pagar (incluso un monto bajo)
- Al menos 1 tutor reportó haber conseguido un estudiante a través de la plataforma
- El volumen de clicks supera 100/mes de forma sostenida

---

## Recomendación final

**Construir, pero no ahora y no cobrando desde el inicio.**

El orden correcto es:

1. **Validar primero (esta semana).** Antes de escribir una línea de código, lanzar una encuesta de 3 preguntas a los usuarios actuales: "¿Buscaste tutor este cuatrimestre?", "¿Lo encontraste fácil?", "¿Usarías la plataforma para buscar uno?". Si >30% responde afirmativamente a la tercera, hay señal real.

2. **Esperar la expansión de facultades.** El feature vale el doble con 5 facultades que con 1. Si la expansión está a 1-2 meses, conviene esperar ese momento para lanzar ambas cosas juntas y maximizar el impacto inicial.

3. **Lanzar gratis.** El modelo de fee upfront sin demanda demostrada es incorrecto. El primer objetivo es generar supply (tutores registrados). Sin supply, no hay demanda. Sin demanda, no hay negocio.

4. **Monetizar con evidencia.** Una vez que haya tutores activos y estudiantes que los contactan, la propuesta de valor para cobrar es clara y vendible: "X estudiantes vieron tu perfil este mes, Y te contactaron." Ahí el tutor entiende por qué pagar.

5. **Mantener separado del core.** La sección debe sentirse como una extensión natural pero opcional de la app. Si la feature falla o no tiene tracción, no debe arrastrar la reputación del producto principal.

---

_Este documento es un análisis de viabilidad. No implica una decisión de desarrollo._
