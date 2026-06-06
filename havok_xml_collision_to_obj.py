#!/usr/bin/env python3
"""Convert Havok tagfile XML compressed collision mesh data to OBJ.

This exporter targets hknpCompressedMeshShapeData/hkcdStaticMeshTree data like
33.xml. It reconstructs the actual collision mesh from packedVertices and
primitives. It does not export meshTree/section domains or any other AABB data
as geometry.
"""

from __future__ import annotations

import argparse
import math
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence


XY_BITS = 11
Z_BITS = 10
XY_MASK = (1 << XY_BITS) - 1
Z_MASK = (1 << Z_BITS) - 1


@dataclass(frozen=True)
class Section:
    codec_parms: tuple[float, float, float, float, float, float]
    first_packed_vertex_index: int
    first_shared_vertex_index: int
    first_primitive_index: int
    num_packed_vertices: int
    num_primitives: int


@dataclass(frozen=True)
class Bounds:
    min: tuple[float, float, float]
    max: tuple[float, float, float]


@dataclass(frozen=True)
class Primitive:
    indices: tuple[int, int, int, int]


@dataclass(frozen=True)
class MeshTreeSource:
    object_id: str
    mesh_tree: ET.Element


@dataclass(frozen=True)
class BodyInstance:
    name: str
    shape_id: str
    position: tuple[float, float, float]
    orientation: tuple[float, float, float, float]


@dataclass(frozen=True)
class CollisionMesh:
    vertices: list[tuple[float, float, float]]
    faces: list[tuple[int, int, int, int]]
    sections: list[Section]
    section_modes: list[str]
    section_ranges: list[tuple[int, int, int, int]]
    name: str


def direct_child(parent: ET.Element, tag: str) -> ET.Element | None:
    for child in parent:
        if child.tag == tag:
            return child
    return None


def direct_field(parent: ET.Element, name: str) -> ET.Element | None:
    for child in parent:
        if child.tag == "field" and child.get("name") == name:
            return child
    return None


def require_child(parent: ET.Element, tag: str, context: str) -> ET.Element:
    child = direct_child(parent, tag)
    if child is None:
        raise ValueError(f"{context}: missing <{tag}>")
    return child


def require_field(parent: ET.Element, name: str, context: str) -> ET.Element:
    field = direct_field(parent, name)
    if field is None:
        raise ValueError(f"{context}: missing field '{name}'")
    return field


def parse_integer_value(element: ET.Element, context: str) -> int:
    value = element.get("value")
    if value is None:
        raise ValueError(f"{context}: integer is missing value")
    return int(value, 0)


def parse_real_value(element: ET.Element, context: str) -> float:
    dec = element.get("dec")
    if dec is not None:
        return float(dec)
    value = element.get("value")
    if value is not None:
        return float(value)
    raise ValueError(f"{context}: real is missing dec/value")


def field_integer(record: ET.Element, name: str, context: str) -> int:
    field = require_field(record, name, context)
    integer = direct_child(field, "integer")
    if integer is None:
        raise ValueError(f"{context}.{name}: missing integer")
    return parse_integer_value(integer, f"{context}.{name}")


def field_real_array(record: ET.Element, name: str, context: str) -> list[float]:
    field = require_field(record, name, context)
    array = require_child(field, "array", f"{context}.{name}")
    values = [
        parse_real_value(real, f"{context}.{name}")
        for real in array
        if real.tag == "real"
    ]
    if not values:
        raise ValueError(f"{context}.{name}: no real values found")
    return values


def optional_field_real_array(record: ET.Element, name: str) -> list[float]:
    field = direct_field(record, name)
    if field is None:
        return []
    array = direct_child(field, "array")
    if array is None:
        return []
    return [
        parse_real_value(real, name)
        for real in array
        if real.tag == "real"
    ]


def field_integer_array(record: ET.Element, name: str, context: str) -> list[int]:
    field = require_field(record, name, context)
    array = require_child(field, "array", f"{context}.{name}")
    return [
        parse_integer_value(integer, f"{context}.{name}")
        for integer in array
        if integer.tag == "integer"
    ]


def field_pointer_id(record: ET.Element, name: str) -> str | None:
    field = direct_field(record, name)
    if field is None:
        return None
    pointer = direct_child(field, "pointer")
    if pointer is None:
        return None
    return pointer.get("id")


def field_string_value(record: ET.Element, name: str) -> str | None:
    field = direct_field(record, name)
    if field is None:
        return None
    string = direct_child(field, "string")
    if string is None:
        return None
    return string.get("value")


def collect_objects(root: ET.Element) -> dict[str, ET.Element]:
    objects: dict[str, ET.Element] = {}
    for obj in root.iter("object"):
        object_id = obj.get("id")
        record = direct_child(obj, "record")
        if object_id and record is not None:
            objects[object_id] = record
    return objects


def collect_mesh_tree_sources(objects: dict[str, ET.Element]) -> dict[str, MeshTreeSource]:
    sources: dict[str, MeshTreeSource] = {}
    for object_id, record in objects.items():
        mesh_tree_field = direct_field(record, "meshTree")
        if mesh_tree_field is None:
            continue
        mesh_tree = direct_child(mesh_tree_field, "record")
        if mesh_tree is not None and direct_field(mesh_tree, "packedVertices") is not None:
            sources[object_id] = MeshTreeSource(object_id=object_id, mesh_tree=mesh_tree)
    return sources


def collect_shape_data_links(objects: dict[str, ET.Element]) -> dict[str, str]:
    links: dict[str, str] = {}
    for object_id, record in objects.items():
        data_id = field_pointer_id(record, "data")
        if data_id is not None:
            links[object_id] = data_id
    return links


def collect_body_instances(root: ET.Element) -> list[BodyInstance]:
    instances: list[BodyInstance] = []
    for body_cinfos_field in root.iter("field"):
        if body_cinfos_field.get("name") != "bodyCinfos":
            continue
        array = direct_child(body_cinfos_field, "array")
        if array is None:
            continue
        for index, record in enumerate(child for child in array if child.tag == "record"):
            shape_id = field_pointer_id(record, "shape")
            if not shape_id or shape_id == "object0":
                continue
            position_values = optional_field_real_array(record, "position")
            orientation_values = optional_field_real_array(record, "orientation")
            position = tuple((position_values + [0.0, 0.0, 0.0])[:3])
            orientation = tuple((orientation_values + [0.0, 0.0, 0.0, 1.0])[:4])
            name = field_string_value(record, "name") or f"body_{index:03d}"
            instances.append(
                BodyInstance(
                    name=name,
                    shape_id=shape_id,
                    position=position,  # type: ignore[arg-type]
                    orientation=orientation,  # type: ignore[arg-type]
                )
            )
    return instances


def parse_sections(mesh_tree: ET.Element) -> list[Section]:
    sections_field = require_field(mesh_tree, "sections", "meshTree")
    sections_array = require_child(sections_field, "array", "meshTree.sections")
    sections: list[Section] = []

    for index, section_record in enumerate(
        child for child in sections_array if child.tag == "record"
    ):
        context = f"meshTree.sections[{index}]"
        codec_parms = field_real_array(section_record, "codecParms", context)
        if len(codec_parms) != 6:
            raise ValueError(f"{context}.codecParms: expected 6 values, got {len(codec_parms)}")

        sections.append(
            Section(
                codec_parms=tuple(codec_parms),  # type: ignore[arg-type]
                first_packed_vertex_index=field_integer(
                    section_record, "firstPackedVertexIndex", context
                ),
                first_shared_vertex_index=field_integer(
                    section_record, "firstSharedVertexIndex", context
                ),
                first_primitive_index=field_integer(
                    section_record, "firstPrimitiveIndex", context
                ),
                num_packed_vertices=field_integer(
                    section_record, "numPackedVertices", context
                ),
                num_primitives=field_integer(section_record, "numPrimitives", context),
            )
        )

    if not sections:
        raise ValueError("meshTree.sections: no section records found")
    return sections


def parse_primitives(mesh_tree: ET.Element) -> list[Primitive]:
    primitives_field = require_field(mesh_tree, "primitives", "meshTree")
    primitives_array = require_child(primitives_field, "array", "meshTree.primitives")
    primitives: list[Primitive] = []

    for index, primitive_record in enumerate(
        child for child in primitives_array if child.tag == "record"
    ):
        values = field_integer_array(
            primitive_record,
            "indices",
            f"meshTree.primitives[{index}]",
        )
        if len(values) != 4:
            raise ValueError(
                f"meshTree.primitives[{index}].indices: expected 4 values, got {len(values)}"
            )
        primitives.append(Primitive(indices=tuple(values)))  # type: ignore[arg-type]

    if not primitives:
        raise ValueError("meshTree.primitives: no primitive records found")
    return primitives


def parse_domain_bounds(mesh_tree: ET.Element) -> Bounds:
    domain_field = require_field(mesh_tree, "domain", "meshTree")
    domain_record = require_child(domain_field, "record", "meshTree.domain")
    min_values = field_real_array(domain_record, "min", "meshTree.domain")
    max_values = field_real_array(domain_record, "max", "meshTree.domain")
    if len(min_values) < 3 or len(max_values) < 3:
        raise ValueError("meshTree.domain: min/max must contain at least 3 values")
    return Bounds(
        min=(min_values[0], min_values[1], min_values[2]),
        max=(max_values[0], max_values[1], max_values[2]),
    )


def decode_packed_vertex(
    packed: int,
    codec_parms: Sequence[float],
) -> tuple[float, float, float]:
    x_code = packed & XY_MASK
    y_code = (packed >> XY_BITS) & XY_MASK
    z_code = (packed >> (XY_BITS * 2)) & Z_MASK
    return (
        codec_parms[0] + (x_code * codec_parms[3]),
        codec_parms[1] + (y_code * codec_parms[4]),
        codec_parms[2] + (z_code * codec_parms[5]),
    )


def decode_shared_vertex(packed: int, bounds: Bounds) -> tuple[float, float, float]:
    xy_max_code = (1 << 21) - 1
    z_max_code = (1 << 22) - 1
    x_code = packed & xy_max_code
    y_code = (packed >> 21) & xy_max_code
    z_code = (packed >> 42) & z_max_code

    def decode_axis(axis: int, code: int, max_code: int) -> float:
        return bounds.min[axis] + (
            code * (bounds.max[axis] - bounds.min[axis]) / max_code
        )

    return (
        decode_axis(0, x_code, xy_max_code),
        decode_axis(1, y_code, xy_max_code),
        decode_axis(2, z_code, z_max_code),
    )


def transform_vertex(
    vertex: tuple[float, float, float],
    position: tuple[float, float, float],
    orientation: tuple[float, float, float, float],
) -> tuple[float, float, float]:
    x, y, z = vertex
    qx, qy, qz, qw = orientation
    length_sq = qx * qx + qy * qy + qz * qz + qw * qw
    if length_sq <= 0.0:
        qx, qy, qz, qw = 0.0, 0.0, 0.0, 1.0
    else:
        inv_length = length_sq ** -0.5
        qx *= inv_length
        qy *= inv_length
        qz *= inv_length
        qw *= inv_length

    # Quaternion-vector multiplication: v' = v + 2w(q.xyz x v) + 2(q.xyz x (q.xyz x v)).
    tx = 2.0 * (qy * z - qz * y)
    ty = 2.0 * (qz * x - qx * z)
    tz = 2.0 * (qx * y - qy * x)
    rx = x + (qw * tx) + (qy * tz - qz * ty)
    ry = y + (qw * ty) + (qz * tx - qx * tz)
    rz = z + (qw * tz) + (qx * ty - qy * tx)
    return (rx + position[0], ry + position[1], rz + position[2])


def section_shared_count(section: Section, primitives: Sequence[Primitive]) -> int:
    shared_count = 0
    for primitive in primitives[
        section.first_primitive_index : section.first_primitive_index
        + section.num_primitives
    ]:
        shared_count = max(
            shared_count,
            max(
                (
                    index - section.num_packed_vertices + 1
                    for index in primitive.indices
                    if index >= section.num_packed_vertices
                ),
                default=0,
            ),
        )
    return shared_count


def decode_shared_vertex_for_mode(
    packed: int,
    mode: str,
    bounds: Bounds,
    codec_parms: Sequence[float],
) -> tuple[float, float, float]:
    if mode == "global21":
        return decode_shared_vertex(packed, bounds)
    if mode == "low32":
        return decode_packed_vertex(packed & 0xFFFFFFFF, codec_parms)
    if mode == "high32":
        return decode_packed_vertex((packed >> 32) & 0xFFFFFFFF, codec_parms)
    raise ValueError(f"Unsupported shared vertex mode: {mode}")


def score_section_shared_mode(
    section: Section,
    primitives: Sequence[Primitive],
    packed_vertices: Sequence[int],
    shared_vertices: Sequence[int],
    shared_lookup: Sequence[int],
    bounds: Bounds,
    mode: str,
) -> tuple[float, float]:
    vertices: list[tuple[float, float, float]] = [
        decode_packed_vertex(packed, section.codec_parms)
        for packed in packed_vertices[
            section.first_packed_vertex_index : section.first_packed_vertex_index
            + section.num_packed_vertices
        ]
    ]
    for shared_index in shared_lookup:
        vertices.append(
            decode_shared_vertex_for_mode(
                shared_vertices[shared_index],
                mode,
                bounds,
                section.codec_parms,
            )
        )

    max_edge = 0.0
    sum_sq = 0.0
    edge_count = 0
    for primitive in primitives[
        section.first_primitive_index : section.first_primitive_index
        + section.num_primitives
    ]:
        face = [
            index
            if index < section.num_packed_vertices
            else section.num_packed_vertices + (index - section.num_packed_vertices)
            for index in primitive.indices
        ]
        points = [vertices[index] for index in face]
        for a, b in zip(points, points[1:] + points[:1]):
            distance = math.dist(a, b)
            max_edge = max(max_edge, distance)
            sum_sq += distance * distance
            edge_count += 1

    rms_edge = (sum_sq / edge_count) ** 0.5 if edge_count else 0.0
    return max_edge, rms_edge


def choose_shared_vertex_mode(
    section: Section,
    primitives: Sequence[Primitive],
    packed_vertices: Sequence[int],
    shared_vertices: Sequence[int],
    shared_lookup: Sequence[int],
    bounds: Bounds,
) -> str:
    if not shared_lookup:
        return "none"

    scores = [
        (
            score_section_shared_mode(
                section,
                primitives,
                packed_vertices,
                shared_vertices,
                shared_lookup,
                bounds,
                mode,
            ),
            mode,
        )
        for mode in ("global21", "low32", "high32")
    ]
    scores.sort(key=lambda item: (item[0][0], item[0][1]))
    return scores[0][1]


def parse_collision_mesh(
    mesh_tree: ET.Element,
    name: str,
    position: tuple[float, float, float] = (0.0, 0.0, 0.0),
    orientation: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 1.0),
) -> CollisionMesh:
    bounds = parse_domain_bounds(mesh_tree)
    packed_vertices = field_integer_array(mesh_tree, "packedVertices", "meshTree")
    shared_vertices = field_integer_array(mesh_tree, "sharedVertices", "meshTree")
    shared_vertex_indices = field_integer_array(
        mesh_tree,
        "sharedVerticesIndex",
        "meshTree",
    )
    primitives = parse_primitives(mesh_tree)
    sections = parse_sections(mesh_tree)

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    section_modes: list[str] = []
    section_ranges: list[tuple[int, int, int, int]] = []

    for section_index, section in enumerate(sections):
        vertex_start = len(vertices)
        packed_start = section.first_packed_vertex_index
        packed_end = packed_start + section.num_packed_vertices
        if packed_start < 0 or packed_end > len(packed_vertices):
            raise ValueError(
                f"section {section_index}: packed vertex range "
                f"{packed_start}..{packed_end} exceeds packedVertices count "
                f"{len(packed_vertices)}"
            )

        for packed in packed_vertices[packed_start:packed_end]:
            vertices.append(
                transform_vertex(
                    decode_packed_vertex(packed, section.codec_parms),
                    position,
                    orientation,
                )
            )

        shared_start = section.first_shared_vertex_index
        shared_count = section_shared_count(section, primitives)

        shared_lookup: list[int] = []
        if shared_count:
            shared_end = shared_start + shared_count
            if shared_start < 0 or shared_end > len(shared_vertex_indices):
                raise ValueError(
                    f"section {section_index}: shared vertex index range "
                    f"{shared_start}..{shared_end} exceeds sharedVerticesIndex count "
                    f"{len(shared_vertex_indices)}"
                )
            shared_lookup = shared_vertex_indices[shared_start:shared_end]
            mode = choose_shared_vertex_mode(
                section,
                primitives,
                packed_vertices,
                shared_vertices,
                shared_lookup,
                bounds,
            )
            for shared_index in shared_lookup:
                if shared_index < 0 or shared_index >= len(shared_vertices):
                    raise ValueError(
                        f"section {section_index}: shared vertex index {shared_index} "
                        f"exceeds sharedVertices count {len(shared_vertices)}"
                    )
                vertices.append(
                    transform_vertex(
                        decode_shared_vertex_for_mode(
                            shared_vertices[shared_index],
                            mode,
                            bounds,
                            section.codec_parms,
                        ),
                        position,
                        orientation,
                    )
                )
        else:
            mode = "none"
        section_modes.append(mode)

        primitive_start = section.first_primitive_index
        primitive_end = primitive_start + section.num_primitives
        if primitive_start < 0 or primitive_end > len(primitives):
            raise ValueError(
                f"section {section_index}: primitive range "
                f"{primitive_start}..{primitive_end} exceeds primitives count "
                f"{len(primitives)}"
            )

        for primitive in primitives[primitive_start:primitive_end]:
            resolved_indices: list[int] = []
            for index in primitive.indices:
                if index < 0:
                    raise ValueError(
                        f"section {section_index}: primitive {primitive.indices} "
                        "contains a negative vertex index"
                    )
                if index < section.num_packed_vertices:
                    resolved_indices.append(vertex_start + index)
                    continue
                shared_local_index = index - section.num_packed_vertices
                if shared_local_index >= len(shared_lookup):
                    raise ValueError(
                        f"section {section_index}: primitive {primitive.indices} "
                        f"references shared local vertex {shared_local_index}, "
                        f"but only {len(shared_lookup)} shared vertices were resolved"
                    )
                resolved_indices.append(
                    vertex_start + section.num_packed_vertices + shared_local_index
                )
            faces.append(tuple(resolved_indices))  # type: ignore[arg-type]
        section_ranges.append((vertex_start, len(vertices), len(faces) - section.num_primitives, len(faces)))

    return CollisionMesh(
        vertices=vertices,
        faces=faces,
        sections=sections,
        section_modes=section_modes,
        section_ranges=section_ranges,
        name=name,
    )


def parse_collision_meshes(xml_path: Path) -> list[CollisionMesh]:
    root = ET.parse(xml_path).getroot()
    objects = collect_objects(root)
    sources = collect_mesh_tree_sources(objects)
    if not sources:
        raise ValueError("No data-bearing hknpCompressedMeshShapeData meshTree found")

    shape_to_data = collect_shape_data_links(objects)
    body_instances = collect_body_instances(root)
    meshes: list[CollisionMesh] = []
    used_data_ids: set[str] = set()

    for body_index, body in enumerate(body_instances):
        data_id = shape_to_data.get(body.shape_id)
        if data_id is None or data_id not in sources:
            continue
        source = sources[data_id]
        meshes.append(
            parse_collision_mesh(
                source.mesh_tree,
                f"{body_index:02d}_{body.name}_{body.shape_id}_{data_id}",
                body.position,
                body.orientation,
            )
        )
        used_data_ids.add(data_id)

    for data_id, source in sources.items():
        if data_id in used_data_ids:
            continue
        meshes.append(parse_collision_mesh(source.mesh_tree, data_id))

    return meshes


def format_float(value: float) -> str:
    if abs(value) < 1e-12:
        value = 0.0
    return f"{value:.9g}"


def safe_obj_name(name: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)
    return cleaned or "HavokCollision"


def write_obj(
    meshes: Sequence[CollisionMesh],
    output_path: Path,
    object_name: str,
    triangulate: bool,
) -> None:
    vertex_count = sum(len(mesh.vertices) for mesh in meshes)
    quad_count = sum(len(mesh.faces) for mesh in meshes)
    section_count = sum(len(mesh.sections) for mesh in meshes)
    triangle_count = quad_count * 2 if triangulate else 0
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("# Havok compressed collision mesh converted to OBJ\n")
        handle.write("# Source geometry: packedVertices + primitives\n")
        handle.write("# This OBJ does not use AABB/domain data as mesh geometry\n")
        handle.write(f"# Objects: {len(meshes)}\n")
        handle.write(f"# Sections: {section_count}\n")
        handle.write(f"# Vertices: {vertex_count}\n")
        handle.write(f"# Quad primitives: {quad_count}\n")
        if triangulate:
            handle.write(f"# Triangles: {triangle_count}\n")

        vertex_offset = 0
        for mesh_index, mesh in enumerate(meshes):
            handle.write(f"o {safe_obj_name(object_name)}_{safe_obj_name(mesh.name)}\n")
            handle.write(f"# Object index: {mesh_index}\n")
            handle.write(f"# Object vertices: {len(mesh.vertices)}\n")
            handle.write(f"# Object quad primitives: {len(mesh.faces)}\n")

            for x, y, z in mesh.vertices:
                handle.write(
                    f"v {format_float(x)} {format_float(y)} {format_float(z)}\n"
                )

            for section_index, (face_start, face_end) in enumerate(
                (item[2], item[3]) for item in mesh.section_ranges
            ):
                mode = mesh.section_modes[section_index]
                handle.write(
                    f"g {safe_obj_name(object_name)}_{safe_obj_name(mesh.name)}"
                    f"_section_{section_index:02d}_{mode}\n"
                )
                handle.write(f"# Section index: {section_index}\n")
                handle.write(f"# Shared vertex decode mode: {mode}\n")

                section_faces = mesh.faces[face_start:face_end]
                if triangulate:
                    for a, b, c, d in section_faces:
                        handle.write(
                            f"f {vertex_offset + a + 1} {vertex_offset + b + 1} "
                            f"{vertex_offset + c + 1}\n"
                        )
                        handle.write(
                            f"f {vertex_offset + a + 1} {vertex_offset + c + 1} "
                            f"{vertex_offset + d + 1}\n"
                        )
                else:
                    for a, b, c, d in section_faces:
                        handle.write(
                            f"f {vertex_offset + a + 1} {vertex_offset + b + 1} "
                            f"{vertex_offset + c + 1} {vertex_offset + d + 1}\n"
                        )

            if len(mesh.section_ranges) != len(mesh.sections):
                raise ValueError(
                    f"{mesh.name}: section range count does not match section count"
                )

            if not mesh.section_ranges:
                if triangulate:
                    for a, b, c, d in mesh.faces:
                        handle.write(
                            f"f {vertex_offset + a + 1} {vertex_offset + b + 1} "
                            f"{vertex_offset + c + 1}\n"
                        )
                        handle.write(
                            f"f {vertex_offset + a + 1} {vertex_offset + c + 1} "
                            f"{vertex_offset + d + 1}\n"
                        )
                else:
                    for a, b, c, d in mesh.faces:
                        handle.write(
                            f"f {vertex_offset + a + 1} {vertex_offset + b + 1} "
                            f"{vertex_offset + c + 1} {vertex_offset + d + 1}\n"
                        )

            vertex_offset += len(mesh.vertices)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Convert hknpCompressedMeshShapeData collision geometry from Havok "
            "tagfile XML to OBJ."
        )
    )
    parser.add_argument("input_xml", type=Path, help="Input Havok tagfile XML path")
    parser.add_argument(
        "output_obj",
        type=Path,
        nargs="?",
        help="Output OBJ path. Defaults to input file name with .obj extension.",
    )
    parser.add_argument(
        "--triangulate",
        action="store_true",
        help="Write each quad primitive as two triangle faces.",
    )
    parser.add_argument(
        "--object-name",
        help="OBJ object name. Defaults to the input file stem.",
    )
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    input_xml: Path = args.input_xml
    if not input_xml.is_file():
        parser.error(f"input XML does not exist: {input_xml}")

    output_obj: Path = args.output_obj or input_xml.with_suffix(".obj")
    object_name = args.object_name or input_xml.stem

    try:
        meshes = parse_collision_meshes(input_xml)
        write_obj(meshes, output_obj, object_name, args.triangulate)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    face_label = "triangles" if args.triangulate else "quads"
    face_count = (
        sum(len(mesh.faces) for mesh in meshes) * 2
        if args.triangulate
        else sum(len(mesh.faces) for mesh in meshes)
    )
    vertex_count = sum(len(mesh.vertices) for mesh in meshes)
    section_count = sum(len(mesh.sections) for mesh in meshes)
    print(
        f"Wrote {output_obj} with {vertex_count} vertices and "
        f"{face_count} {face_label} from {len(meshes)} object(s) / "
        f"{section_count} section(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
