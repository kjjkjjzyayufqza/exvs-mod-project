import maya.cmds as cmds

# Get selected objects (transform nodes that contain meshes)
selected_objects = cmds.ls(selection=True)

# Filter to get only mesh transform nodes and maintain selection order
selected_meshes = []
for obj in selected_objects:
    # Check if this object has a mesh shape
    shapes = cmds.listRelatives(obj, shapes=True, type='mesh')
    if shapes:
        selected_meshes.append(obj)

# Print the list of selected mesh names in selection order
print(selected_meshes)
