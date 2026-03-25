from pathlib import Path
import re

p = Path(__file__).resolve().parent.parent / "src" / "ssbh_dae" / "dae_parse.rs"
text = p.read_text(encoding="utf-8")

text = re.sub(
    r"\n/// Convert dialog state\n#\[derive\(Debug, Default\)\]\npub struct DaeConvertDialogState \{[^}]+\}\n",
    "\n",
    text,
    count=1,
)


def strip_logs(s: str) -> str:
    lines = s.splitlines(keepends=True)
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.lstrip()
        if stripped.startswith("log::"):
            depth = line.count("(") - line.count(")")
            i += 1
            while i < len(lines) and depth > 0:
                depth += lines[i].count("(") - lines[i].count(")")
                i += 1
            continue
        out.append(line)
        i += 1
    return "".join(out)


text = strip_logs(text)

old_norm = """        if !mesh.normals.is_empty() && mesh.normals.len() != mesh.vertices.len() {
            log::warn!(
                \"Mesh '{}': Normals count ({}) != vertices count ({}). This may cause issues.\",
                mesh.name, mesh.normals.len(), mesh.vertices.len()
            );
        }
        
        if !mesh.uvs.is_empty() && mesh.uvs.len() != mesh.vertices.len() {
            log::warn!(
                \"Mesh '{}': UV count ({}) != vertices count ({}). This may cause issues.\",
                mesh.name, mesh.uvs.len(), mesh.vertices.len()
            );
        }"""

new_norm = """        if !mesh.normals.is_empty() && mesh.normals.len() != mesh.vertices.len() {
            return Err(anyhow!(
                \"Mesh '{}' (index {}): normals count {} does not match vertex count {}\",
                mesh.name,
                index,
                mesh.normals.len(),
                mesh.vertices.len()
            ));
        }

        if !mesh.uvs.is_empty() && mesh.uvs.len() != mesh.vertices.len() {
            return Err(anyhow!(
                \"Mesh '{}' (index {}): UV count {} does not match vertex count {}\",
                mesh.name,
                index,
                mesh.uvs.len(),
                mesh.vertices.len()
            ));
        }"""

# After strip_logs the old block may already be removed if it only had log::warn
# Check what's in validate_dae_scene now
if old_norm in text:
    text = text.replace(old_norm, new_norm)
else:
    # Already stripped; insert strict checks before validate_mesh_skinning
    needle = "        validate_mesh_skinning_constraints(mesh, index)?;"
    insert = """        if !mesh.normals.is_empty() && mesh.normals.len() != mesh.vertices.len() {
            return Err(anyhow!(
                \"Mesh '{}' (index {}): normals count {} does not match vertex count {}\",
                mesh.name,
                index,
                mesh.normals.len(),
                mesh.vertices.len()
            ));
        }

        if !mesh.uvs.is_empty() && mesh.uvs.len() != mesh.vertices.len() {
            return Err(anyhow!(
                \"Mesh '{}' (index {}): UV count {} does not match vertex count {}\",
                mesh.name,
                index,
                mesh.uvs.len(),
                mesh.vertices.len()
            ));
        }

        """
    if needle in text and insert.strip() not in text:
        text = text.replace(needle, insert + needle, 1)

p.write_text(text, encoding="utf-8")
print("OK", p)
