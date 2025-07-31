import { 
    generateObjects, 
    appendToBinFile, 
    PRESET_CONFIGS 
} from './bin-generator.js';

// Example usage of the bin generator

console.log('🏗️  Starting bin file generation...\n');

// Generate different types of objects
try {
    // 3. Add 3 skyline objects
    console.log('3️⃣  Generating skyline objects...');
    const skylineObjects = generateObjects(200, PRESET_CONFIGS.skyline);
    appendToBinFile('17.bin', skylineObjects, 'Additional Skyline Objects');

    console.log('\n✅ All objects generated successfully!');
    console.log(`📊 Total new objects added: ${5 + 10 + 3 + 7} objects`);

} catch (error) {
    console.error('❌ Error during generation:', error.message);
}