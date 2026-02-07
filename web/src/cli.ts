import { open } from "node:fs/promises";
import { parseModel } from "./parse.ts";
import { buildMesh } from "./util.ts";

function main([_node, _script, modelPath]: string[]) {
    if (modelPath == null) {
        console.error("No path argument provided");
        process.exit(1);
    }

    (async () => {
        const fileHandle = await open(modelPath, "r").catch(reason => {
            console.error(reason.message);
            process.exit(1);
        });
    
        const fileData = await fileHandle.readFile();
        fileHandle.close();
        const model = parseModel(fileData);
        const mesh = buildMesh(model.getBody());

        for (const line of mesh.toObjLines()) {
            console.log(line);
        }
    })();
}


main(process.argv);
