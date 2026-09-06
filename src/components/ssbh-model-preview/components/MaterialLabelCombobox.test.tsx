import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MaterialLabelCombobox } from "./MaterialLabelCombobox";

describe("MaterialLabelCombobox", () => {
  const options = ["bodyMtl", "wingMtl", "headMtl"];

  it("shows the current value in the input", () => {
    render(<MaterialLabelCombobox value="bodyMtl" options={options} onChange={() => {}} />);
    expect(screen.getByDisplayValue("bodyMtl")).toBeInTheDocument();
  });

  it("shows every option on focus even when a value is already set", () => {
    render(<MaterialLabelCombobox value="bodyMtl" options={options} onChange={() => {}} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByText("wingMtl")).toBeInTheDocument();
    expect(screen.getByText("headMtl")).toBeInTheDocument();
  });

  it("selecting an option calls onChange with that label", () => {
    const onChange = vi.fn();
    render(<MaterialLabelCombobox value="" options={options} onChange={onChange} />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("wingMtl"));
    expect(onChange).toHaveBeenCalledWith("wingMtl");
  });

  it("offers a create-new row for a value not in the options", () => {
    const onChange = vi.fn();
    render(<MaterialLabelCombobox value="" options={options} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "newMtl" } });
    fireEvent.click(screen.getByText(/newMtl/));
    expect(onChange).toHaveBeenCalledWith("newMtl");
  });

  it("commits the typed value on Enter", () => {
    const onChange = vi.fn();
    render(<MaterialLabelCombobox value="" options={options} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "customMtl" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("customMtl");
  });

  it("commits a changed value on blur", () => {
    const onChange = vi.fn();
    render(<MaterialLabelCombobox value="bodyMtl" options={options} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "bodyMtl2" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("bodyMtl2");
  });

  it("does not commit on blur when the value is unchanged", () => {
    const onChange = vi.fn();
    render(<MaterialLabelCombobox value="bodyMtl" options={options} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lists shader presets and commits a typed override", () => {
    const onChange = vi.fn();
    render(
      <MaterialLabelCombobox
        value="vsngCharaBasic"
        options={["vsngCharaBasic", "FeStandard"]}
        i18nPrefix="shader"
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    expect(screen.getByText("FeStandard")).toBeInTheDocument();
    fireEvent.click(screen.getByText("FeStandard"));
    expect(onChange).toHaveBeenCalledWith("FeStandard");
    fireEvent.change(input, { target: { value: "vstgStandard_VertexColor" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("vstgStandard_VertexColor");
  });
});
