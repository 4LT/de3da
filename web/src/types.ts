import { Vec3 } from "./math.ts";

type TagItem = {
    kind: "tag",
    value: string,
};

type IntItem = {
    kind: "int",
    value: number,
};

type FloatItem = {
    kind: "float",
    value: number,
};

type BinaryItem = {
    kind: "binary",
    value: Uint8Array,
};

type EmptyItem = {
    kind: "empty",
};

export enum Action {
    SHIFT_0 = 0,
    SHIFT_1,
    ROT_X,
    ROT_Y,
    ROT_Z,
};

export type LineItem = TagItem | IntItem | FloatItem | BinaryItem | EmptyItem;

export type DiskVertex = [Vec3, number];
export type Disk = DiskVertex[];

export type RawDiskInfo = {
    shift: [number, number],
    scale: [number, number],
    diskIdx: number,
    id: number,
    flags: number,
    arr1: [number, number, number, number],
    arr2: [number, number, number, number],
};

export type RawBodySegment = {
    diskInfoIdx: number,
    action: number,
    value: number,
    color: number,
    left: number,
    right: number,
};

export type ModelConfig = {
    disks: Disk[],
    diskInfo: RawDiskInfo[],
    body: RawBodySegment[],
};

export class CookedDiskInfo {
    public index: number;
    public shift: [number, number];
    public scale: [number, number];
    public disk: Disk | null;
    public id: number;
    public flags: number;
    public arr1: [number, number, number, number];
    public arr2: [number, number, number, number];

    constructor(rawInfo: RawDiskInfo, index: number, disks: Disk[]) {
        const disk = disks[rawInfo.diskIdx] ?? null;

        this.index = index;
        this.shift = rawInfo.shift;
        this.scale = rawInfo.scale;
        this.disk = disk;
        this.id = rawInfo.id;
        this.flags = rawInfo.flags;
        this.arr1 = rawInfo.arr1;
        this.arr2 = rawInfo.arr2;
    }
}

export class CookedBodySegment {
    public index: number = -1;
    public diskInfo: CookedDiskInfo | null = null;
    public action: Action = Action.SHIFT_0;
    public value: number = 0;
    public color: number = -1;
    public left: CookedBodySegment | null = null;
    public right: CookedBodySegment | null = null;
}

function bodyFromRaw(
    rawBody: RawBodySegment[],
    diskInfo: CookedDiskInfo[]
): CookedBodySegment {
    const visited = new Set();

    const bodyFromRawRec = (
        idx: number,
    ): CookedBodySegment => {
        if (visited.has(idx)) {
            throw new Error("Cycle detected in body");
        }

        visited.add(idx);

        const rawNode = rawBody[idx] ?? null;

        if (rawNode == null) {
            throw new Error("Bad index in body");
        }

        const left = (rawNode.left < 0) ? null :
            bodyFromRawRec(rawNode.left);

        const right = (rawNode.right < 0) ? null :
            bodyFromRawRec(rawNode.right);

        const diskInfoPiece = (rawNode.action > 1) ? null :
            diskInfo[rawNode.diskInfoIdx] ?? null;

        const segment = new CookedBodySegment();

        segment.index = idx;
        segment.diskInfo = diskInfoPiece;
        segment.action = rawNode.action;
        segment.value = rawNode.value;
        segment.color = rawNode.color;
        segment.left = left;
        segment.right = right;

        return segment;
    }

    return bodyFromRawRec(0);
}

export type ModelStats = {
    diskCt: number,
    diskInfoCt: number,
    bodySegmentCt: number,
};

export class Model {
    private disks: Disk[];
    private diskInfo: CookedDiskInfo[];
    private body: CookedBodySegment;

    constructor(config: ModelConfig) {
        this.disks = config.disks;

        this.diskInfo = Array.from(config.diskInfo.entries())
            .map(([idx, diskInfo]: [number, RawDiskInfo]) =>
                 new CookedDiskInfo(diskInfo, idx, this.disks)
            );

        this.body = bodyFromRaw(config.body, this.diskInfo);
    }

    public getBody(): CookedBodySegment {
        return this.body;
    }

    public diskSize(): number {
        return this.disks[0]?.length ?? 0;
    }

    public getStats(): ModelStats {
        function bodySegmentCount(segment: CookedBodySegment): number {
            const leftCt = segment.left == null ? 0 :
                bodySegmentCount(segment.left);
            const rightCt = segment.right == null ? 0 :
                bodySegmentCount(segment.right);

            return leftCt + rightCt + 1;
        }

        return {
            diskCt: this.disks.length,
            diskInfoCt: this.diskInfo.length,
            bodySegmentCt: bodySegmentCount(this.body),
        };
    }
}

export class Mesh {
    private verts: Vec3[] = [];
    private indices: number[] = [];
    private meta: Map<number, MeshMeta> = new Map();

    public addDisk(disk: Vec3[], meta: MeshMeta | null): void {
        const diskSize = disk.length;
        const isNew = this.verts.length === 0;
        const initialVertsLength = this.verts.length;

        this.verts.push(...disk);

        if (!isNew) {
            const startIdx = initialVertsLength - diskSize;

            if (meta != null) {
                this.meta.set(this.indices.length / 4, meta);
            }

            for (let idx = 0; idx < diskSize; ++idx) {
                const idx1 = idx + startIdx;
                const idx2 = (idx + 1) % diskSize + startIdx;
                const idx3 = idx2 + diskSize;
                const idx4 = idx1 + diskSize;
                this.indices.push(idx1, idx2, idx3, idx4);
            }
        }
    }

    public addLoop(
        startDisk: Vec3[],
        endDisk: Vec3[],
        meta: MeshMeta | null
    ): void {
        this.verts.push(...startDisk);
        this.addDisk(endDisk, meta);
    }

    public *toObjLines(): Generator<string, undefined, void> {
        for (const v of this.verts) {
            const xStr = v.x().toFixed(9);
            const yStr = v.y().toFixed(9);
            const zStr = v.z().toFixed(9);
            // Swizzle y and z
            yield `v ${xStr} ${zStr} ${yStr}`;
        }

        const self = this;

        function *breakIntoChunks(): Generator<
            [number, number, number, number],
            undefined,
            void
        > {
            for (
                let chunkStart = 0;
                chunkStart < self.indices.length;
                chunkStart+= 4
            ) {
                // Type shenanigans to coerce [number, number, number, number]
                // out of slice
                const [a, b, c, d] =
                    self.indices.slice(chunkStart, chunkStart + 4);
                yield [a ?? 0, b ?? 0, c ?? 0, d ?? 0];
            }
        }

        const chunks = Array.from(breakIntoChunks());

        // Flip faces
        for (let [idxIdx, [idx1, idx4, idx3, idx2]] of chunks.entries()) {
            const meta = this.meta.get(idxIdx);
            idx1+= 1;
            idx2+= 1;
            idx3+= 1;
            idx4+= 1;

            if (meta != null) {
                yield `${meta}`;
            }

            yield `f ${idx1} ${idx2} ${idx3} ${idx4}`;
        }
    }
}

export class MeshMeta {
    public bodyIdx: number;
    public diskInfoIdx: number;

    constructor(bodyIdx: number, diskInfoIdx: number) {
        this.bodyIdx = bodyIdx;
        this.diskInfoIdx = diskInfoIdx;
    }

    public toString(): string {
        return `g body_idx=${this.bodyIdx} disk_info_idx=${this.diskInfoIdx}`;
    }
}

