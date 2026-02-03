use std::fmt;
use std::rc::Rc;
use std::collections::HashSet;

use glam::Vec3;

use fmt::{Formatter, Debug, Display};


#[derive(Clone)]
pub enum LineItem {
    Tag(String),
    Int(i32),
    Float(f32),
    Binary(Vec<u8>),
    Empty,
}

impl Debug for LineItem {
    fn fmt(&self, formatter: &mut Formatter) -> Result<(), fmt::Error> {
        match self {
            Self::Tag(tag) => write!(formatter, "Tag({:?})", tag),
            Self::Int(i) => write!(formatter, "Int({:?})", i),
            Self::Float(f) => write!(formatter, "Float({:?})", f),
            Self::Binary(bytes) => write!(
                formatter,
                "Binary(<{} bytes>)",
                bytes.len(),
            ),
            Self::Empty => write!(formatter, "Empty"),
        }
    }
}

pub type DiskVertex = (Vec3, i32);

pub type Disk = Vec<DiskVertex>;

pub mod raw {
    use glam::Vec2;

    #[derive(Clone, Debug)]
    #[allow(dead_code)]
    pub struct BodySegment {
        pub disk_info_idx: i32,
        pub action: i32,
        pub value: f32,
        pub color: i32,
        pub left: i32,
        pub right: i32,
    }

    #[derive(Clone, Debug)]
    #[allow(dead_code)]
    pub struct DiskInformation {
        pub shift: Vec2,
        pub scale: Vec2,
        pub disk_idx: i32,
        pub id: i32,
        pub flags: i32,
        pub arr1: [f32; 4],
        pub arr2: [f32; 4],
    }
}

pub mod cooked {
    use std::rc::Rc;
    use glam::Vec2;

    #[derive(Clone, Debug)]
    #[allow(dead_code)]
    pub struct BodySegment {
        pub index: usize,
        pub disk_info: Option<Rc<DiskInformation>>,
        pub action: i32,
        pub value: f32,
        pub color: Option<u32>,
        pub left: Option<Box<BodySegment>>,
        pub right: Option<Box<BodySegment>>,
    }

    #[derive(Clone, Debug)]
    #[allow(dead_code)]
    pub struct DiskInformation {
        pub shift: Vec2,
        pub scale: Vec2,
        pub disk: Option<Rc<crate::types::Disk>>,
        pub id: i32,
        pub flags: i32,
        pub arr1: [f32; 4],
        pub arr2: [f32; 4],
    }

    impl DiskInformation {
        pub fn from_raw(
            raw_info: crate::types::raw::DiskInformation,
            disks: &[Rc<crate::types::Disk>],
        ) -> Self {
            let disk = usize::try_from(raw_info.disk_idx).ok()
                .and_then(|idx| disks.get(idx).map(Rc::clone));

            Self {
                shift: raw_info.shift,
                scale: raw_info.scale,
                disk,
                id: raw_info.id,
                flags: raw_info.flags,
                arr1: raw_info.arr1,
                arr2: raw_info.arr2,
            }
        }
    }

}

#[derive(Clone, Debug)]
pub struct ModelConfig {
    pub disks: Vec<Disk>,
    pub disk_info: Vec<raw::DiskInformation>,
    pub body: Vec<raw::BodySegment>,
}

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct Model {
    disks: Vec<Rc<Disk>>,
    disk_info: Vec<Rc<cooked::DiskInformation>>,
    body: Option<Box<cooked::BodySegment>>,
}

impl Model {
    pub fn new(config: ModelConfig) -> Self {
        let ModelConfig {
            disks,
            disk_info: raw_disk_info,
            body: raw_body
        } = config;

        let disks: Vec<_> = disks.into_iter()
            .map(Rc::new)
            .collect();

        let disk_info: Vec<_> = raw_disk_info.into_iter().map(|raw_info|
            Rc::new(crate::types::cooked::DiskInformation::from_raw(
                raw_info,
                &disks[..]
            ))
        ).collect();

        let body = body_from_raw(raw_body, &disk_info[..]);

        Self {
            disks,
            disk_info,
            body
        }
    }
}

impl Model {
    pub fn body(&self) -> Option<&cooked::BodySegment> {
        self.body.as_deref()
    }

    #[allow(dead_code)]
    pub fn disk_size(&self) -> usize {
        self.disks.first().map(|v| v.len()).unwrap_or(0)
    }
}

pub fn body_from_raw(
    raw_body: Vec<raw::BodySegment>,
    disk_info: &[Rc<cooked::DiskInformation>],
) -> Option<Box<cooked::BodySegment>> {
    let mut visited = HashSet::<usize>::new();

    fn body_from_raw_rec(
        raw_body: &[raw::BodySegment],
        disk_info: &[Rc<cooked::DiskInformation>],
        idx: usize,
        visited: &mut HashSet<usize>,
    ) -> Option<Box<cooked::BodySegment>> {
        if visited.contains(&idx) {
            panic!("Cycle detected");
        }

        visited.insert(idx);

        let raw_node = raw_body.get(idx)?;

        let left = usize::try_from(raw_node.left)
            .ok()
            .and_then(|lf| body_from_raw_rec(
                raw_body,
                disk_info,
                lf,
                visited,
            ));

        let right = usize::try_from(raw_node.right)
            .ok()
            .and_then(|rt| body_from_raw_rec(
                raw_body,
                disk_info,
                rt,
                visited,
            ));
    
        let disk_info_piece = usize::try_from(raw_node.disk_info_idx)
            .ok()
            .filter(|_| raw_node.action <= 1)
            .and_then(|info_idx| disk_info.get(info_idx))
            .map(Rc::clone);

        Some(Box::new(cooked::BodySegment {
            index: idx,
            disk_info: disk_info_piece,
            action: raw_node.action,
            value: raw_node.value,
            color: u32::try_from(raw_node.color).ok(),
            left,
            right,
        }))
    }

    body_from_raw_rec(&raw_body[..], disk_info, 0, &mut visited)
}

#[derive(Clone, Debug, Default)]
pub struct Mesh {
    verts: Vec<Vec3>,
    indices: Vec<usize>,
}

impl Mesh {
    #[allow(dead_code)]
    pub fn add_disk(&mut self, disk: &[Vec3]) {
        let disk_size = disk.len();
        let new = self.verts.is_empty();
        let start_idx = self.verts.len() - disk.len();

        self.verts.extend(disk);
        
        if !new {
            for idx in 0..disk_size {
                let idx1 = idx + start_idx;
                let idx2 = (idx + 1) % disk_size + start_idx;
                let idx3 = idx2 + disk_size;
                let idx4 = idx1 + disk_size;
                self.indices.extend(&[idx1, idx2, idx3, idx4]);
            }
        }
    }

    pub fn add_loop(&mut self, start_disk: &[Vec3], end_disk: &[Vec3]) {
        self.verts.extend(start_disk);
        self.add_disk(end_disk);
    }
}

impl Display for Mesh {
    fn fmt(&self, formatter: &mut Formatter) -> Result<(), fmt::Error> {
        for v in &self.verts[..] {
            let [x, y, z] = (*v).into();
            // Swizzle y and z
            writeln!(formatter, "v {x:.9} {z:.9} {y:.9}")?;
        }

        // Flip faces
        for &[mut idx1, mut idx4, mut idx3, mut idx2]
            in self.indices.as_chunks().0
        {
            idx1+= 1;
            idx2+= 1;
            idx3+= 1;
            idx4+= 1;
            writeln!(formatter, "f {idx1} {idx2} {idx3} {idx4}")?;
        }

        Ok(())
    }
}
