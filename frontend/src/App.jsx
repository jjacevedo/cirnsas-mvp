import { useEffect, useMemo, useState } from "react";

const API_URL = "http://localhost:4000/api";
const TOKEN_KEY = "cirnsas_token";

const initialApto = {
  proyecto: "",
  torre: "",
  numero: "",
  piso: "",
  area_m2: "",
  precio: "",
};
const initialReserva = {
  apartamento_id: "",
  prospecto_nombre: "",
  fecha_vencimiento: "",
};
const initialVenta = {
  apartamento_id: "",
  cliente_nombre: "",
  cliente_documento: "",
  cliente_telefono: "",
  cliente_correo: "",
  precio_pactado: "",
  acabados_elegidos: "",
  fecha_firma: "",
};
const initialPago = {
  venta_id: "",
  cuota_numero: "",
  fecha_vencimiento: "",
  valor: "",
  metodo_pago: "",
  estado: "Pendiente",
  fecha_pago: "",
  notas: "",
};
const initialRubro = { proyecto: "", rubro: "", valor_presupuestado: "" };
const initialGasto = {
  presupuesto_item_id: "",
  fecha: "",
  valor: "",
  proveedor: "",
  referencia: "",
  descripcion: "",
};

function App() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({
    correo: "asesor@cirnsas.com",
    password: "asesor123",
  });

  const [tab, setTab] = useState("inventario");
  const [apartamentos, setApartamentos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [resumenClientes, setResumenClientes] = useState([]);
  const [detalleCliente, setDetalleCliente] = useState([]);
  const [presupuesto, setPresupuesto] = useState([]);

  const [filtrosInventario, setFiltrosInventario] = useState({
    proyecto: "",
    torre: "",
    piso: "",
    estado: "",
  });
  const [filtrosPagos, setFiltrosPagos] = useState({
    proyecto: "",
    estado_global: "",
  });
  const [selectedVentaId, setSelectedVentaId] = useState("");
  const [editingRubro, setEditingRubro] = useState(null);

  const [formApto, setFormApto] = useState(initialApto);
  const [formReserva, setFormReserva] = useState(initialReserva);
  const [formVenta, setFormVenta] = useState(initialVenta);
  const [formVentaReserva, setFormVentaReserva] = useState({
    reserva_id: "",
    ...initialVenta,
  });
  const [formPago, setFormPago] = useState(initialPago);
  const [formRubro, setFormRubro] = useState(initialRubro);
  const [formGasto, setFormGasto] = useState(initialGasto);

  const disponibles = apartamentos.filter((a) => a.estado === "Disponible");
  const reservasActivas = apartamentos.filter((a) => a.reserva_id);

  const totalPresupuestado = useMemo(
    () =>
      presupuesto.reduce((acc, curr) => acc + Number(curr.valor_presupuestado || 0), 0),
    [presupuesto]
  );
  const totalEjecutado = useMemo(
    () => presupuesto.reduce((acc, curr) => acc + Number(curr.valor_ejecutado || 0), 0),
    [presupuesto]
  );
  const totalVariacion = totalPresupuestado - totalEjecutado;
  const resumenInventario = useMemo(() => {
    const total = apartamentos.length;
    const disponibles = apartamentos.filter((a) => a.estado === "Disponible").length;
    const reservados = apartamentos.filter((a) => a.estado === "Reservado").length;
    const vendidos = apartamentos.filter((a) =>
      ["Vendido", "Escriturado"].includes(a.estado)
    ).length;
    const enProceso = reservados;
    const porcentajeVendido = total ? (vendidos / total) * 100 : 0;
    return { total, disponibles, enProceso, vendidos, porcentajeVendido };
  }, [apartamentos]);

  function queryString(params) {
    const clean = Object.entries(params).filter(([, v]) => v !== "" && v != null);
    return clean.length
      ? `?${new URLSearchParams(clean.map(([k, v]) => [k, String(v)])).toString()}`
      : "";
  }

  async function api(path, options = {}, parseJson = true) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Error al consultar la API");
    }
    return parseJson ? response.json() : response;
  }

  async function login(e) {
    e.preventDefault();
    const result = await api(
      "/auth/login",
      { method: "POST", body: JSON.stringify(loginForm) },
      true
    );
    localStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (_error) {
      // Ignore logout network errors and clear session locally.
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
  }

  async function loadSession() {
    if (!token) return;
    const me = await api("/auth/me");
    setUser(me.user);
  }

  async function loadApartamentos() {
    const data = await api(`/apartamentos${queryString(filtrosInventario)}`);
    setApartamentos(data);
  }

  async function loadVentas() {
    setVentas(await api("/ventas"));
  }

  async function loadPagos() {
    const params = {};
    if (selectedVentaId) params.venta_id = selectedVentaId;
    setPagos(await api(`/pagos${queryString(params)}`));
  }

  async function loadResumenClientes() {
    setResumenClientes(await api(`/clientes/resumen-pagos${queryString(filtrosPagos)}`));
  }

  async function loadDetalleCliente(ventaId) {
    if (!ventaId) {
      setDetalleCliente([]);
      return;
    }
    setDetalleCliente(await api(`/clientes/${ventaId}/pagos`));
  }

  async function loadPresupuesto() {
    setPresupuesto(await api("/presupuesto/resumen"));
  }

  async function loadAll() {
    await Promise.all([
      loadApartamentos(),
      loadVentas(),
      loadPagos(),
      loadResumenClientes(),
      loadPresupuesto(),
    ]);
  }

  useEffect(() => {
    if (!token) return;
    loadSession()
      .then(loadAll)
      .catch(async () => {
        await logout();
      });
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    loadApartamentos().catch((e) => alert(e.message));
  }, [filtrosInventario, token, user]);

  useEffect(() => {
    if (!token || !user) return;
    loadResumenClientes().catch((e) => alert(e.message));
  }, [filtrosPagos, token, user]);

  useEffect(() => {
    if (!token || !user) return;
    loadPagos().catch((e) => alert(e.message));
  }, [selectedVentaId, token, user]);

  async function onAction(action) {
    try {
      await action();
      await Promise.all([
        loadApartamentos(),
        loadVentas(),
        loadPagos(),
        loadResumenClientes(),
        loadPresupuesto(),
      ]);
    } catch (error) {
      alert(error.message);
    }
  }

  async function crearApartamento(e) {
    e.preventDefault();
    await onAction(async () => {
      await api("/apartamentos", {
        method: "POST",
        body: JSON.stringify({
          ...formApto,
          piso: Number(formApto.piso),
          area_m2: Number(formApto.area_m2),
          precio: Number(formApto.precio),
        }),
      });
      setFormApto(initialApto);
    });
  }

  async function crearReserva(e) {
    e.preventDefault();
    await onAction(async () => {
      await api("/reservas", {
        method: "POST",
        body: JSON.stringify(formReserva),
      });
      setFormReserva(initialReserva);
    });
  }

  async function crearVenta(e) {
    e.preventDefault();
    await onAction(async () => {
      await api("/ventas", {
        method: "POST",
        body: JSON.stringify({
          ...formVenta,
          apartamento_id: Number(formVenta.apartamento_id),
          precio_pactado: Number(formVenta.precio_pactado),
        }),
      });
      setFormVenta(initialVenta);
    });
  }

  async function convertirReservaVenta(e) {
    e.preventDefault();
    await onAction(async () => {
      await api(`/reservas/${formVentaReserva.reserva_id}/convertir-venta`, {
        method: "POST",
        body: JSON.stringify({
          ...formVentaReserva,
          precio_pactado: Number(formVentaReserva.precio_pactado),
        }),
      });
      setFormVentaReserva({ reserva_id: "", ...initialVenta });
    });
  }

  async function cancelarReserva(reservaId) {
    await onAction(async () => {
      await api(`/reservas/${reservaId}/cancelar`, { method: "POST" });
    });
  }

  async function crearPago(e) {
    e.preventDefault();
    await onAction(async () => {
      await api("/pagos", {
        method: "POST",
        body: JSON.stringify({
          ...formPago,
          venta_id: Number(formPago.venta_id),
          cuota_numero: Number(formPago.cuota_numero),
          valor: Number(formPago.valor),
          fecha_pago: formPago.fecha_pago || null,
        }),
      });
      setFormPago(initialPago);
    });
  }

  async function actualizarEstadoPago(id, estado) {
    await onAction(async () => {
      await api(`/pagos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          estado,
          fecha_pago: estado === "Pagado" ? new Date().toISOString().slice(0, 10) : null,
        }),
      });
    });
  }

  async function exportarPagos() {
    try {
      const response = await api(
        `/reportes/pagos.csv${queryString({ proyecto: filtrosPagos.proyecto })}`,
        { method: "GET" },
        false
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reporte_pagos_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message);
    }
  }

  async function crearRubro(e) {
    e.preventDefault();
    await onAction(async () => {
      await api("/presupuesto/items", {
        method: "POST",
        body: JSON.stringify({
          ...formRubro,
          valor_presupuestado: Number(formRubro.valor_presupuestado),
        }),
      });
      setFormRubro(initialRubro);
    });
  }

  async function editarRubro(e) {
    e.preventDefault();
    await onAction(async () => {
      await api(`/presupuesto/items/${editingRubro.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editingRubro,
          valor_presupuestado: Number(editingRubro.valor_presupuestado),
        }),
      });
      setEditingRubro(null);
    });
  }

  async function eliminarRubro(id) {
    await onAction(async () => {
      await api(`/presupuesto/items/${id}`, { method: "DELETE" });
    });
  }

  async function registrarGasto(e) {
    e.preventDefault();
    await onAction(async () => {
      await api("/presupuesto/gastos", {
        method: "POST",
        body: JSON.stringify({
          ...formGasto,
          presupuesto_item_id: Number(formGasto.presupuesto_item_id),
          valor: Number(formGasto.valor),
        }),
      });
      setFormGasto(initialGasto);
    });
  }

  if (!token || !user) {
    return (
      <div className="auth-page">
        <form className="card auth-card" onSubmit={login}>
          <h2>Ingreso al sistema CIRNSAS</h2>
          <p>Acceso con usuarios autorizados.</p>
          <input
            type="email"
            placeholder="Correo"
            value={loginForm.correo}
            onChange={(e) => setLoginForm({ ...loginForm, correo: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            required
          />
          <button type="submit">Ingresar</button>
          <small>Demo: asesor@cirnsas.com / asesor123</small>
        </form>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>SGI CIRNSAS - MVP</h1>
        <p>
          Usuario: {user.nombre} ({user.rol}){" "}
          <button className="btn-ghost" onClick={logout}>
            Cerrar sesión
          </button>
        </p>
      </header>

      <nav className="tabs">
        <button
          className={tab === "inventario" ? "active" : ""}
          onClick={() => setTab("inventario")}
        >
          Inventario y ventas
        </button>
        <button
          className={tab === "pagos" ? "active" : ""}
          onClick={() => setTab("pagos")}
        >
          Pagos
        </button>
        <button
          className={tab === "presupuesto" ? "active" : ""}
          onClick={() => setTab("presupuesto")}
        >
          Presupuesto
        </button>
      </nav>

      {tab === "inventario" && (
        <section className="module">
          <h2>Inventario de apartamentos</h2>
          <div className="metrics">
            <article className="metric">
              <strong>Total unidades</strong>
              <span>{resumenInventario.total}</span>
            </article>
            <article className="metric">
              <strong>Disponibles</strong>
              <span>{resumenInventario.disponibles}</span>
            </article>
            <article className="metric">
              <strong>En proceso (reservadas)</strong>
              <span>{resumenInventario.enProceso}</span>
            </article>
            <article className="metric">
              <strong>Vendidas/escrituradas</strong>
              <span>
                {resumenInventario.vendidos} ({resumenInventario.porcentajeVendido.toFixed(1)}%)
              </span>
            </article>
          </div>

          <div className="card form-grid">
            <input
              placeholder="Filtrar proyecto"
              value={filtrosInventario.proyecto}
              onChange={(e) =>
                setFiltrosInventario({ ...filtrosInventario, proyecto: e.target.value })
              }
            />
            <input
              placeholder="Filtrar torre"
              value={filtrosInventario.torre}
              onChange={(e) =>
                setFiltrosInventario({ ...filtrosInventario, torre: e.target.value })
              }
            />
            <input
              placeholder="Filtrar piso"
              value={filtrosInventario.piso}
              onChange={(e) =>
                setFiltrosInventario({ ...filtrosInventario, piso: e.target.value })
              }
            />
            <select
              value={filtrosInventario.estado}
              onChange={(e) =>
                setFiltrosInventario({ ...filtrosInventario, estado: e.target.value })
              }
            >
              <option value="">Todos los estados</option>
              <option>Disponible</option>
              <option>Reservado</option>
              <option>Vendido</option>
              <option>Escriturado</option>
            </select>
          </div>

          <form className="card form-grid" onSubmit={crearApartamento}>
            <input
              placeholder="Proyecto"
              value={formApto.proyecto}
              onChange={(e) => setFormApto({ ...formApto, proyecto: e.target.value })}
              required
            />
            <input
              placeholder="Torre"
              value={formApto.torre}
              onChange={(e) => setFormApto({ ...formApto, torre: e.target.value })}
              required
            />
            <input
              placeholder="Número apto"
              value={formApto.numero}
              onChange={(e) => setFormApto({ ...formApto, numero: e.target.value })}
              required
            />
            <input
              type="number"
              placeholder="Piso"
              value={formApto.piso}
              onChange={(e) => setFormApto({ ...formApto, piso: e.target.value })}
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Área m²"
              value={formApto.area_m2}
              onChange={(e) => setFormApto({ ...formApto, area_m2: e.target.value })}
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Precio base"
              value={formApto.precio}
              onChange={(e) => setFormApto({ ...formApto, precio: e.target.value })}
              required
            />
            <button type="submit">Agregar apartamento</button>
          </form>

          <div className="three-cols">
            <form className="card form-grid" onSubmit={crearVenta}>
              <h3>Registrar venta</h3>
              <select
                value={formVenta.apartamento_id}
                onChange={(e) =>
                  setFormVenta({ ...formVenta, apartamento_id: e.target.value })
                }
                required
              >
                <option value="">Apartamento disponible</option>
                {disponibles.map((apt) => (
                  <option key={apt.id} value={apt.id}>
                    {apt.proyecto} - {apt.torre}-{apt.numero}
                  </option>
                ))}
              </select>
              <input
                placeholder="Nombre cliente"
                value={formVenta.cliente_nombre}
                onChange={(e) =>
                  setFormVenta({ ...formVenta, cliente_nombre: e.target.value })
                }
                required
              />
              <input
                placeholder="Documento"
                value={formVenta.cliente_documento}
                onChange={(e) =>
                  setFormVenta({ ...formVenta, cliente_documento: e.target.value })
                }
                required
              />
              <input
                placeholder="Teléfono"
                value={formVenta.cliente_telefono}
                onChange={(e) =>
                  setFormVenta({ ...formVenta, cliente_telefono: e.target.value })
                }
                required
              />
              <input
                type="email"
                placeholder="Correo"
                value={formVenta.cliente_correo}
                onChange={(e) =>
                  setFormVenta({ ...formVenta, cliente_correo: e.target.value })
                }
                required
              />
              <input
                type="number"
                placeholder="Precio pactado"
                value={formVenta.precio_pactado}
                onChange={(e) =>
                  setFormVenta({ ...formVenta, precio_pactado: e.target.value })
                }
                required
              />
              <input
                placeholder="Acabados elegidos"
                value={formVenta.acabados_elegidos}
                onChange={(e) =>
                  setFormVenta({ ...formVenta, acabados_elegidos: e.target.value })
                }
              />
              <input
                type="date"
                value={formVenta.fecha_firma}
                onChange={(e) =>
                  setFormVenta({ ...formVenta, fecha_firma: e.target.value })
                }
                required
              />
              <button type="submit">Guardar venta</button>
            </form>

            <form className="card form-grid" onSubmit={crearReserva}>
              <h3>Registrar reserva</h3>
              <select
                value={formReserva.apartamento_id}
                onChange={(e) =>
                  setFormReserva({ ...formReserva, apartamento_id: e.target.value })
                }
                required
              >
                <option value="">Apartamento disponible</option>
                {disponibles.map((apt) => (
                  <option key={apt.id} value={apt.id}>
                    {apt.proyecto} - {apt.torre}-{apt.numero}
                  </option>
                ))}
              </select>
              <input
                placeholder="Prospecto"
                value={formReserva.prospecto_nombre}
                onChange={(e) =>
                  setFormReserva({ ...formReserva, prospecto_nombre: e.target.value })
                }
                required
              />
              <input
                type="date"
                value={formReserva.fecha_vencimiento}
                onChange={(e) =>
                  setFormReserva({ ...formReserva, fecha_vencimiento: e.target.value })
                }
                required
              />
              <button type="submit">Guardar reserva</button>
            </form>

            <form className="card form-grid" onSubmit={convertirReservaVenta}>
              <h3>Convertir reserva a venta</h3>
              <select
                value={formVentaReserva.reserva_id}
                onChange={(e) =>
                  setFormVentaReserva({ ...formVentaReserva, reserva_id: e.target.value })
                }
                required
              >
                <option value="">Reserva activa</option>
                {reservasActivas.map((apt) => (
                  <option key={apt.reserva_id} value={apt.reserva_id}>
                    {apt.proyecto} - {apt.torre}-{apt.numero} ({apt.prospecto_nombre})
                  </option>
                ))}
              </select>
              <input
                placeholder="Nombre cliente"
                value={formVentaReserva.cliente_nombre}
                onChange={(e) =>
                  setFormVentaReserva({
                    ...formVentaReserva,
                    cliente_nombre: e.target.value,
                  })
                }
                required
              />
              <input
                placeholder="Documento"
                value={formVentaReserva.cliente_documento}
                onChange={(e) =>
                  setFormVentaReserva({
                    ...formVentaReserva,
                    cliente_documento: e.target.value,
                  })
                }
                required
              />
              <input
                placeholder="Teléfono"
                value={formVentaReserva.cliente_telefono}
                onChange={(e) =>
                  setFormVentaReserva({
                    ...formVentaReserva,
                    cliente_telefono: e.target.value,
                  })
                }
                required
              />
              <input
                type="email"
                placeholder="Correo"
                value={formVentaReserva.cliente_correo}
                onChange={(e) =>
                  setFormVentaReserva({
                    ...formVentaReserva,
                    cliente_correo: e.target.value,
                  })
                }
                required
              />
              <input
                type="number"
                placeholder="Precio pactado"
                value={formVentaReserva.precio_pactado}
                onChange={(e) =>
                  setFormVentaReserva({
                    ...formVentaReserva,
                    precio_pactado: e.target.value,
                  })
                }
                required
              />
              <input
                type="date"
                value={formVentaReserva.fecha_firma}
                onChange={(e) =>
                  setFormVentaReserva({ ...formVentaReserva, fecha_firma: e.target.value })
                }
                required
              />
              <button type="submit">Convertir a venta</button>
            </form>
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Torre</th>
                  <th>Apto</th>
                  <th>Piso</th>
                  <th>Área</th>
                  <th>Precio</th>
                  <th>Estado</th>
                  <th>Reserva</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {apartamentos.map((a) => (
                  <tr key={a.id}>
                    <td>{a.proyecto}</td>
                    <td>{a.torre}</td>
                    <td>{a.numero}</td>
                    <td>{a.piso}</td>
                    <td>{Number(a.area_m2).toLocaleString("es-CO")} m²</td>
                    <td>${Number(a.precio).toLocaleString("es-CO")}</td>
                    <td>{a.estado}</td>
                    <td>
                      {a.prospecto_nombre
                        ? `${a.prospecto_nombre} (${Number(a.dias_reserva || 0)} días)`
                        : "-"}
                    </td>
                    <td>
                      {a.reserva_id ? (
                        <button
                          className="btn-danger"
                          onClick={() => cancelarReserva(a.reserva_id)}
                        >
                          Cancelar reserva
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "pagos" && (
        <section className="module">
          <h2>Seguimiento de pagos</h2>

          <form className="card form-grid" onSubmit={crearPago}>
            <select
              value={formPago.venta_id}
              onChange={(e) => setFormPago({ ...formPago, venta_id: e.target.value })}
              required
            >
              <option value="">Cliente / apartamento</option>
              {ventas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.cliente_nombre} - {v.apartamento_ref}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="N° cuota"
              value={formPago.cuota_numero}
              onChange={(e) => setFormPago({ ...formPago, cuota_numero: e.target.value })}
              required
            />
            <input
              type="date"
              value={formPago.fecha_vencimiento}
              onChange={(e) =>
                setFormPago({ ...formPago, fecha_vencimiento: e.target.value })
              }
              required
            />
            <input
              type="number"
              placeholder="Monto"
              value={formPago.valor}
              onChange={(e) => setFormPago({ ...formPago, valor: e.target.value })}
              required
            />
            <select
              value={formPago.estado}
              onChange={(e) => setFormPago({ ...formPago, estado: e.target.value })}
            >
              <option>Pendiente</option>
              <option>Pagado</option>
            </select>
            <input
              placeholder="Método pago"
              value={formPago.metodo_pago}
              onChange={(e) => setFormPago({ ...formPago, metodo_pago: e.target.value })}
            />
            <input
              type="date"
              value={formPago.fecha_pago}
              onChange={(e) => setFormPago({ ...formPago, fecha_pago: e.target.value })}
            />
            <input
              placeholder="Notas"
              value={formPago.notas}
              onChange={(e) => setFormPago({ ...formPago, notas: e.target.value })}
            />
            <button type="submit">Registrar cuota/pago</button>
          </form>

          <div className="card form-grid">
            <input
              placeholder="Filtrar proyecto"
              value={filtrosPagos.proyecto}
              onChange={(e) =>
                setFiltrosPagos({ ...filtrosPagos, proyecto: e.target.value })
              }
            />
            <select
              value={filtrosPagos.estado_global}
              onChange={(e) =>
                setFiltrosPagos({ ...filtrosPagos, estado_global: e.target.value })
              }
            >
              <option value="">Todos</option>
              <option>Al día</option>
              <option>Con pendientes</option>
              <option>Vencido</option>
            </select>
            <button onClick={exportarPagos}>Exportar reporte (CSV)</button>
          </div>

          <div className="card">
            <h3>Estado global por cliente</h3>
            <table>
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Cliente</th>
                  <th>Apartamento</th>
                  <th>Estado global</th>
                  <th>Saldo pendiente</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {resumenClientes.map((c) => (
                  <tr
                    key={c.venta_id}
                    className={c.estado_global === "Vencido" ? "row-danger" : ""}
                  >
                    <td>{c.proyecto}</td>
                    <td>{c.cliente_nombre}</td>
                    <td>{c.apartamento_ref}</td>
                    <td>{c.estado_global}</td>
                    <td>${Number(c.saldo_total).toLocaleString("es-CO")}</td>
                    <td>
                      <button
                        onClick={() => {
                          setSelectedVentaId(c.venta_id);
                          loadDetalleCliente(c.venta_id).catch((e) => alert(e.message));
                        }}
                      >
                        Ver cuotas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Detalle de cuotas del cliente seleccionado</h3>
            <table>
              <thead>
                <tr>
                  <th>Cuota</th>
                  <th>Vencimiento</th>
                  <th>Valor</th>
                  <th>Estado</th>
                  <th>Método</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {detalleCliente.map((p) => (
                  <tr key={p.id} className={p.estado === "Vencido" ? "row-danger" : ""}>
                    <td>{p.cuota_numero}</td>
                    <td>{String(p.fecha_vencimiento).slice(0, 10)}</td>
                    <td>${Number(p.valor).toLocaleString("es-CO")}</td>
                    <td>{p.estado}</td>
                    <td>{p.metodo_pago || "-"}</td>
                    <td>
                      <select
                        value={p.estado}
                        onChange={(e) => actualizarEstadoPago(p.id, e.target.value)}
                      >
                        <option>Pendiente</option>
                        <option>Pagado</option>
                        <option>Vencido</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "presupuesto" && (
        <section className="module">
          <h2>Control presupuestal</h2>
          <div className="metrics">
            <article className="metric">
              <strong>Total presupuestado</strong>
              <span>${totalPresupuestado.toLocaleString("es-CO")}</span>
            </article>
            <article className="metric">
              <strong>Total ejecutado</strong>
              <span>${totalEjecutado.toLocaleString("es-CO")}</span>
            </article>
            <article className="metric">
              <strong>Variación</strong>
              <span>${totalVariacion.toLocaleString("es-CO")}</span>
            </article>
          </div>

          <form className="card form-grid" onSubmit={crearRubro}>
            <input
              placeholder="Proyecto"
              value={formRubro.proyecto}
              onChange={(e) => setFormRubro({ ...formRubro, proyecto: e.target.value })}
              required
            />
            <input
              placeholder="Rubro"
              value={formRubro.rubro}
              onChange={(e) => setFormRubro({ ...formRubro, rubro: e.target.value })}
              required
            />
            <input
              type="number"
              placeholder="Valor presupuestado"
              value={formRubro.valor_presupuestado}
              onChange={(e) =>
                setFormRubro({ ...formRubro, valor_presupuestado: e.target.value })
              }
              required
            />
            <button type="submit">Crear rubro</button>
          </form>

          {editingRubro && (
            <form className="card form-grid" onSubmit={editarRubro}>
              <h3>Editar rubro (solo si no tiene gastos)</h3>
              <input
                value={editingRubro.proyecto}
                onChange={(e) =>
                  setEditingRubro({ ...editingRubro, proyecto: e.target.value })
                }
                required
              />
              <input
                value={editingRubro.rubro}
                onChange={(e) =>
                  setEditingRubro({ ...editingRubro, rubro: e.target.value })
                }
                required
              />
              <input
                type="number"
                value={editingRubro.valor_presupuestado}
                onChange={(e) =>
                  setEditingRubro({
                    ...editingRubro,
                    valor_presupuestado: e.target.value,
                  })
                }
                required
              />
              <button type="submit">Guardar cambios</button>
              <button type="button" className="btn-muted" onClick={() => setEditingRubro(null)}>
                Cancelar
              </button>
            </form>
          )}

          <form className="card form-grid" onSubmit={registrarGasto}>
            <select
              value={formGasto.presupuesto_item_id}
              onChange={(e) =>
                setFormGasto({ ...formGasto, presupuesto_item_id: e.target.value })
              }
              required
            >
              <option value="">Rubro</option>
              {presupuesto.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.proyecto} - {r.rubro}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={formGasto.fecha}
              onChange={(e) => setFormGasto({ ...formGasto, fecha: e.target.value })}
              required
            />
            <input
              type="number"
              placeholder="Monto"
              value={formGasto.valor}
              onChange={(e) => setFormGasto({ ...formGasto, valor: e.target.value })}
              required
            />
            <input
              placeholder="Proveedor"
              value={formGasto.proveedor}
              onChange={(e) => setFormGasto({ ...formGasto, proveedor: e.target.value })}
            />
            <input
              placeholder="Referencia (factura/contrato)"
              value={formGasto.referencia}
              onChange={(e) => setFormGasto({ ...formGasto, referencia: e.target.value })}
            />
            <input
              placeholder="Descripción"
              value={formGasto.descripcion}
              onChange={(e) => setFormGasto({ ...formGasto, descripcion: e.target.value })}
            />
            <button type="submit">Registrar gasto</button>
          </form>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Rubro</th>
                  <th>Presupuestado</th>
                  <th>Ejecutado</th>
                  <th>Variación</th>
                  <th>% Ejecución</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {presupuesto.map((r) => (
                  <tr key={r.id} className={Number(r.alerta_desviacion) ? "row-danger" : ""}>
                    <td>{r.proyecto}</td>
                    <td>{r.rubro}</td>
                    <td>${Number(r.valor_presupuestado).toLocaleString("es-CO")}</td>
                    <td>${Number(r.valor_ejecutado).toLocaleString("es-CO")}</td>
                    <td>${Number(r.variacion).toLocaleString("es-CO")}</td>
                    <td>{Number(r.porcentaje_ejecucion).toFixed(2)}%</td>
                    <td>
                      <button className="btn-muted" onClick={() => setEditingRubro(r)}>
                        Editar
                      </button>{" "}
                      <button className="btn-danger" onClick={() => eliminarRubro(r.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
