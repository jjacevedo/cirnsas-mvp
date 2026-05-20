import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    window.localStorage?.clear?.();
    vi.restoreAllMocks();
  });

  it("muestra pantalla de login cuando no hay sesión", () => {
    render(<App />);
    expect(screen.getByText("Ingreso al sistema CIRNSAS")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Correo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Contraseña")).toBeInTheDocument();
  });

  it("muestra pestaña de auditoría en la navegación autenticada", async () => {
    window.localStorage.setItem("cirnsas_token", "token123");
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/auth/me")) {
        return {
          ok: true,
          json: async () => ({
            user: {
              id: 1,
              nombre: "Administrador CIRNSAS",
              correo: "admin@cirnsas.com",
              rol: "Administrador",
            },
          }),
        };
      }
      return { ok: true, json: async () => [] };
    });

    render(<App />);
    expect(await screen.findByText("Auditoría")).toBeInTheDocument();
  });
});
