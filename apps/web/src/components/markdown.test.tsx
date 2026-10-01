import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("renders lists, emphasis and headings", () => {
    const { container } = render(
      <Markdown>{"## Tríadas\n\n- **Cuerdas 1–3**\n- Corcheas"}</Markdown>,
    );
    expect(container.querySelector("h2")?.textContent).toBe("Tríadas");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("Cuerdas 1–3");
  });

  it("never renders raw HTML or script links", () => {
    const { container } = render(
      <Markdown>
        {'<img src=x onerror="alert(1)"> [clic](javascript:alert(1)) <script>alert(1)</script>'}
      </Markdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toContain("javascript");
  });
});
