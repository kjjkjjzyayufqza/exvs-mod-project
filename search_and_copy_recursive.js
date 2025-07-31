const fs = require('fs');
const path = require('path');

/**
 * Recursively search for a file in all subdirectories and copy it to target directory
 * @param {string} filename - The base filename to search for (without extension)
 * @param {string} sourceDir - The root directory to start searching from
 * @param {string} targetDir - The target directory to copy the file to
 * @returns {Promise<boolean>} - Returns true if file was found and copied, false otherwise
 */
async function searchAndCopyFile(filename, sourceDir, targetDir) {
  try {
    const binFileName = `${filename}.bin`;
    
    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const filePath = await searchFileRecursively(binFileName, sourceDir);
    
    if (filePath) {
      const targetPath = path.join(targetDir, binFileName);
      fs.copyFileSync(filePath, targetPath);
      console.log(`Found and copied ${binFileName} from ${filePath}`);
      return true;
    } else {
      console.log(`File not found: ${binFileName} in ${sourceDir} and its subdirectories`);
      return false;
    }
  } catch (error) {
    console.error(`Error copying file ${filename}.bin:`, error);
    return false;
  }
}

/**
 * Recursively search for a specific file in directory and all subdirectories
 * @param {string} targetFileName - The filename to search for
 * @param {string} currentDir - The current directory being searched
 * @returns {Promise<string|null>} - Returns the full path if found, null otherwise
 */
async function searchFileRecursively(targetFileName, currentDir) {
  try {
    const items = fs.readdirSync(currentDir);
    
    // First, check if the file exists in current directory
    for (const item of items) {
      const itemPath = path.join(currentDir, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isFile() && item === targetFileName) {
        return itemPath;
      }
    }
    
    // If not found in current directory, search subdirectories
    for (const item of items) {
      const itemPath = path.join(currentDir, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        const result = await searchFileRecursively(targetFileName, itemPath);
        if (result) {
          return result;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error searching in directory ${currentDir}:`, error);
    return null;
  }
}

/**
 * Search and copy multiple files
 * @param {string[]} filenames - Array of base filenames to search for
 * @param {string} sourceDir - The root directory to start searching from
 * @param {string} targetDir - The target directory to copy files to
 */
async function searchAndCopyMultipleFiles(filenames, sourceDir, targetDir) {
  console.log(`Starting search in: ${sourceDir}`);
  console.log(`Target directory: ${targetDir}`);
  
  const results = [];
  
  for (const filename of filenames) {
    console.log(`\nSearching for: ${filename}.bin`);
    const success = await searchAndCopyFile(filename, sourceDir, targetDir);
    results.push({ filename: `${filename}.bin`, success });
  }
  
  // Summary
  console.log('\n=== Copy Summary ===');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Successfully copied: ${successful} files`);
  console.log(`Failed to find: ${failed} files`);
  
  if (failed > 0) {
    console.log('\nFailed files:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`- ${r.filename}`);
    });
  }
}

module.exports = {
  searchAndCopyFile,
  searchFileRecursively,
  searchAndCopyMultipleFiles
};

// Example usage:
// searchAndCopyFile('160', 'C:\\source\\directory', 'C:\\target\\directory');
// 
// Or for multiple files:
// searchAndCopyMultipleFiles(
//   ['160', '161', '194', '195'], 
//   'C:\\source\\directory', 
//   'C:\\target\\directory'
// );