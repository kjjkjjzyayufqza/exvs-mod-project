# Paste this entire script into Blender's Scripting workspace and run it.
# Tested for Blender 3.x / 4.x with Principled BSDF.
#
# Asset layout (flat folder):
#   SK_T_NEX_A_A001.fbx
#   MI_T_NEX_A001_Black.mat   -> Diffuse / Normal / Other[0] texture names
#   TX_T_NEX_A_A001_C_8.png   -> color
#   TX_T_NEX_A_A001_N_8.png   -> normal
#   TX_T_NEX_A_A001_M_8.png   -> mask (roughness/metallic packed)

import os
import bpy

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ASSET_DIR = r"D:\densha_research\resources\models\NEX"

# Set to None to import every .fbx in ASSET_DIR, or pick one file name.
IMPORT_FBX = None  # e.g. "SK_T_NEX_A_A001.fbx"

# If True, import FBX before mapping. If False, only remap materials on the current scene.
DO_IMPORT_FBX = True

# Flip normal-map green channel (DirectX -> OpenGL). Turn off if normals look inverted.
FLIP_NORMAL_Y = True

# M-map channel wiring (common packed mask: R=metallic, G=roughness, B=AO)
M_MAP_METALLIC_CHANNEL = "RED"
M_MAP_ROUGHNESS_CHANNEL = "GREEN"

# Glass / placeholder texture names from .mat files
SKIP_TEXTURE_PREFIXES = ("Field",)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SLOT_KEYS = {
    "Diffuse": "base_color",
    "Normal": "normal",
    "Emissive": "emission",
    "Opacity": "alpha",
    "Other[0]": "mask",
    "Other[1]": "other1",
    "Other[2]": "other2",
    "Other[3]": "other3",
    "Other[4]": "other4",
}


def log(msg: str) -> None:
    print(f"[NEX-FBX] {msg}")


def normalize_material_name(name: str) -> str:
    base = name.split(".", 1)[0]
    return base.strip()


def parse_mat_file(path: str) -> dict[str, str]:
    slots: dict[str, str] = {}
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or "=" not in line:
                continue
            key, value = line.split("=", 1)
            slots[key.strip()] = value.strip()
    return slots


def load_mat_library(asset_dir: str) -> dict[str, dict[str, str]]:
    library: dict[str, dict[str, str]] = {}
    for entry in os.listdir(asset_dir):
        if not entry.lower().endswith(".mat"):
            continue
        mat_name = os.path.splitext(entry)[0]
        library[mat_name] = parse_mat_file(os.path.join(asset_dir, entry))
        library[mat_name.lower()] = library[mat_name]
    return library


def should_skip_texture(tex_name: str | None) -> bool:
    if not tex_name:
        return True
    return any(tex_name.startswith(prefix) for prefix in SKIP_TEXTURE_PREFIXES)


def find_texture_path(asset_dir: str, tex_name: str) -> str | None:
    if should_skip_texture(tex_name):
        return None
    for ext in (".png", ".PNG", ".dds", ".DDS", ".tga", ".TGA", ".jpg", ".jpeg"):
        candidate = os.path.join(asset_dir, tex_name + ext)
        if os.path.isfile(candidate):
            return candidate
    return None


def load_image(filepath: str):
    filename = os.path.basename(filepath)
    existing = bpy.data.images.get(filename)
    if existing is not None:
        existing.filepath = filepath
        existing.reload()
        return existing
    image = bpy.data.images.load(filepath, check_existing=True)
    image.name = filename
    return image


def ensure_nodes(material: bpy.types.Material) -> tuple:
    material.use_nodes = True
    tree = material.node_tree
    nodes = tree.nodes
    links = tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (500, 0)

    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (200, 0)
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    return tree, nodes, links, bsdf


def connect_normal(
    tree,
    nodes,
    links,
    bsdf,
    image,
    x: int = -500,
    y: int = -200,
):
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.image.colorspace_settings.name = "Non-Color"
    tex.location = (x, y)
    tex.label = "Normal"

    if FLIP_NORMAL_Y:
        sep = nodes.new("ShaderNodeSeparateColor")
        sep.location = (x + 220, y - 80)
        comb = nodes.new("ShaderNodeCombineColor")
        comb.location = (x + 440, y - 80)
        invert = nodes.new("ShaderNodeMath")
        invert.operation = "SUBTRACT"
        invert.inputs[0].default_value = 1.0
        invert.location = (x + 330, y - 160)

        links.new(tex.outputs["Color"], sep.inputs["Color"])
        links.new(sep.outputs["Red"], comb.inputs["Red"])
        links.new(sep.outputs["Green"], invert.inputs[1])
        links.new(invert.outputs["Value"], comb.inputs["Green"])
        links.new(sep.outputs["Blue"], comb.inputs["Blue"])
        color_out = comb.outputs["Color"]
    else:
        color_out = tex.outputs["Color"]

    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.location = (x + 660, y - 80)
    links.new(color_out, normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return tex


def bsdf_input(bsdf, *names: str):
    for name in names:
        if name in bsdf.inputs:
            return bsdf.inputs[name]
    raise KeyError(f"None of {names} found on Principled BSDF")


def connect_color(
    nodes,
    links,
    bsdf,
    image,
    x: int,
    y: int,
    *socket_names: str,
    non_color: bool = False,
):
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    if non_color:
        tex.image.colorspace_settings.name = "Non-Color"
    else:
        tex.image.colorspace_settings.name = "sRGB"
    tex.location = (x, y)
    links.new(tex.outputs["Color"], bsdf_input(bsdf, *socket_names))
    return tex


def connect_mask_map(tree, nodes, links, bsdf, image, x: int = -500, y: int = -500):
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.image.colorspace_settings.name = "Non-Color"
    tex.location = (x, y)
    tex.label = "Mask_M"

    sep = nodes.new("ShaderNodeSeparateColor")
    sep.location = (x + 220, y)
    links.new(tex.outputs["Color"], sep.inputs["Color"])

    channel_map = {
        "RED": sep.outputs["Red"],
        "GREEN": sep.outputs["Green"],
        "BLUE": sep.outputs["Blue"],
    }
    if M_MAP_METALLIC_CHANNEL in channel_map:
        links.new(channel_map[M_MAP_METALLIC_CHANNEL], bsdf_input(bsdf, "Metallic"))
    if M_MAP_ROUGHNESS_CHANNEL in channel_map:
        links.new(channel_map[M_MAP_ROUGHNESS_CHANNEL], bsdf_input(bsdf, "Roughness"))
    return tex


def resolve_mat_slots(mat_name: str, library: dict[str, dict[str, str]]) -> dict[str, str] | None:
    candidates = [
        mat_name,
        mat_name.lower(),
        normalize_material_name(mat_name),
        normalize_material_name(mat_name).lower(),
    ]
    for candidate in candidates:
        if candidate in library:
            return library[candidate]
    return None


def apply_slots_to_material(
    material: bpy.types.Material,
    slots: dict[str, str],
    asset_dir: str,
) -> list[str]:
    applied: list[str] = []
    tree, nodes, links, bsdf = ensure_nodes(material)

    is_glass = "Glass" in material.name or slots.get("Diffuse", "").startswith("Field")
    if is_glass:
        bsdf_input(bsdf, "Transmission Weight", "Transmission").default_value = 1.0
        bsdf_input(bsdf, "Roughness").default_value = 0.05
        bsdf_input(bsdf, "Base Color").default_value = (0.8, 0.9, 1.0, 1.0)
        bsdf_input(bsdf, "Alpha").default_value = 0.15
        material.blend_method = "BLEND"
        material.shadow_method = "NONE"
        applied.append("glass-fallback")
        return applied

    y_cursor = 200
    for slot_key, role in SLOT_KEYS.items():
        tex_name = slots.get(slot_key)
        if not tex_name:
            continue
        tex_path = find_texture_path(asset_dir, tex_name)
        if not tex_path:
            continue

        image = load_image(tex_path)
        if role == "base_color":
            connect_color(nodes, links, bsdf, image, -500, y_cursor, "Base Color")
            applied.append(f"BaseColor<= {tex_name}")
        elif role == "normal":
            connect_normal(tree, nodes, links, bsdf, image, -500, y_cursor - 250)
            applied.append(f"Normal<= {tex_name}")
        elif role == "emission":
            connect_color(nodes, links, bsdf, image, -500, y_cursor - 500, "Emission Color", "Emission")
            emission_strength = bsdf.inputs.get("Emission Strength")
            if emission_strength is not None:
                emission_strength.default_value = 1.0
            applied.append(f"Emission<= {tex_name}")
        elif role == "alpha":
            connect_color(nodes, links, bsdf, image, -500, y_cursor - 650, "Alpha", non_color=True)
            material.blend_method = "BLEND"
            applied.append(f"Alpha<= {tex_name}")
        elif role == "mask":
            connect_mask_map(tree, nodes, links, bsdf, image, -500, y_cursor - 900)
            applied.append(f"Mask<= {tex_name}")
        y_cursor -= 40

    return applied


def import_fbx_files(asset_dir: str, import_name: str | None) -> list[str]:
    imported: list[str] = []
    if import_name:
        targets = [import_name]
    else:
        targets = sorted(
            name for name in os.listdir(asset_dir) if name.lower().endswith(".fbx")
        )

    for name in targets:
        path = os.path.join(asset_dir, name)
        if not os.path.isfile(path):
            log(f"FBX not found: {path}")
            continue
        bpy.ops.import_scene.fbx(
            filepath=path,
            automatic_bone_orientation=False,
            use_image_search=False,
        )
        imported.append(name)
        log(f"Imported FBX: {name}")
    return imported


def remap_scene_materials(asset_dir: str) -> None:
    library = load_mat_library(asset_dir)
    if not library:
        raise RuntimeError(f"No .mat files found in {asset_dir}")

    matched = 0
    missing = 0
    for material in bpy.data.materials:
        if material.users == 0:
            continue
        slots = resolve_mat_slots(material.name, library)
        if slots is None:
            missing += 1
            log(f"No .mat match for Blender material: {material.name}")
            continue
        applied = apply_slots_to_material(material, slots, asset_dir)
        matched += 1
        log(f"{material.name}: {', '.join(applied) if applied else 'no local textures found'}")

    log(f"Done. Matched {matched} material(s), unmatched {missing}.")


def main() -> None:
    if not os.path.isdir(ASSET_DIR):
        raise RuntimeError(f"ASSET_DIR does not exist: {ASSET_DIR}")

    if DO_IMPORT_FBX:
        import_fbx_files(ASSET_DIR, IMPORT_FBX)

    remap_scene_materials(ASSET_DIR)


if __name__ == "__main__":
    main()
