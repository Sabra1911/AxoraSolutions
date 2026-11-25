-- MS En Línea · V004 · Servicios de la lista de precios y adecuaciones visuales

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM USER_CONSTRAINTS
   WHERE TABLE_NAME = 'SERVICIOS'
     AND CONSTRAINT_NAME = 'CK_SERVICIOS_LINEA';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE
      'ALTER TABLE SERVICIOS ADD CONSTRAINT CK_SERVICIOS_LINEA ' ||
      'CHECK (LINEA IN (''SOPORTE_EQUIPOS'',''REDES'',''CCTV'',''ADECUACIONES''))';
  END IF;

  FOR c IN (
    SELECT CONSTRAINT_NAME
      FROM USER_CONSTRAINTS
     WHERE TABLE_NAME = 'SERVICIOS'
       AND CONSTRAINT_TYPE = 'C'
       AND CONSTRAINT_NAME <> 'CK_SERVICIOS_LINEA'
       AND UPPER(SEARCH_CONDITION_VC) LIKE '%LINEA IN%'
  ) LOOP
    EXECUTE IMMEDIATE 'ALTER TABLE SERVICIOS DROP CONSTRAINT ' ||
      DBMS_ASSERT.SIMPLE_SQL_NAME(c.CONSTRAINT_NAME);
  END LOOP;
END;
/

MERGE INTO SERVICIOS target
USING (
  SELECT 'SOPORTE_EQUIPOS' LINEA, 'SOP-001' CODIGO, 'Mantenimiento de computadores' NOMBRE, 'Mantenimiento básico de computador.' DESCRIPCION, 60000 PRECIO_BASE, 'equipo' UNIDAD FROM DUAL
  UNION ALL SELECT 'SOPORTE_EQUIPOS', 'SOP-002', 'Mantenimiento de portátil', 'Mantenimiento básico de portátil.', 100000, 'equipo' FROM DUAL
  UNION ALL SELECT 'REDES', 'RED-001', 'Instalación de redes', 'Instalación de redes; alcance final sujeto a revisión técnica.', 100000, 'servicio' FROM DUAL
  UNION ALL SELECT 'REDES', 'RED-003', 'Mantenimiento de redes', 'Mantenimiento de redes existentes.', 80000, 'visita' FROM DUAL
  UNION ALL SELECT 'CCTV', 'CCT-001', 'Instalación de cámaras de seguridad en poste', 'Instalación de cámara de seguridad en poste.', 100000, 'servicio' FROM DUAL
  UNION ALL SELECT 'SOPORTE_EQUIPOS', 'SOP-004', 'Mantenimiento de computadores y formateo', 'Mantenimiento y formateo de computador.', 100000, 'equipo' FROM DUAL
  UNION ALL SELECT 'SOPORTE_EQUIPOS', 'SOP-005', 'Formateo de computador', 'Formateo de computador.', 50000, 'equipo' FROM DUAL
  UNION ALL SELECT 'SOPORTE_EQUIPOS', 'SOP-006', 'Mantenimiento de impresoras y lavado de cabezal', 'Mantenimiento de impresora con lavado de cabezal.', 80000, 'impresora' FROM DUAL
  UNION ALL SELECT 'SOPORTE_EQUIPOS', 'SOP-007', 'Mantenimiento de impresoras y cambio de mecanismo', 'Mantenimiento de impresora con cambio de mecanismo.', 100000, 'impresora' FROM DUAL
  UNION ALL SELECT 'SOPORTE_EQUIPOS', 'SOP-008', 'Formateo de portátil', 'Formateo de portátil.', 50000, 'equipo' FROM DUAL
  UNION ALL SELECT 'SOPORTE_EQUIPOS', 'SOP-009', 'Mantenimiento de teléfonos', 'Mantenimiento de equipo telefónico.', 50000, 'equipo' FROM DUAL
  UNION ALL SELECT 'CCTV', 'CCT-004', 'Instalación de cámaras de seguridad punto a punto', 'Instalación de cámaras de seguridad en enlace punto a punto.', 60000, 'servicio' FROM DUAL
  UNION ALL SELECT 'REDES', 'RED-004', 'Instalación de líneas telefónicas', 'Instalación de líneas telefónicas.', 80000, 'servicio' FROM DUAL
  UNION ALL SELECT 'ADECUACIONES', 'ADE-001', 'Instalación de PVC/WPC marmolizado en paredes', 'Instalación de PVC y WPC marmolizado en paredes.', 50000, 'metro' FROM DUAL
  UNION ALL SELECT 'ADECUACIONES', 'ADE-002', 'Instalación de PVC en techos', 'Instalación de PVC en techos.', 60000, 'metro' FROM DUAL
  UNION ALL SELECT 'ADECUACIONES', 'ADE-003', 'Instalación de drywall por metro', 'Instalación de drywall por metro.', 42000, 'metro' FROM DUAL
  UNION ALL SELECT 'ADECUACIONES', 'ADE-004', 'Instalación de puntos eléctricos', 'Instalación de punto eléctrico.', 40000, 'punto' FROM DUAL
  UNION ALL SELECT 'ADECUACIONES', 'ADE-005', 'Instalación de lámparas', 'Instalación de lámpara.', 40000, 'unidad' FROM DUAL
  UNION ALL SELECT 'ADECUACIONES', 'ADE-006', 'Instalación de base de televisores', 'Instalación de base para televisor.', 100000, 'base' FROM DUAL
) source
ON (target.CODIGO = source.CODIGO)
WHEN MATCHED THEN UPDATE SET
  target.LINEA = source.LINEA,
  target.NOMBRE = source.NOMBRE,
  target.DESCRIPCION = source.DESCRIPCION,
  target.PRECIO_BASE = source.PRECIO_BASE,
  target.UNIDAD = source.UNIDAD,
  target.ACTIVO = 1,
  target.ACTUALIZADO_EN = SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT
  (LINEA, CODIGO, NOMBRE, DESCRIPCION, PRECIO_BASE, UNIDAD, ACTIVO)
  VALUES (source.LINEA, source.CODIGO, source.NOMBRE, source.DESCRIPCION, source.PRECIO_BASE, source.UNIDAD, 1)
/
