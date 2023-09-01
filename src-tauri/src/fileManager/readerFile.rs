
use std::fs::File;
use std::io::{Read};


#[tauri::command]
pub fn read_binary_file(path: String) -> Result<Vec<Vec<u8>>, String> {
    let mut file = match File::open(&path) {
        Ok(file) => file,
        Err(_) => return Err("Failed to open file".to_string()),
    };

    let mut buffer = Vec::new();
    match file.read_to_end(&mut buffer) {
        Ok(_) => {
            let chunk_size: usize = 1024;
            let mut chunks = Vec::new();

            for chunk in buffer.chunks(chunk_size) {
                chunks.push(chunk.to_vec());
            }

            Ok(chunks)
        }
        Err(_) => Err("Failed to read file content".to_string()),
    }
}

#[tauri::command]
pub async fn save_buffer_to_file(path: String, buffer: Vec<u8>) -> Result<(), String> {
    // 构造文件路径
    let file_path = path;
    // 使用Tokio异步写入文件
    match tokio::fs::write(&file_path, &buffer).await {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write to file: {}", e)),
    }
}

#[tauri::command]
pub async fn decompression_deflate_raw_buffer(buffer: Vec<u8>) -> Result<Vec<u8>, String> {
    // 创建一个 zlib 解压缩器
    println!("{:?}", buffer);
    let mut decompressor: flate2::read::ZlibDecoder<&[u8]> = flate2::read::ZlibDecoder::new(buffer.as_slice());

    // 解压数据
    let mut decompressed_data = Vec::new();
    match decompressor.read_to_end(&mut decompressed_data) {
        Ok(_) => Ok(decompressed_data),
        Err(err) => Err(format!("Error decompressing data: {:?}", err)),
    }
}