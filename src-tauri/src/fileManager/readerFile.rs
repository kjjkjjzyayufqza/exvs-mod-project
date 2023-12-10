
use std::fs::File;
use std::io::Read;
use std::io::Write;

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
    println!("{:?}", buffer);
    // 构造文件路径
    let file_path = path;
    // 使用Tokio异步写入文件
    match tokio::fs::write(&file_path, &buffer).await {
        Ok(_) => Ok(println!("Done")),
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

#[tauri::command]
pub fn create_large_file_and_print_done() -> Result<(), String> {
    let file_path = "./output_file.bin"; // 文件将会被创建在当前目录下

    // 创建一个1GB大小的空文件
    let mut file = match File::create(file_path) {
        Ok(file) => file,
        Err(err) => return Err(format!("Error creating file: {}", err)),
    };

    // 写入1GB的数据，这里使用1MB的缓冲区来提高效率
    const BUFFER_SIZE: usize = 1024 * 1024; // 1MB
    let buffer = vec![0; BUFFER_SIZE];

    for _ in 0..1024 {
        match file.write_all(&buffer) {
            Ok(_) => continue,
            Err(err) => return Err(format!("Error writing to file: {}", err)),
        }
    }

    // 关闭文件
    match file.flush() {
        Ok(_) => {
            println!("Done"); // 写入完成后打印done
            Ok(())
        }
        Err(err) => Err(format!("Error flushing file: {}", err)),
    }
}