import { categoryLetter } from "@/services/triadRoute/types";

/** The shipped naming rule: `000triad_battle_<cat><NNN>_<MMM>`. */
export function officialSceneName(
  category: number,
  courseNumber: number,
  stageNumber: number,
): string {
  const letter = (categoryLetter(category) ?? "A").toLowerCase();
  const course = String(Math.max(1, courseNumber)).padStart(3, "0");
  const stage = String(Math.max(1, stageNumber)).padStart(3, "0");
  return `000triad_battle_${letter}${course}_${stage}`;
}

export type ParsedTriadSceneName = {
  letter: string;
  courseNumber: number;
  stageNumber: number;
};

/** Read the category letter and course/stage numbers out of an official scene name. */
export function parseTriadSceneName(name: string | null | undefined): ParsedTriadSceneName | null {
  if (!name) return null;
  const match = /^000triad_battle_([a-f])(\d{3})_(\d{3})(?:_r\d+)?$/i.exec(name.trim());
  if (!match) return null;
  return {
    letter: match[1].toLowerCase(),
    courseNumber: Number(match[2]),
    stageNumber: Number(match[3]),
  };
}
