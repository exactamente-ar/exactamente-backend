# Exactamente — Contexto del proyecto

## Qué es

Exactamente es una plataforma web para estudiantes universitarios que centraliza recursos de estudio: resúmenes, parciales y finales organizados por materia, carrera y facultad.

El problema que resuelve: los materiales de estudio están dispersos en grupos de WhatsApp, drives personales y foros sin estructura. Exactamente los concentra en un solo lugar, con orden y moderación.

---

## Usuarios

### Estudiante (user)
El usuario principal de la plataforma. Puede:
- Explorar el catálogo de materias de su carrera
- Ver los recursos publicados de cada materia (resúmenes, parciales, finales)
- Descargar o previsualizar archivos desde Google Drive
- Subir sus propios recursos para que sean revisados por un admin

### Admin
Administrador de una facultad específica. Puede:
- Revisar recursos pendientes de aprobación (publicar o rechazar)
- Gestionar carpetas en Google Drive donde se almacenan los archivos

### Superadmin
Control total del sistema. Puede hacer todo lo que hace el admin más gestión de usuarios y roles.

---

## Jerarquia de entidades

```
Universidad
  └── Facultad
        └── Carrera
              └── Plan de estudios
                    └── Materia (con año y cuatrimestre)
                          └── Recursos (resumen / parcial / final)
```

Ejemplo concreto:
```
UNICEN
  └── FACET (Facultad de Ciencias Exactas)
        └── Ingeniería en Sistemas
              └── Plan 2019
                    └── Algoritmos y Estructuras de Datos (Año 1, Cuatrimestre 2)
                          ├── resumen-unidad-3.pdf
                          ├── parcial-2023-1er-turno.pdf
                          └── final-diciembre-2022.pdf
```

---

## Entidades clave

### Materia (Subject)
- Tiene título, año de cursado (1-5) y cuatrimestre (1-2)
- Puede pertenecer a múltiples carreras (una materia compartida entre Sistemas e Industrial, por ejemplo)
- Tiene prerequisitos (materias que hay que aprobar antes) y correlativas (materias que habilita)
- Puede tener links a Moodle y al programa oficial

### Recurso (Resource)
- Pertenece a una materia
- Tiene un tipo: `resumen`, `parcial` o `final`
- Pasa por estados: `pending` → `published` / `rejected`
- El archivo se almacena en Google Drive (identificado por `driveFileId`)
- Registra quién lo subió (`uploadedBy`) y quién lo revisó (`reviewedBy`)
- Cuando es rechazado, tiene un `rejectionReason`

---

## Flujos principales

### Flujo del estudiante

1. **Descubrimiento**: El usuario llega a la plataforma y selecciona su universidad, facultad y carrera.
2. **Exploración de materias**: Ve las materias organizadas por año y cuatrimestre, con sus prerequisitos visibles.
3. **Detalle de materia**: Accede a una materia y ve los recursos disponibles (filtrados por tipo).
4. **Consumo de recurso**: Previsualiza el archivo en el navegador o lo descarga directamente desde Google Drive.
5. **Contribución**: Si está registrado, puede subir un nuevo recurso para que sea revisado.

### Flujo de subida de recurso (usuario registrado)

1. El usuario selecciona la materia a la que pertenece el recurso.
2. Elige el tipo: resumen, parcial o final.
3. Le da un título descriptivo y sube el archivo.
4. El recurso queda en estado `pending`.
5. Un admin lo revisa y lo publica o rechaza (con motivo).
6. Si es publicado, queda disponible para todos.

### Flujo de moderación (admin)

1. El admin accede al panel de administración.
2. Ve la lista de recursos pendientes de su facultad.
3. Para cada recurso: puede previsualizar el archivo, publicarlo o rechazarlo con un motivo.
4. También puede gestionar la estructura de carpetas en Google Drive.

---

## Roles y permisos

| Accion                          | user | admin | superadmin |
|---------------------------------|------|-------|------------|
| Ver materias y recursos         | si   | si    | si         |
| Descargar recursos              | si   | si    | si         |
| Subir recursos                  | si   | si    | si         |
| Publicar / rechazar recursos    | no   | si    | si         |
| Gestionar Drive                 | no   | si    | si         |
| Gestionar usuarios y roles      | no   | no    | si         |

Los admins están asociados a una facultad específica (`adminFacultyId`). Solo moderan recursos de esa facultad.

---

## Almacenamiento de archivos

Los archivos no viven en el servidor. Se guardan en **Google Drive** en una estructura de carpetas espejada a la jerarquía de la plataforma:

```
Google Drive/
  exactamente/
    FACET/
      Ingeniería en Sistemas/
        Algoritmos y Estructuras de Datos/
          Parciales/
          Finales/
          Resumenes/
```

Cada recurso guarda el `driveFileId` del archivo en Drive, y la plataforma construye dos URLs:
- **Preview**: para ver el archivo embebido en el navegador
- **Download**: para descarga directa

---

## Estado actual del proyecto

- API REST funcional con todos los endpoints de lectura publicos
- Autenticacion JWT implementada
- Moderacion de recursos implementada (pendiente / publicado / rechazado)
- Panel admin con gestion de Drive
- Sin frontend publico aun (en desarrollo)
- Datos cargados: UNICEN > FACET > carreras de ingenieria con sus materias y recursos
