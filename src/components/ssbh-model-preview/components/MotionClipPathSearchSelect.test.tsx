import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MotionClipPathSearchSelect } from "./MotionClipPathSearchSelect";

const PACK = "E:/XB/mod/003motion/017gyakch_006newhws_001";

const PATHS = [
  `${PACK}/0/0/001hito_000common_000common_001_20headgrab_stk_air_bk.nuanmb`,
  `${PACK}/0/0/10/001hito_017gyakch_006newhws_001_exatk11a_sht_air_fr.nuanmb`,
  `${PACK}/0/0/10/736newhwssld_017gyakch_006newhws_001_hmshield00_exatk11a_sht_air_fr.nuanmb`,
];

const ACTIVE = PATHS[1]!;

describe("MotionClipPathSearchSelect", () => {
  it("shows the full file name plus its folder", () => {
    render(<MotionClipPathSearchSelect paths={PATHS} value={ACTIVE} onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent(
      "001hito_017gyakch_006newhws_001_exatk11a_sht_air_fr.nuanmb",
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("0/0/10");
  });

  it("lists action folders and picks a clip from the expanded folder", () => {
    const onChange = vi.fn();
    render(<MotionClipPathSearchSelect paths={PATHS} value={ACTIVE} onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("button", { name: "0/0/10, 2 clips" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "0/0, 1 clips" }));
    fireEvent.click(
      screen.getByRole("option", {
        name: "001hito_000common_000common_001_20headgrab_stk_air_bk.nuanmb",
      }),
    );
    expect(onChange).toHaveBeenCalledWith(PATHS[0]);
  });

  it("does not scroll back to the selected clip when another folder is opened", () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const { rerender } = render(
        <MotionClipPathSearchSelect paths={PATHS} value={ACTIVE} onChange={() => {}} />,
      );
      fireEvent.click(screen.getByRole("combobox"));
      scrollIntoView.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "0/0, 1 clips" }));
      expect(screen.getByRole("button", { name: "0/0, 1 clips" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(scrollIntoView).not.toHaveBeenCalled();

      rerender(
        <MotionClipPathSearchSelect paths={[...PATHS]} value={ACTIVE} onChange={() => {}} />,
      );
      expect(screen.getByRole("button", { name: "0/0, 1 clips" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(
        screen.getByRole("option", {
          name: "001hito_000common_000common_001_20headgrab_stk_air_bk.nuanmb",
        }),
      ).toBeInTheDocument();
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});
