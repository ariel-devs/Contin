
CREATE DATABASE SistemaContableDB;
GO

USE SistemaContableDB;
GO


CREATE TABLE USUARIO (
    id_usuario INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    fecha_registro DATETIME2 NOT NULL
        DEFAULT SYSDATETIME()
);
GO


CREATE TABLE EMPRESA (
    id_empresa INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    nit VARCHAR(20) NULL,
    direccion VARCHAR(200) NULL,
    fecha_registro DATETIME2 NOT NULL
        DEFAULT SYSDATETIME(),

    CONSTRAINT FK_EMPRESA_USUARIO
        FOREIGN KEY (id_usuario)
        REFERENCES USUARIO(id_usuario)
);
GO


CREATE TABLE LIBRO (
    id_libro INT IDENTITY(1,1) PRIMARY KEY,
    id_empresa INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    tipo_libro VARCHAR(20) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado VARCHAR(10) NOT NULL
        DEFAULT 'ABIERTO',
    fecha_creacion DATETIME2 NOT NULL
        DEFAULT SYSDATETIME(),

    CONSTRAINT FK_LIBRO_EMPRESA
        FOREIGN KEY (id_empresa)
        REFERENCES EMPRESA(id_empresa),

    CONSTRAINT CK_LIBRO_ESTADO
        CHECK (estado IN ('ABIERTO', 'CERRADO')),

    CONSTRAINT CK_LIBRO_TIPO
        CHECK (tipo_libro IN (
            'DIARIO',
            'MAYOR',
            'IVA',
            'BALANCE'
        )),

    CONSTRAINT CK_LIBRO_FECHAS
        CHECK (fecha_inicio <= fecha_fin)
);
GO


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
        FOREIGN KEY (id_cuenta_padre)
        REFERENCES CUENTA_PREDETERMINADA(id_cuenta),

    CONSTRAINT CK_CUENTA_PRE_CLASIFICACION
        CHECK (clasificacion IN (
            'ACTIVO',
            'PASIVO',
            'PATRIMONIO',
            'INGRESO',
            'GASTO',
            'COSTO'
        )),

    CONSTRAINT CK_CUENTA_PRE_NATURALEZA
        CHECK (naturaleza IN (
            'DEUDORA',
            'ACREEDORA'
        )),

    CONSTRAINT CK_CUENTA_PRE_ESTADO
        CHECK (estado IN (
            'ACTIVA',
            'INACTIVA'
        ))
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
        FOREIGN KEY (id_empresa)
        REFERENCES EMPRESA(id_empresa),

    CONSTRAINT FK_CUENTA_PERSONALIZADA_PRE_PADRE
        FOREIGN KEY (id_cuenta_predeterminada_padre)
        REFERENCES CUENTA_PREDETERMINADA(id_cuenta),

    CONSTRAINT FK_CUENTA_PERSONALIZADA_PADRE
        FOREIGN KEY (
            id_cuenta_personalizada_padre,
            id_empresa
        )
        REFERENCES CUENTA_PERSONALIZADA (
            id_cuenta,
            id_empresa
        ),

    CONSTRAINT UQ_CUENTA_PERSONALIZADA_ID_EMPRESA
        UNIQUE (id_cuenta, id_empresa),

    CONSTRAINT CK_CUENTA_PER_CLASIFICACION
        CHECK (clasificacion IN (
            'ACTIVO',
            'PASIVO',
            'PATRIMONIO',
            'INGRESO',
            'GASTO',
            'COSTO'
        )),

    CONSTRAINT CK_CUENTA_PER_NATURALEZA
        CHECK (naturaleza IN (
            'DEUDORA',
            'ACREEDORA'
        )),

    CONSTRAINT CK_CUENTA_PER_ESTADO
        CHECK (estado IN (
            'ACTIVA',
            'INACTIVA'
        )),

    CONSTRAINT CK_CUENTA_PER_PADRE
        CHECK (
            id_cuenta_predeterminada_padre IS NULL
            OR id_cuenta_personalizada_padre IS NULL
        ),

    CONSTRAINT CK_CUENTA_PER_NO_AUTO_PADRE
        CHECK (
            id_cuenta_personalizada_padre IS NULL
            OR id_cuenta_personalizada_padre <> id_cuenta
        )
);
GO

CREATE UNIQUE INDEX UQ_CUENTA_PERSONALIZADA_EMPRESA_CODIGO
ON CUENTA_PERSONALIZADA(id_empresa, codigo);
GO


CREATE TABLE PARTIDA (
    id_partida INT IDENTITY(1,1) PRIMARY KEY,
    id_libro INT NOT NULL,
    numero_partida INT NOT NULL,
    fecha DATE NOT NULL,
    concepto VARCHAR(250) NOT NULL,
    estado VARCHAR(15) NOT NULL
        DEFAULT 'BORRADOR',
    fecha_creacion DATETIME2 NOT NULL
        DEFAULT SYSDATETIME(),
    fecha_anulacion DATETIME2 NULL,
    motivo_anulacion VARCHAR(250) NULL,

    CONSTRAINT FK_PARTIDA_LIBRO
        FOREIGN KEY (id_libro)
        REFERENCES LIBRO(id_libro),

    CONSTRAINT UQ_PARTIDA_NUMERO_LIBRO
        UNIQUE (id_libro, numero_partida),

    CONSTRAINT CK_PARTIDA_ESTADO
        CHECK (estado IN (
            'BORRADOR',
            'CONTABILIZADA',
            'ANULADA'
        )),

    CONSTRAINT CK_PARTIDA_NUMERO
        CHECK (numero_partida > 0),

    CONSTRAINT CK_PARTIDA_ANULACION
        CHECK (
            (
                estado = 'ANULADA'
                AND fecha_anulacion IS NOT NULL
                AND motivo_anulacion IS NOT NULL
            )
            OR
            (
                estado <> 'ANULADA'
                AND fecha_anulacion IS NULL
                AND motivo_anulacion IS NULL
            )
        )
);
GO


CREATE TABLE MOVIMIENTO (
    id_movimiento INT IDENTITY(1,1) PRIMARY KEY,
    id_partida INT NOT NULL,
    id_cuenta_predeterminada INT NULL,
    id_cuenta_personalizada INT NULL,
    folio VARCHAR(20) NULL,
    parcial DECIMAL(12,2) NULL,
    debe DECIMAL(12,2) NOT NULL DEFAULT 0,
    haber DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT FK_MOVIMIENTO_PARTIDA
        FOREIGN KEY (id_partida)
        REFERENCES PARTIDA(id_partida),

    CONSTRAINT FK_MOVIMIENTO_CUENTA_PRE
        FOREIGN KEY (id_cuenta_predeterminada)
        REFERENCES CUENTA_PREDETERMINADA(id_cuenta),

    CONSTRAINT FK_MOVIMIENTO_CUENTA_PER
        FOREIGN KEY (id_cuenta_personalizada)
        REFERENCES CUENTA_PERSONALIZADA(id_cuenta),

    CONSTRAINT CK_MOVIMIENTO_UNA_CUENTA
        CHECK (
            (
                id_cuenta_predeterminada IS NOT NULL
                AND id_cuenta_personalizada IS NULL
            )
            OR
            (
                id_cuenta_predeterminada IS NULL
                AND id_cuenta_personalizada IS NOT NULL
            )
        ),

    CONSTRAINT CK_MOVIMIENTO_DEBE_HABER
        CHECK (
            (debe > 0 AND haber = 0)
            OR
            (haber > 0 AND debe = 0)
        ),

    CONSTRAINT CK_MOVIMIENTO_PARCIAL
        CHECK (
            parcial IS NULL OR parcial >= 0
        )
);
GO


CREATE INDEX IX_EMPRESA_USUARIO
ON EMPRESA(id_usuario);
GO

CREATE INDEX IX_LIBRO_EMPRESA
ON LIBRO(id_empresa);
GO

CREATE INDEX IX_CUENTA_PRE_PADRE
ON CUENTA_PREDETERMINADA(id_cuenta_padre);
GO

CREATE INDEX IX_CUENTA_PER_EMPRESA
ON CUENTA_PERSONALIZADA(id_empresa);
GO

CREATE INDEX IX_PARTIDA_LIBRO
ON PARTIDA(id_libro);
GO

CREATE INDEX IX_MOVIMIENTO_PARTIDA
ON MOVIMIENTO(id_partida);
GO

CREATE INDEX IX_MOVIMIENTO_CUENTA_PRE
ON MOVIMIENTO(id_cuenta_predeterminada);
GO

CREATE INDEX IX_MOVIMIENTO_CUENTA_PER
ON MOVIMIENTO(id_cuenta_personalizada);
GO

CREATE UNIQUE INDEX UX_CUENTA_PERSONALIZADA_EMPRESA_CODIGO
ON CUENTA_PERSONALIZADA (id_empresa, codigo);
GO

CREATE OR ALTER TRIGGER TR_VALIDAR_JERARQUIA_PREDETERMINADA
ON CUENTA_PREDETERMINADA
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Validar la cuenta padre de las cuentas insertadas o modificadas
    IF EXISTS (
        SELECT 1
        FROM inserted I
        INNER JOIN CUENTA_PREDETERMINADA P
            ON P.id_cuenta = I.id_cuenta_padre
        WHERE
            P.permite_movimientos = 1
            OR I.clasificacion <> P.clasificacion
    )
    BEGIN
        THROW 50010,
        'La cuenta padre debe ser agrupadora y tener la misma clasificacion.',
        1;
    END;

    -- 2. Evitar invalidar cuentas hijas existentes
    IF EXISTS (
        SELECT 1
        FROM inserted I
        INNER JOIN CUENTA_PREDETERMINADA H
            ON H.id_cuenta_padre = I.id_cuenta
        WHERE
            I.permite_movimientos = 1
            OR H.clasificacion <> I.clasificacion
    )
    BEGIN
        THROW 50011,
        'No se puede convertir en cuenta de movimiento una cuenta con hijas ni cambiar su clasificacion de forma incompatible.',
        1;
    END;

    -- 3. Validar también las cuentas personalizadas
    IF EXISTS (
        SELECT 1
        FROM inserted I
        INNER JOIN CUENTA_PERSONALIZADA H
            ON H.id_cuenta_predeterminada_padre = I.id_cuenta
        WHERE
            I.permite_movimientos = 1
            OR H.clasificacion <> I.clasificacion
    )
    BEGIN
        THROW 50012,
        'La modificacion de esta cuenta afectaria cuentas personalizadas dependientes.',
        1;
    END;

    -- 4. Detectar ciclos en el catalogo predeterminado
    DECLARE @ExisteCiclo BIT = 0;

    ;WITH Jerarquia AS (
        SELECT
            I.id_cuenta AS id_inicio,
            I.id_cuenta_padre AS id_padre,
            CAST(
                '|' + CAST(I.id_cuenta AS VARCHAR(20)) + '|'
                AS VARCHAR(MAX)
            ) AS ruta,
            CAST(0 AS BIT) AS ciclo
        FROM inserted I

        UNION ALL

        SELECT
            J.id_inicio,
            P.id_cuenta_padre,
            CAST(
                J.ruta + CAST(P.id_cuenta AS VARCHAR(20)) + '|'
                AS VARCHAR(MAX)
            ),
            CAST(
                CASE
                    WHEN CHARINDEX(
                        '|' + CAST(P.id_cuenta AS VARCHAR(20)) + '|',
                        J.ruta
                    ) > 0 THEN 1
                    ELSE 0
                END AS BIT
            )
        FROM Jerarquia J
        INNER JOIN CUENTA_PREDETERMINADA P
            ON P.id_cuenta = J.id_padre
        WHERE J.ciclo = 0
          AND J.id_padre IS NOT NULL
    )
    SELECT @ExisteCiclo = MAX(CAST(ciclo AS INT))
    FROM Jerarquia
    OPTION (MAXRECURSION 32767);

    IF @ExisteCiclo = 1
    BEGIN
        THROW 50013,
        'No se permiten ciclos en la jerarquia de cuentas predeterminadas.',
        1;
    END;
END;
GO


CREATE OR ALTER TRIGGER TR_VALIDAR_JERARQUIA_PERSONALIZADA
ON CUENTA_PERSONALIZADA
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Validar padres predeterminados
    IF EXISTS (
        SELECT 1
        FROM inserted I
        INNER JOIN CUENTA_PREDETERMINADA P
            ON P.id_cuenta = I.id_cuenta_predeterminada_padre
        WHERE P.permite_movimientos = 1
           OR I.clasificacion <> P.clasificacion
    )
    BEGIN
        THROW 50020,
        'La cuenta padre debe ser agrupadora y tener la misma clasificacion.',
        1;
    END;

    -- 2. Validar padres personalizados
    IF EXISTS (
        SELECT 1
        FROM inserted I
        INNER JOIN CUENTA_PERSONALIZADA P
            ON P.id_cuenta = I.id_cuenta_personalizada_padre
            AND P.id_empresa = I.id_empresa
        WHERE P.permite_movimientos = 1
           OR I.clasificacion <> P.clasificacion
    )
    BEGIN
        THROW 50021,
        'La cuenta personalizada padre debe ser agrupadora y tener la misma clasificacion.',
        1;
    END;

    -- 3. Evitar invalidar cuentas hijas personalizadas
    IF EXISTS (
        SELECT 1
        FROM inserted I
        INNER JOIN CUENTA_PERSONALIZADA H
            ON H.id_cuenta_personalizada_padre = I.id_cuenta
            AND H.id_empresa = I.id_empresa
        WHERE I.permite_movimientos = 1
           OR H.clasificacion <> I.clasificacion
    )
    BEGIN
        THROW 50022,
        'No se puede invalidar la jerarquia de cuentas personalizadas existentes.',
        1;
    END;

    -- 4. Detectar ciclos
    DECLARE @ExisteCiclo BIT = 0;

    ;WITH Jerarquia AS (
        SELECT
            I.id_empresa,
            I.id_cuenta AS id_inicio,
            I.id_cuenta_personalizada_padre AS id_padre,
            CAST(
                '|' + CAST(I.id_cuenta AS VARCHAR(20)) + '|'
                AS VARCHAR(MAX)
            ) AS ruta,
            CAST(0 AS BIT) AS ciclo
        FROM inserted I
        WHERE I.id_cuenta_personalizada_padre IS NOT NULL

        UNION ALL

        SELECT
            J.id_empresa,
            J.id_inicio,
            P.id_cuenta_personalizada_padre,
            CAST(
                J.ruta + CAST(P.id_cuenta AS VARCHAR(20)) + '|'
                AS VARCHAR(MAX)
            ),
            CAST(
                CASE
                    WHEN CHARINDEX(
                        '|' + CAST(P.id_cuenta AS VARCHAR(20)) + '|',
                        J.ruta
                    ) > 0 THEN 1
                    ELSE 0
                END AS BIT
            )
        FROM Jerarquia J
        INNER JOIN CUENTA_PERSONALIZADA P
            ON P.id_cuenta = J.id_padre
            AND P.id_empresa = J.id_empresa
        WHERE J.ciclo = 0
          AND J.id_padre IS NOT NULL
    )
    SELECT @ExisteCiclo = MAX(CAST(ciclo AS INT))
    FROM Jerarquia
    OPTION (MAXRECURSION 32767);

    IF @ExisteCiclo = 1
    BEGIN
        THROW 50024,
        'No se permiten ciclos en la jerarquia de cuentas personalizadas.',
        1;
    END;
END;
GO

CREATE OR ALTER TRIGGER TR_PROTEGER_CUENTA_PREDETERMINADA
ON CUENTA_PREDETERMINADA
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Impedir eliminar cuentas con movimientos contabilizados
    IF EXISTS (
        SELECT 1
        FROM deleted D
        INNER JOIN MOVIMIENTO M
            ON M.id_cuenta_predeterminada = D.id_cuenta
        INNER JOIN PARTIDA P
            ON P.id_partida = M.id_partida
        WHERE P.estado = 'CONTABILIZADA'
          AND NOT EXISTS (
              SELECT 1
              FROM inserted I
              WHERE I.id_cuenta = D.id_cuenta
          )
    )
    BEGIN
        THROW 50030,
        'No se puede eliminar una cuenta que tenga movimientos contabilizados.',
        1;
    END;

    -- 2. Impedir desactivar cuentas con movimientos contabilizados
    IF EXISTS (
        SELECT 1
        FROM deleted D
        INNER JOIN inserted I
            ON I.id_cuenta = D.id_cuenta
        INNER JOIN MOVIMIENTO M
            ON M.id_cuenta_predeterminada = D.id_cuenta
        INNER JOIN PARTIDA P
            ON P.id_partida = M.id_partida
        WHERE P.estado = 'CONTABILIZADA'
          AND D.estado <> 'INACTIVA'
          AND I.estado = 'INACTIVA'
    )
    BEGIN
        THROW 50031,
        'No se puede desactivar una cuenta que tenga movimientos contabilizados.',
        1;
    END;
END;
GO

CREATE OR ALTER TRIGGER TR_PROTEGER_CUENTA_PERSONALIZADA
ON CUENTA_PERSONALIZADA
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Impedir eliminar cuentas con movimientos contabilizados
    IF EXISTS (
        SELECT 1
        FROM deleted D
        INNER JOIN MOVIMIENTO M
            ON M.id_cuenta_personalizada = D.id_cuenta
        INNER JOIN PARTIDA P
            ON P.id_partida = M.id_partida
        WHERE P.estado = 'CONTABILIZADA'
          AND NOT EXISTS (
              SELECT 1
              FROM inserted I
              WHERE I.id_cuenta = D.id_cuenta
          )
    )
    BEGIN
        THROW 50032,
        'No se puede eliminar una cuenta personalizada que tenga movimientos contabilizados.',
        1;
    END;

    -- 2. Impedir desactivar cuentas con movimientos contabilizados
    IF EXISTS (
        SELECT 1
        FROM deleted D
        INNER JOIN inserted I
            ON I.id_cuenta = D.id_cuenta
            AND I.id_empresa = D.id_empresa
        INNER JOIN MOVIMIENTO M
            ON M.id_cuenta_personalizada = D.id_cuenta
        INNER JOIN PARTIDA P
            ON P.id_partida = M.id_partida
        WHERE P.estado = 'CONTABILIZADA'
          AND D.estado <> 'INACTIVA'
          AND I.estado = 'INACTIVA'
    )
    BEGIN
        THROW 50033,
        'No se puede desactivar una cuenta personalizada que tenga movimientos contabilizados.',
        1;
    END;
END;
GO

INSERT INTO USUARIO (nombre, correo, contrasena_hash)
VALUES (
    'Administrador',
    'admin@sistemacontable.com',
    '$2b$10$TIAl26RCm5ZaN1ZIx2WL1.fBgw0.2QvgP20PoRf/pTmHy9utcassq'
);

IF EXISTS (SELECT 1 FROM CUENTA_PREDETERMINADA)
BEGIN
    THROW 50001, 'El catalogo ya contiene cuentas. No se realizo la insercion.', 1;
END;
GO

DECLARE @Catalogo TABLE (
    codigo VARCHAR(20),
    nombre VARCHAR(150),
    clasificacion VARCHAR(20),
    naturaleza VARCHAR(15),
    codigo_padre VARCHAR(20) NULL,
    permite_movimientos BIT
);

INSERT INTO @Catalogo VALUES

-- 1. ACTIVOS
('1', 'Activos', 'ACTIVO', 'DEUDORA', NULL, 0),
('1.1', 'Activos corrientes', 'ACTIVO', 'DEUDORA', '1', 0),
('1.1.01', 'Caja', 'ACTIVO', 'DEUDORA', '1.1', 1),
('1.1.02', 'Bancos', 'ACTIVO', 'DEUDORA', '1.1', 1),
('1.1.03', 'Clientes', 'ACTIVO', 'DEUDORA', '1.1', 1),
('1.1.04', 'Documentos por cobrar', 'ACTIVO', 'DEUDORA', '1.1', 1),
('1.1.05', 'Inventario de mercaderias', 'ACTIVO', 'DEUDORA', '1.1', 1),
('1.1.06', 'IVA credito fiscal', 'ACTIVO', 'DEUDORA', '1.1', 1),
('1.1.07', 'Anticipos a proveedores', 'ACTIVO', 'DEUDORA', '1.1', 1),
('1.1.08', 'Alquileres pagados por anticipado', 'ACTIVO', 'DEUDORA', '1.1', 1),

('1.2', 'Activos no corrientes', 'ACTIVO', 'DEUDORA', '1', 0),
('1.2.01', 'Terrenos', 'ACTIVO', 'DEUDORA', '1.2', 1),
('1.2.02', 'Edificios', 'ACTIVO', 'DEUDORA', '1.2', 1),
('1.2.03', 'Mobiliario y equipo', 'ACTIVO', 'DEUDORA', '1.2', 1),
('1.2.04', 'Equipo de transporte', 'ACTIVO', 'DEUDORA', '1.2', 1),
('1.2.05', 'Equipo de computo', 'ACTIVO', 'DEUDORA', '1.2', 1),
('1.2.06', 'Depreciacion acumulada', 'ACTIVO', 'ACREEDORA', '1.2', 1),

-- 2. PASIVOS
('2', 'Pasivos', 'PASIVO', 'ACREEDORA', NULL, 0),
('2.1', 'Pasivos corrientes', 'PASIVO', 'ACREEDORA', '2', 0),
('2.1.01', 'Proveedores', 'PASIVO', 'ACREEDORA', '2.1', 1),
('2.1.02', 'Documentos por pagar', 'PASIVO', 'ACREEDORA', '2.1', 1),
('2.1.03', 'Acreedores diversos', 'PASIVO', 'ACREEDORA', '2.1', 1),
('2.1.04', 'IVA debito fiscal', 'PASIVO', 'ACREEDORA', '2.1', 1),
('2.1.05', 'Impuestos por pagar', 'PASIVO', 'ACREEDORA', '2.1', 1),
('2.1.06', 'Sueldos por pagar', 'PASIVO', 'ACREEDORA', '2.1', 1),
('2.1.07', 'Prestamos a corto plazo', 'PASIVO', 'ACREEDORA', '2.1', 1),

('2.2', 'Pasivos no corrientes', 'PASIVO', 'ACREEDORA', '2', 0),
('2.2.01', 'Prestamos a largo plazo', 'PASIVO', 'ACREEDORA', '2.2', 1),
('2.2.02', 'Documentos por pagar a largo plazo', 'PASIVO', 'ACREEDORA', '2.2', 1),

-- 3. PATRIMONIO
('3', 'Patrimonio', 'PATRIMONIO', 'ACREEDORA', NULL, 0),
('3.1', 'Capital', 'PATRIMONIO', 'ACREEDORA', '3', 0),
('3.1.01', 'Capital social', 'PATRIMONIO', 'ACREEDORA', '3.1', 1),
('3.1.02', 'Aportes adicionales de capital', 'PATRIMONIO', 'ACREEDORA', '3.1', 1),

('3.2', 'Resultados', 'PATRIMONIO', 'ACREEDORA', '3', 0),
('3.2.01', 'Utilidades acumuladas', 'PATRIMONIO', 'ACREEDORA', '3.2', 1),
('3.2.02', 'Perdidas acumuladas', 'PATRIMONIO', 'DEUDORA', '3.2', 1),
('3.2.03', 'Resultado del ejercicio', 'PATRIMONIO', 'ACREEDORA', '3.2', 1),

-- 4. INGRESOS
('4', 'Ingresos', 'INGRESO', 'ACREEDORA', NULL, 0),
('4.1', 'Ingresos de operacion', 'INGRESO', 'ACREEDORA', '4', 0),
('4.1.01', 'Ventas', 'INGRESO', 'ACREEDORA', '4.1', 1),
('4.1.02', 'Ingresos por servicios', 'INGRESO', 'ACREEDORA', '4.1', 1),

('4.2', 'Otros ingresos', 'INGRESO', 'ACREEDORA', '4', 0),
('4.2.01', 'Ingresos financieros', 'INGRESO', 'ACREEDORA', '4.2', 1),
('4.2.02', 'Otros ingresos', 'INGRESO', 'ACREEDORA', '4.2', 1),

('4.3', 'Deducciones sobre ventas', 'INGRESO', 'DEUDORA', '4', 0),
('4.3.01', 'Devoluciones sobre ventas', 'INGRESO', 'DEUDORA', '4.3', 1),
('4.3.02', 'Descuentos sobre ventas', 'INGRESO', 'DEUDORA', '4.3', 1),

-- 5. COSTOS
('5', 'Costos', 'COSTO', 'DEUDORA', NULL, 0),
('5.1', 'Costos de operacion', 'COSTO', 'DEUDORA', '5', 0),
('5.1.01', 'Costo de ventas', 'COSTO', 'DEUDORA', '5.1', 1),
('5.1.02', 'Otros costos de operacion', 'COSTO', 'DEUDORA', '5.1', 1),

-- 6. GASTOS
('6', 'Gastos', 'GASTO', 'DEUDORA', NULL, 0),
('6.1', 'Gastos de administracion', 'GASTO', 'DEUDORA', '6', 0),
('6.1.01', 'Sueldos y salarios', 'GASTO', 'DEUDORA', '6.1', 1),
('6.1.02', 'Alquileres', 'GASTO', 'DEUDORA', '6.1', 1),
('6.1.03', 'Energia electrica', 'GASTO', 'DEUDORA', '6.1', 1),
('6.1.04', 'Agua potable', 'GASTO', 'DEUDORA', '6.1', 1),
('6.1.05', 'Internet y telefonia', 'GASTO', 'DEUDORA', '6.1', 1),
('6.1.06', 'Papeleria y utiles', 'GASTO', 'DEUDORA', '6.1', 1),
('6.1.07', 'Depreciacion del ejercicio', 'GASTO', 'DEUDORA', '6.1', 1),

('6.2', 'Gastos de venta', 'GASTO', 'DEUDORA', '6', 0),
('6.2.01', 'Publicidad y propaganda', 'GASTO', 'DEUDORA', '6.2', 1),
('6.2.02', 'Transporte y distribucion', 'GASTO', 'DEUDORA', '6.2', 1),
('6.2.03', 'Comisiones sobre ventas', 'GASTO', 'DEUDORA', '6.2', 1),

('6.3', 'Gastos financieros', 'GASTO', 'DEUDORA', '6', 0),
('6.3.01', 'Intereses pagados', 'GASTO', 'DEUDORA', '6.3', 1),
('6.3.02', 'Comisiones bancarias', 'GASTO', 'DEUDORA', '6.3', 1);

-- Insertar primero las cuentas principales.
INSERT INTO CUENTA_PREDETERMINADA (
    codigo,
    nombre,
    clasificacion,
    naturaleza,
    permite_movimientos
)
SELECT
    codigo,
    nombre,
    clasificacion,
    naturaleza,
    permite_movimientos
FROM @Catalogo
WHERE codigo_padre IS NULL;

-- Insertar las cuentas subordinadas.
-- Se procesan por niveles para asegurar que el padre ya exista.
DECLARE
    @Codigo VARCHAR(20),
    @Nombre VARCHAR(150),
    @Clasificacion VARCHAR(20),
    @Naturaleza VARCHAR(15),
    @CodigoPadre VARCHAR(20),
    @PermiteMovimientos BIT,
    @IdPadre INT;

DECLARE cursor_cuentas CURSOR LOCAL FAST_FORWARD FOR
SELECT
    codigo,
    nombre,
    clasificacion,
    naturaleza,
    codigo_padre,
    permite_movimientos
FROM @Catalogo
WHERE codigo_padre IS NOT NULL
ORDER BY LEN(codigo), codigo;

OPEN cursor_cuentas;

FETCH NEXT FROM cursor_cuentas INTO
    @Codigo,
    @Nombre,
    @Clasificacion,
    @Naturaleza,
    @CodigoPadre,
    @PermiteMovimientos;

WHILE @@FETCH_STATUS = 0
BEGIN
    SELECT @IdPadre = id_cuenta
    FROM CUENTA_PREDETERMINADA
    WHERE codigo = @CodigoPadre;

    INSERT INTO CUENTA_PREDETERMINADA (
        id_cuenta_padre,
        codigo,
        nombre,
        clasificacion,
        naturaleza,
        permite_movimientos
    )
    VALUES (
        @IdPadre,
        @Codigo,
        @Nombre,
        @Clasificacion,
        @Naturaleza,
        @PermiteMovimientos
    );

    FETCH NEXT FROM cursor_cuentas INTO
        @Codigo,
        @Nombre,
        @Clasificacion,
        @Naturaleza,
        @CodigoPadre,
        @PermiteMovimientos;
END;

CLOSE cursor_cuentas;
DEALLOCATE cursor_cuentas;
GO



CREATE OR ALTER PROCEDURE sp_ContabilizarPartida
    @IdPartida INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE
            @IdLibro INT,
            @IdEmpresa INT,
            @FechaPartida DATE,
            @EstadoPartida VARCHAR(15),
            @EstadoLibro VARCHAR(10),
            @TotalMovimientos INT,
            @TotalDebe DECIMAL(38,2),
            @TotalHaber DECIMAL(38,2);

        -- 1. Obtener la partida y bloquear su registro
        -- mientras se realizan las validaciones.
        SELECT
            @IdLibro = P.id_libro,
            @FechaPartida = P.fecha,
            @EstadoPartida = P.estado,
            @EstadoLibro = L.estado,
            @IdEmpresa = L.id_empresa
        FROM PARTIDA P WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN LIBRO L WITH (UPDLOCK, HOLDLOCK)
            ON P.id_libro = L.id_libro
        WHERE P.id_partida = @IdPartida;

        IF @IdLibro IS NULL
            THROW 50010, 'La partida indicada no existe.', 1;

        -- 2. Verificar el estado de la partida
        IF @EstadoPartida <> 'BORRADOR'
            THROW 50011, 'Solo se pueden contabilizar partidas en estado BORRADOR.', 1;

        -- 3. Verificar que el libro este abierto
        IF @EstadoLibro <> 'ABIERTO'
            THROW 50012, 'No se puede contabilizar en un libro cerrado.', 1;

        -- 4. Verificar que la fecha este dentro del periodo del libro
        IF NOT EXISTS (
            SELECT 1
            FROM LIBRO
            WHERE id_libro = @IdLibro
              AND @FechaPartida BETWEEN fecha_inicio AND fecha_fin
        )
            THROW 50013, 'La fecha de la partida esta fuera del periodo del libro.', 1;

        -- 5. Verificar que existan al menos dos movimientos
        SELECT
            @TotalMovimientos = COUNT(*),
            @TotalDebe = COALESCE(SUM(debe), 0),
            @TotalHaber = COALESCE(SUM(haber), 0)
        FROM MOVIMIENTO
        WHERE id_partida = @IdPartida;

        IF @TotalMovimientos < 2
            THROW 50014, 'La partida debe tener al menos dos movimientos.', 1;

        -- 6. Verificar que el Debe y el Haber sean iguales
        IF @TotalDebe <> @TotalHaber
            THROW 50015, 'La partida no esta cuadrada. El Debe y el Haber deben ser iguales.', 1;

        -- 7. Verificar las cuentas utilizadas
        -- Las cuentas deben existir, estar activas
        -- y permitir movimientos.
        IF EXISTS (
            SELECT 1
            FROM MOVIMIENTO M
            LEFT JOIN CUENTA_PREDETERMINADA CP
                ON M.id_cuenta_predeterminada = CP.id_cuenta
            LEFT JOIN CUENTA_PERSONALIZADA CC
                ON M.id_cuenta_personalizada = CC.id_cuenta
            WHERE M.id_partida = @IdPartida
              AND (
                    (
                        M.id_cuenta_predeterminada IS NOT NULL
                        AND (
                            CP.id_cuenta IS NULL
                            OR ISNULL(CP.estado, '') <> 'ACTIVA'
                            OR ISNULL(CP.permite_movimientos, 0) = 0
                        )
                    )
                    OR
                    (
                        M.id_cuenta_personalizada IS NOT NULL
                        AND (
                            CC.id_cuenta IS NULL
                            OR CC.id_empresa <> @IdEmpresa
                            OR ISNULL(CC.estado, '') <> 'ACTIVA'
                            OR ISNULL(CC.permite_movimientos, 0) = 0
                        )
                    )
              )
        )
            THROW 50016, 'Una o mas cuentas no estan disponibles para contabilizar esta partida.', 1;

        -- 8. Cambiar el estado de la partida
        UPDATE PARTIDA
        SET estado = 'CONTABILIZADA'
        WHERE id_partida = @IdPartida
          AND estado = 'BORRADOR';

        IF @@ROWCOUNT <> 1
            THROW 50017, 'No fue posible cambiar el estado de la partida.', 1;

        COMMIT TRANSACTION;

        PRINT 'La partida fue contabilizada correctamente.';

        -- Mostrar el resultado
        SELECT
            P.id_partida,
            P.numero_partida,
            P.fecha,
            P.concepto,
            P.estado,
            @TotalDebe AS total_debe,
            @TotalHaber AS total_haber
        FROM PARTIDA P
        WHERE P.id_partida = @IdPartida;

    END TRY
    BEGIN CATCH

        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;

    END CATCH;
END;
GO
