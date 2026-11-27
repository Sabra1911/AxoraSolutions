-- AXORA SOLUTIONS · V006 · Solicitudes de solo consulta y verificación de correo
-- Cada sentencia termina con una línea que contiene solo "/"
ALTER TABLE SOLICITUDES ADD (TIPO VARCHAR2(10) DEFAULT 'SERVICIO' NOT NULL CHECK (TIPO IN ('SERVICIO','CONSULTA')))
/
-- Las cuentas existentes quedan verificadas (DEFAULT 1); las nuevas por registro o invitación se crean con 0 hasta activar el correo.
ALTER TABLE USUARIOS ADD (EMAIL_VERIFICADO NUMBER(1) DEFAULT 1 NOT NULL CHECK (EMAIL_VERIFICADO IN (0,1)))
/
