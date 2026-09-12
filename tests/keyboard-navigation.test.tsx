import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import GlobalKeyboardNavigation from "../components/common/GlobalKeyboardNavigation";

// Mock next/navigation
let currentMockPath = "/production";
vi.mock("next/navigation", () => ({
  usePathname: () => currentMockPath,
}));

describe("GlobalKeyboardNavigation", () => {
  beforeEach(() => {
    currentMockPath = "/production";
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Enter advances focus to next input field (Enter as Tab behavior)", () => {
    document.body.innerHTML = `
      <form id="test-form">
        <input id="input1" type="text" />
        <input id="input2" type="text" />
        <input id="input3" type="text" />
      </form>
    `;

    render(<GlobalKeyboardNavigation />);

    const input1 = document.getElementById("input1") as HTMLInputElement;
    const input2 = document.getElementById("input2") as HTMLInputElement;

    input1.focus();
    expect(document.activeElement).toBe(input1);

    // Press Enter on input1
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    input1.dispatchEvent(enterEvent);

    expect(document.activeElement).toBe(input2);
  });

  it("Shift+Enter moves focus to previous input field", () => {
    document.body.innerHTML = `
      <form id="test-form">
        <input id="input1" type="text" />
        <input id="input2" type="text" />
      </form>
    `;

    render(<GlobalKeyboardNavigation />);

    const input1 = document.getElementById("input1") as HTMLInputElement;
    const input2 = document.getElementById("input2") as HTMLInputElement;

    input2.focus();
    expect(document.activeElement).toBe(input2);

    const shiftEnterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    input2.dispatchEvent(shiftEnterEvent);

    expect(document.activeElement).toBe(input1);
  });

  it("Ctrl+Enter triggers save / submit on active form", () => {
    document.body.innerHTML = `
      <form id="test-form">
        <input id="input1" type="text" />
        <button type="submit" id="submit-btn">Save</button>
      </form>
    `;

    render(<GlobalKeyboardNavigation />);

    const input1 = document.getElementById("input1") as HTMLInputElement;
    const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
    const clickSpy = vi.spyOn(submitBtn, "click");

    input1.focus();

    const ctrlEnterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input1.dispatchEvent(ctrlEnterEvent);

    expect(clickSpy).toHaveBeenCalled();
  });

  it("Bypasses keyboard interception on /login route", () => {
    currentMockPath = "/login";
    document.body.innerHTML = `
      <form id="login-form">
        <input id="username" type="text" />
        <input id="password" type="password" />
      </form>
    `;

    render(<GlobalKeyboardNavigation />);

    const username = document.getElementById("username") as HTMLInputElement;
    username.focus();

    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    username.dispatchEvent(enterEvent);

    // In login, Enter should not be intercepted or prevented
    expect(enterEvent.defaultPrevented).toBe(false);
  });
});
