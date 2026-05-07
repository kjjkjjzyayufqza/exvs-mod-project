import math
from pathlib import Path
import unittest

import havok_xml_collision_to_obj as converter


class HavokXmlCollisionToObjTests(unittest.TestCase):
    def test_326_shared_vertices_do_not_create_stretched_edges(self) -> None:
        meshes = converter.parse_collision_meshes(Path("326.xml"))
        terrain = next(mesh for mesh in meshes if "object24" in mesh.name)

        max_edge = 0.0
        for face in terrain.faces:
            points = [terrain.vertices[index] for index in face]
            for a, b in zip(points, points[1:] + points[:1]):
                max_edge = max(max_edge, math.dist(a, b))

        self.assertLess(max_edge, 600.0)

    def test_326_all_mesh_groups_avoid_cross_map_edges(self) -> None:
        meshes = converter.parse_collision_meshes(Path("326.xml"))

        worst_edges: list[tuple[float, str]] = []
        for mesh in meshes:
            max_edge = 0.0
            for face in mesh.faces:
                points = [mesh.vertices[index] for index in face]
                for a, b in zip(points, points[1:] + points[:1]):
                    max_edge = max(max_edge, math.dist(a, b))
            worst_edges.append((max_edge, mesh.name))

        max_edge, mesh_name = max(worst_edges)
        self.assertLess(max_edge, 900.0, mesh_name)


if __name__ == "__main__":
    unittest.main()
