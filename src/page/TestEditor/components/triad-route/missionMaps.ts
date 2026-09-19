/**
 * Map hashes a mission script can pass to `sys_0(0x40e, ...)`.
 *
 * Transcribed from the in-repo research notes
 * (docs/mission-research/exvs2-ob-triad-mission-architecture.md and the
 * attached in-game notes). The list is known to be incomplete, so it drives
 * the picker but is deliberately not used as a validation whitelist: a hash
 * that is missing here is unproven, not wrong.
 */

export interface MissionMapOption {
  hash: number;
  /** Japanese name as it appears in game. */
  name: string;
  /** Short English label for the picker. */
  label: string;
}

export const MISSION_MAPS: readonly MissionMapOption[] = Object.freeze([
  { hash: 0xfe67f4f9, name: "サイド7", label: "Side 7" },
  { hash: 0x3e9fbd53, name: "ミンスリー", label: "Minsry colony" },
  { hash: 0x6539cbf8, name: "メーティス", label: "Metis" },
  { hash: 0xc5bda687, name: "ギアナ高地", label: "Guiana Highlands" },
  { hash: 0x08beae86, name: "廃棄コロニー", label: "Derelict colony" },
  { hash: 0x641e2846, name: "ランタオ島", label: "Lantau Island" },
  { hash: 0x04620c93, name: "ニュー・ホンコン", label: "New Hong Kong" },
  { hash: 0xf2bb56ec, name: "丘隆地帯", label: "Ridge belt" },
  { hash: 0x5ee38886, name: "アーモリー・ワン", label: "Armory One" },
  { hash: 0x2b18fa06, name: "ニュータイプ研究所", label: "Newtype lab" },
  { hash: 0xa4e661ec, name: "トリントン基地周辺", label: "Torrington base" },
  { hash: 0x32431f46, name: "アクシズ", label: "Axis" },
  { hash: 0xa83ac3f9, name: "ギガフロート", label: "Gigafloat" },
  { hash: 0x68c28a53, name: "REBIRTH", label: "Rebirth" },
  { hash: 0xc846e72c, name: "農業プラント", label: "Agricultural plant" },
  { hash: 0x523f3b93, name: "丘陵地帯", label: "Hills" },
  { hash: 0xc49a4539, name: "キャピタル・テリトリィ", label: "Capital Territory" },
  { hash: 0x4b64ded3, name: "アフリカ砂漠", label: "African desert" },
  { hash: 0x9232a61d, name: "training", label: "Training" },
]);

export function missionMapLabel(hash: number): string | null {
  const found = MISSION_MAPS.find((map) => map.hash === (hash >>> 0));
  return found ? `${found.label} / ${found.name}` : null;
}
