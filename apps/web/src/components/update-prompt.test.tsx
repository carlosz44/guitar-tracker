import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { es } from "@/i18n/es";
import { UpdatePrompt } from "./update-prompt";

const updateServiceWorker = vi.fn();
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [true, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}));

describe("UpdatePrompt", () => {
  it("offers “Nueva versión disponible · Actualizar” and updates on tap", async () => {
    render(
      <>
        <Toaster />
        <UpdatePrompt />
      </>,
    );
    expect(await screen.findByText(es.pwa.updateAvailable)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: es.pwa.update }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
