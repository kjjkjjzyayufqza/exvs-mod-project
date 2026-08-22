# Split-export EXVS2 body and wing motion FBX from a composed Blender scene.
#
# Isolation is visibility/selection. Do not unparent wing from ATH_BACKPACK.
# Identify body by CENTER_RT, wing by LMAIN_1. Skip OLD_* leftovers.
#
# Blender MCP:
#   exec(compile(open(THIS_FILE, encoding="utf-8").read(), THIS_FILE, "exec"), globals())
#   print(inspect_scene())
#   export_pair(out_dir=r"D:\output\...", body_filename="001hito_..._out.fbx",
#               wing_filename="410wzerowing_..._out.fbx")
#
# CLI:
#   blender --background scene.blend --python export_body_wing_fbx.py -- \
#     --out-dir D:\output\exvs2\<unit>\motion \
#     --body-name 001hito_..._body_<clip>_out.fbx \
#     --wing-name 410wzerowing_..._wing00_<clip>_out.fbx

from __future__ import annotations

import os
import sys

try:
    import bpy
except ImportError:
    bpy = None


BODY_MARKER = "CENTER_RT"
WING_MARKER = "LMAIN_1"
OLD_PREFIX = "OLD_"

# Proven Blender 5.1 kwargs from session 019fec42. Do not "improve" these.
FBX_EXPORT_KWARGS = {
    "object_types": {"ARMATURE", "MESH"},
    "use_mesh_modifiers": True,
    "use_armature_deform_only": False,
    "add_leaf_bones": False,
    "primary_bone_axis": "Y",
    "secondary_bone_axis": "X",
    "armature_nodetype": "NULL",
    "bake_anim": True,
    "bake_anim_use_all_bones": True,
    "bake_anim_use_nla_strips": False,
    "bake_anim_use_all_actions": False,
    "bake_anim_force_startend_keying": True,
    "bake_anim_step": 1.0,
    "bake_anim_simplify_factor": 0.0,
    "path_mode": "AUTO",
    "embed_textures": False,
    "axis_forward": "-Z",
    "axis_up": "Y",
}


def _require_bpy():
    if bpy is None:
        raise RuntimeError("This module must run inside Blender")


def get_fcurves(action):
    fcs = []
    if not action:
        return fcs
    if hasattr(action, "layers") and action.layers:
        for layer in action.layers:
            for strip in layer.strips:
                if hasattr(strip, "channelbags"):
                    for cb in strip.channelbags:
                        fcs.extend(list(cb.fcurves))
                elif getattr(strip, "channelbag", None):
                    fcs.extend(list(strip.channelbag.fcurves))
    if not fcs and hasattr(action, "fcurves") and action.fcurves:
        try:
            fcs = list(action.fcurves)
        except Exception:
            pass
    return fcs


def action_frame_range(action, default=(1, 24)):
    frames = [kp.co[0] for fc in get_fcurves(action) for kp in fc.keyframe_points]
    if not frames:
        return default
    return int(round(min(frames))), int(round(max(frames)))


def current_action(arm):
    if not arm or not arm.animation_data:
        return None
    return arm.animation_data.action


def bone_names(arm):
    return [b.name for b in arm.data.bones]


def has_bone(arm, name):
    return name in arm.data.bones


def is_old(obj):
    return obj.name.startswith(OLD_PREFIX)


def in_view_layer(obj):
    try:
        return obj.name in bpy.context.view_layer.objects
    except Exception:
        return True


def scene_objects():
    return list(bpy.context.scene.objects)


def classify_armature(arm):
    if arm is None or arm.type != "ARMATURE" or is_old(arm):
        return None
    body = has_bone(arm, BODY_MARKER)
    wing = has_bone(arm, WING_MARKER)
    if body and not wing:
        return "body"
    if wing and not body:
        return "wing"
    if body and wing:
        raise RuntimeError(
            "Armature %s has both %s and %s; mixed skeleton, refuse export"
            % (arm.name, BODY_MARKER, WING_MARKER)
        )
    return None


def find_arm(role):
    _require_bpy()
    if role not in ("body", "wing"):
        raise RuntimeError("role must be body or wing")
    cands = []
    for obj in scene_objects():
        if obj.type != "ARMATURE" or not in_view_layer(obj):
            continue
        if classify_armature(obj) == role:
            cands.append(obj)
    if not cands:
        return None
    prefer = "ZeroEW_Body" if role == "body" else "ZeroEW_Wing"
    for obj in cands:
        if obj.name == prefer:
            return obj
    return cands[0]


def collect_export_objects(arm):
    objs = [arm]
    for obj in scene_objects():
        if obj.type != "MESH" or not in_view_layer(obj) or is_old(obj):
            continue
        use = obj.parent == arm
        for mod in obj.modifiers:
            if mod.type == "ARMATURE" and mod.object == arm:
                use = True
        other = find_arm("wing") if classify_armature(arm) == "body" else find_arm("body")
        if other and (obj.parent == other or obj.name.startswith(other.name)):
            use = False
        if use:
            objs.append(obj)
    return objs


def _hide_state(obj):
    return (obj.hide_get(), obj.hide_viewport, obj.hide_render, obj.hide_select)


def _restore_hide(obj, state):
    hg, hv, hr, hs = state
    obj.hide_viewport = hv
    obj.hide_render = hr
    obj.hide_select = hs
    try:
        obj.hide_set(hg)
    except Exception:
        pass


def _object_mode():
    try:
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        pass


def _view3d_override(arm):
    win = bpy.context.window
    scr = win.screen if win else None
    area = next((a for a in scr.areas if a.type == "VIEW_3D"), None) if scr else None
    region = next((r for r in area.regions if r.type == "WINDOW"), None) if area else None
    override = {
        "scene": bpy.context.scene,
        "view_layer": bpy.context.view_layer,
        "active_object": arm,
        "object": arm,
    }
    if win is not None:
        override["window"] = win
    if scr is not None:
        override["screen"] = scr
    if area is not None:
        override["area"] = area
    if region is not None:
        override["region"] = region
    return override


def export_arm(arm, filepath, isolation="visible"):
    """Export one armature + its meshes. isolation: 'visible' or 'selection'."""
    _require_bpy()
    if arm is None:
        raise RuntimeError("armature missing for " + filepath)
    if isolation not in ("visible", "selection"):
        raise RuntimeError("isolation must be visible or selection")

    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
    _object_mode()
    export_objs = collect_export_objects(arm)
    export_set = set(export_objs)
    hide_state = {}

    for obj in bpy.context.view_layer.objects:
        hide_state[obj.name] = _hide_state(obj)
        obj.select_set(False)

    for obj in bpy.context.view_layer.objects:
        if obj in export_set:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_render = False
            obj.hide_select = False
            obj.select_set(True)
        elif isolation == "visible":
            obj.select_set(False)
            obj.hide_set(True)
            obj.hide_viewport = True

    bpy.context.view_layer.objects.active = arm
    act = current_action(arm)
    fr_s, fr_e = action_frame_range(act)
    sc = bpy.context.scene
    old_frames = (sc.frame_start, sc.frame_end, sc.frame_current)
    sc.frame_start, sc.frame_end, sc.frame_current = fr_s, fr_e, fr_s

    kwargs = dict(FBX_EXPORT_KWARGS)
    kwargs["filepath"] = filepath
    if isolation == "visible":
        kwargs["use_selection"] = False
        kwargs["use_visible"] = True
    else:
        kwargs["use_selection"] = True
        kwargs["use_visible"] = False

    override = _view3d_override(arm)
    try:
        with bpy.context.temp_override(**override):
            bpy.ops.export_scene.fbx(**kwargs)
    except Exception:
        bpy.ops.export_scene.fbx(**kwargs)

    for obj in bpy.context.view_layer.objects:
        if obj.name in hide_state:
            _restore_hide(obj, hide_state[obj.name])
            obj.select_set(False)
    sc.frame_start, sc.frame_end, sc.frame_current = old_frames

    if not os.path.exists(filepath):
        raise RuntimeError("FBX was not written: " + filepath)
    return {
        "file": filepath,
        "size": os.path.getsize(filepath),
        "frames": (fr_s, fr_e),
        "arm": arm.name,
        "action": act.name if act else None,
        "bones": len(arm.data.bones),
        "objects": [o.name for o in export_objs],
        "role": classify_armature(arm),
        "isolation": isolation,
    }


def fbx_has_ascii_token(filepath, token):
    with open(filepath, "rb") as fh:
        data = fh.read()
    return token.encode("ascii") in data


def verify_exported_fbx(filepath, role):
    if role not in ("body", "wing"):
        raise RuntimeError("role must be body or wing")
    if not os.path.exists(filepath):
        raise RuntimeError("missing FBX: " + filepath)
    size = os.path.getsize(filepath)
    if size <= 0:
        raise RuntimeError("empty FBX: " + filepath)
    has_center = fbx_has_ascii_token(filepath, BODY_MARKER)
    has_lmain = fbx_has_ascii_token(filepath, WING_MARKER)
    has_gbl = fbx_has_ascii_token(filepath, "GBL_RT")
    errors = []
    if not has_gbl:
        errors.append("missing GBL_RT")
    if role == "body":
        if not has_center:
            errors.append("body FBX missing CENTER_RT (mixed export or wing file)")
        if has_lmain:
            errors.append("body FBX contains LMAIN_1 (wing leaked into body file)")
    else:
        if not has_lmain:
            errors.append("wing FBX missing LMAIN_1")
        if has_center:
            errors.append("wing FBX contains CENTER_RT (body leaked into wing file)")
    report = {
        "file": filepath,
        "size": size,
        "role": role,
        "CENTER_RT": has_center,
        "LMAIN_1": has_lmain,
        "GBL_RT": has_gbl,
        "ok": not errors,
        "errors": errors,
    }
    if errors:
        raise RuntimeError("verify failed %s: %s" % (filepath, "; ".join(errors)))
    return report


def inspect_scene():
    _require_bpy()
    rows = []
    for obj in scene_objects():
        if obj.type != "ARMATURE":
            continue
        act = current_action(obj)
        parent = obj.parent.name if obj.parent else None
        parent_bone = obj.parent_bone if obj.parent_type == "BONE" else None
        cons = []
        if "GBL_RT" in obj.pose.bones:
            for c in obj.pose.bones["GBL_RT"].constraints:
                tgt = c.target.name if getattr(c, "target", None) else None
                sub = getattr(c, "subtarget", None)
                cons.append((c.name, c.type, tgt, sub))
        rows.append(
            {
                "name": obj.name,
                "role": classify_armature(obj),
                "bones": len(obj.data.bones),
                "CENTER_RT": has_bone(obj, BODY_MARKER),
                "LMAIN_1": has_bone(obj, WING_MARKER),
                "action": act.name if act else None,
                "frames": action_frame_range(act) if act else None,
                "parent": parent,
                "parent_bone": parent_bone,
                "gbl_constraints": cons,
                "hide": obj.hide_get() or obj.hide_viewport,
            }
        )
    return rows


def export_pair(out_dir, body_filename=None, wing_filename=None, which="both", isolation="visible"):
    """Export body and/or wing from the current scene."""
    _require_bpy()
    if which not in ("body", "wing", "both"):
        raise RuntimeError("which must be body, wing, or both")
    os.makedirs(out_dir, exist_ok=True)
    results = {}
    if which in ("body", "both"):
        if not body_filename:
            raise RuntimeError("body_filename required")
        body = find_arm("body")
        if body is None:
            raise RuntimeError("no body armature (CENTER_RT) in current scene")
        path = os.path.join(out_dir, body_filename)
        info = export_arm(body, path, isolation=isolation)
        info["verify"] = verify_exported_fbx(path, "body")
        results["body"] = info
    if which in ("wing", "both"):
        if not wing_filename:
            raise RuntimeError("wing_filename required")
        wing = find_arm("wing")
        if wing is None:
            raise RuntimeError("no wing armature (LMAIN_1) in current scene")
        path = os.path.join(out_dir, wing_filename)
        info = export_arm(wing, path, isolation=isolation)
        info["verify"] = verify_exported_fbx(path, "wing")
        results["wing"] = info
    return results


def open_blend(blend_path):
    _require_bpy()
    if not os.path.exists(blend_path):
        raise RuntimeError("blend missing: " + blend_path)
    bpy.ops.wm.open_mainfile(filepath=blend_path)


def export_blend(blend_path, out_dir, body_filename, wing_filename, which="both"):
    open_blend(blend_path)
    return export_pair(
        out_dir=out_dir,
        body_filename=body_filename,
        wing_filename=wing_filename,
        which=which,
    )


def _new_action(name):
    if name in bpy.data.actions:
        act = bpy.data.actions[name]
        bpy.data.actions.remove(act)
    return bpy.data.actions.new(name)


def _ensure_channelbag(action, arm):
    """Blender 5 layered actions: one slot + one channelbag. Fallback: action.fcurves."""
    if hasattr(action, "slots") and hasattr(action, "layers"):
        if not action.slots:
            action.slots.new(name=arm.name)
        slot = action.slots[0]
        if not action.layers:
            layer = action.layers.new(name="Layer")
        else:
            layer = action.layers[0]
        if not layer.strips:
            strip = layer.strips.new(type="KEYFRAME")
        else:
            strip = layer.strips[0]
        cb = strip.channelbag(slot, ensure=True) if hasattr(strip, "channelbag") else None
        if cb is None and hasattr(strip, "channelbags"):
            if len(strip.channelbags) == 0:
                raise RuntimeError("cannot create channelbag on action " + action.name)
            cb = strip.channelbags[0]
        return cb
    return action


def _fcurve_container(target):
    return target.fcurves if hasattr(target, "fcurves") else target


def make_reversed_action(arm, new_name):
    """trans_end: reverse time of the armature's current action."""
    _require_bpy()
    src = current_action(arm)
    if src is None:
        raise RuntimeError(arm.name + " has no action to reverse")
    fr_s, fr_e = action_frame_range(src)
    span = float(fr_e - fr_s)
    dst = _new_action(new_name)
    bag = _ensure_channelbag(dst, arm)
    container = _fcurve_container(bag)
    for fc in get_fcurves(src):
        new_fc = container.new(data_path=fc.data_path, index=fc.array_index)
        new_fc.keyframe_points.add(len(fc.keyframe_points))
        src_pts = list(fc.keyframe_points)
        for i, kp in enumerate(reversed(src_pts)):
            dst_kp = new_fc.keyframe_points[i]
            new_f = fr_s + (span - (kp.co[0] - fr_s))
            dst_kp.co = (new_f, kp.co[1])
            dst_kp.interpolation = kp.interpolation
        new_fc.update()
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = dst
    return dst


def make_hold_last_frame_action(arm, new_name, frame_end=60, fps=60):
    """trans_loop: hold the last pose of the current action across 1..frame_end at fps."""
    _require_bpy()
    src = current_action(arm)
    if src is None:
        raise RuntimeError(arm.name + " has no action to hold")
    _fr_s, fr_e = action_frame_range(src)
    last = {}
    for fc in get_fcurves(src):
        if not fc.keyframe_points:
            continue
        pts = sorted(fc.keyframe_points, key=lambda k: k.co[0])
        last[(fc.data_path, fc.array_index)] = pts[-1].co[1]
    dst = _new_action(new_name)
    bag = _ensure_channelbag(dst, arm)
    container = _fcurve_container(bag)
    sc = bpy.context.scene
    sc.render.fps = fps
    sc.frame_start = 1
    sc.frame_end = frame_end
    for (path, index), value in last.items():
        new_fc = container.new(data_path=path, index=index)
        new_fc.keyframe_points.add(frame_end)
        for frame in range(1, frame_end + 1):
            kp = new_fc.keyframe_points[frame - 1]
            kp.co = (float(frame), value)
            kp.interpolation = "CONSTANT"
        new_fc.update()
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = dst
    return dst


def strip_ath_keys(arm):
    """Delete fcurves whose bone leaf name starts with ATH_."""
    _require_bpy()
    act = current_action(arm)
    if act is None:
        return 0
    removed = 0
    fcs = get_fcurves(act)
    to_remove = []
    for fc in fcs:
        path = fc.data_path or ""
        if 'pose.bones["' not in path:
            continue
        name = path.split('pose.bones["', 1)[1].split('"]', 1)[0]
        leaf = name.split(":")[-1]
        if leaf.upper().startswith("ATH_"):
            to_remove.append(fc)
    for fc in to_remove:
        try:
            fcs_owner = fc.id_data
            if hasattr(fcs_owner, "fcurves"):
                fcs_owner.fcurves.remove(fc)
            else:
                for layer in getattr(act, "layers", []):
                    for strip in layer.strips:
                        bags = []
                        if hasattr(strip, "channelbags"):
                            bags = list(strip.channelbags)
                        elif getattr(strip, "channelbag", None):
                            bags = [strip.channelbag]
                        for bag in bags:
                            if fc in list(bag.fcurves):
                                bag.fcurves.remove(fc)
            removed += 1
        except Exception:
            pass
    return removed


def _parse_cli(argv):
    args = {
        "out_dir": None,
        "body_name": None,
        "wing_name": None,
        "which": "both",
        "open_blend": None,
        "isolation": "visible",
        "inspect": False,
    }
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--out-dir":
            i += 1
            args["out_dir"] = argv[i]
        elif a == "--body-name":
            i += 1
            args["body_name"] = argv[i]
        elif a == "--wing-name":
            i += 1
            args["wing_name"] = argv[i]
        elif a == "--which":
            i += 1
            args["which"] = argv[i]
        elif a == "--open-blend":
            i += 1
            args["open_blend"] = argv[i]
        elif a == "--isolation":
            i += 1
            args["isolation"] = argv[i]
        elif a == "--inspect":
            args["inspect"] = True
        elif a in ("-h", "--help"):
            print(
                "export_body_wing_fbx.py --out-dir DIR "
                "--body-name FILE --wing-name FILE [--which both|body|wing] "
                "[--open-blend FILE] [--isolation visible|selection] [--inspect]"
            )
            return None
        else:
            raise RuntimeError("unknown argument: " + a)
        i += 1
    return args


def _argv_after_double_dash(argv):
    if "--" in argv:
        return argv[argv.index("--") + 1 :]
    # Blender also forwards args after the python file.
    return [a for a in argv[1:] if a.startswith("--") or not a.endswith(".py")]


if bpy is not None and __name__ == "__main__":
    cli = _parse_cli(_argv_after_double_dash(sys.argv))
    if cli is None:
        pass
    elif cli["inspect"]:
        print(inspect_scene())
    else:
        if not cli["out_dir"]:
            raise RuntimeError("--out-dir is required")
        if cli["open_blend"]:
            open_blend(cli["open_blend"])
        print(
            export_pair(
                out_dir=cli["out_dir"],
                body_filename=cli["body_name"],
                wing_filename=cli["wing_name"],
                which=cli["which"],
                isolation=cli["isolation"],
            )
        )
