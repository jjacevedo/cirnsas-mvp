INSERT INTO apartamentos (proyecto, torre, numero, piso, area_m2, precio, estado)
VALUES
  ('Montpellier', 'Torre A', '302', 3, 78.50, 320000000, 'Disponible'),
  ('Montpellier', 'Torre A', '601', 6, 95.00, 410000000, 'Reservado'),
  ('Le Marais', 'Torre B', '205', 2, 70.25, 295000000, 'En promesa de compra');

INSERT INTO pagos (cliente_nombre, apartamento_ref, cuota_numero, fecha_vencimiento, valor, estado, fecha_pago, notas)
VALUES
  ('Carlos Martínez', 'Montpellier-TA-302', 1, '2026-05-10', 32000000, 'Pagado', '2026-05-09', 'Cuota de separación'),
  ('Carlos Martínez', 'Montpellier-TA-302', 2, '2026-06-10', 64000000, 'Pendiente', NULL, 'Cuota durante obra'),
  ('Laura Gómez', 'LeMarais-TB-205', 1, '2026-05-15', 29500000, 'Vencido', NULL, 'Seguimiento comercial activo');

INSERT INTO presupuesto_items (proyecto, rubro, valor_presupuestado)
VALUES
  ('Montpellier', 'Estructura', 900000000),
  ('Montpellier', 'Acabados', 420000000),
  ('Le Marais', 'Subcontratos', 300000000);

INSERT INTO gastos_obra (presupuesto_item_id, fecha, valor, descripcion)
VALUES
  (1, '2026-05-01', 210000000, 'Compra de acero y concreto'),
  (1, '2026-05-12', 130000000, 'Mano de obra cimientos'),
  (2, '2026-05-08', 90000000, 'Acabados pisos 1-2'),
  (3, '2026-05-11', 145000000, 'Contrato de instalaciones');
