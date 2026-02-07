import {
    Action,
    CookedBodySegment,
    Mesh,
    type Disk,
    MeshMeta,
} from "./types.ts";

import { Affine3, Mat3, Vec3 } from "./math.ts";

export function buildMesh(root: CookedBodySegment): Mesh {
    const mesh = new Mesh();

    buildMeshRec(
        root,
        new Affine3(),
        null,
        null,
        mesh
    );

    return mesh;
}

function buildMeshRec(
    node: CookedBodySegment | null,
    xform: Affine3,
    prevDisk: Disk | null,
    prevXformdDisk: Vec3[] | null,
    mesh: Mesh,
): void {
    if (node != null) {
        let xformBy;

        switch (node.action) {
            case Action.SHIFT_0:
            case Action.SHIFT_1:
                xformBy = new Affine3(null, new Vec3(0, 0, node.value));
                break;
            case Action.ROT_X:
                xformBy = new Affine3(Mat3.fromRotationX(
                    node.value / 180 * Math.PI
                ));
                break;
            case Action.ROT_Y:
                xformBy = new Affine3(Mat3.fromRotationY(
                    node.value / 180 * Math.PI
                ));
                break;
            case Action.ROT_Z:
                xformBy = new Affine3(Mat3.fromRotationZ(
                    node.value / 180 * Math.PI
                ));
                break;
            default:
                throw new Error(`Bad action ${node.action}`);
        }

        xform = xform.combine(xformBy);
        const diskInfo = node.diskInfo;

        if (diskInfo != null) {
            const [shiftX, shiftY] = diskInfo.shift;
            xformBy = new Affine3(null, new Vec3(shiftX, shiftY, 0));
            xform = xform.combine(xformBy);

            let disk = diskInfo.disk;

            if (disk == null) {
                disk = prevDisk;
            }

            if (disk != null) {
                const [scaleX, scaleY] = diskInfo.scale;
                const scale = Mat3.fromDiagonal(new Vec3(scaleX, scaleY, 1));
                const xformdDisk = disk.map(
                    ([pt, _i]) => xform.transformPt(scale.mulCol(pt))
                );

                if (prevXformdDisk != null) {
                    mesh.addLoop(
                        prevXformdDisk,
                        xformdDisk,
                        new MeshMeta(node.index, diskInfo.index)
                    );
                }

                prevXformdDisk = xformdDisk;
                prevDisk = disk;
            }
        }

        buildMeshRec(
            node.left,
            xform,
            prevDisk,
            prevXformdDisk,
            mesh
        );

        buildMeshRec(
            node.right,
            xform,
            prevDisk,
            prevXformdDisk,
            mesh
        );
    }
}
