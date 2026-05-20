import { useEffect, useMemo, useState } from "react";

const API_URL = "http://localhost:4000/api";

const initialApto = {
  proyecto: "",
  torre: "",
  numero: "",
  piso: "",
  area_m2: "",
  precio: "",
  estado: "Disponible",
};

const initialPago = {
  cliente_nombre: "",
  apartamento_ref: "",
  cuota_numero: "",
  fecha_vencimiento: "",
  valor: "",
  estado: "Pendiente",
};

const initialRubro = {
  proyecto: "",
  rubro: "",
  valor_presupuestado: "",
};

const initialGasto = {
  presupuesto_item_id: "",
  fecha: "",
  valor: "",
  descripcion: "",
};

function App() {
  const [tab, setTab] = useState("inventario");
  const [apartamentos, setApartamentos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [presupuesto, setPresupuesto] = useState([]);

  const [formApto, setFormApto] = useState(initialApto);
  const [formPago, setFormPago] = useState(initialPago);
  const [formRubro, setFormRubro] = useState(initialRubro);
  const [formGasto, setFormGasto] = useState(initialGasto);

  async function api(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Error al consultar la API");
    }
    return response.json();
  }

  async function loadApartamentos() {
    setApartamentos(await api("/apartamentos"));
  }

  async function loadPagos() {
    setPagos(await api("/pagos"));
  }

  async function loadPresupuesto() {
    setPresupuesto(await api("/presupuesto/resumen"));
  }

  async function loadAll() {
    await Promise.all([loadApartamentos(), loadPagos(), loadPresupuesto()]);
  }

  useEffect(() => {
    loadAll().catch((err) => alert(err.message));
  }, []);

  const totalPresupuestado = useMemo(
    () =>
      presupuesto.reduce((acc, curr) => acc + Number(curr.valor_presupuestado), 0),
    [presupuesto]
  );

  const totalEjecutado = useMemo(
    () => presupuesto.reduce((acc, curr) => acc + Number(curr.valor_ejecutado), 0),
    [presupuesto]
  );

  const totalPendiente = totalPresupuestado - totalEjecutado;

  async function crearApartamento(e) {
    e.preventDefault();
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
    await loadApartamentos();
  }

  async function cambiarEstadoApartamento(id, estado) {
    await api(`/apartamentos/${id}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ estado }),
    });
    await loadApartamentos();
  }

  async function crearPago(e) {
    e.preventDefault();
    await api("/pagos", {
      method: "POST",
      body: JSON.stringify({
        ...formPago,
        cuota_numero: Number(formPago.cuota_numero),
        valor: Number(formPago.valor),
      }),
    });
    setFormPago(initialPago);
    await loadPagos();
  }

  async function actualizarEstadoPago(id, estado) {
    const payload = { estado };
    if (estado === "Pagado") {
      payload.fecha_pago = new Date().toISOString().slice(0, 10);
    }
    await api(`/pagos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    await loadPagos();
  }

  async function crearRubro(e) {
    e.preventDefault();
    await api("/presupuesto/items", {
      method: "POST",
      body: JSON.stringify({
        ...formRubro,
        valor_presupuestado: Number(formRubro.valor_presupuestado),
      }),
    });
    setFormRubro(initialRubro);
    await loadPresupuesto();
  }

  async function registrarGasto(e) {
    e.preventDefault();
    await api("/presupuesto/gastos", {
      method: "POST",
      body: JSON.stringify({
        ...formGasto,
        presupuesto_item_id: Number(formGasto.presupuesto_item_id),
        valor: Number(formGasto.valor),
      }),
    });
    setFormGasto(initialGasto);
    await loadPresupuesto();
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>SGI CIRNSAS - MVP</h1>
        <p>Inventario de aptos, pagos y control presupuestal</p>
      </header>

      <nav className="tabs">
        <button
          className={tab === "inventario" ? "active" : ""}
          onClick={() => setTab("inventario")}
        >
          Inventario
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
          <h2>Gestión de venta e inventario de apartamentos</h2>
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
              placeholder="N° apto"
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
              placeholder="Área m2"
              value={formApto.area_m2}
              onChange={(e) => setFormApto({ ...formApto, area_m2: e.target.value })}
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Precio"
              value={formApto.precio}
              onChange={(e) => setFormApto({ ...formApto, precio: e.target.value })}
              required
            />
            <button type="submit">Agregar apartamento</button>
          </form>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Proyecto</th>
                  <th>Torre</th>
                  <th>Apto</th>
                  <th>Área</th>
                  <th>Precio</th>
                  <th>Estado</th>
                  <th>Actualizar</th>
                </tr>
              </thead>
              <tbody>
                {apartamentos.map((a) => (
                  <tr key={a.id}>
                    <td>{a.proyecto}</td>
                    <td>{a.torre}</td>
                    <td>{a.numero}</td>
                    <td>{Number(a.area_m2).toLocaleString("es-CO")} m2</td>
                    <td>${Number(a.precio).toLocaleString("es-CO")}</td>
                    <td>{a.estado}</td>
                    <td>
                      <select
                        value={a.estado}
                        onChange={(e) => cambiarEstadoApartamento(a.id, e.target.value)}
                      >
                        <option>Disponible</option>
                        <option>Reservado</option>
                        <option>En promesa de compra</option>
                        <option>Escriturado</option>
                      </select>
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
          <h2>Seguimiento de pagos por cliente</h2>
          <form className="card form-grid" onSubmit={crearPago}>
            <input
              placeholder="Cliente"
              value={formPago.cliente_nombre}
              onChange={(e) =>
                setFormPago({ ...formPago, cliente_nombre: e.target.value })
              }
              required
            />
            <input
              placeholder="Referencia apto (ej. TorreA-302)"
              value={formPago.apartamento_ref}
              onChange={(e) =>
                setFormPago({ ...formPago, apartamento_ref: e.target.value })
              }
              required
            />
            <input
              type="number"
              placeholder="N° cuota"
              value={formPago.cuota_numero}
              onChange={(e) =>
                setFormPago({ ...formPago, cuota_numero: e.target.value })
              }
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
              placeholder="Valor cuota"
              value={formPago.valor}
              onChange={(e) => setFormPago({ ...formPago, valor: e.target.value })}
              required
            />
            <button type="submit">Agregar cuota</button>
          </form>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Apto</th>
                  <th>Cuota</th>
                  <th>Vence</th>
                  <th>Valor</th>
                  <th>Estado</th>
                  <th>Actualizar</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.cliente_nombre}</td>
                    <td>{p.apartamento_ref}</td>
                    <td>{p.cuota_numero}</td>
                    <td>{p.fecha_vencimiento?.slice(0, 10)}</td>
                    <td>${Number(p.valor).toLocaleString("es-CO")}</td>
                    <td>{p.estado}</td>
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
          <h2>Control presupuestal de obra</h2>
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
              <strong>Variación acumulada</strong>
              <span>${totalPendiente.toLocaleString("es-CO")}</span>
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
              placeholder="Rubro (estructura, acabados...)"
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
            <button type="submit">Agregar rubro</button>
          </form>

          <form className="card form-grid" onSubmit={registrarGasto}>
            <select
              value={formGasto.presupuesto_item_id}
              onChange={(e) =>
                setFormGasto({ ...formGasto, presupuesto_item_id: e.target.value })
              }
              required
            >
              <option value="">Selecciona rubro</option>
              {presupuesto.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.proyecto} - {item.rubro}
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
              placeholder="Valor gasto"
              value={formGasto.valor}
              onChange={(e) => setFormGasto({ ...formGasto, valor: e.target.value })}
              required
            />
            <input
              placeholder="Descripción"
              value={formGasto.descripcion}
              onChange={(e) =>
                setFormGasto({ ...formGasto, descripcion: e.target.value })
              }
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
                </tr>
              </thead>
              <tbody>
                {presupuesto.map((item) => (
                  <tr key={item.id}>
                    <td>{item.proyecto}</td>
                    <td>{item.rubro}</td>
                    <td>${Number(item.valor_presupuestado).toLocaleString("es-CO")}</td>
                    <td>${Number(item.valor_ejecutado).toLocaleString("es-CO")}</td>
                    <td>${Number(item.variacion).toLocaleString("es-CO")}</td>
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
