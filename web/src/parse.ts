import {
    type LineItem,
    type Disk,
    type DiskVertex,
    type RawDiskInfo,
    type RawBodySegment,
    Model
} from "./types.ts";

import { Vec3 } from "./math.ts";

const ASCII = {
    CARRIAGE_RETURN: "\r".charCodeAt(0),
    LINE_FEED: "\n".charCodeAt(0),
    MAX: 127,
};

Object.freeze(ASCII);

export function parseModel(bytes: Uint8Array): Model {
    const parsedLines = parseLines(bytes);
    let idx = parsedLines.length - 1;

    while (idx > 0) {
        if (parsedLines[idx-1]?.kind === "tag") {
            break;
        }

        --idx;
    }

    // Skip a few records to prevent parsing non-disk records as disks
    idx+= 6;

    const [disks, bodyIdx] = parseDisks(parsedLines, idx);
    const [body, diskInfoIdx] = parseBody(parsedLines, bodyIdx);
    const diskInfo = parseDiskInfo(parsedLines, diskInfoIdx);

    return new Model({
        disks,
        diskInfo,
        body,
    });
}

export class ParseError extends Error {
    public line: number;

    constructor(reason: string, index: number) {
        const line = index + 1;
        super(`Line ${line}: ${reason}`);
        this.line = line;
    }
}

function parseDisks(lines: LineItem[], idx: number): [Disk[], number] {
    const errorMsg = "Failed to parse disks";

    const parseVert = (idx: number): [DiskVertex, number] => {
        let x: number, y: number, z: number, int: number;
        let item: LineItem | undefined;

        item = lines[idx];
        if (item?.kind === "float") {
            x = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "float") {
            y = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "float") {
            z = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "int") {
            int = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        return [[new Vec3(x, y, z), int], idx];
    };

    const parseDisk = (
        idx: number,
        expectedSz: number | null
    ): [Disk, number] => {
        const disk = [];

        let vertCt: number;
        let item: LineItem | undefined;

        item = lines[idx];
        if (item?.kind === "int") {
            vertCt = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        if (vertCt < 1) {
            throw new ParseError(errorMsg, idx);
        }

        if (expectedSz != null && expectedSz !== vertCt) {
            throw new ParseError(errorMsg, idx);
        }

        for (let _i = 0; _i < vertCt; ++_i) {
            const [vert, newIdx] = parseVert(idx);
            idx = newIdx;
            disk.push(vert);
        }

        return [disk, idx];
    }

    let disks = [];
    let diskCt: number;
    let item: LineItem | undefined;
    let disksBroken = true;
    let expectedSz: number | null = null;

    while (idx < lines.length) {
        item = lines[idx];
        if (item?.kind === "int") {
            diskCt = item.value;
        } else {
            diskCt = 0;
        }

        ++idx;

        if (diskCt < 1) {
            continue;
        }

        let expectedCount: number | null = null;
        disksBroken = false;

        for (let _i = 0; _i < diskCt; ++_i) {
            try {
                const [disk, newIdx] = parseDisk(idx, expectedSz);
                expectedSz = disk.length;
                disks.push(disk);
                idx = newIdx;
            } catch (e) {
                disksBroken = true;
                break;
            }
        }

        if (disksBroken) {
            disks = [];
            expectedSz = null;
        } else {
            break;
        }
    }

    if (disksBroken) {
        throw new ParseError(errorMsg, idx);
    } else {
        return [disks, idx];
    }
}

function parseBody(lines: LineItem[], idx: number): [RawBodySegment[], number] {
    const body = [];
    const errorMsg = "Failed to parse body";

    let segmentCt: number;
    let item: LineItem | undefined;
    let diskInfoIdx: number, action: number, value: number, color: number,
        left: number, right: number;

    item = lines[idx];
    if (item?.kind === "int") {
        segmentCt = item.value;
        ++idx;

        while (segmentCt < 0) {
            item = lines[idx];
            if (item?.kind === "float") {
                ++idx;
            } else {
                throw new ParseError(errorMsg, idx);
            }

            item = lines[idx];
            if (item?.kind === "int") {
                segmentCt = item.value;
                ++idx;
            } else {
                throw new ParseError(errorMsg, idx);
            }
        }
    } else {
        throw new ParseError(errorMsg, idx);
    }

    for (let _i = 0; _i < segmentCt; ++_i) {
        item = lines[idx];
        if (item?.kind === "int") {
            diskInfoIdx = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "int") {
            action = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "float") {
            value = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "int") {
            color = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "int") {
            left = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "int") {
            right = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        body.push({
            diskInfoIdx,
            action,
            value,
            color,
            left,
            right,
        });
    }

    return [body, idx];
}

function parseDiskInfo(lines: LineItem[], idx: number): RawDiskInfo[] {
    const diskInfo = [];
    const errorMsg = "Failed to parse disk info";

    let diskIdx: number, id: number, flags: number, infoCt: number;
    let item: LineItem | undefined;

    item = lines[idx];
    if (item?.kind === "int") {
        infoCt = item.value;
        ++idx;
    } else {
        throw new ParseError(errorMsg, idx);
    }

    for (let _i = 0; _i < infoCt; ++_i) {
        const shift: [number, number] = [0, 0];
        const scale: [number, number] = [0, 0];
        const arr1: [number, number, number, number] = [0, 0, 0, 0];
        const arr2: [number, number, number, number] = [0, 0, 0, 0];

        item = lines[idx];
        if (item?.kind === "float") {
            shift[0] = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "float") {
            shift[1] = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "float") {
            scale[0] = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "float") {
            scale[1] = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "int") {
            diskIdx = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "int") {
            id = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        item = lines[idx];
        if (item?.kind === "int") {
            flags = item.value;
            ++idx;
        } else {
            throw new ParseError(errorMsg, idx);
        }

        const indices: [0, 1, 2, 3] = [0, 1, 2, 3];

        for (const arrIdx of indices) {
            item = lines[idx];
            if (item?.kind === "float") {
                arr1[arrIdx] = item.value;
                ++idx;
            } else {
                throw new ParseError(errorMsg, idx);
            }

            item = lines[idx];
            if (item?.kind === "float") {
                arr2[arrIdx] = item.value;
                ++idx;
            } else {
                throw new ParseError(errorMsg, idx);
            }
        }

        diskInfo.push({
            shift,
            scale: scale,
            diskIdx,
            id,
            flags,
            arr1,
            arr2,
        });
    }

    return diskInfo;
}

function parseLines(bytes: Uint8Array): LineItem[] {
    const maxBufSz = 256;
    const intRegex = /^-?\d+$/;
    const floatRegex = /^-?\d+\.\d+(e[-+]?\d+)?$/

    let items: LineItem[] = [];
    let lineBuffer = [];
    let itemStart = 0;
    let idx = 0;

    // Treat `bytes` like a stream, returning next byte on each call
    const read = (): number | null => {
        if (idx < bytes.length) {
            const byte = bytes[idx] ?? null;
            ++idx;
            return byte;
        }

        return null;
    };

    // Seek backwards by some number of elements
    const rewind = (count: number) => {
        idx-= count;

        if (idx < 0) {
            throw new Error("Rewound too far");
        }
    };

    // Read bytes into line items
    for (let byte; byte = read(), byte != null; ) {
        if (lineBuffer.length >= maxBufSz || byte > ASCII.MAX || byte === 0) {
            items.push({
                kind: "binary",
                value: bytes.subarray(itemStart)
            });

            // Not necessary, but it keeps state consistent
            idx = bytes.length;

            break;
        } else if (byte === ASCII.CARRIAGE_RETURN || byte === ASCII.LINE_FEED) {
            // Handle CR+LF (Windows) line-endings (which we expect from 3DA)
            if (byte === ASCII.CARRIAGE_RETURN) {
                byte = read();

                if (byte != null && byte !== ASCII.LINE_FEED) {
                    rewind(1);
                }
            }

            const str = charCodesToString(lineBuffer).trim();
            lineBuffer = [];
            itemStart = idx;

            if (str === "") {
                items.push({
                    kind: "empty",
                });
            } else if (intRegex.exec(str) != null) {
                items.push({
                    kind: "int",
                    value: parseInt(str, 10),
                });
            } else if (floatRegex.exec(str) != null) {
                items.push({
                    kind: "float",
                    value: parseFloat(str),
                })
            } else {
                items.push({
                    kind: "tag",
                    value: str,
                });
            }
        } else {
            lineBuffer.push(byte);
        }
    }

    return items;
}

const charCodesToString = (codes: number[]): string =>
    codes.map(code => String.fromCharCode(code)).join("");
