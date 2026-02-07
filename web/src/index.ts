import { parseModel } from "./parse.ts";
import { buildMesh } from "./util.ts";
import { Mesh, Model } from "./types.ts";

(() => {
    let mesh: Mesh | null = null;

    const openBtn = document.getElementById("open-btn") as HTMLInputElement;
    const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
    const hiddenElement = document.getElementById("hidden") as HTMLElement;
    const content = document.getElementById("content") as HTMLElement;

    const populateContent = (model: Model) => {
        const {
            diskCt,
            diskInfoCt,
            bodySegmentCt,
        } = model.getStats();

        const header = document.createElement("H2");
        header.innerText = "Stats:";

        const diskStat = document.createElement("P");
        diskStat.innerText = `Disk count: ${diskCt}`;
        const diskInfoStat = document.createElement("P");
        diskInfoStat.innerText = `Disk information count: ${diskInfoCt}`;
        const bodyStat = document.createElement("P");
        bodyStat.innerText = `Body segment count: ${bodySegmentCt}`;

        content.appendChild(header);
        content.appendChild(diskStat);
        content.appendChild(diskInfoStat);
        content.appendChild(bodyStat);
    };

    const wipeContent = (): void => {
        content.innerHTML = "";
    };

    const writeFile = (blob: Blob) => {
        const url = URL.createObjectURL(blob);

        if (window.open != null) {
            open(url, "_blank");
        } else {
            const link = document.createElement("A") as HTMLAnchorElement;
            link.href = url;
            link.target = "_blank";
            hiddenElement.appendChild(link);
            link.click();
            hiddenElement.removeChild(link);
        }

        URL.revokeObjectURL(url);
    };

    const onClickSave = (evt: Event): void => {
        if (!saveBtn.disabled && mesh != null) {
            const lines = Array.from(mesh.toObjLines())
                .map(line => `${line}\n`);
            writeFile(new Blob(lines));
        }
    };

    const onOpen = (evt: Event): void => {
        const [file] = openBtn?.files ?? [];

        if (file != null) {
            saveBtn.disabled = true;
            wipeContent();

            file.arrayBuffer()
                .then(fileData => parseModel(new Uint8Array(fileData)))
                .then(model => {
                    mesh = buildMesh(model.getBody());
                    saveBtn.disabled = false;
                    populateContent(model);
                })
                .catch(reason => {
                    alert(`Failed to open file: ${reason.message}`);
                });
        }
    };

    openBtn.addEventListener("change", onOpen);
    saveBtn.addEventListener("click", onClickSave);

    openBtn.disabled = false;
})();
