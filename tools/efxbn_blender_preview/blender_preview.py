from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Render an EFXBN deterministic scene plan")
    parser.add_argument("--scene-plan", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--blend", required=True)
    parser.add_argument("--size", type=int, default=512)
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)


def configure_render(size: int, output: Path) -> None:
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.004, 0.006, 0.012, 1.0)
        background.inputs["Strength"].default_value = 0.08
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass


def to_blender_position(value: list[float] | tuple[float, ...]) -> tuple[float, float, float]:
    return (float(value[0]), float(value[2]), float(value[1]))


def finite_scale(value: Any, fallback: float = 0.2) -> float:
    try:
        parsed = abs(float(value))
    except (TypeError, ValueError):
        return fallback
    return min(1000.0, max(0.025, parsed)) if math.isfinite(parsed) else fallback


def safe_color(value: Any) -> tuple[float, float, float, float]:
    components = list(value) if isinstance(value, (list, tuple)) else []
    while len(components) < 4:
        components.append(1.0)
    rgb = [min(20.0, max(0.0, float(component))) for component in components[:3]]
    if max(rgb) < 0.02:
        rgb = [1.0, 0.22, 0.05]
    alpha = min(1.0, max(0.05, float(components[3])))
    return (rgb[0], rgb[1], rgb[2], alpha)


def make_emissive_material(
    name: str,
    color: tuple[float, float, float, float],
    texture_path: Path | None,
    uv_transform: dict[str, Any] | None,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    material.diffuse_color = color
    if hasattr(material, "surface_render_method"):
        try:
            material.surface_render_method = "DITHERED"
        except TypeError:
            pass
    elif hasattr(material, "blend_method"):
        material.blend_method = "BLEND"

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    emission.inputs["Strength"].default_value = 1.8
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs["Surface"])

    if texture_path and texture_path.is_file():
        image = bpy.data.images.load(str(texture_path), check_existing=True)
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        texcoord = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        transform = uv_transform or {}
        scale = transform.get("scale", [1.0, 1.0])
        offset = transform.get("offset", [0.0, 0.0])
        mapping.inputs["Scale"].default_value = (float(scale[0]), float(scale[1]), 1.0)
        mapping.inputs["Location"].default_value = (float(offset[0]), float(offset[1]), 0.0)
        links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
        tint = nodes.new("ShaderNodeMixRGB")
        tint.blend_type = "MULTIPLY"
        tint.inputs[0].default_value = 1.0
        tint.inputs[2].default_value = color
        links.new(texture.outputs["Color"], tint.inputs[1])
        links.new(tint.outputs[0], emission.inputs["Color"])
        alpha = nodes.new("ShaderNodeMath")
        alpha.operation = "MULTIPLY"
        alpha.inputs[1].default_value = color[3]
        links.new(texture.outputs["Alpha"], alpha.inputs[0])
        links.new(alpha.outputs[0], mix.inputs[0])
    else:
        emission.inputs["Color"].default_value = color
        mix.inputs[0].default_value = color[3]
    return material


def texture_for_effect(plan: dict[str, Any], effect_index: int) -> Path | None:
    for asset in plan.get("assets", {}).get("textures", []):
        if asset.get("ok") and effect_index in asset.get("effectIndices", []):
            path = Path(asset["outputPath"])
            if path.is_file():
                return path
    return None


def import_model_collections(plan: dict[str, Any]) -> dict[int, bpy.types.Collection]:
    collections: dict[int, bpy.types.Collection] = {}
    for asset in plan.get("assets", {}).get("models", []):
        if not asset.get("ok"):
            continue
        dae_path = Path(asset["outputPath"])
        if not dae_path.is_file():
            continue
        before = set(bpy.data.objects)
        try:
            bpy.ops.wm.collada_import(filepath=str(dae_path))
        except Exception as error:
            print(f"MODEL_IMPORT_WARNING {dae_path}: {error}")
            continue
        imported = [item for item in bpy.data.objects if item not in before]
        if not imported:
            continue
        collection = bpy.data.collections.new(f"Asset_{asset['id']}")
        for item in imported:
            for owner in list(item.users_collection):
                owner.objects.unlink(item)
            collection.objects.link(item)
        for effect_index in asset.get("effectIndices", []):
            collections[int(effect_index)] = collection
    return collections


def add_collection_instance(
    collection: bpy.types.Collection,
    particle: dict[str, Any],
    name: str,
) -> bpy.types.Object:
    instance = bpy.data.objects.new(name, None)
    instance.instance_type = "COLLECTION"
    instance.instance_collection = collection
    instance.location = to_blender_position(particle["position"])
    scale = particle.get("scale", [1.0, 1.0, 1.0])
    instance.scale = (
        finite_scale(scale[0], 1.0),
        finite_scale(scale[2], 1.0),
        finite_scale(scale[1], 1.0),
    )
    rotation = particle.get("rotationEuler", [0.0, 0.0, 0.0])
    instance.rotation_euler = (float(rotation[0]), float(rotation[2]), float(rotation[1]))
    bpy.context.scene.collection.objects.link(instance)
    return instance


def add_billboard(
    particle: dict[str, Any],
    group: dict[str, Any],
    camera: bpy.types.Object,
    texture_path: Path | None,
    sequence: int,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_plane_add(size=2.0, location=to_blender_position(particle["position"]))
    plane = bpy.context.object
    plane.name = f"Particle_{group['targetEffectIndex']}_{sequence:04d}"
    size = particle.get("size", [0.2, 0.2])
    plane.scale = (finite_scale(size[0]), finite_scale(size[1]), 1.0)
    direction = camera.location - plane.location
    if direction.length > 0.0001:
        plane.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    plane.rotation_euler.rotate_axis("Z", float(particle.get("rotation", 0.0)))
    material = make_emissive_material(
        f"ParticleMat_{group['targetEffectIndex']}_{sequence:04d}",
        safe_color(particle.get("color")),
        texture_path,
        particle.get("uvTransform"),
    )
    plane.data.materials.append(material)
    return plane


def add_strip(
    particle: dict[str, Any],
    group: dict[str, Any],
    texture_path: Path | None,
    sequence: int,
) -> bpy.types.Object | None:
    history = particle.get("history", [])
    if len(history) < 2:
        return None
    curve_data = bpy.data.curves.new(
        name=f"Strip_{group['targetEffectIndex']}_{sequence:04d}",
        type="CURVE",
    )
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 1
    size = particle.get("size", [0.1, 0.1])
    curve_data.bevel_depth = max(0.01, min(1.0, finite_scale(size[0]) * 0.15))
    curve_data.bevel_resolution = 2
    spline = curve_data.splines.new("POLY")
    spline.points.add(len(history) - 1)
    for point, position in zip(spline.points, history):
        converted = to_blender_position(position)
        point.co = (*converted, 1.0)
    curve_object = bpy.data.objects.new(curve_data.name, curve_data)
    bpy.context.scene.collection.objects.link(curve_object)
    curve_data.materials.append(
        make_emissive_material(
            f"StripMat_{group['targetEffectIndex']}_{sequence:04d}",
            safe_color(particle.get("color")),
            texture_path,
            particle.get("uvTransform"),
        )
    )
    return curve_object


def collect_positions(plan: dict[str, Any]) -> list[tuple[float, float, float]]:
    positions: list[tuple[float, float, float]] = []
    for group in plan.get("particleGroups", []):
        for particle in group.get("particles", []):
            positions.append(to_blender_position(particle["position"]))
            positions.extend(to_blender_position(point) for point in particle.get("history", []))
    return positions or [(0.0, 0.0, 0.0)]


def add_camera_and_lights(
    positions: list[tuple[float, float, float]],
) -> tuple[bpy.types.Object, tuple[float, float, float], float]:
    axes = list(zip(*positions))
    center = tuple((min(axis) + max(axis)) * 0.5 for axis in axes)
    span = max(max(axis) - min(axis) for axis in axes)
    radius = max(2.0, span * 0.65)
    distance = max(7.0, span * 2.2)
    bpy.ops.object.camera_add(location=(center[0] + distance, center[1] - distance, center[2] + distance * 0.65))
    camera = bpy.context.object
    camera.name = "PreviewCamera"
    direction = Vector(center) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 52
    camera.data.clip_start = 0.01
    camera.data.clip_end = max(1000.0, distance * 10.0)
    bpy.context.scene.camera = camera

    for name, location, energy, size in (
        ("Key", (center[0] + distance, center[1] - distance * 0.4, center[2] + distance), 900.0, 5.0),
        ("Fill", (center[0] - distance, center[1] - distance * 0.2, center[2] + distance * 0.3), 500.0, 4.0),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (Vector(center) - light.location).to_track_quat("-Z", "Y").to_euler()
    return camera, center, radius


def add_reference_floor(center: tuple[float, float, float], radius: float) -> None:
    bpy.ops.mesh.primitive_plane_add(size=radius * 8.0, location=(center[0], center[1], center[2] - radius))
    floor = bpy.context.object
    floor.name = "ReferenceFloor"
    material = bpy.data.materials.new("ReferenceFloorMaterial")
    material.diffuse_color = (0.012, 0.016, 0.025, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = material.diffuse_color
        principled.inputs["Roughness"].default_value = 0.85
    floor.data.materials.append(material)


def add_empty_fallback(center: tuple[float, float, float]) -> None:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.35, location=center)
    marker = bpy.context.object
    marker.name = "NoActiveParticlesMarker"
    marker.data.materials.append(make_emissive_material("FallbackMaterial", (1.0, 0.05, 0.2, 1.0), None, None))


def build_scene(plan: dict[str, Any]) -> int:
    model_collections = import_model_collections(plan)
    positions = collect_positions(plan)
    camera, center, radius = add_camera_and_lights(positions)
    add_reference_floor(center, radius)
    visual_count = 0
    used_model_effects: set[int] = set()
    for group in plan.get("particleGroups", []):
        effect_index = int(group["targetEffectIndex"])
        texture_path = texture_for_effect(plan, effect_index)
        model_collection = model_collections.get(effect_index)
        for sequence, particle in enumerate(group.get("particles", [])):
            if model_collection:
                add_collection_instance(model_collection, particle, f"ModelParticle_{effect_index}_{sequence:04d}")
                used_model_effects.add(effect_index)
            else:
                add_billboard(particle, group, camera, texture_path, sequence)
            if int(group.get("effectType", 0)) == 2:
                if add_strip(particle, group, texture_path, sequence):
                    visual_count += 1
            visual_count += 1
    for effect_index, collection in model_collections.items():
        if effect_index in used_model_effects:
            continue
        add_collection_instance(
            collection,
            {
                "position": [0.0, 0.0, 0.0],
                "scale": [1.0, 1.0, 1.0],
                "rotationEuler": [0.0, 0.0, 0.0],
            },
            f"StaticModel_{effect_index}",
        )
        visual_count += 1
    if visual_count == 0:
        add_empty_fallback(center)
        visual_count = 1
    return visual_count


def main() -> None:
    args = parse_args()
    scene_plan_path = Path(args.scene_plan).resolve()
    output_path = Path(args.output).resolve()
    blend_path = Path(args.blend).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    plan = json.loads(scene_plan_path.read_text(encoding="utf-8"))
    reset_scene()
    configure_render(max(128, min(2048, args.size)), output_path)
    visual_count = build_scene(plan)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    print(
        "EFXBN_RENDER_COMPLETE "
        + json.dumps(
            {
                "visualCount": visual_count,
                "output": str(output_path),
                "blend": str(blend_path),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
