import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/tauri'
import { Buffer } from 'buffer'
// Write a binary file to the `$APPDATA/avatar.png` path

// export const createBinaryFile = async (path: string, data: Buffer) => {
//   writeFile(path, data, {})
//     .then((e) => {
//       console.log("save done");
//     })
//     .catch((err) => {
//       console.log("save error", err);
//     });
// };

