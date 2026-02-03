use std::iter;
use std::io::{Read, Seek, SeekFrom};
use std::str::FromStr;
use crate::app_error::AppError;

use crate::types::{raw, DiskVertex, Disk, LineItem, Model, ModelConfig};

pub fn parse_disks(
    items: &[LineItem],
    start: usize
) -> Option<(Vec<Disk>, usize)> {

    fn parse_vert(
        items: &[LineItem],
        start: usize
    ) -> Option<(DiskVertex, usize)> {
        let mut idx = start;

        let x = *if let Some(LineItem::Float(f)) = items.get(idx) {
            f
        } else {
            return None;
        };

        idx+= 1;
        let y = *if let Some(LineItem::Float(f)) = items.get(idx) {
            f
        } else {
            return None;
        };

        idx+= 1;
        let z = *if let Some(LineItem::Float(f)) = items.get(idx) {
            f
        } else {
            return None;
        };

        idx+= 1;
        let int = *if let Some(LineItem::Int(i)) = items.get(idx) {
            i
        } else {
            return None;
        };

        idx+= 1;
        Some((([x, y, z].into(), int), idx))
    }

    fn parse_disk(
        items: &[LineItem],
        expected_size: Option<usize>,
        start: usize,
    ) -> Option<(Disk, usize)> {
        let mut idx = start;

        let v_ct = *if let Some(LineItem::Int(i)) = items.get(idx) {
            i
        } else {
            return None;
        };

        if v_ct < 1 {
            return None;
        } 

        let v_ct = v_ct as usize;
        idx+= 1;

        if expected_size.is_some() && Some(v_ct) != expected_size {
            return None;
        }

        let mut disk = Disk::with_capacity(v_ct);
        
        for _ in 0..v_ct {
            if let Some((vert, new_idx)) = parse_vert(items, idx) {
                idx = new_idx;
                disk.push(vert);
            } else {
                return None;
            }
        }

        Some((disk, idx))
    }

    let mut idx = start;
    let mut disks = Vec::new();
    let mut disks_broken = true;

    while idx < items.len() {
        let disk_ct = if let Some(&LineItem::Int(count)) = items.get(idx) {
            count
        } else {
            0
        };

        idx+= 1;

        if disk_ct < 1 {
            continue;
        }

        let disk_ct = disk_ct as usize;
        let mut expected_count = None;
        disks_broken = false;

        for _ in 0..disk_ct {
            if let Some((disk, new_idx)) = parse_disk(
                items,
                expected_count,
                idx,
            ) {
                expected_count = Some(disk.len());
                disks.push(disk);
                idx = new_idx;
            } else {
                disks_broken = true;
                break;
            }
        }

        if !disks_broken {
            break;
        }
    }

    if disks_broken {
        None
    } else {
        Some((disks, idx))
    }
}

pub fn parse_body(
    items: &[LineItem],
    start: usize
) -> Option<(Vec<raw::BodySegment>, usize)> {
    let mut idx = start;

    let segment_ct = if let Some(&LineItem::Int(mut count)) = items.get(idx) {
        idx+= 1;

        if count < 0 {
            if let Some(&LineItem::Float(_)) = items.get(idx) {
                idx+= 1;
            } else {
                return None
            }

            if let Some(&LineItem::Int(ct)) = items.get(idx) {
                idx+= 1;
                count = ct;
            } else {
                return None
            }
        }
        
        count
    } else {
        return None;
    };

    let segment_ct = if let Ok(ct) = usize::try_from(segment_ct) {
        ct
    } else {
        return None;
    };

    let mut body = Vec::with_capacity(segment_ct);

    for _ in 0..segment_ct {
        let disk_info_idx = if let Some(&LineItem::Int(i)) = items.get(idx) {
            idx+= 1;
            i
        } else {
            return None;
        };

        let action = if let Some(&LineItem::Int(i)) = items.get(idx) {
            idx+= 1;
            i
        } else {
            return None;
        };

        let value = if let Some(&LineItem::Float(f)) = items.get(idx) {
            idx+= 1;
            f
        } else {
            return None;
        };

        let color = if let Some(&LineItem::Int(i)) = items.get(idx) {
            idx+= 1;
            i
        } else {
            return None;
        };

        let left = if let Some(&LineItem::Int(i)) = items.get(idx) {
            idx+= 1;
            i
        } else {
            return None;
        };

        let right = if let Some(&LineItem::Int(i)) = items.get(idx) {
            idx+= 1;
            i
        } else {
            return None;
        };

        let segment = raw::BodySegment {
            disk_info_idx,
            action,
            value,
            color,
            left,
            right
        };

        body.push(segment);
    }

    Some((body, idx))
}

pub fn parse_disk_info(
    items: &[LineItem],
    start: usize,
) -> Option<Vec<raw::DiskInformation>> {
    let mut idx = start;
    
    let info_ct = if let Some(&LineItem::Int(ct)) = items.get(idx) {
        idx+= 1;
        ct
    } else {
        return None;
    };

    let mut info = Vec::new();

    for _ in 0..info_ct {
        let mut arr1 = [0f32; 4];
        let mut arr2 = [0f32; 4];

        let shift_x = if let Some(&LineItem::Float(f)) = items.get(idx) {
            idx+= 1;
            f
        } else {
            return None;
        };

        let shift_y = if let Some(&LineItem::Float(f)) = items.get(idx) {
            idx+= 1;
            f
        } else {
            return None;
        };

        let scale_x = if let Some(&LineItem::Float(f)) = items.get(idx) {
            idx+= 1;
            f
        } else {
            return None;
        };

        let scale_y = if let Some(&LineItem::Float(f)) = items.get(idx) {
            idx+= 1;
            f
        } else {
            return None;
        };

        let disk_idx = if let Some(&LineItem::Int(i)) = items.get(idx) {
            idx+= 1;
            i
        } else {
            return None;
        };

        let id = if let Some(&LineItem::Int(i)) = items.get(idx) {
            idx+= 1;
            i
        } else {
            return None;
        };

        let flags = if let Some(&LineItem::Int(i)) = items.get(idx) {
            idx+= 1;
            i
        } else {
            return None;
        };

        for arr_idx in 0..4 {
            arr1[arr_idx] = if let Some(&LineItem::Float(f)) = items.get(idx) {
                idx+= 1;
                f
            } else {
                return None;
            };

            arr2[arr_idx] = if let Some(&LineItem::Float(f)) = items.get(idx) {
                idx+= 1;
                f
            } else {
                return None;
            };
        }

        info.push(raw::DiskInformation {
            shift: [shift_x, shift_y].into(),
            scale: [scale_x, scale_y].into(),
            disk_idx,
            id,
            flags,
            arr1,
            arr2,
        });
    }

    Some(info)
}

pub fn parse_lines<T: Read + Seek>(
    mut reader: T
) -> impl Iterator<Item = LineItem> {
    const BUF_MAX: usize = 256;
    let mut buffer = [0u8; BUF_MAX];
    let mut buffer_sz = 0usize;
    let mut record_start = reader.stream_position().unwrap();
    
    iter::from_fn(move || {
        let mut byte_buf = [0u8; 1];

        loop {
            let read_result = reader.read(&mut byte_buf[..]);

            match read_result {
                Ok(0) => { break; },
                Err(_) => { break; },
                _ => (),
            }

            let byte = byte_buf[0];

            if buffer_sz >= BUF_MAX || !byte.is_ascii() {
                let mut binary = Vec::new();

                if reader.seek(SeekFrom::Start(record_start)).is_ok() {
                    let _ = reader.read_to_end(&mut binary);
                }

                return Some(LineItem::Binary(binary));
            } else if  byte == b'\r' || byte == b'\n' {
                if byte == b'\r' {
                    if let Ok(n) = reader.read(&mut byte_buf) && n > 0 
                        && byte_buf[0] != b'\n'
                    {
                        reader.seek(SeekFrom::Current(-1)).unwrap();
                    }
                    
                    let string = String::from_utf8_lossy(&buffer[..buffer_sz]);
                    let string = string.trim().to_string();
                    buffer_sz = 0;
                    record_start = reader.stream_position().unwrap();

                    return Some(
                        if string.is_empty() {
                            LineItem::Empty
                        } else if let Ok(i) = i32::from_str(&string) {
                            LineItem::Int(i)
                        } else if let Ok(f) = f32::from_str(&string) {
                            LineItem::Float(f)
                        } else {
                            LineItem::Tag(string)
                        }
                    );
                }
            } else {
                buffer[buffer_sz] = byte;
                buffer_sz+= 1;
            }
        } 

        None
    })
}

pub fn parse_model(reader: impl Read + Seek) -> Result<Model, AppError> {
    let parsed_lines: Vec<_> = parse_lines(reader).collect();
    let mut idx = parsed_lines.len() - 1;
    
    while idx > 0 {
        if let LineItem::Tag(_) = parsed_lines[idx-1] {
            break;
        }

        idx-= 1;
    }

    let (disks, idx) = if let Some((disks, body_idx)) = parse_disks(
        &parsed_lines,
        idx
    ) {
        (disks, body_idx)
    } else {
        return Err(AppError("Parse failure: disks".to_string()));
    };

    let (body, idx) = if let Some((body, disk_info_idx)) = parse_body(
        &parsed_lines,
        idx,
    ) {
        (body, disk_info_idx)
    } else {
        return Err(AppError("Parse failure: body".to_string()));
    };

    let info = if let Some(info) = parse_disk_info(
        &parsed_lines,
        idx,
    ) {
        info
    } else {
        return Err(AppError("Parse failure: disk information".to_string()));
    };

    let config = ModelConfig {
        disks,
        disk_info: info,
        body
    };

    Ok(Model::new(config))
}
