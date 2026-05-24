import type { LucideIcon } from "lucide-react";
import {
  Archive,
  FileCode,
  Files,
  List,
  Map,
  Package,
  Settings,
  UserCog,
  Wrench,
} from "lucide-react";

export type HomeModuleCategory = "pipeline" | "editing" | "scene" | "dev" | "system";

export type HomeModule = {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  category: HomeModuleCategory;
  description: string;
  keywords: string[];
};

export const HOME_MODULE_CATEGORIES: Record<
  HomeModuleCategory,
  { label: string; description: string }
> = {
  pipeline: {
    label: "Asset Pipeline",
    description: "Extract and repack FHM2D game archives",
  },
  editing: {
    label: "Unit & Files",
    description: "Character data, file tables, and unit browsing",
  },
  scene: {
    label: "Scene",
    description: "Stage layout, objects, and placement editing",
  },
  dev: {
    label: "Development",
    description: "MSC workspace, models, and parameter editors",
  },
  system: {
    label: "System",
    description: "Configuration and utility tools",
  },
};

export const HOME_MODULES: HomeModule[] = [
  {
    id: "extract",
    title: "Extract",
    url: "/Extract",
    icon: Archive,
    category: "pipeline",
    description: "Unpack FHM2D archives into editable asset folders.",
    keywords: ["fhm2d", "unpack", "archive", "extract"],
  },
  {
    id: "repack",
    title: "Repack",
    url: "/Repack",
    icon: Package,
    category: "pipeline",
    description: "Build repack projects and merge modified assets back.",
    keywords: ["pack", "repack", "template", "bundle"],
  },
  {
    id: "unit-edit",
    title: "Unit Edit",
    url: "/UnitEdit",
    icon: UserCog,
    category: "editing",
    description: "Edit unit parameters, stats, and character definitions.",
    keywords: ["unit", "character", "stats", "param"],
  },
  {
    id: "files-edit",
    title: "Files Edit",
    url: "/FilesEdit",
    icon: Files,
    category: "editing",
    description: "Browse and edit structured game file tables.",
    keywords: ["files", "table", "json", "data"],
  },
  {
    id: "unit-list",
    title: "Unit List",
    url: "/UnitList",
    icon: List,
    category: "editing",
    description: "Search and inspect the full unit roster.",
    keywords: ["list", "roster", "search", "browse"],
  },
  {
    id: "scene-edit",
    title: "Scene Edit",
    url: "/SceneEdit",
    icon: Map,
    category: "scene",
    description: "Edit stage scenes, object placement, and textures.",
    keywords: ["scene", "stage", "map", "placement", "3d"],
  },
  {
    id: "test-editor",
    title: "Test Editor",
    url: "/TestEditor",
    icon: FileCode,
    category: "dev",
    description: "MSC scripts, SSBH models, and param editor workspace.",
    keywords: ["msc", "script", "ssbh", "model", "test"],
  },
  {
    id: "misc-tools",
    title: "Misc Tools",
    url: "/MiscTools",
    icon: Wrench,
    category: "system",
    description: "Image tools, NUMATB editor, FBX rename, and more.",
    keywords: ["utility", "image", "nutexb", "numatb", "fbx"],
  },
  {
    id: "config",
    title: "Config",
    url: "/Config",
    icon: Settings,
    category: "system",
    description: "Game paths, cache folders, and global app settings.",
    keywords: ["settings", "path", "config", "cache"],
  },
];

export const WORKFLOW_STEPS = [
  {
    step: 1,
    title: "Configure paths",
    description: "Set OB cache, mod folder, and extract output in Config.",
    url: "/Config",
  },
  {
    step: 2,
    title: "Extract assets",
    description: "Unpack FHM2D archives to a working directory.",
    url: "/Extract",
  },
  {
    step: 3,
    title: "Edit content",
    description: "Use editors for units, scenes, scripts, or models.",
    url: "/TestEditor",
  },
  {
    step: 4,
    title: "Repack & deploy",
    description: "Merge changes and repack for in-game testing.",
    url: "/Repack",
  },
] as const;
