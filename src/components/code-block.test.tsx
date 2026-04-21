import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CodeBlock } from "./code-block";

describe("CodeBlock copy button", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("writes the content to the clipboard and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<CodeBlock>hello world</CodeBlock>);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("hello world");
      expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
        "Copied",
      );
    });
    expect(screen.getByRole("status").textContent).toBe("Copied");
  });

  test("surfaces clipboard failures via aria-label and a live-region status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const writeText = vi
      .fn()
      .mockRejectedValue(new Error("NotAllowedError: blocked"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<CodeBlock>hello world</CodeBlock>);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
        "Copy failed — select manually",
      );
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Copy failed — select manually",
    );
  });
});
