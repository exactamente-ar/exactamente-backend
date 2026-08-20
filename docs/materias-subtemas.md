# Materias y subtemas — Ingeniería en Sistemas

> Lista de subtemas por materia para el feature de **Blogs por Materia** (foro tipo Reddit).
> Cada blog de materia se divide en subtemas: un **Subtema general** (default, presente en
> todas) y **4 subtemas específicos** derivados del programa de cada materia.
>
> Los nombres y slugs están en forma corta y general (ej. `arquitecturas` → `arquis`),
> para que se lean igual que hablan los estudiantes.

## Fuente

- **Origen de las materias:** `../scripts/data/materias.ts`, constante
  `MATERIAS_SISTEMAS`, carrera `C1`, **plan `C1P2024`** (RCA vigente).
- Se incluye **solo el plan 2024** (el actual). El plan 2011 queda fuera: es legacy.
- Los `id` de cada materia (`A1C1M1`, `A2C2M3`, etc.) son los que ya existen en el seed, para
  engancharlos 1:1 cuando esto se lleve a código.

## Subtema default (general) — para todas las materias

| Campo        | Valor     |
| ------------ | --------- |
| `name`       | `General` |
| `slug`       | `general` |
| `is_default` | `true`    |

Es el canal fijo que nace con cada blog (PRD FR-2, migración `0010_add_blog_tables.sql`). Recibe
toda discusión que no encaja en ninguno de los 4 subtemas específicos: avisos de cursada, dudas
sueltas, coordinación, presentaciones.

## Mapeo a la tabla `blog_subtopics`

Cada subtema (general + específicos) se inserta con:

| Columna      | Valor                                |
| ------------ | ------------------------------------ |
| `id`         | `gen_random_uuid()::text` (generado) |
| `subject_id` | el `id` de la materia (ej. `A1C1M1`) |
| `name`       | nombre del subtema                   |
| `slug`       | slug (kebab-case, único por materia) |
| `is_default` | `true` solo para `general`           |

---

## Año 1 — Cuatrimestre 1

### Introducción a la Programación 1 (`A1C1M1`)

- **Algoritmos** — `algoritmos`
- **Tipos de datos** — `tipos-datos`
- **Funciones** — `funciones`
- **Ordenamiento** — `ordenamiento`

### Introducción al Álgebra (`A1C1M2`)

- **Lógica** — `logica`
- **Conjuntos** — `conjuntos`
- **Boole** — `boole`
- **Relaciones** — `relaciones`

### Introducción a los Sistemas Informáticos (`A1C1M3`)

- **Representación** — `representacion`
- **Computadora** — `computadora`
- **Paradigmas** — `paradigmas`
- **Redes** — `redes`

### Inglés (`A1C1M4`)

- **Comprensión** — `comprension`
- **Lectura** — `lectura`
- **Gramática** — `gramatica`
- **Redacción** — `redaccion`

## Año 1 — Cuatrimestre 2

### Diseño Lógico (`A1C2M1`)

- **Combinacionales** — `combis`
- **Secuenciales** — `secuenciales`
- **Estados** — `estados`
- **Arquitectura** — `arqui`

### Introducción a la Programación 2 (`A1C2M2`)

- **Archivos** — `archivos`
- **Listas** — `listas`
- **Árboles** — `arboles`
- **Algoritmos** — `algoritmos`

### Lenguajes Formales y Autómatas (`A1C2M3`)

- **Autómatas** — `automatas`
- **Pila** — `pila`
- **Gramáticas** — `gramaticas`
- **Turing** — `turing`

### Cálculo 1 (`A1C2M4`)

- **Límites** — `limites`
- **Derivadas** — `derivadas`
- **Integrales** — `integrales`
- **Series** — `series`

## Año 2 — Cuatrimestre 1

### Arquitectura de Computadoras 1 (`A2C1M1`)

- **ISA** — `isa`
- **Pipeline** — `pipeline`
- **Unidades** — `unidades`
- **Memoria** — `memoria`

### Análisis y Diseño de Algoritmos 1 (`A2C1M2`)

- **Complejidad** — `complejidad`
- **Ordenamiento** — `ordenamiento`
- **Búsqueda** — `busqueda`
- **Técnicas** — `tecnicas`

### Programación Orientada a Objetos (`A2C1M3`)

- **Clases** — `clases`
- **Herencia** — `herencia`
- **UML** — `uml`
- **Patrones** — `patrones`

### Álgebra Lineal (`A2C1M4`)

- **Espacios** — `espacios`
- **Transformaciones** — `transformaciones`
- **Autovalores** — `autovalores`
- **Ortogonalización** — `orto`

## Año 2 — Cuatrimestre 2

### Redes de Computadoras 1 (`A2C2M1`)

- **Modelos** — `modelos`
- **IP** — `ip`
- **Protocolos** — `protocolos`
- **Ruteo** — `ruteo`

### Metodologías de Desarrollo de Software (`A2C2M2`)

- **Ciclo de vida** — `ciclo`
- **Ágiles** — `agiles`
- **Requisitos** — `requisitos`
- **Pruebas** — `pruebas`

### Análisis y Diseño de Algoritmos 2 (`A2C2M3`)

- **Grafos** — `grafos`
- **Caminos** — `caminos`
- **Flujo** — `flujo`
- **NP** — `np`

### Cálculo 2 (`A2C2M4`)

- **Multivariable** — `multivariable`
- **Optimización** — `optimizacion`
- **Integrales** — `integrales`
- **Teoremas** — `teoremas`

## Año 3 — Cuatrimestre 1

### Sistemas Operativos (`A3C1M1`)

- **Procesos** — `procesos`
- **Memoria** — `memoria`
- **Archivos** — `archivos`
- **Casos** — `casos`

### Base de Datos 1 (`A3C1M2`)

- **MER** — `mer`
- **Relacional** — `relacional`
- **SQL** — `sql`
- **Transacciones** — `transacciones`

### Física 1 (`A3C1M3`)

- **Dinámica** — `dinamica`
- **Energía** — `energia`
- **Rotación** — `rotacion`
- **Ondas** — `ondas`

### Lenguajes y Paradigmas (`A3C1M4`)

- **Paradigmas** — `paradigmas`
- **Lenguajes** — `lenguajes`
- **Compiladores** — `compiladores`
- **VM** — `vm`

## Año 3 — Cuatrimestre 2

### Programación WEB (`A3C2M1`)

- **Frontend** — `frontend`
- **Frameworks** — `frameworks`
- **APIs** — `apis`
- **Seguridad** — `seguridad`

### Base de Datos 2 (`A3C2M2`)

- **Optimización** — `optimizacion`
- **Replicación** — `replicacion`
- **Warehousing** — `warehousing`
- **NoSQL** — `nosql`

### Probabilidad y Estadística (`A3C2M3`)

- **Probabilidad** — `probabilidad`
- **Distribuciones** — `distribuciones`
- **Estimación** — `estimacion`
- **Regresión** — `regresion`

### Ingeniería de Software 1 (`A3C2M4`)

- **Requisitos** — `requisitos`
- **Patrones** — `patrones`
- **Pruebas** — `pruebas`
- **Calidad** — `calidad`

## Año 4 — Cuatrimestre 1

### Organización y Gestión Empresarial (`A4C1M1`)

- **Estructuras** — `estructuras`
- **Administración** — `administracion`
- **Finanzas** — `finanzas`
- **Ética** — `etica`

### Teoría de la Información (`A4C1M2`)

- **Entropía** — `entropia`
- **Codificación** — `codificacion`
- **Shannon** — `shannon`
- **Cripto** — `cripto`

### Redes de Computadoras 2 (`A4C1M3`)

- **Inalámbricas** — `inalambricas`
- **Seguridad** — `seguridad`
- **Servicios** — `servicios`
- **Cloud** — `cloud`

### Física 2 (`A4C1M4`)

- **Electrostática** — `electrostatica`
- **Circuitos** — `circuitos`
- **Magnetismo** — `magnetismo`
- **Óptica** — `optica`

## Año 4 — Cuatrimestre 2

### Calidad de Software (`A4C2M1`)

- **Modelos** — `modelos`
- **Aseguramiento** — `aseguramiento`
- **Métricas** — `metricas`
- **Pruebas** — `pruebas`

### Arquitectura de Computadoras 2 (`A4C2M2`)

- **ILP** — `ilp`
- **Superescalares** — `superescalares`
- **Multiprocesadores** — `multiprocesadores`
- **GPUs** — `gpus`

### Fundamentos de la Ciencia de Datos (`A4C2M3`)

- **Procesamiento** — `procesamiento`
- **Visualización** — `visualizacion`
- **ML** — `ml`
- **Ética** — `etica`

### Compiladores e Intérpretes (`A4C2M4`)

- **Parsing** — `parsing`
- **Semántico** — `semantico`
- **Optimización** — `optimizacion`
- **Herramientas** — `herramientas`

## Año 5 — Cuatrimestre 1

### Ingeniería de Software 2 (`A5C1M1`)

- **Configuración** — `configuracion`
- **DevOps** — `devops`
- **Arquitecturas** — `arquis`
- **SSDLC** — `ssdlc`

### Ciberseguridad (`A5C1M2`)

- **Ataques** — `ataques`
- **Cripto** — `cripto`
- **Seguridad** — `seguridad`
- **Forense** — `forense`

### Inteligencia Artificial (`A5C1M3`)

- **Búsqueda** — `busqueda`
- **Conocimiento** — `conocimiento`
- **ML** — `ml`
- **PLN** — `pln`

## Año 5 — Cuatrimestre 2

### Formulación y Evaluación de Proyectos TICs (`A5C2M1`)

- **Estudios** — `estudios`
- **Financiera** — `financiera`
- **Riesgos** — `riesgos`
- **Financiamiento** — `financiamiento`

### Ética y Legislación de la Práctica Profesional (`A5C2M2`)

- **Ética** — `etica`
- **Propiedad intelectual** — `propiedad`
- **Delitos** — `delitos`
- **Regulación** — `regulacion`

### Práctica Profesional Supervisada y Proyecto Integrador (`A5C2M3`)

- **PPS** — `pps`
- **Proyecto** — `proyecto`
- **Tutoría** — `tutoria`
- **Informe** — `informe`
