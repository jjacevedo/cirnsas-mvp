INSERT IGNORE INTO apartamentos (proyecto, torre, numero, piso, area_m2, precio, estado)
VALUES
  ('Montpellier', 'Torre A', '302', 3, 78.50, 320000000, 'Disponible'),
  ('Montpellier', 'Torre A', '601', 6, 95.00, 410000000, 'Reservado'),
  ('Le Marais', 'Torre B', '205', 2, 70.25, 295000000, 'Vendido');

INSERT IGNORE INTO ventas (
  apartamento_id, cliente_nombre, cliente_documento, cliente_telefono,
  cliente_correo, precio_pactado, acabados_elegidos, fecha_firma, asesor_usuario_id
)
SELECT
  a.id, 'Laura Gómez', '111222333', '3001234567', 'laura@email.com',
  295000000, 'Premium', '2026-05-15', u.id
FROM apartamentos a
JOIN usuarios u ON u.correo = 'asesor@cirnsas.com'
WHERE a.proyecto = 'Le Marais' AND a.torre = 'Torre B' AND a.numero = '205';

INSERT IGNORE INTO reservas (
  apartamento_id, prospecto_nombre, fecha_vencimiento, estado, asesor_usuario_id
)
SELECT
  a.id, 'Carlos Martínez', '2026-06-15', 'Activa', u.id
FROM apartamentos a
JOIN usuarios u ON u.correo = 'asesor@cirnsas.com'
WHERE a.proyecto = 'Montpellier' AND a.torre = 'Torre A' AND a.numero = '601';

INSERT INTO presupuesto_items (proyecto, rubro, valor_presupuestado)
VALUES
  ('Montpellier', 'Estructura', 900000000),
  ('Montpellier', 'Acabados', 420000000),
  ('Le Marais', 'Subcontratos', 300000000)
ON DUPLICATE KEY UPDATE valor_presupuestado = VALUES(valor_presupuestado);

INSERT INTO gastos_obra (presupuesto_item_id, fecha, valor, proveedor, referencia, descripcion)
VALUES
  (1, '2026-05-01', 210000000, 'Acero SAS', 'FAC-001', 'Compra de acero y concreto'),
  (1, '2026-05-12', 130000000, 'Mano de obra S.A.', 'CON-019', 'Mano de obra cimientos'),
  (2, '2026-05-08', 90000000, 'Acabados LTDA', 'FAC-220', 'Acabados pisos 1-2'),
  (3, '2026-05-11', 145000000, 'Instalaciones ABC', 'CON-103', 'Contrato de instalaciones');
