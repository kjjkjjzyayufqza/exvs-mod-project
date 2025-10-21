import fs from 'fs';

// File paths
const file1 = 'E:\\research\\ssbh_lib\\target\\release\\n2_bomb.numatb.json';
const file2 = 'E:\\research\\ssbh_lib\\target\\release\\n2_bomb_b2.numatb.json';
const input = 'E:\\TAURI_PROJECT\\test_updated.json';

// Read JSON files
const templateData1 = JSON.parse(fs.readFileSync(file1, 'utf8'));
const templateData2 = JSON.parse(fs.readFileSync(file2, 'utf8'));
const mappingData = JSON.parse(fs.readFileSync(input, 'utf8'));

// Helper function to extract texture name from path
function extractTextureName(path) {
  // Extract filename from path like "D:/output/愛荷華級戰艦/M71.jpg" -> "M71"
  const filename = path.split('/').pop().split('\\').pop();
  return filename.split('.')[0]; // Remove extension
}

// Helper function to update attributes for file1 template
function updateAttributesFile1(attributes, mapping) {
  const baseColorName = extractTextureName(mapping.baseColor);
  const normalName = extractTextureName(mapping.normal);

  return attributes.map(attr => {
    const newAttr = JSON.parse(JSON.stringify(attr)); // Deep copy

    switch (attr.param_id) {
      case 'DiffuseMap':
        newAttr.param.data.String = `../../textures/${baseColorName}`;
        break;
      case 'SpecularMap':
        newAttr.param.data.String = `../../textures/${baseColorName}`;
        break;
      case 'NormalMap':
        newAttr.param.data.String = `../../textures/${normalName}`;
        break;
      case 'Texture1':
        newAttr.param.data.String = `../../textures/${baseColorName}`;
        break;
      case 'RoughnessMap':
        newAttr.param.data.String = `../../textures/${baseColorName}`;
        break;
      case 'AmbientOcclusionMap':
        newAttr.param.data.String = `../../textures/${baseColorName}`;
        break;
      // EmissiveMap is not changed, keep as is
    }

    return newAttr;
  });
}

// Helper function to update attributes for file2 template
function updateAttributesFile2(attributes, mapping) {
  const baseColorName = extractTextureName(mapping.baseColor);
  const normalName = extractTextureName(mapping.normal);
  const ambientName = extractTextureName(mapping.ambient);
  const specularName = extractTextureName(mapping.specular);

  return attributes.map(attr => {
    const newAttr = JSON.parse(JSON.stringify(attr)); // Deep copy

    switch (attr.param_id) {
      case 'RoughnessMap':
        newAttr.param.data.String = `../../textures/${ambientName}`;
        break;
      case 'MetallicMap':
        newAttr.param.data.String = `../../textures/${baseColorName}`;
        break;
      case 'Texture1':
        newAttr.param.data.String = `../../textures/${specularName}`;
        break;
      case 'NormalMap':
        newAttr.param.data.String = `../../textures/${normalName}`;
        break;
      case 'BaseColorMap':
        newAttr.param.data.String = `../../textures/${baseColorName}`;
        break;
      case 'AmbientOcclusionMap':
        newAttr.param.data.String = `../../textures/${ambientName}`;
        break;
      // DiffuseCubeMap and EmissiveMap are not changed, keep as is
    }

    return newAttr;
  });
}

// Generate materials for each mapping entry
const materials1 = [];
const materials2 = [];

mappingData.forEach((mapping, index) => {
  // Create material for file1 template
  const material1 = JSON.parse(JSON.stringify(templateData1.Matl.V16.entries[0])); // Deep copy template
  material1.material_label = `pbr${index}`;
  material1.attributes = updateAttributesFile1(material1.attributes, mapping);
  materials1.push(material1);

  // Create material for file2 template
  const material2 = JSON.parse(JSON.stringify(templateData2.Matl.V16.entries[0])); // Deep copy template
  material2.material_label = `pbr${index}`;
  material2.attributes = updateAttributesFile2(material2.attributes, mapping);
  materials2.push(material2);
});

// Create output data structures
const outputData1 = {
  Matl: {
    V16: {
      entries: materials1
    }
  }
};

const outputData2 = {
  Matl: {
    V16: {
      entries: materials2
    }
  }
};

// Write output files
fs.writeFileSync('output_file1.json', JSON.stringify(outputData1, null, 2));
fs.writeFileSync('output_file2.json', JSON.stringify(outputData2, null, 2));

console.log('Generated output_file1.json and output_file2.json');
