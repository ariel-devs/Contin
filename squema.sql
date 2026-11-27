CREATE DATABASE SistemaContableDB;
GO

USE SistemaContableDB;
GO

/* ============================================================
   1. TABLAS BASE
   ============================================================ */

CREATE TABLE USUARIO (
    id_usuario INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    fecha_registro DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE TABLE EMPRESA (
    id_empresa INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    nit VARCHAR(20) NULL,
    nrc VARCHAR(20) NULL,
    direccion VARCHAR(200) NULL,
    tipo_contribuyente VARCHAR(20) NOT NULL DEFAULT 'PEQUENO',
    inscrito_dte BIT NOT NULL DEFAULT 0,
    nit_validado BIT NOT NULL DEFAULT 0,
    fecha_registro DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_EMPRESA_USUARIO
        FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario),
    CONSTRAINT CK_EMPRESA_TIPO_CONTRIBUYENTE
        CHECK (tipo_contribuyente IN ('GRAN_CONTRIBUYENTE','MEDIANO','PEQUENO','EXENTO'))
);
GO

CREATE TABLE LIBRO (
    id_libro INT IDENTITY(1,1) PRIMARY KEY,
    id_empresa INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    tipo_libro VARCHAR(20) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado VARCHAR(10) NOT NULL DEFAULT 'ABIERTO',
    fecha_creacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_LIBRO_EMPRESA
        FOREIGN KEY (id_empresa) REFERENCES EMPRESA(id_empresa),
    CONSTRAINT CK_LIBRO_ESTADO
        CHECK (estado IN ('ABIERTO', 'CERRADO')),
    CONSTRAINT CK_LIBRO_TIPO
        CHECK (tipo_libro IN ('DIARIO', 'MAYOR', 'IVA', 'BALANCE')),
    CONSTRAINT CK_LIBRO_FECHAS
        CHECK (fecha_inicio <= fecha_fin)
);
GO

/* ============================================================
   2. CATÁLOGO DE CUENTAS (sin cambios en estructura)
   ============================================================ */

CREATE TABLE CUENTA_PREDETERMINADA (
    id_cuenta INT IDENTITY(1,1) PRIMARY KEY,
    id_cuenta_padre INT NULL,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    clasificacion VARCHAR(20) NOT NULL,
    naturaleza VARCHAR(15) NOT NULL,
    permite_movimientos BIT NOT NULL DEFAULT 1,
    estado VARCHAR(10) NOT NULL DEFAULT 'ACTIVA',
    CONSTRAINT FK_CUENTA_PREDETERMINADA_PADRE
        FOREIGN KEY (id_cuenta_padre) REFERENCES CUENTA_PREDETERMINADA(id_cuenta),
    CONSTRAINT CK_CUENTA_PRE_CLASIFICACION
        CHECK (clasificacion IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO')),
    CONSTRAINT CK_CUENTA_PRE_NATURALEZA
        CHECK (naturaleza IN ('DEUDORA','ACREEDORA')),
    CONSTRAINT CK_CUENTA_PRE_ESTADO
        CHECK (estado IN ('ACTIVA','INACTIVA'))
);
GO

CREATE TABLE CUENTA_PERSONALIZADA (
    id_cuenta INT IDENTITY(1,1) PRIMARY KEY,
    id_empresa INT NOT NULL,
    id_cuenta_predeterminada_padre INT NULL,
    id_cuenta_personalizada_padre INT NULL,
    codigo VARCHAR(20) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    clasificacion VARCHAR(20) NOT NULL,
    naturaleza VARCHAR(15) NOT NULL,
    permite_movimientos BIT NOT NULL DEFAULT 1,
    estado VARCHAR(10) NOT NULL DEFAULT 'ACTIVA',
    CONSTRAINT FK_CUENTA_PERSONALIZADA_EMPRESA
        FOREIGN KEY (id_empresa) REFERENCES EMPRESA(id_empresa),
    CONSTRAINT FK_CUENTA_PERSONALIZADA_PRE_PADRE
        FOREIGN KEY (id_cuenta_predeterminada_padre) REFERENCES CUENTA_PREDETERMINADA(id_cuenta),
    CONSTRAINT FK_CUENTA_PERSONALIZADA_PADRE
        FOREIGN KEY (id_cuenta_personalizada_padre, id_empresa)
        REFERENCES CUENTA_PERSONALIZADA (id_cuenta, id_empresa),
    CONSTRAINT UQ_CUENTA_PERSONALIZADA_ID_EMPRESA
        UNIQUE (id_cuenta, id_empresa),
    CONSTRAINT CK_CUENTA_PER_CLASIFICACION
        CHECK (clasificacion IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO','COSTO')),
    CONSTRAINT CK_CUENTA_PER_NATURALEZA
        CHECK (naturaleza IN ('DEUDORA','ACREEDORA')),
    CONSTRAINT CK_CUENTA_PER_ESTADO
        CHECK (estado IN ('ACTIVA','INACTIVA')),
    CONSTRAINT CK_CUENTA_PER_PADRE
        CHECK (id_cuenta_predeterminada_padre IS NULL OR id_cuenta_personalizada_padre IS NULL),
    CONSTRAINT CK_CUENTA_PER_NO_AUTO_PADRE
        CHECK (id_cuenta_personalizada_padre IS NULL OR id_cuenta_personalizada_padre <> id_cuenta)
);
GO

CREATE UNIQUE INDEX UQ_CUENTA_PERSONALIZADA_EMPRESA_CODIGO
ON CUENTA_PERSONALIZADA(id_empresa, codigo);
GO

/* ============================================================
   3. TERCEROS (clientes / proveedores)
   ============================================================ */

CREATE TABLE TERCERO (
    id_tercero INT IDENTITY(1,1) PRIMARY KEY,
    id_empresa INT NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    nit VARCHAR(20) NULL,
    nrc VARCHAR(20) NULL,
    tipo_contribuyente VARCHAR(20) NOT NULL DEFAULT 'PEQUENO',
    direccion VARCHAR(250) NULL,
    correo VARCHAR(150) NULL,
    telefono VARCHAR(20) NULL,
    estado VARCHAR(10) NOT NULL DEFAULT 'ACTIVO',
    fecha_registro DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_TERCERO_EMPRESA
        FOREIGN KEY (id_empresa) REFERENCES EMPRESA(id_empresa),
    CONSTRAINT CK_TERCERO_TIPO
        CHECK (tipo IN ('CLIENTE','PROVEEDOR','AMBOS')),
    CONSTRAINT CK_TERCERO_TIPO_CONTRIBUYENTE
        CHECK (tipo_contribuyente IN ('GRAN_CONTRIBUYENTE','MEDIANO','PEQUENO','EXENTO')),
    CONSTRAINT CK_TERCERO_ESTADO
        CHECK (estado IN ('ACTIVO','INACTIVO'))
);
GO

CREATE INDEX IX_TERCERO_EMPRESA ON TERCERO(id_empresa);
CREATE INDEX IX_TERCERO_NIT ON TERCERO(id_empresa, nit);
GO

/* ============================================================
   4. DTE (Documento Tributario Electrónico)
   ============================================================ */

CREATE TABLE DTE (
    id_dte INT IDENTITY(1,1) PRIMARY KEY,
    id_empresa INT NOT NULL,
    id_tercero INT NULL,
    tipo_dte VARCHAR(10) NOT NULL,
    numero_control VARCHAR(50) NOT NULL,
    codigo_generacion VARCHAR(50) NOT NULL,
    sello_recepcion VARCHAR(50) NULL,
    fecha_emision DATE NOT NULL,
    monto_gravado DECIMAL(12,2) NOT NULL DEFAULT 0,
    monto_exento DECIMAL(12,2) NOT NULL DEFAULT 0,
    iva DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    estado_transmision VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    json_dte NVARCHAR(MAX) NULL,
    id_partida INT NULL,
    fecha_registro DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_DTE_EMPRESA
        FOREIGN KEY (id_empresa) REFERENCES EMPRESA(id_empresa),
    CONSTRAINT FK_DTE_TERCERO
        FOREIGN KEY (id_tercero) REFERENCES TERCERO(id_tercero),
    CONSTRAINT UQ_DTE_NUMERO_CONTROL
        UNIQUE (id_empresa, numero_control),
    CONSTRAINT CK_DTE_TIPO
        CHECK (tipo_dte IN ('FACTURA','CCF','NC','ND','RETENCION','SUJETO_EXCLUIDO','EXPORTACION')),
    CONSTRAINT CK_DTE_ESTADO_TRANSMISION
        CHECK (estado_transmision IN ('PENDIENTE','TRANSMITIDO','RECHAZADO','INVALIDADO','CONTINGENCIA'))
);
GO

CREATE INDEX IX_DTE_EMPRESA_FECHA ON DTE(id_empresa, fecha_emision);
CREATE INDEX IX_DTE_CODIGO_GENERACION ON DTE(codigo_generacion);
GO

/* ============================================================
   5. CORRELATIVO DTE
   ============================================================ */

CREATE TABLE CORRELATIVO_DTE (
    id_correlativo INT IDENTITY(1,1) PRIMARY KEY,
    id_empresa INT NOT NULL,
    tipo_dte VARCHAR(10) NOT NULL,
    prefijo VARCHAR(10) NOT NULL,
    ultimo_numero INT NOT NULL DEFAULT 0,
    CONSTRAINT FK_CORRELATIVO_EMPRESA
        FOREIGN KEY (id_empresa) REFERENCES EMPRESA(id_empresa),
    CONSTRAINT UQ_CORRELATIVO
        UNIQUE (id_empresa, tipo_dte)
);
GO

/* ============================================================
   6. PARTIDA Y MOVIMIENTO (con columnas nuevas)
   ============================================================ */

CREATE TABLE PARTIDA (
    id_partida INT IDENTITY(1,1) PRIMARY KEY,
    id_libro INT NOT NULL,
    numero_partida INT NOT NULL,
    fecha DATE NOT NULL,
    concepto VARCHAR(250) NOT NULL,
    estado VARCHAR(15) NOT NULL DEFAULT 'BORRADOR',
    tipo_operacion VARCHAR(10) NULL,
    id_dte INT NULL,
    fecha_creacion DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    fecha_anulacion DATETIME2 NULL,
    motivo_anulacion VARCHAR(250) NULL,
    CONSTRAINT FK_PARTIDA_LIBRO
        FOREIGN KEY (id_libro) REFERENCES LIBRO(id_libro),
    CONSTRAINT FK_PARTIDA_DTE
        FOREIGN KEY (id_dte) REFERENCES DTE(id_dte),
    CONSTRAINT UQ_PARTIDA_NUMERO_LIBRO
        UNIQUE (id_libro, numero_partida),
    CONSTRAINT CK_PARTIDA_ESTADO
        CHECK (estado IN ('BORRADOR','CONTABILIZADA','ANULADA')),
    CONSTRAINT CK_PARTIDA_NUMERO
        CHECK (numero_partida > 0),
    CONSTRAINT CK_PARTIDA_TIPO_OPERACION
        CHECK (tipo_operacion IS NULL OR tipo_operacion IN ('COMPRA','VENTA','AJUSTE')),
    CONSTRAINT CK_PARTIDA_ANULACION
        CHECK (
            (estado = 'ANULADA' AND fecha_anulacion IS NOT NULL AND motivo_anulacion IS NOT NULL)
            OR
            (estado <> 'ANULADA' AND fecha_anulacion IS NULL AND motivo_anulacion IS NULL)
        )
);
GO

CREATE TABLE MOVIMIENTO (
    id_movimiento INT IDENTITY(1,1) PRIMARY KEY,
    id_partida INT NOT NULL,
    id_cuenta_predeterminada INT NULL,
    id_cuenta_personalizada INT NULL,
    id_tercero INT NULL,
    folio VARCHAR(20) NULL,
    parcial DECIMAL(12,2) NULL,
    base_gravada DECIMAL(12,2) NULL,
    debe DECIMAL(12,2) NOT NULL DEFAULT 0,
    haber DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT FK_MOVIMIENTO_PARTIDA
        FOREIGN KEY (id_partida) REFERENCES PARTIDA(id_partida),
    CONSTRAINT FK_MOVIMIENTO_CUENTA_PRE
        FOREIGN KEY (id_cuenta_predeterminada) REFERENCES CUENTA_PREDETERMINADA(id_cuenta),
    CONSTRAINT FK_MOVIMIENTO_CUENTA_PER
        FOREIGN KEY (id_cuenta_personalizada) REFERENCES CUENTA_PERSONALIZADA(id_cuenta),
    CONSTRAINT FK_MOVIMIENTO_TERCERO
        FOREIGN KEY (id_tercero) REFERENCES TERCERO(id_tercero),
    CONSTRAINT CK_MOVIMIENTO_UNA_CUENTA
        CHECK (
            (id_cuenta_predeterminada IS NOT NULL AND id_cuenta_personalizada IS NULL)
            OR
            (id_cuenta_predeterminada IS NULL AND id_cuenta_personalizada IS NOT NULL)
        ),
    CONSTRAINT CK_MOVIMIENTO_DEBE_HABER
        CHECK ((debe > 0 AND haber = 0) OR (haber > 0 AND debe = 0)),
    CONSTRAINT CK_MOVIMIENTO_PARCIAL
        CHECK (parcial IS NULL OR parcial >= 0),
    CONSTRAINT CK_MOVIMIENTO_BASE_GRAVADA
        CHECK (base_gravada IS NULL OR base_gravada >= 0)
);
GO

CREATE INDEX IX_PARTIDA_FECHA ON PARTIDA(fecha);
CREATE INDEX IX_PARTIDA_ESTADO ON PARTIDA(estado);
GO

/* ============================================================
   7. RETENCIÓN IVA
   ============================================================ */

CREATE TABLE RETENCION_IVA (
    id_retencion INT IDENTITY(1,1) PRIMARY KEY,
    id_empresa INT NOT NULL,
    id_dte INT NULL,
    id_tercero INT NOT NULL,
    periodo VARCHAR(7) NOT NULL,
    base DECIMAL(12,2) NOT NULL,
    tasa DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    monto DECIMAL(12,2) NOT NULL,
    estado VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE',
    fecha_registro DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_RETENCION_EMPRESA
        FOREIGN KEY (id_empresa) REFERENCES EMPRESA(id_empresa),
    CONSTRAINT FK_RETENCION_DTE
        FOREIGN KEY (id_dte) REFERENCES DTE(id_dte),
    CONSTRAINT FK_RETENCION_TERCERO
        FOREIGN KEY (id_tercero) REFERENCES TERCERO(id_tercero),
    CONSTRAINT CK_RETENCION_ESTADO
        CHECK (estado IN ('PENDIENTE','DECLARADA','PAGADA'))
);
GO

/* ============================================================
   8. DECLARACIÓN IVA (F-07)
   ============================================================ */

CREATE TABLE DECLARACION_IVA (
    id_declaracion INT IDENTITY(1,1) PRIMARY KEY,
    id_empresa INT NOT NULL,
    id_libro INT NOT NULL,
    periodo VARCHAR(7) NOT NULL,
    debito_fiscal DECIMAL(12,2) NOT NULL DEFAULT 0,
    credito_fiscal DECIMAL(12,2) NOT NULL DEFAULT 0,
    iva_retenido DECIMAL(12,2) NOT NULL DEFAULT 0,
    iva_percibido DECIMAL(12,2) NOT NULL DEFAULT 0,
    remanente_anterior DECIMAL(12,2) NOT NULL DEFAULT 0,
    iva_a_pagar DECIMAL(12,2) NOT NULL DEFAULT 0,
    remanente_siguiente DECIMAL(12,2) NOT NULL DEFAULT 0,
    estado VARCHAR(15) NOT NULL DEFAULT 'BORRADOR',
    fecha_presentacion DATETIME2 NULL,
    CONSTRAINT FK_DECLARACION_EMPRESA
        FOREIGN KEY (id_empresa) REFERENCES EMPRESA(id_empresa),
    CONSTRAINT FK_DECLARACION_LIBRO
        FOREIGN KEY (id_libro) REFERENCES LIBRO(id_libro),
    CONSTRAINT UQ_DECLARACION_PERIODO
        UNIQUE (id_empresa, periodo),
    CONSTRAINT CK_DECLARACION_ESTADO
        CHECK (estado IN ('BORRADOR','PRESENTADA','PAGADA'))
);
GO

/* ============================================================
   9. AUDITORÍA
   ============================================================ */

CREATE TABLE AUDITORIA (
    id_auditoria INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario INT NULL,
    id_empresa INT NULL,
    accion VARCHAR(50) NOT NULL,
    entidad VARCHAR(50) NOT NULL,
    id_entidad INT NULL,
    datos_anteriores NVARCHAR(MAX) NULL,
    datos_nuevos NVARCHAR(MAX) NULL,
    fecha DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

/* ============================================================
   10. TRIGGERS (los mismos que ya tenías)
   ============================================================ */

CREATE OR ALTER TRIGGER TR_VALIDAR_JERARQUIA_PREDETERMINADA
ON CUENTA_PREDETERMINADA
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM inserted I
        INNER JOIN CUENTA_PREDETERMINADA P ON P.id_cuenta = I.id_cuenta_padre
        WHERE P.permite_movimientos = 1 OR I.clasificacion <> P.clasificacion
    )
        THROW 50010, 'La cuenta padre debe ser agrupadora y tener la misma clasificacion.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted I
        INNER JOIN CUENTA_PREDETERMINADA H ON H.id_cuenta_padre = I.id_cuenta
        WHERE I.permite_movimientos = 1 OR H.clasificacion <> I.clasificacion
    )
        THROW 50011, 'No se puede convertir en cuenta de movimiento una cuenta con hijas ni cambiar su clasificacion.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted I
        INNER JOIN CUENTA_PERSONALIZADA H ON H.id_cuenta_predeterminada_padre = I.id_cuenta
        WHERE I.permite_movimientos = 1 OR H.clasificacion <> I.clasificacion
    )
        THROW 50012, 'La modificacion de esta cuenta afectaria cuentas personalizadas dependientes.', 1;

    DECLARE @ExisteCiclo BIT = 0;
    ;WITH Jerarquia AS (
        SELECT I.id_cuenta AS id_inicio, I.id_cuenta_padre AS id_padre,
               CAST('|' + CAST(I.id_cuenta AS VARCHAR(20)) + '|' AS VARCHAR(MAX)) AS ruta,
               CAST(0 AS BIT) AS ciclo
        FROM inserted I
        UNION ALL
        SELECT J.id_inicio, P.id_cuenta_padre,
               CAST(J.ruta + CAST(P.id_cuenta AS VARCHAR(20)) + '|' AS VARCHAR(MAX)),
               CAST(CASE WHEN CHARINDEX('|' + CAST(P.id_cuenta AS VARCHAR(20)) + '|', J.ruta) > 0 THEN 1 ELSE 0 END AS BIT)
        FROM Jerarquia J
        INNER JOIN CUENTA_PREDETERMINADA P ON P.id_cuenta = J.id_padre
        WHERE J.ciclo = 0 AND J.id_padre IS NOT NULL
    )
    SELECT @ExisteCiclo = MAX(CAST(ciclo AS INT)) FROM Jerarquia OPTION (MAXRECURSION 32767);

    IF @ExisteCiclo = 1
        THROW 50013, 'No se permiten ciclos en la jerarquia de cuentas predeterminadas.', 1;
END;
GO

CREATE OR ALTER TRIGGER TR_VALIDAR_JERARQUIA_PERSONALIZADA
ON CUENTA_PERSONALIZADA
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM inserted I
        INNER JOIN CUENTA_PREDETERMINADA P ON P.id_cuenta = I.id_cuenta_predeterminada_padre
        WHERE P.permite_movimientos = 1 OR I.clasificacion <> P.clasificacion
    )
        THROW 50020, 'La cuenta padre debe ser agrupadora y tener la misma clasificacion.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted I
        INNER JOIN CUENTA_PERSONALIZADA P ON P.id_cuenta = I.id_cuenta_personalizada_padre AND P.id_empresa = I.id_empresa
        WHERE P.permite_movimientos = 1 OR I.clasificacion <> P.clasificacion
    )
        THROW 50021, 'La cuenta personalizada padre debe ser agrupadora y tener la misma clasificacion.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted I
        INNER JOIN CUENTA_PERSONALIZADA H ON H.id_cuenta_personalizada_padre = I.id_cuenta AND H.id_empresa = I.id_empresa
        WHERE I.permite_movimientos = 1 OR H.clasificacion <> I.clasificacion
    )
        THROW 50022, 'No se puede invalidar la jerarquia de cuentas personalizadas existentes.', 1;

    DECLARE @ExisteCiclo BIT = 0;
    ;WITH Jerarquia AS (
        SELECT I.id_empresa, I.id_cuenta AS id_inicio, I.id_cuenta_personalizada_padre AS id_padre,
               CAST('|' + CAST(I.id_cuenta AS VARCHAR(20)) + '|' AS VARCHAR(MAX)) AS ruta,
               CAST(0 AS BIT) AS ciclo
        FROM inserted I
        WHERE I.id_cuenta_personalizada_padre IS NOT NULL
        UNION ALL
        SELECT J.id_empresa, J.id_inicio, P.id_cuenta_personalizada_padre,
               CAST(J.ruta + CAST(P.id_cuenta AS VARCHAR(20)) + '|' AS VARCHAR(MAX)),
               CAST(CASE WHEN CHARINDEX('|' + CAST(P.id_cuenta AS VARCHAR(20)) + '|', J.ruta) > 0 THEN 1 ELSE 0 END AS BIT)
        FROM Jerarquia J
        INNER JOIN CUENTA_PERSONALIZADA P ON P.id_cuenta = J.id_padre AND P.id_empresa = J.id_empresa
        WHERE J.ciclo = 0 AND J.id_padre IS NOT NULL
    )
    SELECT @ExisteCiclo = MAX(CAST(ciclo AS INT)) FROM Jerarquia OPTION (MAXRECURSION 32767);

    IF @ExisteCiclo = 1
        THROW 50024, 'No se permiten ciclos en la jerarquia de cuentas personalizadas.', 1;
END;
GO

CREATE OR ALTER TRIGGER TR_PROTEGER_CUENTA_PREDETERMINADA
ON CUENTA_PREDETERMINADA
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM deleted D
        INNER JOIN MOVIMIENTO M ON M.id_cuenta_predeterminada = D.id_cuenta
        INNER JOIN PARTIDA P ON P.id_partida = M.id_partida
        WHERE P.estado = 'CONTABILIZADA'
          AND NOT EXISTS (SELECT 1 FROM inserted I WHERE I.id_cuenta = D.id_cuenta)
    )
        THROW 50030, 'No se puede eliminar una cuenta que tenga movimientos contabilizados.', 1;

    IF EXISTS (
        SELECT 1 FROM deleted D
        INNER JOIN inserted I ON I.id_cuenta = D.id_cuenta
        INNER JOIN MOVIMIENTO M ON M.id_cuenta_predeterminada = D.id_cuenta
        INNER JOIN PARTIDA P ON P.id_partida = M.id_partida
        WHERE P.estado = 'CONTABILIZADA'
          AND D.estado <> 'INACTIVA' AND I.estado = 'INACTIVA'
    )
        THROW 50031, 'No se puede desactivar una cuenta que tenga movimientos contabilizados.', 1;
END;
GO

CREATE OR ALTER TRIGGER TR_PROTEGER_CUENTA_PERSONALIZADA
ON CUENTA_PERSONALIZADA
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM deleted D
        INNER JOIN MOVIMIENTO M ON M.id_cuenta_personalizada = D.id_cuenta
        INNER JOIN PARTIDA P ON P.id_partida = M.id_partida
        WHERE P.estado = 'CONTABILIZADA'
          AND NOT EXISTS (SELECT 1 FROM inserted I WHERE I.id_cuenta = D.id_cuenta)
    )
        THROW 50032, 'No se puede eliminar una cuenta personalizada con movimientos contabilizados.', 1;

    IF EXISTS (
        SELECT 1 FROM deleted D
        INNER JOIN inserted I ON I.id_cuenta = D.id_cuenta AND I.id_empresa = D.id_empresa
        INNER JOIN MOVIMIENTO M ON M.id_cuenta_personalizada = D.id_cuenta
        INNER JOIN PARTIDA P ON P.id_partida = M.id_partida
        WHERE P.estado = 'CONTABILIZADA'
          AND D.estado <> 'INACTIVA' AND I.estado = 'INACTIVA'
    )
        THROW 50033, 'No se puede desactivar una cuenta personalizada con movimientos contabilizados.', 1;
END;
GO

/* ============================================================
   11. USUARIO ADMIN
   ============================================================ */

INSERT INTO USUARIO (nombre, correo, contrasena_hash)
VALUES ('Administrador', 'admin@sistemacontable.com',
        '$2b$10$1yt7XiPigu2houWiS0a8Ju2YXe8FfFFdrJiIXcdUxm4j2wkMkZzBe');
GO

/* ============================================================
   12. CATÁLOGO (idéntico al que ya tenías)
   ============================================================ */

IF EXISTS (SELECT 1 FROM CUENTA_PREDETERMINADA)
    THROW 50001, 'El catalogo ya contiene cuentas. No se realizo la insercion.', 1;
GO

DECLARE @Catalogo TABLE (
    codigo VARCHAR(20) PRIMARY KEY,
    nombre VARCHAR(150),
    clasificacion VARCHAR(20),
    naturaleza VARCHAR(15),
    codigo_padre VARCHAR(20) NULL,
    permite_movimientos BIT
);

INSERT INTO @Catalogo VALUES
('1', 'ACTIVO', 'ACTIVO', 'DEUDORA', NULL, 0),
('11', 'ACTIVO CORRIENTE', 'ACTIVO', 'DEUDORA', '1', 0),
('12', 'ACTIVO NO CORRIENTE', 'ACTIVO', 'DEUDORA', '1', 0),
('1101', 'EFECTIVO Y EQUIVALENTES DE EFECTIVO', 'ACTIVO', 'DEUDORA', '11', 0),
('110101', 'Caja General', 'ACTIVO', 'DEUDORA', '1101', 1),
('110102', 'Caja Chica', 'ACTIVO', 'DEUDORA', '1101', 1),
('110103', 'BANCOS', 'ACTIVO', 'DEUDORA', '1101', 0),
('11010301', 'Banco Agricola', 'ACTIVO', 'DEUDORA', '110103', 0),
('1101030101', 'Cuenta Corriente', 'ACTIVO', 'DEUDORA', '11010301', 1),
('1101030102', 'Cuenta Ahorro', 'ACTIVO', 'DEUDORA', '11010301', 1),
('1101030103', 'Deposito a Plazo (menor de tres meses)', 'ACTIVO', 'DEUDORA', '11010301', 1),
('11010302', 'Banco Cuscatlan', 'ACTIVO', 'DEUDORA', '110103', 0),
('1101030201', 'Cuenta Corriente', 'ACTIVO', 'DEUDORA', '11010302', 1),
('1101030202', 'Cuenta Ahorro', 'ACTIVO', 'DEUDORA', '11010302', 1),
('1101030203', 'Depositos a Plazo (menor de tres meses)', 'ACTIVO', 'DEUDORA', '11010302', 1),
('11010303', 'Banco (nombre del Banco)', 'ACTIVO', 'DEUDORA', '110103', 0),
('1101030301', 'Cuenta Corriente', 'ACTIVO', 'DEUDORA', '11010303', 1),
('1101030302', 'Cuenta Ahorro', 'ACTIVO', 'DEUDORA', '11010303', 1),
('1101030303', 'Depositos a Plazo (menor de tres meses)', 'ACTIVO', 'DEUDORA', '11010303', 1),
('110104', 'EQUIVALENTES DE EFECTIVO', 'ACTIVO', 'DEUDORA', '1101', 0),
('11010401', 'Cupones', 'ACTIVO', 'DEUDORA', '110104', 1),
('1102', 'CUENTAS Y DOCUMENTOS POR COBRAR', 'ACTIVO', 'DEUDORA', '11', 0),
('110201', 'Cuentas por cobrar clientes', 'ACTIVO', 'DEUDORA', '1102', 0),
('11020101', 'Clientes (nombre)', 'ACTIVO', 'DEUDORA', '110201', 1),
('110202', 'Anticipos a Empleados', 'ACTIVO', 'DEUDORA', '1102', 0),
('11020201', 'Empleados (nombre)', 'ACTIVO', 'DEUDORA', '110202', 1),
('110203', 'Prestamos a Empleados', 'ACTIVO', 'DEUDORA', '1102', 0),
('11020301', 'Empleados (nombre)', 'ACTIVO', 'DEUDORA', '110203', 1),
('110204', 'Arrendamiento Financiero', 'ACTIVO', 'DEUDORA', '1102', 0),
('11020401', 'Letras de cambio', 'ACTIVO', 'DEUDORA', '110204', 1),
('11020402', 'Pagares', 'ACTIVO', 'DEUDORA', '110204', 1),
('110205', 'Arrendamiento Operativo', 'ACTIVO', 'DEUDORA', '1102', 1),
('110206', 'Documentos por cobrar', 'ACTIVO', 'DEUDORA', '1102', 1),
('1103', 'PROVISION PARA CUENTAS INCOBRABLES', 'ACTIVO', 'ACREEDORA', '11', 1),
('1104', 'INVENTARIOS', 'ACTIVO', 'DEUDORA', '11', 0),
('110401', 'Mercaderias para la venta', 'ACTIVO', 'DEUDORA', '1104', 1),
('110402', 'Costo de Servicios en Proceso', 'ACTIVO', 'DEUDORA', '1104', 1),
('110403', 'Repuestos y Accesorios', 'ACTIVO', 'DEUDORA', '1104', 1),
('110404', 'Insumos', 'ACTIVO', 'DEUDORA', '1104', 1),
('110405', 'Estimacion por Obsolescencia de Inventario', 'ACTIVO', 'ACREEDORA', '1104', 1),
('110406', 'Inventario de productos en Proceso', 'ACTIVO', 'DEUDORA', '1104', 1),
('110407', 'Inventario de Productos Terminados', 'ACTIVO', 'DEUDORA', '1104', 1),
('1105', 'INVERSIONES A CORTO PLAZO', 'ACTIVO', 'DEUDORA', '11', 0),
('110501', 'Depositos a Plazo', 'ACTIVO', 'DEUDORA', '1105', 0),
('11050101', 'Depositos a Plazo mayor de tres meses', 'ACTIVO', 'DEUDORA', '110501', 1),
('110502', 'Otras Inversiones a corto plazo', 'ACTIVO', 'DEUDORA', '1105', 1),
('1106', 'GASTOS PAGADOS POR ANTICIPADO', 'ACTIVO', 'DEUDORA', '11', 0),
('110601', 'Seguros Pagados por Anticipado', 'ACTIVO', 'DEUDORA', '1106', 1),
('110602', 'Papeleria y Utiles', 'ACTIVO', 'DEUDORA', '1106', 1),
('110603', 'Alquileres Pagados por Anticipado', 'ACTIVO', 'DEUDORA', '1106', 1),
('1107', 'PAGO A CUENTA IMPUESTO SOBRE LA RENTA', 'ACTIVO', 'DEUDORA', '11', 0),
('110701', 'Pago a Cuenta ISR del Periodo Corriente', 'ACTIVO', 'DEUDORA', '1107', 1),
('110702', 'Remanente de Periodos Anteriores', 'ACTIVO', 'DEUDORA', '1107', 1),
('1108', 'CREDITO FISCAL - IVA', 'ACTIVO', 'DEUDORA', '11', 0),
('110801', 'Credito Fiscal sobre Compras - IVA', 'ACTIVO', 'DEUDORA', '1108', 1),
('110802', 'Credito Fiscal pendiente de aplicar', 'ACTIVO', 'DEUDORA', '1108', 1),
('1109', 'IVA PERCIBIDO', 'ACTIVO', 'DEUDORA', '11', 0),
('110901', 'IVA Percibido del 1%', 'ACTIVO', 'DEUDORA', '1109', 1),
('110902', 'Retenciones del 1%', 'ACTIVO', 'DEUDORA', '1109', 1),
('1201', 'PROPIEDAD, PLANTA Y EQUIPO', 'ACTIVO', 'DEUDORA', '12', 0),
('120101', 'Terrenos', 'ACTIVO', 'DEUDORA', '1201', 1),
('120102', 'Construcciones', 'ACTIVO', 'DEUDORA', '1201', 1),
('120103', 'Edificaciones', 'ACTIVO', 'DEUDORA', '1201', 1),
('120104', 'Maquinaria y Equipo', 'ACTIVO', 'DEUDORA', '1201', 1),
('120105', 'Mobiliario y Equipo de Oficina', 'ACTIVO', 'DEUDORA', '1201', 1),
('120106', 'Equipo de Transporte', 'ACTIVO', 'DEUDORA', '1201', 1),
('120107', 'Herramientas y Equipo Pequeno', 'ACTIVO', 'DEUDORA', '1201', 1),
('120108', 'Instalaciones', 'ACTIVO', 'DEUDORA', '1201', 1),
('120109', 'Adiciones y Mejoras', 'ACTIVO', 'DEUDORA', '1201', 1),
('1202', 'DEPRECIACION ACUMULADA - PROPIEDAD PLANTA Y EQUIPO', 'ACTIVO', 'ACREEDORA', '12', 0),
('120201', 'Depreciacion Acumulada de Construcciones', 'ACTIVO', 'ACREEDORA', '1202', 1),
('120202', 'Depreciacion Acumulada de Edificaciones', 'ACTIVO', 'ACREEDORA', '1202', 1),
('120203', 'Depreciacion Acumulada de Maquinaria y Equipo', 'ACTIVO', 'ACREEDORA', '1202', 1),
('120204', 'Depreciacion Acumulada de Mobiliario y Equipo de Oficina', 'ACTIVO', 'ACREEDORA', '1202', 1),
('120205', 'Depreciacion Acumulada de Equipo de Transporte', 'ACTIVO', 'ACREEDORA', '1202', 1),
('120206', 'Depreciacion Acumulada de Herramientas y Equipo Pequeno', 'ACTIVO', 'ACREEDORA', '1202', 1),
('120207', 'Depreciacion Acumulada de Instalaciones', 'ACTIVO', 'ACREEDORA', '1202', 1),
('120208', 'Depreciacion Acumulada de Otros Equipos', 'ACTIVO', 'ACREEDORA', '1202', 1),
('120209', 'Depreciacion Acumulada de Adiciones y Mejoras', 'ACTIVO', 'ACREEDORA', '1202', 1),
('1203', 'PROPIEDADES DE INVERSION', 'ACTIVO', 'DEUDORA', '12', 0),
('120301', 'Terrenos', 'ACTIVO', 'DEUDORA', '1203', 1),
('120302', 'Edificios', 'ACTIVO', 'DEUDORA', '1203', 1),
('1204', 'PPE EN ARRENDAMIENTO FINANCIERO', 'ACTIVO', 'DEUDORA', '12', 0),
('120401', 'Maquinaria y Equipo en Arrendamiento Financiero', 'ACTIVO', 'DEUDORA', '1204', 1),
('120402', 'Mobiliario y Equipo de Oficina en Arrendamiento Financiero', 'ACTIVO', 'DEUDORA', '1204', 1),
('120403', 'Equipo de Transporte en Arrendamiento Financiero', 'ACTIVO', 'DEUDORA', '1204', 1),
('120404', 'Otros Equipos en Arrendamiento Financiero', 'ACTIVO', 'DEUDORA', '1204', 1),
('1205', 'DEPRECIACION ACUMULADA - PPE EN ARRENDAMIENTO FINANCIERO', 'ACTIVO', 'ACREEDORA', '12', 0),
('120501', 'Depreciacion Acumulada de Maquinaria y Equipo en A.F.', 'ACTIVO', 'ACREEDORA', '1205', 1),
('120502', 'Depreciacion Acumulada de Mobiliario y Equipo en A.F.', 'ACTIVO', 'ACREEDORA', '1205', 1),
('120503', 'Depreciacion Acumulada de Equipo de Transporte en A.F.', 'ACTIVO', 'ACREEDORA', '1205', 1),
('120504', 'Depreciacion Acumulada de Otros Equipos en A.F.', 'ACTIVO', 'ACREEDORA', '1205', 1),
('1206', 'ACTIVOS EN DESARROLLO', 'ACTIVO', 'DEUDORA', '12', 0),
('120601', 'Software en Desarrollo', 'ACTIVO', 'DEUDORA', '1206', 1),
('120602', 'Otros Intangibles en Desarrollo', 'ACTIVO', 'DEUDORA', '1206', 1),
('1207', 'PPE - PEDIDOS EN TRANSITO', 'ACTIVO', 'DEUDORA', '12', 0),
('120701', 'Vehiculos', 'ACTIVO', 'DEUDORA', '1207', 1),
('1208', 'DOCUMENTOS POR COBRAR A LARGO PLAZO', 'ACTIVO', 'DEUDORA', '12', 0),
('120801', 'Pagares', 'ACTIVO', 'DEUDORA', '1208', 1),
('120802', 'Letras de Cambio', 'ACTIVO', 'DEUDORA', '1208', 1),
('1209', 'INVERSIONES PERMANENTES', 'ACTIVO', 'DEUDORA', '12', 0),
('120901', 'Inversiones en Subsidiarias', 'ACTIVO', 'DEUDORA', '1209', 1),
('120902', 'Inversiones en Asociadas', 'ACTIVO', 'DEUDORA', '1209', 1),
('120903', 'Otras Inversiones Permanentes', 'ACTIVO', 'DEUDORA', '1209', 1),
('1210', 'INTANGIBLES', 'ACTIVO', 'DEUDORA', '12', 0),
('121001', 'Derecho de Llave', 'ACTIVO', 'DEUDORA', '1210', 1),
('121002', 'Patentes y Marcas', 'ACTIVO', 'DEUDORA', '1210', 1),
('121003', 'Franquicias', 'ACTIVO', 'DEUDORA', '1210', 1),
('121004', 'Licencias y Concesiones', 'ACTIVO', 'DEUDORA', '1210', 1),
('121005', 'Programas y Sistemas', 'ACTIVO', 'DEUDORA', '1210', 1),
('1211', 'AMORTIZACION DE INTANGIBLES', 'ACTIVO', 'ACREEDORA', '12', 0),
('121101', 'Amortizacion Derecho de Llave', 'ACTIVO', 'ACREEDORA', '1211', 1),
('121102', 'Amortizacion Patentes y Marcas', 'ACTIVO', 'ACREEDORA', '1211', 1),
('121103', 'Amortizacion Franquicias', 'ACTIVO', 'ACREEDORA', '1211', 1),
('121104', 'Amortizacion Licencias y Concesiones', 'ACTIVO', 'ACREEDORA', '1211', 1),
('121105', 'Amortizacion Programas y Sistemas', 'ACTIVO', 'ACREEDORA', '1211', 1),
('1212', 'DEPOSITOS EN GARANTIA', 'ACTIVO', 'DEUDORA', '12', 0),
('121201', 'Depositos en Garantia', 'ACTIVO', 'DEUDORA', '1212', 1),
('1213', 'ACTIVO POR ISR DIFERIDO', 'ACTIVO', 'DEUDORA', '12', 1),
('2', 'PASIVO', 'PASIVO', 'ACREEDORA', NULL, 0),
('21', 'PASIVO CORRIENTE', 'PASIVO', 'ACREEDORA', '2', 0),
('22', 'PASIVO NO CORRIENTE', 'PASIVO', 'ACREEDORA', '2', 0),
('2101', 'PROVEEDORES', 'PASIVO', 'ACREEDORA', '21', 0),
('210101', 'Locales', 'PASIVO', 'ACREEDORA', '2101', 1),
('210102', 'Extranjeros', 'PASIVO', 'ACREEDORA', '2101', 1),
('2102', 'PRESTAMOS A CORTO PLAZO Y SOBREGIROS', 'PASIVO', 'ACREEDORA', '21', 0),
('210201', 'Sobregiros Bancarios', 'PASIVO', 'ACREEDORA', '2102', 1),
('210202', 'Prestamos Bancarios (Porcion a Corto Plazo)', 'PASIVO', 'ACREEDORA', '2102', 0),
('21020201', 'Prestamos Personales', 'PASIVO', 'ACREEDORA', '210202', 1),
('21020202', 'Prestamos Prendarios', 'PASIVO', 'ACREEDORA', '210202', 1),
('21020203', 'Prestamos Hipotecarios', 'PASIVO', 'ACREEDORA', '210202', 1),
('2103', 'CUENTAS Y DOCUMENTOS POR PAGAR', 'PASIVO', 'ACREEDORA', '21', 0),
('210301', 'Documentos por Pagar', 'PASIVO', 'ACREEDORA', '2103', 0),
('21030101', 'Letras de cambio', 'PASIVO', 'ACREEDORA', '210301', 1),
('21030102', 'Pagares', 'PASIVO', 'ACREEDORA', '210301', 1),
('210302', 'Cuentas por Pagar', 'PASIVO', 'ACREEDORA', '2103', 1),
('210303', 'Gastos Acumulados por Pagar', 'PASIVO', 'ACREEDORA', '2103', 1),
('210304', 'Depositos en Garantia Recibidos', 'PASIVO', 'ACREEDORA', '2103', 1),
('210305', 'Beneficios a Empleados', 'PASIVO', 'ACREEDORA', '2103', 0),
('21030501', 'Sueldos y Comisiones por Pagar', 'PASIVO', 'ACREEDORA', '210305', 1),
('21030502', 'Vacaciones por Pagar', 'PASIVO', 'ACREEDORA', '210305', 1),
('21030503', 'Aguinaldos por Pagar', 'PASIVO', 'ACREEDORA', '210305', 1),
('21030504', 'Indemnizaciones por Pagar', 'PASIVO', 'ACREEDORA', '210305', 1),
('21030505', 'Bonificaciones por Pagar', 'PASIVO', 'ACREEDORA', '210305', 1),
('2104', 'PROVISIONES', 'PASIVO', 'ACREEDORA', '21', 0),
('210401', 'Cuota Patronal ISSS', 'PASIVO', 'ACREEDORA', '2104', 1),
('210402', 'Cuota Patronal AFP', 'PASIVO', 'ACREEDORA', '2104', 1),
('210403', 'Intereses por Pagar', 'PASIVO', 'ACREEDORA', '2104', 1),
('210404', 'Honorarios por Pagar', 'PASIVO', 'ACREEDORA', '2104', 1),
('210405', 'IVA por Pagar', 'PASIVO', 'ACREEDORA', '2104', 1),
('210406', 'Impuestos Municipales por Pagar', 'PASIVO', 'ACREEDORA', '2104', 1),
('210407', 'Pago a Cuenta ISR por Pagar', 'PASIVO', 'ACREEDORA', '2104', 1),
('210408', 'Servicio de Energia Electrica por Pagar', 'PASIVO', 'ACREEDORA', '2104', 1),
('210409', 'Impuesto sobre la Renta Retenido', 'PASIVO', 'ACREEDORA', '2104', 1),
('210410', 'Acreedores Varios', 'PASIVO', 'ACREEDORA', '2104', 1),
('2105', 'RETENCIONES POR PAGAR', 'PASIVO', 'ACREEDORA', '21', 0),
('210501', 'Cotizacion ISSS', 'PASIVO', 'ACREEDORA', '2105', 1),
('210502', 'Cotizacion a Fondo de Pensiones', 'PASIVO', 'ACREEDORA', '2105', 0),
('21050201', 'AFP Crecer', 'PASIVO', 'ACREEDORA', '210502', 1),
('21050202', 'AFP Confia', 'PASIVO', 'ACREEDORA', '210502', 1),
('210503', 'Retencion de Impuesto Sobre la Renta', 'PASIVO', 'ACREEDORA', '2105', 1),
('210504', 'Retencion F.S.V.', 'PASIVO', 'ACREEDORA', '2105', 1),
('210505', 'Ordenes de Descuentos - Bancos y Otras Financieras', 'PASIVO', 'ACREEDORA', '2105', 1),
('210506', 'Procuraduria General de la Republica', 'PASIVO', 'ACREEDORA', '2105', 1),
('2106', 'IMPUESTO SOBRE LA RENTA POR PAGAR', 'PASIVO', 'ACREEDORA', '21', 1),
('2107', 'OBLIGACIONES POR ARRENDAMIENTO FINANCIERO (Corto Plazo)', 'PASIVO', 'ACREEDORA', '21', 1),
('2108', 'IVA - DEBITO FISCAL', 'PASIVO', 'ACREEDORA', '21', 0),
('210801', 'Debito Fiscal sobre Ventas - IVA', 'PASIVO', 'ACREEDORA', '2108', 1),
('210802', 'IVA Retenido a Terceros', 'PASIVO', 'ACREEDORA', '2108', 1),
('2109', 'INGRESOS RECIBIDOS POR ANTICIPADO', 'PASIVO', 'ACREEDORA', '21', 0),
('210901', 'Suscripciones Cobradas por Anticipado', 'PASIVO', 'ACREEDORA', '2109', 1),
('210902', 'Alquileres Cobrados por Anticipado', 'PASIVO', 'ACREEDORA', '2109', 1),
('210903', 'Intereses Cobrados por Anticipado', 'PASIVO', 'ACREEDORA', '2109', 1),
('2110', 'BENEFICIOS A EMPLEADOS A CORTO PLAZO', 'PASIVO', 'ACREEDORA', '21', 1),
('2201', 'PRESTAMOS POR PAGAR A LARGO PLAZO', 'PASIVO', 'ACREEDORA', '22', 0),
('220101', 'Prestamos Bancarios (Porcion a Largo Plazo)', 'PASIVO', 'ACREEDORA', '2201', 0),
('22010101', 'Prestamos Personales', 'PASIVO', 'ACREEDORA', '220101', 1),
('22010102', 'Prestamos Prendarios', 'PASIVO', 'ACREEDORA', '220101', 1),
('22010103', 'Prestamos Hipotecarios', 'PASIVO', 'ACREEDORA', '220101', 1),
('2202', 'OBLIGACIONES POR ARRENDAMIENTO FINANCIERO (Largo Plazo)', 'PASIVO', 'ACREEDORA', '22', 1),
('2203', 'PROVISION PARA OBLIGACIONES LABORALES', 'PASIVO', 'ACREEDORA', '22', 1),
('2204', 'PASIVO POR ISR DIFERIDO', 'PASIVO', 'ACREEDORA', '22', 1),
('3', 'PATRIMONIO', 'PATRIMONIO', 'ACREEDORA', NULL, 0),
('31', 'CAPITAL', 'PATRIMONIO', 'ACREEDORA', '3', 0),
('3101', 'CAPITAL LIQUIDO', 'PATRIMONIO', 'ACREEDORA', '31', 1),
('3102', 'CAPITAL SOCIAL', 'PATRIMONIO', 'ACREEDORA', '31', 1),
('3103', 'UTILIDADES DE EJERCICIOS ANTERIORES', 'PATRIMONIO', 'ACREEDORA', '31', 1),
('3104', 'UTILIDAD DEL EJERCICIO ACTUAL', 'PATRIMONIO', 'ACREEDORA', '31', 1),
('3105', 'PERDIDAS / DEFICIT DE EJERCICIOS ANTERIORES', 'PATRIMONIO', 'DEUDORA', '31', 1),
('3106', 'PERDIDAS DEL EJERCICIO ACTUAL', 'PATRIMONIO', 'DEUDORA', '31', 1),
('3107', 'SUPERAVIT POR REVALUACIONES', 'PATRIMONIO', 'ACREEDORA', '31', 1),
('3108', 'RESERVA LEGAL', 'PATRIMONIO', 'ACREEDORA', '31', 1),
('4', 'CUENTAS DE RESULTADO DEUDOR', 'COSTO', 'DEUDORA', NULL, 0),
('41', 'COSTOS Y GASTOS DE OPERACION', 'COSTO', 'DEUDORA', '4', 0),
('42', 'COSTOS Y GASTOS DE NO OPERACION', 'GASTO', 'DEUDORA', '4', 0),
('4101', 'COMPRAS', 'COSTO', 'DEUDORA', '41', 0),
('410101', 'Mercaderia', 'COSTO', 'DEUDORA', '4101', 1),
('410102', 'Insumos', 'COSTO', 'DEUDORA', '4101', 1),
('410103', 'Otros', 'COSTO', 'DEUDORA', '4101', 1),
('4102', 'GASTOS DE VENTAS', 'GASTO', 'DEUDORA', '41', 0),
('410201', 'Sueldos y Comisiones', 'GASTO', 'DEUDORA', '4102', 1),
('410202', 'Horas Extras', 'GASTO', 'DEUDORA', '4102', 1),
('410203', 'Vacaciones', 'GASTO', 'DEUDORA', '4102', 1),
('410204', 'Aguinaldos', 'GASTO', 'DEUDORA', '4102', 1),
('410205', 'Bonificaciones y Gratificaciones', 'GASTO', 'DEUDORA', '4102', 1),
('410206', 'Indemnizaciones', 'GASTO', 'DEUDORA', '4102', 1),
('410207', 'Cuota Patronal I.S.S.S.', 'GASTO', 'DEUDORA', '4102', 1),
('410208', 'Cuota Patronal A.F.P.', 'GASTO', 'DEUDORA', '4102', 1),
('410209', 'Honorarios', 'GASTO', 'DEUDORA', '4102', 1),
('410210', 'Papeleria y Utiles', 'GASTO', 'DEUDORA', '4102', 1),
('410211', 'Telefono y Correo', 'GASTO', 'DEUDORA', '4102', 1),
('410212', 'Servicio Electrico', 'GASTO', 'DEUDORA', '4102', 1),
('410213', 'Servicio de Agua', 'GASTO', 'DEUDORA', '4102', 1),
('410214', 'Impuestos Fiscales y Municipales', 'GASTO', 'DEUDORA', '4102', 1),
('410215', 'Fletes y Transportes', 'GASTO', 'DEUDORA', '4102', 1),
('410216', 'Reparacion y Mantenimiento de Instalaciones', 'GASTO', 'DEUDORA', '4102', 1),
('410217', 'Reparacion y Mantenimiento de Mob. y Equipo', 'GASTO', 'DEUDORA', '4102', 1),
('410218', 'Reparacion y Mantenimiento de Vehiculos', 'GASTO', 'DEUDORA', '4102', 1),
('410219', 'Combustibles y Lubricantes', 'GASTO', 'DEUDORA', '4102', 1),
('410220', 'Propaganda y Promociones', 'GASTO', 'DEUDORA', '4102', 1),
('410221', 'Viaticos y Gastos de Viaje', 'GASTO', 'DEUDORA', '4102', 1),
('410222', 'Alquiler de Local', 'GASTO', 'DEUDORA', '4102', 1),
('410223', 'Arrendamiento de Equipo', 'GASTO', 'DEUDORA', '4102', 1),
('410224', 'Cuotas y Suscripciones', 'GASTO', 'DEUDORA', '4102', 1),
('410225', 'Seguros', 'GASTO', 'DEUDORA', '4102', 1),
('410226', 'Depreciaciones', 'GASTO', 'DEUDORA', '4102', 1),
('410227', 'Servicio de Vigilancia', 'GASTO', 'DEUDORA', '4102', 1),
('410228', 'Aseo y Limpieza', 'GASTO', 'DEUDORA', '4102', 1),
('410229', 'Articulos Promocionales', 'GASTO', 'DEUDORA', '4102', 1),
('410230', 'Fovial y Cotrans', 'GASTO', 'DEUDORA', '4102', 1),
('410231', 'Otros', 'GASTO', 'DEUDORA', '4102', 1),
('4103', 'GASTOS DE ADMINISTRACION', 'GASTO', 'DEUDORA', '41', 0),
('410301', 'Sueldos', 'GASTO', 'DEUDORA', '4103', 1),
('410302', 'Horas Extras', 'GASTO', 'DEUDORA', '4103', 1),
('410303', 'Vacaciones', 'GASTO', 'DEUDORA', '4103', 1),
('410304', 'Aguinaldos', 'GASTO', 'DEUDORA', '4103', 1),
('410305', 'Bonificaciones y Gratificaciones', 'GASTO', 'DEUDORA', '4103', 1),
('410306', 'Indemnizaciones', 'GASTO', 'DEUDORA', '4103', 1),
('410307', 'Cuota Patronal I.S.S.S.', 'GASTO', 'DEUDORA', '4103', 1),
('410308', 'Cuota Patronal A.F.P.', 'GASTO', 'DEUDORA', '4103', 1),
('410309', 'Honorarios', 'GASTO', 'DEUDORA', '4103', 1),
('410310', 'Papeleria y Utiles', 'GASTO', 'DEUDORA', '4103', 1),
('410311', 'Telefono y Correo', 'GASTO', 'DEUDORA', '4103', 1),
('410312', 'Servicio Electrico', 'GASTO', 'DEUDORA', '4103', 1),
('410313', 'Servicio de Agua', 'GASTO', 'DEUDORA', '4103', 1),
('410314', 'Impuestos Fiscales y Municipales', 'GASTO', 'DEUDORA', '4103', 1),
('410315', 'Fletes y Transportes', 'GASTO', 'DEUDORA', '4103', 1),
('410316', 'Reparacion y Mantenimiento de Instalaciones', 'GASTO', 'DEUDORA', '4103', 1),
('410317', 'Reparacion y Mantenimiento de Mob. y Equipo', 'GASTO', 'DEUDORA', '4103', 1),
('410318', 'Reparacion y Mantenimiento de Vehiculos', 'GASTO', 'DEUDORA', '4103', 1),
('410319', 'Combustibles y Lubricantes', 'GASTO', 'DEUDORA', '4103', 1),
('410320', 'Aseo y Limpieza', 'GASTO', 'DEUDORA', '4103', 1),
('410321', 'Viaticos y Gastos de Viaje', 'GASTO', 'DEUDORA', '4103', 1),
('410322', 'Alquiler de Local', 'GASTO', 'DEUDORA', '4103', 1),
('410323', 'Arrendamiento de Equipo', 'GASTO', 'DEUDORA', '4103', 1),
('410324', 'Cuotas y Suscripciones', 'GASTO', 'DEUDORA', '4103', 1),
('410325', 'Seguros', 'GASTO', 'DEUDORA', '4103', 1),
('410326', 'Depreciaciones', 'GASTO', 'DEUDORA', '4103', 1),
('410327', 'Servicio de Vigilancia', 'GASTO', 'DEUDORA', '4103', 1),
('410328', 'Fovial y Cotrans', 'GASTO', 'DEUDORA', '4103', 1),
('410329', 'Solvencia de la Alcaldia', 'GASTO', 'DEUDORA', '4103', 1),
('410330', 'Solvencia de la Digestyc', 'GASTO', 'DEUDORA', '4103', 1),
('410331', 'Matricula de Comercio', 'GASTO', 'DEUDORA', '4103', 1),
('410332', 'Inscripcion de Balance', 'GASTO', 'DEUDORA', '4103', 1),
('410333', 'Aranceles del CNR', 'GASTO', 'DEUDORA', '4103', 1),
('410334', 'Otros', 'GASTO', 'DEUDORA', '4103', 1),
('4104', 'GASTOS POR SERVICIOS', 'GASTO', 'DEUDORA', '41', 0),
('410401', 'Sueldos y Comisiones', 'GASTO', 'DEUDORA', '4104', 1),
('410402', 'Horas Extras', 'GASTO', 'DEUDORA', '4104', 1),
('410403', 'Vacaciones', 'GASTO', 'DEUDORA', '4104', 1),
('410404', 'Aguinaldos', 'GASTO', 'DEUDORA', '4104', 1),
('410405', 'Bonificaciones y Gratificaciones', 'GASTO', 'DEUDORA', '4104', 1),
('410406', 'Indemnizaciones', 'GASTO', 'DEUDORA', '4104', 1),
('410407', 'Cuota Patronal I.S.S.S.', 'GASTO', 'DEUDORA', '4104', 1),
('410408', 'Cuota Patronal A.F.P.', 'GASTO', 'DEUDORA', '4104', 1),
('410409', 'Honorarios', 'GASTO', 'DEUDORA', '4104', 1),
('410410', 'Papeleria y Utiles', 'GASTO', 'DEUDORA', '4104', 1),
('410411', 'Telefono y Correo', 'GASTO', 'DEUDORA', '4104', 1),
('410412', 'Servicio Electrico', 'GASTO', 'DEUDORA', '4104', 1),
('410413', 'Servicio de Agua', 'GASTO', 'DEUDORA', '4104', 1),
('410414', 'Impuestos Fiscales y Municipales', 'GASTO', 'DEUDORA', '4104', 1),
('410415', 'Fletes y Transportes', 'GASTO', 'DEUDORA', '4104', 1),
('410416', 'Reparacion y Mantenimiento de Instalaciones', 'GASTO', 'DEUDORA', '4104', 1),
('410417', 'Reparacion y Mantenimiento de Mob. y Equipo', 'GASTO', 'DEUDORA', '4104', 1),
('410418', 'Reparacion y Mantenimiento de Vehiculos', 'GASTO', 'DEUDORA', '4104', 1),
('410419', 'Combustibles y Lubricantes', 'GASTO', 'DEUDORA', '4104', 1),
('410420', 'Propaganda y Promociones', 'GASTO', 'DEUDORA', '4104', 1),
('410421', 'Viaticos y Gastos de Viaje', 'GASTO', 'DEUDORA', '4104', 1),
('410422', 'Alquiler de Local', 'GASTO', 'DEUDORA', '4104', 1),
('410423', 'Arrendamiento de Equipo', 'GASTO', 'DEUDORA', '4104', 1),
('410424', 'Cuotas y Suscripciones', 'GASTO', 'DEUDORA', '4104', 1),
('410425', 'Seguros', 'GASTO', 'DEUDORA', '4104', 1),
('410426', 'Depreciaciones', 'GASTO', 'DEUDORA', '4104', 1),
('410427', 'Servicio de Vigilancia', 'GASTO', 'DEUDORA', '4104', 1),
('410428', 'Aseo y Limpieza', 'GASTO', 'DEUDORA', '4104', 1),
('410429', 'Articulos Promocionales', 'GASTO', 'DEUDORA', '4104', 1),
('410431', 'Fovial y Cotrans', 'GASTO', 'DEUDORA', '4104', 1),
('410432', 'Otros', 'GASTO', 'DEUDORA', '4104', 1),
('4105', 'COSTO DE VENTAS', 'COSTO', 'DEUDORA', '41', 0),
('410501', 'Costo de lo vendido', 'COSTO', 'DEUDORA', '4105', 1),
('4106', 'REBAJAS Y DEVOLUCIONES SOBRE VENTAS', 'COSTO', 'DEUDORA', '41', 1),
('4201', 'GASTOS FINANCIEROS', 'GASTO', 'DEUDORA', '42', 0),
('420101', 'Intereses', 'GASTO', 'DEUDORA', '4201', 1),
('420102', 'Comisiones', 'GASTO', 'DEUDORA', '4201', 1),
('420103', 'Honorarios', 'GASTO', 'DEUDORA', '4201', 1),
('420104', 'Seguros', 'GASTO', 'DEUDORA', '4201', 1),
('420105', 'Otros', 'GASTO', 'DEUDORA', '4201', 1),
('4202', 'PERDIDA EN VENTA O RETIRO DE ACTIVOS FIJOS', 'GASTO', 'DEUDORA', '42', 1),
('4203', 'GASTOS POR DETERIORO DE VALOR DE ACTIVOS', 'GASTO', 'DEUDORA', '42', 1),
('4204', 'GASTOS POR DETERIORO EN EL VALOR DE LAS INVERSIONES', 'GASTO', 'DEUDORA', '42', 1),
('4205', 'PERDIDAS EN VALOR RAZONABLE DE PROPIEDADES DE INVERSION', 'GASTO', 'DEUDORA', '42', 1),
('4206', 'GASTOS DE EJERCICIOS ANTERIORES', 'GASTO', 'DEUDORA', '42', 1),
('4207', 'GASTOS POR OPERACIONES EN DISCONTINUACION', 'GASTO', 'DEUDORA', '42', 1),
('4208', 'GASTOS NO DEDUCIBLES', 'GASTO', 'DEUDORA', '42', 0),
('420801', 'Intereses', 'GASTO', 'DEUDORA', '4208', 1),
('420802', 'Comisiones', 'GASTO', 'DEUDORA', '4208', 1),
('420803', 'Multas', 'GASTO', 'DEUDORA', '4208', 1),
('420804', 'Seguros', 'GASTO', 'DEUDORA', '4208', 1),
('5', 'CUENTAS DE RESULTADO ACREEDOR', 'INGRESO', 'ACREEDORA', NULL, 0),
('51', 'INGRESOS DE OPERACION', 'INGRESO', 'ACREEDORA', '5', 0),
('52', 'INGRESOS DE NO OPERACION', 'INGRESO', 'ACREEDORA', '5', 0),
('5101', 'INGRESOS POR SERVICIOS', 'INGRESO', 'ACREEDORA', '51', 1),
('5102', 'VENTAS', 'INGRESO', 'ACREEDORA', '51', 0),
('510201', 'Al contado', 'INGRESO', 'ACREEDORA', '5102', 1),
('510202', 'Al credito', 'INGRESO', 'ACREEDORA', '5102', 1),
('5201', 'INGRESOS FINANCIEROS', 'INGRESO', 'ACREEDORA', '52', 0),
('520101', 'Intereses Bancarios', 'INGRESO', 'ACREEDORA', '5201', 1),
('5202', 'GANANCIA EN VENTA DE ACTIVOS FIJOS', 'INGRESO', 'ACREEDORA', '52', 1),
('5203', 'INGRESOS POR CAMBIO EN VALOR RAZONABLE DE INVERSIONES', 'INGRESO', 'ACREEDORA', '52', 1),
('5204', 'INGRESOS POR CAMBIO EN VALOR RAZONABLE DE PROPIEDADES DE INVERSION', 'INGRESO', 'ACREEDORA', '52', 1),
('5205', 'INDEMNIZACIONES POR SINIESTROS', 'INGRESO', 'ACREEDORA', '52', 1),
('5206', 'OTROS INGRESOS DE NO OPERACION', 'INGRESO', 'ACREEDORA', '52', 1),
('6', 'CUENTA DE CIERRE', 'PATRIMONIO', 'ACREEDORA', NULL, 0),
('61', 'CUENTA LIQUIDADORA', 'PATRIMONIO', 'ACREEDORA', '6', 0),
('6101', 'PERDIDAS Y GANANCIAS', 'PATRIMONIO', 'ACREEDORA', '61', 1);

DECLARE @Insertados INT = 1;
DECLARE @Nivel INT = 0;

WHILE @Insertados > 0 AND @Nivel < 20
BEGIN
    INSERT INTO CUENTA_PREDETERMINADA (
        id_cuenta_padre, codigo, nombre, clasificacion, naturaleza, permite_movimientos
    )
    SELECT
        p.id_cuenta, c.codigo, c.nombre, c.clasificacion, c.naturaleza, c.permite_movimientos
    FROM @Catalogo c
    LEFT JOIN CUENTA_PREDETERMINADA p ON p.codigo = c.codigo_padre
    WHERE NOT EXISTS (SELECT 1 FROM CUENTA_PREDETERMINADA x WHERE x.codigo = c.codigo)
      AND (c.codigo_padre IS NULL OR p.id_cuenta IS NOT NULL);

    SET @Insertados = @@ROWCOUNT;
    SET @Nivel += 1;
END;
GO

/* ============================================================
   13. PROCEDIMIENTOS ALMACENADOS
   ============================================================ */

CREATE OR ALTER PROCEDURE sp_ContabilizarPartida
    @IdPartida INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE
            @IdLibro INT, @IdEmpresa INT, @FechaPartida DATE,
            @EstadoPartida VARCHAR(15), @EstadoLibro VARCHAR(10),
            @TotalMovimientos INT, @TotalDebe DECIMAL(38,2), @TotalHaber DECIMAL(38,2),
            @TipoOperacion VARCHAR(10), @IdDte INT;

        SELECT
            @IdLibro = P.id_libro, @FechaPartida = P.fecha,
            @EstadoPartida = P.estado, @EstadoLibro = L.estado, @IdEmpresa = L.id_empresa,
            @TipoOperacion = P.tipo_operacion, @IdDte = P.id_dte
        FROM PARTIDA P WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN LIBRO L WITH (UPDLOCK, HOLDLOCK) ON P.id_libro = L.id_libro
        WHERE P.id_partida = @IdPartida;

        IF @IdLibro IS NULL
            THROW 50010, 'La partida indicada no existe.', 1;

        IF @EstadoPartida <> 'BORRADOR'
            THROW 50011, 'Solo se pueden contabilizar partidas en estado BORRADOR.', 1;

        IF @EstadoLibro <> 'ABIERTO'
            THROW 50012, 'No se puede contabilizar en un libro cerrado.', 1;

        IF NOT EXISTS (
            SELECT 1 FROM LIBRO
            WHERE id_libro = @IdLibro AND @FechaPartida BETWEEN fecha_inicio AND fecha_fin
        )
            THROW 50013, 'La fecha de la partida esta fuera del periodo del libro.', 1;

        SELECT
            @TotalMovimientos = COUNT(*),
            @TotalDebe = COALESCE(SUM(debe), 0),
            @TotalHaber = COALESCE(SUM(haber), 0)
        FROM MOVIMIENTO
        WHERE id_partida = @IdPartida;

        IF @TotalMovimientos < 2
            THROW 50014, 'La partida debe tener al menos dos movimientos.', 1;

        IF @TotalDebe <> @TotalHaber
            THROW 50015, 'La partida no esta cuadrada. El Debe y el Haber deben ser iguales.', 1;

        IF EXISTS (
            SELECT 1
            FROM MOVIMIENTO M
            LEFT JOIN CUENTA_PREDETERMINADA CP ON M.id_cuenta_predeterminada = CP.id_cuenta
            LEFT JOIN CUENTA_PERSONALIZADA CC ON M.id_cuenta_personalizada = CC.id_cuenta
            WHERE M.id_partida = @IdPartida
              AND (
                    (M.id_cuenta_predeterminada IS NOT NULL
                     AND (CP.id_cuenta IS NULL OR ISNULL(CP.estado,'') <> 'ACTIVA' OR ISNULL(CP.permite_movimientos,0) = 0))
                    OR
                    (M.id_cuenta_personalizada IS NOT NULL
                     AND (CC.id_cuenta IS NULL OR CC.id_empresa <> @IdEmpresa OR ISNULL(CC.estado,'') <> 'ACTIVA' OR ISNULL(CC.permite_movimientos,0) = 0))
              )
        )
            THROW 50016, 'Una o mas cuentas no estan disponibles para contabilizar esta partida.', 1;

        -- Validación IVA Crédito requiere DTE
        IF EXISTS (
            SELECT 1 FROM MOVIMIENTO M
            INNER JOIN CUENTA_PREDETERMINADA CP ON M.id_cuenta_predeterminada = CP.id_cuenta
            WHERE M.id_partida = @IdPartida AND CP.codigo = '110801'
        ) AND @IdDte IS NULL
        BEGIN
            THROW 50018, 'Las partidas con IVA Credito Fiscal requieren un DTE asociado. Registre el DTE del proveedor.', 1;
        END;

        -- Validar que el DTE esté transmitido si se usa crédito fiscal
        IF @IdDte IS NOT NULL
        BEGIN
            IF EXISTS (
                SELECT 1 FROM DTE
                WHERE id_dte = @IdDte
                  AND estado_transmision NOT IN ('TRANSMITIDO', 'CONTINGENCIA')
            )
                THROW 50019, 'El DTE asociado no esta en estado valido (TRANSMITIDO o CONTINGENCIA) para usar credito fiscal.', 1;
        END;

        UPDATE PARTIDA
        SET estado = 'CONTABILIZADA'
        WHERE id_partida = @IdPartida AND estado = 'BORRADOR';

        IF @@ROWCOUNT <> 1
            THROW 50017, 'No fue posible cambiar el estado de la partida.', 1;

        COMMIT TRANSACTION;

        PRINT 'La partida fue contabilizada correctamente.';

        SELECT
            P.id_partida, P.numero_partida, P.fecha, P.concepto, P.estado,
            @TotalDebe AS total_debe, @TotalHaber AS total_haber
        FROM PARTIDA P
        WHERE P.id_partida = @IdPartida;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE sp_AnularPartida
    @IdPartida INT,
    @Motivo VARCHAR(250)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @EstadoActual VARCHAR(15);

        SELECT @EstadoActual = estado
        FROM PARTIDA WITH (UPDLOCK, HOLDLOCK)
        WHERE id_partida = @IdPartida;

        IF @EstadoActual IS NULL
            THROW 50040, 'La partida no existe.', 1;

        IF @EstadoActual = 'ANULADA'
            THROW 50041, 'La partida ya esta anulada.', 1;

        IF LTRIM(RTRIM(@Motivo)) = ''
            THROW 50042, 'Debe indicar el motivo de anulacion.', 1;

        UPDATE PARTIDA
        SET estado = 'ANULADA',
            fecha_anulacion = SYSDATETIME(),
            motivo_anulacion = @Motivo
        WHERE id_partida = @IdPartida;

        COMMIT TRANSACTION;

        PRINT 'Partida anulada correctamente.';
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE sp_CerrarPeriodo
    @IdLibro INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IdEmpresa INT, @Estado VARCHAR(10), @Periodo VARCHAR(7);

        SELECT @IdEmpresa = id_empresa, @Estado = estado,
               @Periodo = CONVERT(VARCHAR(7), fecha_inicio, 126)
        FROM LIBRO WITH (UPDLOCK, HOLDLOCK)
        WHERE id_libro = @IdLibro;

        IF @Estado IS NULL
            THROW 50050, 'El periodo no existe.', 1;

        IF @Estado <> 'ABIERTO'
            THROW 50051, 'El periodo ya esta cerrado.', 1;

        -- Validar partidas en borrador
        IF EXISTS (SELECT 1 FROM PARTIDA WHERE id_libro = @IdLibro AND estado = 'BORRADOR')
            THROW 50052, 'No se puede cerrar el periodo: existen partidas en borrador.', 1;

        -- Validar DTE pendientes (si la empresa está inscrita en DTE)
        IF EXISTS (
            SELECT 1 FROM DTE D
            INNER JOIN PARTIDA P ON P.id_dte = D.id_dte
            INNER JOIN LIBRO L ON L.id_libro = P.id_libro
            WHERE L.id_libro = @IdLibro
              AND D.estado_transmision = 'PENDIENTE'
        )
            THROW 50053, 'No se puede cerrar el periodo: existen DTE pendientes de transmision.', 1;

        -- Validar declaración de IVA (opcional, solo advertir si no existe)
        IF NOT EXISTS (
            SELECT 1 FROM DECLARACION_IVA
            WHERE id_empresa = @IdEmpresa AND periodo = @Periodo
              AND estado IN ('PRESENTADA','PAGADA')
        )
            PRINT 'ADVERTENCIA: No existe declaracion de IVA presentada para este periodo.';

        UPDATE LIBRO SET estado = 'CERRADO' WHERE id_libro = @IdLibro;

        COMMIT TRANSACTION;

        PRINT 'Periodo cerrado correctamente.';
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
