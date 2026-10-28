import { $f, copyText } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <h3>Options</h3>
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label class="ui-label">Count</label>
                        <input type="number" class="form-control" id="lorem-count" value="3" min="1" max="50">
                    </div>
                    <div>
                        <label class="ui-label">Type</label>
                        <select class="form-control cursor-pointer" id="lorem-type">
                            <option value="paragraphs">Paragraphs</option>
                            <option value="sentences">Sentences</option>
                            <option value="words">Words</option>
                        </select>
                    </div>
                </div>
                <button class="btn-primary btn-block" id="lorem-generate"><i class="material-icons">refresh</i> Generate</button>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Generated Text</h3>
                    <button class="btn-icon" id="lorem-copy"><i class="material-icons">content_copy</i> Copy</button>
                </div>
                <div class="panel-well p-5 min-h-[200px] max-h-[500px] overflow-y-auto leading-[1.8] whitespace-pre-wrap" id="lorem-result"></div>
            </div>
        </div>
    `;
    
    const generate = () => {
        const count = parseInt($f('lorem-count').value);
        const type = $f('lorem-type').value;
        let text = "";
        
        const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum".split(" ");
        
        if (type === 'words') {
            for(let i=0; i<count; i++) text += words[i % words.length] + " ";
        } else if (type === 'sentences') {
            for(let i=0; i<count; i++) {
                const sentenceWords = [];
                const len = 8 + Math.floor(Math.random() * 8);
                for (let j=0; j<len; j++) {
                    sentenceWords.push(words[Math.floor(Math.random() * words.length)]);
                }
                sentenceWords[0] = sentenceWords[0].charAt(0).toUpperCase() + sentenceWords[0].slice(1);
                text += sentenceWords.join(' ') + '. ';
            }
        } else {
            for(let i=0; i<count; i++) {
                text += "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\n";
            }
        }
        
        $f('lorem-result').textContent = text.trim();
    };
    
    $f('lorem-generate').onclick = generate;
    $f('lorem-copy').onclick = () => {
        const text = $f('lorem-result').textContent;
        void copyText(text ?? '');
    };
    generate();
}
