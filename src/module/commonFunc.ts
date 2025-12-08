import textIndexJson from "../../tools/text_index.json";
import { Buffer } from 'buffer';
interface Item {
  type: string;
  unk1: string;
  fileIndex: number;
  unk2: string;
  unk3: number;
}

interface Folder {
  type: string;
  unk1: string;
  folderCount: number;
  unk2: string;
  unk3: number;
}

interface EndMark {
  type: string;
  endMarkCount: number;
}

type Entry = Item | Folder | EndMark;

export function generateFileStructure(data: Entry[]): string {
  let result = "";

  const stack: { name: string; count: number }[] = [];
  let currentIndex = -1;

  data.forEach((entry) => {
    if (entry.type === "Folder") {
      currentIndex++;
      const folder = entry as Folder;
      const folderName = `Folder${currentIndex}`;
      const folderCount = folder.folderCount;
      stack.push({ name: folderName, count: folderCount });
    } else if (entry.type === "Item") {
      const item = entry as Item;
      const folderName = stack[stack.length - 1].name;
      const fileIndex = item.fileIndex;
      result += `- Item ${fileIndex} (File: ${folderName}/${fileIndex}.bin)\n`;
    } else if (entry.type === "EndMark") {
      const endMark = entry as EndMark;
      const endMarkCount = endMark.endMarkCount;
      result += `- EndMark (endMarkCount: ${endMarkCount})\n`;
      for (let i = 0; i < endMarkCount; i++) {
        stack.pop();
      }
    }
  });

  return result;
}

export function findNutexbString(data: Uint8Array): string | null {
  const preFix = new TextEncoder().encode("46XT");
  const dataLength = data.length;
  const searchLength = preFix.length;
  let foundOffset = null
  for (let i = 0; i <= dataLength - searchLength; i++) {
    let found = true;
    for (let j = 0; j < searchLength; j++) {
      if (data[i + j] !== preFix[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      foundOffset = i;
      break;
    }
  }

  //read string to end when data not equal 0x00
  if (foundOffset !== null) {
    let stringEnd = foundOffset + searchLength;
    while (stringEnd < dataLength && data[stringEnd] !== 0x00) {
      stringEnd++;
    }
    const stringData = data.slice(foundOffset, stringEnd);
    const str = new TextDecoder().decode(stringData);
    return str.replace("46XT", "");
  }
  return null;
}

export type HexCharMapping = Record<string, string>;

type CompiledEntry = { bytes: number[]; char: string };
type CompiledMapping = {
	firstByteToEntries: Map<number, CompiledEntry[]>;
	maxByteLength: number;
};

const defaultHexCharMapping: HexCharMapping = textIndexJson as HexCharMapping;
let cachedCompiledDefault: CompiledMapping | null = null;

function compileHexMapping(mapping: HexCharMapping): CompiledMapping {
	const firstByteToEntries = new Map<number, CompiledEntry[]>();
	let maxByteLength = 0;

	for (const [hexKeyRaw, charValue] of Object.entries(mapping)) {
		const hexKey = hexKeyRaw.trim().toUpperCase();
		if (hexKey.length === 0 || hexKey.length % 2 !== 0) {
			continue;
		}
		const bytes: number[] = [];
		for (let i = 0; i < hexKey.length; i += 2) {
			bytes.push(parseInt(hexKey.slice(i, i + 2), 16));
		}
		if (bytes.length === 0) {
			continue;
		}
		const first = bytes[0]!
		const entry: CompiledEntry = { bytes, char: charValue };
		if (!firstByteToEntries.has(first)) {
			firstByteToEntries.set(first, []);
		}
		firstByteToEntries.get(first)!.push(entry);
		if (bytes.length > maxByteLength) {
			maxByteLength = bytes.length;
		}
	}

	for (const list of firstByteToEntries.values()) {
		list.sort((a, b) => b.bytes.length - a.bytes.length);
	}

	return { firstByteToEntries, maxByteLength };
}

function getCompiledDefault(): CompiledMapping {
	if (!cachedCompiledDefault) {
		cachedCompiledDefault = compileHexMapping(defaultHexCharMapping);
	}
	return cachedCompiledDefault;
}

export function decodeBufferWithMapping(
	data: Uint8Array,
	mapping?: HexCharMapping
): string {
	const view = data;
	const compiled = mapping ? compileHexMapping(mapping) : getCompiledDefault();
	let offset = 0;
	let result = "";

	while (offset < view.length) {
		const byte = view[offset]!;
		if (byte === 0x00) {
			break;
		}
		const candidates = compiled.firstByteToEntries.get(byte);
		let matched = false;
		if (candidates && candidates.length > 0) {
			for (const entry of candidates) {
				const bytes = entry.bytes;
				if (offset + bytes.length > view.length) {
					continue;
				}
				let ok = true;
				for (let i = 0; i < bytes.length; i++) {
					if (view[offset + i] !== bytes[i]) {
						ok = false;
						break;
					}
				}
				if (ok) {
					result += entry.char;
					offset += bytes.length;
					matched = true;
					break;
				}
			}
		}
		if (!matched) {
			// No mapping matched; consume one byte to avoid infinite loop
			result += "?";
			offset += 1;
		}
	}

	return result;
}

export function decodeBufferWithTextIndexMapping(data: Uint8Array): string {
	return decodeBufferWithMapping(data, undefined);
}

/**
 * Deep clone a CharacterDataOB object with a new character ID
 * @param character - The character to clone
 * @param newCharacterId - The new character ID
 * @param bufferData - The source buffer data
 * @returns A new CharacterDataOB instance
 */
export function cloneCharacterDataOB(
	character: any,
	newCharacterId: number,
	bufferData: Buffer,
	newCharacterUniqueId?: number
): any {
	// Helper function to deep clone StringNameData
	const cloneStringNameData = (stringData: any): any => {
		if (!stringData || !stringData.StringBufferData) {
			return {
				Offset: 0,
				StringBufferData: Buffer.alloc(1, 0) // Default empty buffer with null terminator
			};
		}
		// Create a deep copy of the buffer
		const newBuffer = Buffer.alloc(stringData.StringBufferData.length);
		stringData.StringBufferData.copy(newBuffer);
		return {
			Offset: stringData.Offset,
			StringBufferData: newBuffer
		};
	};
	
	// Create a new character object with all the same properties
	const clonedCharacter = {
		CharacterId: newCharacterId,
		indexInSeries: character.indexInSeries,
		UnkId1: character.UnkId1,
		UnkId2: character.UnkId2,
		UnkId3: character.UnkId3,
		ms_igh_r: character.ms_igh_r,
		ms_vs_r: character.ms_vs_r,
		UnkHash1: character.UnkHash1,
		CharacterNameOffset: cloneStringNameData(character.CharacterNameOffset),
		UnkId4: character.UnkId4,
		UnkId5: character.UnkId5,
		UnkId6: character.UnkId6,
		UnkHash2: character.UnkHash2,
		ms_vs_l: character.ms_vs_l,
		UnkId7: character.UnkId7,
		UnkHash3: character.UnkHash3,
		UnkHash4: character.UnkHash4,
		UnkHash4_0: character.UnkHash4_0,
		UnkHash4_1: character.UnkHash4_1,
		UnkHash5: character.UnkHash5,
		UnkHash6: character.UnkHash6,
		UnkId8: character.UnkId8,
		UnkHash7: character.UnkHash7,
		sticker1: character.sticker1,
		UnkHash8: character.UnkHash8,
		UnkStringOffset1: cloneStringNameData(character.UnkStringOffset1),
		UnkHash9_1: character.UnkHash9_1,
		UnkHash9: character.UnkHash9,
		LMBPilotClothing: character.LMBPilotClothing,
		UnkStringOffset2: cloneStringNameData(character.UnkStringOffset2),
		UnkStringOffset3: cloneStringNameData(character.UnkStringOffset3),
		UnkStringOffset4: cloneStringNameData(character.UnkStringOffset4),
		UnkStringOffset5: cloneStringNameData(character.UnkStringOffset5),
		UnkStringOffset6: cloneStringNameData(character.UnkStringOffset6),
		UnkHash9_2: character.UnkHash9_2,
		EX_Pilot_Clothin_LMB_HASH: character.EX_Pilot_Clothin_LMB_HASH,
		UnkHash10: character.UnkHash10,
		UnkStringOffset7: cloneStringNameData(character.UnkStringOffset7),
		UnkStringOffset8: cloneStringNameData(character.UnkStringOffset8),
		UnkHash10_1: character.UnkHash10_1,
		UnkHash11: character.UnkHash11,
		vs_p_r_c02: character.vs_p_r_c02,
		characterUniqueId: newCharacterUniqueId !== undefined ? newCharacterUniqueId : character.characterUniqueId,
		UnkHash12: character.UnkHash12,
		sticker_t01: character.sticker_t01,
		UnkHash13: character.UnkHash13,
		UnkHash14: character.UnkHash14,
		unkId10: character.unkId10,
		unkId11: character.unkId11,
		vs_p_l_c02: character.vs_p_l_c02,
		UnkHash14_1: character.UnkHash14_1,
		unkId12: character.unkId12,
		unkId12_1: character.unkId12_1,
		unkId13: character.unkId13,
		unkId14: character.unkId14,
		ms_tracker: character.ms_tracker,
		UnkHash15: character.UnkHash15,
		UnkHash15_1: character.UnkHash15_1,
		UnkHash16: character.UnkHash16,
		UnkHash17: character.UnkHash17,
		UnkHash17_1: character.UnkHash17_1,
		UnkHash18: character.UnkHash18,
		UnkStringOffset9: cloneStringNameData(character.UnkStringOffset9),
		UnkHash19: character.UnkHash19,
		MS_card_icon_index: character.MS_card_icon_index,
		UnkStringOffset10: cloneStringNameData(character.UnkStringOffset10),
		UnkHash20: character.UnkHash20,
		unkId15: character.unkId15,
		UnkHash21: character.UnkHash21,
		UnkStringOffset11: cloneStringNameData(character.UnkStringOffset11),
		LMBCutIn: character.LMBCutIn,
		sticker_t05: character.sticker_t05,
		SeriesId: character.SeriesId,
		UnkHash21_1: character.UnkHash21_1,
		UnkHash22: character.UnkHash22,
		UnkHash22_0: character.UnkHash22_0,
		UnkHash22_1: character.UnkHash22_1,
		ms_ms_l: character.ms_ms_l,
		vs_p_r: character.vs_p_r,
		UnkStringOffset12: cloneStringNameData(character.UnkStringOffset12),
		LMBBoost: character.LMBBoost,
		UnkHash23: character.UnkHash23,
		UnkStringOffset13: cloneStringNameData(character.UnkStringOffset13),
		rnk_m_l: character.rnk_m_l,
		unkId15_1: character.unkId15_1,
		ms_crs: character.ms_crs,
		UnkStringOffset14: cloneStringNameData(character.UnkStringOffset14),
		UnkHash23_1: character.UnkHash23_1,
		UnkHash24: character.UnkHash24,
		ms_ms_s: character.ms_ms_s,
		vs_p_l: character.vs_p_l,
		ms_mn: character.ms_mn,
		sc_p: character.sc_p,
		unkId16: character.unkId16
	};
	
	return clonedCharacter;
}

/**
 * Convert int32 to hex string with byte reversal for display
 * @param value - The int32 value
 * @returns Hex string formatted as "XX XX XX XX"
 */
export function int32ToHexDisplay(value: number): string {
  // Convert to unsigned 32-bit integer
  const unsigned = value >>> 0;
  
  // Convert to hex and pad to 8 characters
  const hex = unsigned.toString(16).toUpperCase().padStart(8, '0');
  
  // Reverse byte order and add spaces
  const bytes = [];
  for (let i = 6; i >= 0; i -= 2) {
    bytes.push(hex.substr(i, 2));
  }
  
  return bytes.join(' ');
}

/**
 * Convert hex display string to int32
 * @param hexDisplay - Hex string in format "XX XX XX XX" or "XXXXXXXX"
 * @returns The int32 value
 */
export function hexDisplayToInt32(hexDisplay: string): number {
  // Remove spaces and convert to uppercase
  const hex = hexDisplay.replace(/\s+/g, '').toUpperCase();
  
  // Validate hex string
  if (!/^[0-9A-F]{8}$/.test(hex)) {
    throw new Error('Invalid hex format. Expected 8 hex characters.');
  }
  
  // Reverse byte order
  const reversedHex = hex.substr(6, 2) + hex.substr(4, 2) + hex.substr(2, 2) + hex.substr(0, 2);
  
  // Convert to signed 32-bit integer
  const unsigned = parseInt(reversedHex, 16);
  return unsigned | 0; // Convert to signed 32-bit
}

/**
 * Validate hex input string
 * @param input - The input string to validate
 * @returns Object with isValid boolean and formatted string
 */
export function validateHexInput(input: string): { isValid: boolean; formatted: string; error?: string } {
  // Remove spaces and convert to uppercase
  const cleaned = input.replace(/\s+/g, '').toUpperCase();
  
  // Check if it's valid hex
  if (!/^[0-9A-F]*$/.test(cleaned)) {
    return { isValid: false, formatted: input, error: 'Only hex characters (0-9, A-F) are allowed' };
  }
  
  // Check length
  if (cleaned.length > 8) {
    return { isValid: false, formatted: input, error: 'Hex value cannot exceed 8 characters' };
  }
  
  // Format with spaces for display
  const formatted = cleaned.match(/.{1,2}/g)?.join(' ') || cleaned;
  
  return { 
    isValid: cleaned.length === 8, 
    formatted,
    error: cleaned.length !== 8 ? 'Hex value must be exactly 8 characters' : undefined
  };
}