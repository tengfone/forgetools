import { $f } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3>CSV</h3>
                        <button class="btn-icon btn-sm" data-paste="csv-input">
                            <i class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                    </div>
                    <textarea class="form-control" id="csv-input" rows="12" placeholder="id,name\n1,John"></textarea>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3>JSON</h3>
                        <button class="btn-icon btn-sm" data-copy="json-output">
                            <i class="material-icons icon-sm">content_copy</i> Copy
                        </button>
                    </div>
                    <textarea class="form-control" id="json-output" rows="12" placeholder="[\n  {\n    &quot;id&quot;: &quot;1&quot;,\n    &quot;name&quot;: &quot;John&quot;\n  }\n]"></textarea>
                </div>
            </div>
        </div>
    `;
    const csv = $f('csv-input');
    const json = $f('json-output');

    csv.addEventListener('input', () => {
        try {
            const result = window.electronAPI.csv.toJSON(csv.value);
            json.value = JSON.stringify(result.data, null, 2);
        } catch (e) {}
    });

    json.addEventListener('input', () => {
        try {
            const data = JSON.parse(json.value);
            csv.value = window.electronAPI.csv.fromJSON(data);
        } catch (e) {}
    });
}
