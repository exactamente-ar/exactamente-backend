// Subtemas de los blogs por materia (plan C1P2024 — Ingeniería en Sistemas).
// Fuente: materias_subtemas.md (workspace raíz). Cada materia tiene el Subtema
// "general" (default, lo crea la migración 0010) + 4 subtemas específicos.

export type Subtema = {
  name: string;
  slug: string;
};

export const SUBTEMA_GENERAL: Subtema = {
  name: 'General',
  slug: 'general',
};

export const SUBTEMAS_POR_MATERIA: Record<string, Subtema[]> = {
  // Año 1 — Cuatrimestre 1
  A1C1M1: [
    { name: 'Algoritmos', slug: 'algoritmos' },
    { name: 'Tipos de datos', slug: 'tipos-datos' },
    { name: 'Funciones', slug: 'funciones' },
    { name: 'Ordenamiento', slug: 'ordenamiento' },
  ],
  A1C1M2: [
    { name: 'Lógica', slug: 'logica' },
    { name: 'Conjuntos', slug: 'conjuntos' },
    { name: 'Boole', slug: 'boole' },
    { name: 'Relaciones', slug: 'relaciones' },
  ],
  A1C1M3: [
    { name: 'Representación', slug: 'representacion' },
    { name: 'Computadora', slug: 'computadora' },
    { name: 'Paradigmas', slug: 'paradigmas' },
    { name: 'Redes', slug: 'redes' },
  ],
  A1C1M4: [
    { name: 'Comprensión', slug: 'comprension' },
    { name: 'Lectura', slug: 'lectura' },
    { name: 'Gramática', slug: 'gramatica' },
    { name: 'Redacción', slug: 'redaccion' },
  ],

  // Año 1 — Cuatrimestre 2
  A1C2M1: [
    { name: 'Combinacionales', slug: 'combis' },
    { name: 'Secuenciales', slug: 'secuenciales' },
    { name: 'Estados', slug: 'estados' },
    { name: 'Arquitectura', slug: 'arqui' },
  ],
  A1C2M2: [
    { name: 'Archivos', slug: 'archivos' },
    { name: 'Listas', slug: 'listas' },
    { name: 'Árboles', slug: 'arboles' },
    { name: 'Algoritmos', slug: 'algoritmos' },
  ],
  A1C2M3: [
    { name: 'Autómatas', slug: 'automatas' },
    { name: 'Pila', slug: 'pila' },
    { name: 'Gramáticas', slug: 'gramaticas' },
    { name: 'Turing', slug: 'turing' },
  ],
  A1C2M4: [
    { name: 'Límites', slug: 'limites' },
    { name: 'Derivadas', slug: 'derivadas' },
    { name: 'Integrales', slug: 'integrales' },
    { name: 'Series', slug: 'series' },
  ],

  // Año 2 — Cuatrimestre 1
  A2C1M1: [
    { name: 'ISA', slug: 'isa' },
    { name: 'Pipeline', slug: 'pipeline' },
    { name: 'Unidades', slug: 'unidades' },
    { name: 'Memoria', slug: 'memoria' },
  ],
  A2C1M2: [
    { name: 'Complejidad', slug: 'complejidad' },
    { name: 'Ordenamiento', slug: 'ordenamiento' },
    { name: 'Búsqueda', slug: 'busqueda' },
    { name: 'Técnicas', slug: 'tecnicas' },
  ],
  A2C1M3: [
    { name: 'Clases', slug: 'clases' },
    { name: 'Herencia', slug: 'herencia' },
    { name: 'UML', slug: 'uml' },
    { name: 'Patrones', slug: 'patrones' },
  ],
  A2C1M4: [
    { name: 'Espacios', slug: 'espacios' },
    { name: 'Transformaciones', slug: 'transformaciones' },
    { name: 'Autovalores', slug: 'autovalores' },
    { name: 'Ortogonalización', slug: 'orto' },
  ],

  // Año 2 — Cuatrimestre 2
  A2C2M1: [
    { name: 'Modelos', slug: 'modelos' },
    { name: 'IP', slug: 'ip' },
    { name: 'Protocolos', slug: 'protocolos' },
    { name: 'Ruteo', slug: 'ruteo' },
  ],
  A2C2M2: [
    { name: 'Ciclo de vida', slug: 'ciclo' },
    { name: 'Ágiles', slug: 'agiles' },
    { name: 'Requisitos', slug: 'requisitos' },
    { name: 'Pruebas', slug: 'pruebas' },
  ],
  A2C2M3: [
    { name: 'Grafos', slug: 'grafos' },
    { name: 'Caminos', slug: 'caminos' },
    { name: 'Flujo', slug: 'flujo' },
    { name: 'NP', slug: 'np' },
  ],
  A2C2M4: [
    { name: 'Multivariable', slug: 'multivariable' },
    { name: 'Optimización', slug: 'optimizacion' },
    { name: 'Integrales', slug: 'integrales' },
    { name: 'Teoremas', slug: 'teoremas' },
  ],

  // Año 3 — Cuatrimestre 1
  A3C1M1: [
    { name: 'Procesos', slug: 'procesos' },
    { name: 'Memoria', slug: 'memoria' },
    { name: 'Archivos', slug: 'archivos' },
    { name: 'Casos', slug: 'casos' },
  ],
  A3C1M2: [
    { name: 'MER', slug: 'mer' },
    { name: 'Relacional', slug: 'relacional' },
    { name: 'SQL', slug: 'sql' },
    { name: 'Transacciones', slug: 'transacciones' },
  ],
  A3C1M3: [
    { name: 'Dinámica', slug: 'dinamica' },
    { name: 'Energía', slug: 'energia' },
    { name: 'Rotación', slug: 'rotacion' },
    { name: 'Ondas', slug: 'ondas' },
  ],
  A3C1M4: [
    { name: 'Paradigmas', slug: 'paradigmas' },
    { name: 'Lenguajes', slug: 'lenguajes' },
    { name: 'Compiladores', slug: 'compiladores' },
    { name: 'VM', slug: 'vm' },
  ],

  // Año 3 — Cuatrimestre 2
  A3C2M1: [
    { name: 'Frontend', slug: 'frontend' },
    { name: 'Frameworks', slug: 'frameworks' },
    { name: 'APIs', slug: 'apis' },
    { name: 'Seguridad', slug: 'seguridad' },
  ],
  A3C2M2: [
    { name: 'Optimización', slug: 'optimizacion' },
    { name: 'Replicación', slug: 'replicacion' },
    { name: 'Warehousing', slug: 'warehousing' },
    { name: 'NoSQL', slug: 'nosql' },
  ],
  A3C2M3: [
    { name: 'Probabilidad', slug: 'probabilidad' },
    { name: 'Distribuciones', slug: 'distribuciones' },
    { name: 'Estimación', slug: 'estimacion' },
    { name: 'Regresión', slug: 'regresion' },
  ],
  A3C2M4: [
    { name: 'Requisitos', slug: 'requisitos' },
    { name: 'Patrones', slug: 'patrones' },
    { name: 'Pruebas', slug: 'pruebas' },
    { name: 'Calidad', slug: 'calidad' },
  ],

  // Año 4 — Cuatrimestre 1
  A4C1M1: [
    { name: 'Estructuras', slug: 'estructuras' },
    { name: 'Administración', slug: 'administracion' },
    { name: 'Finanzas', slug: 'finanzas' },
    { name: 'Ética', slug: 'etica' },
  ],
  A4C1M2: [
    { name: 'Entropía', slug: 'entropia' },
    { name: 'Codificación', slug: 'codificacion' },
    { name: 'Shannon', slug: 'shannon' },
    { name: 'Cripto', slug: 'cripto' },
  ],
  A4C1M3: [
    { name: 'Inalámbricas', slug: 'inalambricas' },
    { name: 'Seguridad', slug: 'seguridad' },
    { name: 'Servicios', slug: 'servicios' },
    { name: 'Cloud', slug: 'cloud' },
  ],
  A4C1M4: [
    { name: 'Electrostática', slug: 'electrostatica' },
    { name: 'Circuitos', slug: 'circuitos' },
    { name: 'Magnetismo', slug: 'magnetismo' },
    { name: 'Óptica', slug: 'optica' },
  ],

  // Año 4 — Cuatrimestre 2
  A4C2M1: [
    { name: 'Modelos', slug: 'modelos' },
    { name: 'Aseguramiento', slug: 'aseguramiento' },
    { name: 'Métricas', slug: 'metricas' },
    { name: 'Pruebas', slug: 'pruebas' },
  ],
  A4C2M2: [
    { name: 'ILP', slug: 'ilp' },
    { name: 'Superescalares', slug: 'superescalares' },
    { name: 'Multiprocesadores', slug: 'multiprocesadores' },
    { name: 'GPUs', slug: 'gpus' },
  ],
  A4C2M3: [
    { name: 'Procesamiento', slug: 'procesamiento' },
    { name: 'Visualización', slug: 'visualizacion' },
    { name: 'ML', slug: 'ml' },
    { name: 'Ética', slug: 'etica' },
  ],
  A4C2M4: [
    { name: 'Parsing', slug: 'parsing' },
    { name: 'Semántico', slug: 'semantico' },
    { name: 'Optimización', slug: 'optimizacion' },
    { name: 'Herramientas', slug: 'herramientas' },
  ],

  // Año 5 — Cuatrimestre 1
  A5C1M1: [
    { name: 'Configuración', slug: 'configuracion' },
    { name: 'DevOps', slug: 'devops' },
    { name: 'Arquitecturas', slug: 'arquis' },
    { name: 'SSDLC', slug: 'ssdlc' },
  ],
  A5C1M2: [
    { name: 'Ataques', slug: 'ataques' },
    { name: 'Cripto', slug: 'cripto' },
    { name: 'Seguridad', slug: 'seguridad' },
    { name: 'Forense', slug: 'forense' },
  ],
  A5C1M3: [
    { name: 'Búsqueda', slug: 'busqueda' },
    { name: 'Conocimiento', slug: 'conocimiento' },
    { name: 'ML', slug: 'ml' },
    { name: 'PLN', slug: 'pln' },
  ],

  // Año 5 — Cuatrimestre 2
  A5C2M1: [
    { name: 'Estudios', slug: 'estudios' },
    { name: 'Financiera', slug: 'financiera' },
    { name: 'Riesgos', slug: 'riesgos' },
    { name: 'Financiamiento', slug: 'financiamiento' },
  ],
  A5C2M2: [
    { name: 'Ética', slug: 'etica' },
    { name: 'Propiedad intelectual', slug: 'propiedad' },
    { name: 'Delitos', slug: 'delitos' },
    { name: 'Regulación', slug: 'regulacion' },
  ],
  A5C2M3: [
    { name: 'PPS', slug: 'pps' },
    { name: 'Proyecto', slug: 'proyecto' },
    { name: 'Tutoría', slug: 'tutoria' },
    { name: 'Informe', slug: 'informe' },
  ],
};
