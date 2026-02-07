export class Vec3 {
    private v: [number, number, number];

    constructor(x: number = 0, y: number = 0, z: number = 0) {
        this.v = [x, y, z];
        Object.freeze(this);
    }

    public x(): number {
        return this.v[0];
    }

    public y(): number {
        return this.v[1];
    }

    public z(): number {
        return this.v[2];
    }

    public add(other: Vec3) {
        return new Vec3(
            this.x() + other.x(),
            this.y() + other.y(),
            this.z() + other.z(),
        );
    }

    public scale(sc: number) {
        return new Vec3(
            sc * this.x(),
            sc * this.y(),
            sc * this.z(),
        );
    }
}

type RawMat3 = [
    [number, number, number],
    [number, number, number],
    [number, number, number],
];

export class Mat3 {
    private m: RawMat3;

    constructor(values: RawMat3 | null = null) {
        if (values == null) {
            this.m = [
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1],
            ];
        } else {
            this.m = values.map(row => Array.from(row)) as RawMat3;
        }

        Object.freeze(this);
    }

    public static fromRotationX(angle: number) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return new Mat3([
            [1, 0, 0],
            [0, cos, -sin],
            [0, sin, cos],
        ]);
    }

    public static fromRotationY(angle: number) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return new Mat3([
            [cos, 0, sin],
            [0, 1, 0],
            [-sin, 0, cos],
        ]);
    }

    public static fromRotationZ(angle: number) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return new Mat3([
            [cos, -sin, 0],
            [sin, cos, 0],
            [0, 0, 1],
        ]);
    }

    public static fromDiagonal(v: Vec3) {
        return new Mat3([
            [v.x(), 0, 0],
            [0, v.y(), 0],
            [0, 0, v.z()],
        ]);
    }

    public mul(other: Mat3): Mat3 {
        const rawOut: RawMat3 = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
        ];

        // Tighten-up those types!
        const indices: [0, 1, 2] = [0, 1, 2];

        for (const r of indices) {
            for (const c of indices) {
                const value = this.m[r][0] * other.m[0][c]
                    + this.m[r][1] * other.m[1][c]
                    + this.m[r][2] * other.m[2][c];

                rawOut[r][c] = value;
            }
        }

        return new Mat3(rawOut);
    }

    public mulCol(col: Vec3): Vec3 {
        const x = this.m[0][0] * col.x()
            + this.m[0][1] * col.y()
            + this.m[0][2] * col.z();
        const y = this.m[1][0] * col.x()
            + this.m[1][1] * col.y()
            + this.m[1][2] * col.z();
        const z = this.m[2][0] * col.x()
            + this.m[2][1] * col.y()
            + this.m[2][2] * col.z();

        return new Vec3(x, y, z);
    }
}

export class Affine3 {
    private matrix: Mat3;
    private translate: Vec3;

    constructor(matrix: Mat3 | null = null, translate: Vec3 | null = null) {
        if (matrix == null) {
            matrix = new Mat3();
        }

        if (translate == null) {
            translate = new Vec3();
        }

        this.matrix = matrix;
        this.translate = translate;
        Object.freeze(this);
    }

    public combine(other: Affine3): Affine3 {
        const matrix = this.matrix.mul(other.matrix);
        const rotTranslate = this.matrix.mulCol(other.translate);
        const translate = this.translate.add(rotTranslate);
        return new Affine3(matrix, translate);
    }

    public transformPt(pt: Vec3): Vec3 {
        return this.matrix.mulCol(pt).add(this.translate);
    }
}
