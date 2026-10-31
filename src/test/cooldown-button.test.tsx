import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CooldownButton } from "@/components/cooldown-button";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Button cooldown", () => {
  it("blocks repeated presses and reappears after exactly three seconds", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    render(<CooldownButton onClick={action}>Copy</CooldownButton>);
    const button = screen.getByRole("button", { name: "Copy" });
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveClass("invisible");
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(2999); });
    expect(button).toBeDisabled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveClass("invisible");
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("keeps other buttons usable during a button's three-second pause", () => {
    vi.useFakeTimers();
    render(<><CooldownButton>Rain</CooldownButton><CooldownButton>None</CooldownButton></>);
    fireEvent.click(screen.getByRole("button", { name: "Rain" }));
    expect(screen.getByRole("button", { name: "None" })).not.toBeDisabled();
  });
});