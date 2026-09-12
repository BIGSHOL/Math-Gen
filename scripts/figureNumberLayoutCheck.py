"""Validate browser-measured figure guides in Blender: run after the editing harness."""
import json
from pathlib import Path

from mathutils import Vector
from mathutils.bvhtree import BVHTree


def rectangle_tree(rect):
    x, y, w, h = (rect[key] for key in ("x", "y", "width", "height"))
    vertices = [Vector((x, y, 0)), Vector((x + w, y, 0)),
                Vector((x + w, y + h, 0)), Vector((x, y + h, 0))]
    return BVHTree.FromPolygons(vertices, [(0, 1, 2), (0, 2, 3)], all_triangles=True, epsilon=0.05)


def overlaps(a, b):
    # The containment check also catches one rectangle completely inside another.
    intersects = (a["x"] < b["x"] + b["width"] and a["x"] + a["width"] > b["x"]
                  and a["y"] < b["y"] + b["height"] and a["y"] + a["height"] > b["y"])
    return intersects or bool(rectangle_tree(a).overlap(rectangle_tree(b)))


root = Path(__file__).resolve().parents[1]
layouts = json.loads((root / ".checks.local/figure-number-layout.json").read_text(encoding="utf-8"))
total = 0
for layout in layouts:
    badges = layout["badges"]
    for index, badge in enumerate(badges):
        assert not overlaps(badge, layout["canvas"]), f"Number {badge['number']} overlaps the canvas"
        for shape in layout["objects"]:
            assert not overlaps(badge, shape), f"Number {badge['number']} overlaps a figure object"
        for other in badges[index + 1:]:
            assert not overlaps(badge, other), f"Numbers {badge['number']} and {other['number']} overlap"
        total += 1
    print(f"PASS Blender collision check at {layout['viewport']['width']}px: {len(badges)} guides")
print(f"PASS {total} number placements verified with Blender geometry")
