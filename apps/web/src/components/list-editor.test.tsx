import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/es";
import { ListEditor } from "./list-editor";

function Harness({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ListEditor value={value} onChange={setValue} />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}

describe("ListEditor", () => {
  it("AC-1: adds, edits and removes practice points", async () => {
    render(<Harness initial={["Tríadas"]} />);
    await userEvent.click(screen.getByRole("button", { name: es.list.add }));
    await userEvent.type(screen.getByLabelText(es.list.item(2)), "Arpegios");
    await userEvent.click(screen.getByRole("button", { name: es.list.remove(1) }));
    expect(screen.getByRole("status").textContent).toBe('["Arpegios"]');
  });
});
