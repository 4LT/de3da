use std::env;
use std::iter;
use std::fs::File;
use std::io::BufReader;
use std::rc::Rc;
use glam::{Affine3, Mat3};

use iter::Iterator;

mod parse;
mod types;
mod app_error;

use parse::parse_model;
use types::{Mesh, Disk};
use app_error::AppError;


/*
#[derive(Clone, Debug)]
struct Record {
    pub tag: String,
    pub meta: Vec<i32>,
    pub rest_ct: usize,
}

impl Display for Record {
    fn fmt(&self, formatter: &mut Formatter) -> Result<(), fmt::Error> {
        write!(
            formatter,
            "{:16} : {:16} : {}",
            self.tag,
            self.meta.iter()
                .map(|i| i.to_string())
                .collect::<Vec<_>>()
                .join(","),
            self.rest_ct,
        )
    }
}
*/


fn main() -> Result<(), AppError> {
    let mut args = env::args_os();
    let arg = args.nth(1);

    let path = arg.ok_or(AppError("Provide argument for input path".into()))?;
    let file = File::open(path).map_err(
        |err| AppError(err.to_string())
    )?;

    let reader = BufReader::new(file);
    let model = parse_model(reader)?;

    let node = model.body();

    let mut mesh = Default::default();
    walk_body(node, Affine3::IDENTITY, &mut mesh, None);
    println!("{mesh}");

    Ok(())
}

fn walk_body(
    node: Option<&types::cooked::BodySegment>,
    mut xform: Affine3,
    mesh: &mut Mesh,
    mut prev_disk: Option<Rc<Disk>>,
) {
    if let Some(segment) = node {
        match segment.action {
            0 => {
                xform*= Affine3::from_translation(
                    [0f32, 0f32, segment.value].into()
                )
            },
            1 => {
                xform*= Affine3::from_translation(
                    [0f32, 0f32, segment.value].into()
                )
            },
            2 => {
                xform*= Affine3::from_rotation_x(segment.value.to_radians())
            },
            3 => {
                xform*= Affine3::from_rotation_y(segment.value.to_radians())
            },
            4 => {
                xform*= Affine3::from_rotation_z(segment.value.to_radians())
            },

            a => eprintln!("Unrecognized action {a}"),
        }

        if let Some(disk_info) = segment.disk_info.as_ref() {
            xform *= Affine3::from_translation(
                (disk_info.shift, 0f32).into()
            );

            let disk = disk_info.disk.as_ref()
                .or(prev_disk.as_ref())
                .map(
                    |d| d.iter()
                        .map(|&(mut v, _)| {
                            v = Mat3::from_diagonal(
                                (disk_info.scale, 1f32).into()
                            ) * v;
                            xform.transform_point3(v)
                        })
                        .collect()
                );

            if let Some(d) = disk {
                mesh.add_disk(d);
                prev_disk = disk_info.disk.clone();
            } 
        }

        walk_body(segment.left.as_deref(), xform, mesh, prev_disk.clone());
        walk_body(segment.right.as_deref(), xform, mesh, prev_disk);
    }
}

