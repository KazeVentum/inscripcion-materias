// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { avance } from "@/lib/fixtures";
import { AvanceSemestre } from "./AvanceSemestre";

afterEach(cleanup);

describe("AvanceSemestre", () => {
  it("muestra el mensaje y 'Faltan x de y' sin abrir la lista", () => {
    render(<AvanceSemestre avance={avance} />);
    expect(screen.getByText(avance.mensaje)).toBeTruthy();
    expect(screen.getByText("Faltan 3 de 5")).toBeTruthy();
    expect(screen.queryByText("Bases de Datos")).toBeNull();
  });

  it("una barra de segmentos: uno por materia, tantos llenos como inscritas", () => {
    render(<AvanceSemestre avance={avance} />);
    const seg = screen.getByTestId("avance-segmentos").children;
    expect(seg).toHaveLength(5);
    expect([...seg].filter((s) => s.className.includes("bg-seat-free"))).toHaveLength(2);
  });

  it("al tocarla lista cada materia con su estado en texto", () => {
    render(<AvanceSemestre avance={avance} />);
    fireEvent.click(screen.getByRole("button", { name: /Te faltan 3 materias/ }));
    expect(screen.getAllByText("Inscrita")).toHaveLength(2);
    expect(screen.getByText("Puedes inscribirla")).toBeTruthy();
    expect(screen.getByText("Falta un prerrequisito")).toBeTruthy();
    expect(screen.getByText("Sin grupos por ahora")).toBeTruthy();
  });

  it("las atrasadas van colapsadas hasta tocar su encabezado", () => {
    render(<AvanceSemestre avance={avance} abierto />);
    expect(screen.queryByText("Sistemas Operativos")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /De semestres anteriores \(1\)/ }));
    expect(screen.getByText("Sistemas Operativos")).toBeTruthy();
  });

  it("sin pendientes no muestra cifras ni barra", () => {
    render(
      <AvanceSemestre
        avance={{
          ...avance,
          totalPendientes: 0,
          inscritas: 0,
          faltan: 0,
          materias: [],
          atrasadas: [],
          mensaje: "Nada pendiente.",
        }}
        abierto
      />,
    );
    expect(screen.queryByText(/Faltan/)).toBeNull();
    expect(screen.queryByTestId("avance-segmentos")).toBeNull();
    expect(screen.getByText(/No hay materias obligatorias pendientes/)).toBeTruthy();
  });
});
