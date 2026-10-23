/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { WorkOrderSelect } from "../components/ui/WorkOrderSelect";

describe("SearchableSelect & WorkOrderSelect Component", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const mockOptions = [
    { value: "wo-1", label: "WO #6034 · Apex Pipe", sublabel: "ASTM A106 · 48.3×3.68mm" },
    { value: "wo-2", label: "WO #6307 · Global Energy", sublabel: "API 5L · 60.3×4.5mm" },
  ];

  it("opens dropdown popover on trigger button click without sm:hidden suppressing desktop view", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <SearchableSelect
        value=""
        onChange={handleChange}
        options={mockOptions}
        placeholder="Select Work Order..."
      />
    );

    // Initial state: closed
    expect(screen.queryByRole("listbox")).toBeNull();

    // Click trigger button
    const trigger = screen.getByRole("button", { name: /Select Work Order\.\.\./i });
    fireEvent.click(trigger);

    // Dropdown listbox should now be visible in DOM
    const listbox = screen.getByRole("listbox");
    expect(listbox).not.toBeNull();

    // Verify popover container does NOT contain 'sm:hidden' (which was causing desktop invisibility)
    const popoverContainer = listbox.closest("div[style*='z-index']");
    expect(popoverContainer).not.toBeNull();
    expect(popoverContainer?.className).not.toContain("sm:hidden");
    expect(popoverContainer?.className).toContain("sm:absolute");
    expect(popoverContainer?.className).toContain("sm:top-full");
  });

  it("filters options when typing into the search input and selects an option", () => {
    const handleChange = vi.fn();
    render(
      <SearchableSelect
        value=""
        onChange={handleChange}
        options={mockOptions}
        placeholder="Select Work Order..."
      />
    );

    const trigger = screen.getByRole("button", { name: /Select Work Order\.\.\./i });
    fireEvent.click(trigger);

    // Type '6307' in search
    const searchInput = screen.getByPlaceholderText(/Type to search\.\.\./i);
    fireEvent.change(searchInput, { target: { value: "6307" } });

    // Should only show WO #6307
    expect(screen.getByText(/WO #6307 · Global Energy/i)).not.toBeNull();
    expect(screen.queryByText(/WO #6034 · Apex Pipe/i)).toBeNull();

    // Click the matching option
    fireEvent.click(screen.getByText(/WO #6307 · Global Energy/i));

    expect(handleChange).toHaveBeenCalledWith("wo-2");
  });

  it("WorkOrderSelect maps work orders and renders options properly", () => {
    const handleWoChange = vi.fn();
    const workOrders = [
      {
        id: "wo-101",
        work_order_no: "WO-7001",
        customer_name: "Chevron",
        grade: "A106-B",
        size_od: 60.3,
        size_wt: 5.54,
        avg_length: 6.0,
      },
    ];

    render(
      <WorkOrderSelect
        value=""
        onChange={handleWoChange}
        workOrders={workOrders}
        placeholder="Select Source Order..."
      />
    );

    const trigger = screen.getByRole("button", { name: /Select Source Order\.\.\./i });
    fireEvent.click(trigger);

    expect(screen.getByText(/WO-7001 · Chevron/i)).not.toBeNull();
    expect(screen.getByText(/A106-B · 60\.3×5\.54mm · 6m/i)).not.toBeNull();
  });
});
