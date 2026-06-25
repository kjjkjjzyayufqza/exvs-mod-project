export interface MscStableActionEvidence {
  actionHashHex: string;
  actionIndexHex: string | null;
  callbackName: string;
  requestedSlots: string[];
  legacyWorkingName?: string;
  legacyComment?: string;
}

export interface MscStableSlotCallbackEvidence {
  slotHex: string;
  callbackName: string;
  referencedByActionHashes: string[];
}

export interface MscStableWeaponBindingEvidence {
  slotHex: string;
  armsEntryHashHex: string;
  ownerCallbackName: string;
  label?: string;
}

export interface MscStableResourceBindingEvidence {
  registryKindHex: string;
  slotHex: string;
  resourceValueHex: string;
}

export interface MscOrphanActionFunctionEvidence {
  functionName: string;
  requestedSlots: string[];
  resourceValues: string[];
  notes: string;
}

export interface MscStableOverlayEvidence {
  actions: MscStableActionEvidence[];
  slotCallbacks: MscStableSlotCallbackEvidence[];
  weaponBindings: MscStableWeaponBindingEvidence[];
  resourceBindings: MscStableResourceBindingEvidence[];
  orphanActionFunctions: MscOrphanActionFunctionEvidence[];
}
