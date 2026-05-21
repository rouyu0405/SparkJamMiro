// ─────────────────────────────────────────────────────────────────
// 1. STATE & GLOBALS
// ─────────────────────────────────────────────────────────────────
let activeTool = 'select';
let boardX = 0, boardY = 0;
const connections = [];

// DOM refs
const viewport      = document.getElementById('viewport');
const board         = document.getElementById('board');
const htmlLayer     = document.getElementById('html-layer');
const svgCanvas     = document.getElementById('svg-canvas');
const pathsGroup    = document.getElementById('paths');
const drawingsGroup = document.getElementById('drawings');
const sidebar       = document.getElementById('sidebar');

// Miro 16-colour palette
const miroColors = [
    '#fff59d', '#ffe082',
    '#ffb74d', '#ff8a80',
    '#f8bbd0', '#f48fb1',
    '#ce93d8', '#b39ddb',
    '#81d4fa', '#90caf9',
    '#80cbc4', '#a5d6a7',
    '#c5e1a5', '#e6ee9c',
    '#eeeeee', '#212121'
];
let currentStickyColor = miroColors[0];

const stickyColorPanel    = document.getElementById('sticky-color-panel');
const colorGridContainer  = document.getElementById('color-grid-container');

// ─────────────────────────────────────────────────────────────────
// 2. SCREEN READER HELPERS
// ─────────────────────────────────────────────────────────────────
const srLive   = document.getElementById('sr-live');
const srPolite = document.getElementById('sr-polite');

/** Immediately interrupts — for critical state changes */
function announceAssertive(msg) {
    srLive.textContent = '';
    requestAnimationFrame(() => { srLive.textContent = msg; });
}

/** Polite — waits for current speech to finish */
function announcePolite(msg) {
    srPolite.textContent = '';
    requestAnimationFrame(() => { srPolite.textContent = msg; });
}

// Keep old name working for any existing callers
function announceToScreenReader(msg) { announceAssertive(msg); }

/** Lightweight visual toast for sighted users (mirrors SR announcement) */
function showToast(msg, durationMs = 2200) {
    const existing = document.querySelector('.a11y-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'a11y-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 420);
    }, durationMs);
}

// ─────────────────────────────────────────────────────────────────
// 3. TOOLBAR SELECTION
// ─────────────────────────────────────────────────────────────────
function getToolBtns() { return document.querySelectorAll('.tool-btn'); }

function activateToolBtn(btn) {
    getToolBtns().forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    activeTool = btn.dataset.tool;
    viewport.style.cursor = activeTool === 'select' ? 'grab' : 'crosshair';
}

sidebar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tool-btn');
    if (btn) activateToolBtn(btn);
});

function selectToolById(id) {
    const btn = sidebar.querySelector(`[data-tool="${id}"]`);
    if (btn) activateToolBtn(btn);
}

// ─────────────────────────────────────────────────────────────────
// 4. COORDINATE HELPERS
// ─────────────────────────────────────────────────────────────────
function getBoardCoords(clientX, clientY) {
    return { x: clientX - boardX, y: clientY - boardY };
}

// ─────────────────────────────────────────────────────────────────
// 5. ALL BOARD OBJECTS — for Tab navigation
// ─────────────────────────────────────────────────────────────────
/** Returns all focusable board containers / objects in DOM order */
function getAllBoardObjects() {
    // Stickies live inside .sticky-container; all others are direct .board-object children
    const containers = Array.from(htmlLayer.querySelectorAll('.sticky-container'));
    const others = Array.from(htmlLayer.querySelectorAll('.board-object:not(.sticky-note)'));
    // Merge in DOM order by their top-level position in htmlLayer
    const all = Array.from(htmlLayer.children).flatMap(el => {
        if (el.classList.contains('sticky-container')) return [el];
        if (el.classList.contains('board-object') && !el.classList.contains('sticky-note')) return [el];
        return [];
    });
    return all;
}

let tabFocusIndex = -1; // current position in Tab cycle

function focusBoardObject(obj) {
    // Clear all selection states
    document.querySelectorAll('.sticky-container').forEach(c => c.classList.remove('active-container'));
    document.querySelectorAll('.board-object').forEach(o => o.classList.remove('active-obj'));

    if (obj.classList.contains('sticky-container')) {
        obj.classList.add('active-container');
        const sticky = obj.querySelector('.sticky-note');
        if (sticky) sticky.focus();
        describeObject(obj);
    } else {
        obj.classList.add('active-obj');
        obj.focus();
        describeObject(obj);
    }
}

// ─────────────────────────────────────────────────────────────────
// 6. DESCRIBE OBJECTS (Ctrl+I / Ctrl+D)
// ─────────────────────────────────────────────────────────────────
function getObjectDescription(obj) {
    const isContainer = obj.classList.contains('sticky-container');
    const sticky  = isContainer ? obj.querySelector('.sticky-note') : null;
    const isFrame = obj.classList.contains('frame-box');
    const isShape = obj.classList.contains('shape-rect');
    const isText  = obj.classList.contains('text-box');
    const isDraw  = obj.classList.contains('drawing-box');

    let type = 'Object';
    if (sticky || isContainer)  type = 'Sticky note';
    else if (isFrame) type = 'Frame';
    else if (isShape) type = 'Shape';
    else if (isText)  type = 'Text box';
    else if (isDraw)  type = 'Drawing';

    const el = sticky || obj;
    const textarea = el.querySelector('textarea');
    const content  = textarea ? textarea.value.trim() : '';
    const colorEl  = sticky || (isContainer ? obj.querySelector('.sticky-note') : obj);
    const color    = colorEl ? colorEl.style.backgroundColor : '';

    let desc = type;
    if (color)   desc += `, colour ${color}`;
    if (content) desc += `. Content: "${content}"`;
    else         desc += '. Empty — press Enter to add text.';

    const xPos = Math.round(parseFloat(obj.style.left) || 0);
    const yPos = Math.round(parseFloat(obj.style.top)  || 0);
    desc += `. Position: ${xPos} right, ${yPos} down.`;

    return desc;
}

function describeObject(obj) {
    announceAssertive(getObjectDescription(obj));
}

function describeBoardOverview() {
    const all = getAllBoardObjects();
    if (all.length === 0) {
        announceAssertive('Board is empty. Use the toolbar to create sticky notes, shapes, and more.');
        return;
    }
    const counts = {};
    all.forEach(obj => {
        const isContainer = obj.classList.contains('sticky-container');
        let type = 'object';
        if (isContainer || obj.classList.contains('sticky-note')) type = 'sticky note';
        else if (obj.classList.contains('frame-box'))  type = 'frame';
        else if (obj.classList.contains('shape-rect')) type = 'shape';
        else if (obj.classList.contains('text-box'))   type = 'text box';
        else if (obj.classList.contains('drawing-box'))type = 'drawing';
        counts[type] = (counts[type] || 0) + 1;
    });
    const summary = Object.entries(counts)
        .map(([t, n]) => `${n} ${t}${n > 1 ? 's' : ''}`)
        .join(', ');
    announceAssertive(`Board overview: ${all.length} total objects — ${summary}. ${connections.length} connector${connections.length !== 1 ? 's' : ''}.`);
}

// ─────────────────────────────────────────────────────────────────
// 7. VIEWPORT INTERACTIONS (pan + pen draw)
// ─────────────────────────────────────────────────────────────────
let isPanning = false, isDrawing = false;
let startPanX = 0, startPanY = 0;
let currentDrawingPath = null;

viewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('.toolbar, .board-object, #sticky-color-panel, .sticky-container, .sticky-format-bar')) return;

    // Deselect everything on blank-canvas click
    document.querySelectorAll('.sticky-container').forEach(c => c.classList.remove('active-container'));
    document.querySelectorAll('.board-object').forEach(o => o.classList.remove('active-obj'));
    tabFocusIndex = -1;

    const coords = getBoardCoords(e.clientX, e.clientY);

    if (activeTool === 'select') {
        isPanning = true;
        startPanX = e.clientX - boardX;
        startPanY = e.clientY - boardY;
        viewport.style.cursor = 'grabbing';

    } else if (activeTool === 'pen') {
        isDrawing = true;
        currentDrawingPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        currentDrawingPath.setAttribute('stroke', '#050038');
        currentDrawingPath.setAttribute('stroke-width', '4');
        currentDrawingPath.setAttribute('fill', 'none');
        currentDrawingPath.setAttribute('stroke-linecap', 'round');
        currentDrawingPath.setAttribute('stroke-linejoin', 'round');
        currentDrawingPath.setAttribute('d', `M ${coords.x} ${coords.y}`);
        drawingsGroup.appendChild(currentDrawingPath);

    } else {
        spawnObject(activeTool, coords.x, coords.y);
        selectToolById('select');
    }
});

window.addEventListener('mousemove', (e) => {
    if (isPanning) {
        boardX = e.clientX - startPanX;
        boardY = e.clientY - startPanY;
        board.style.transform = `translate(${boardX}px, ${boardY}px)`;
        viewport.style.backgroundPosition = `${boardX}px ${boardY}px`;
    }
    if (isDrawing && currentDrawingPath) {
        const coords = getBoardCoords(e.clientX, e.clientY);
        const d = currentDrawingPath.getAttribute('d');
        currentDrawingPath.setAttribute('d', `${d} L ${coords.x} ${coords.y}`);
    }
});

window.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        viewport.style.cursor = 'grab';
    }
    if (isDrawing && currentDrawingPath) {
        isDrawing = false;
        const bbox = currentDrawingPath.getBBox();
        if (bbox.width < 4 && bbox.height < 4) {
            currentDrawingPath.remove();
        } else {
            currentDrawingPath.remove();
            spawnDrawingObject(bbox, currentDrawingPath.getAttribute('d'));
        }
        currentDrawingPath = null;
    }
});

// ─────────────────────────────────────────────────────────────────
// 8. FONT FITTING
// ─────────────────────────────────────────────────────────────────
/** Scale font DOWN to fit the 200px sticky square. Never grows the box. */
function fitStickyFont(el) {
    const textarea = el.querySelector('textarea');
    if (!textarea) return;
    const maxH = 168, maxW = 168; // 200 - 32px padding
    let size = 22;
    textarea.style.fontSize = size + 'px';
    void textarea.scrollHeight;
    while (size > 9 && (textarea.scrollHeight > maxH || textarea.scrollWidth > maxW)) {
        size -= 0.5;
        textarea.style.fontSize = size + 'px';
    }
}

function fitTextToContainer(el) {
    const textarea = el.querySelector('textarea');
    if (!textarea) return;
    let fontSize = parseInt(el.style.height || el.offsetHeight) * 0.35;
    fontSize = Math.max(12, Math.min(fontSize, 48));
    textarea.style.fontSize = `${fontSize}px`;
    while ((textarea.scrollHeight > el.clientHeight || textarea.scrollWidth > el.clientWidth) && fontSize > 10) {
        fontSize--;
        textarea.style.fontSize = `${fontSize}px`;
    }
}

// ─────────────────────────────────────────────────────────────────
// 9. TEXT EDITING — enter/exit
//    The FORMAT BAR visibility is driven entirely by
//    .editing-container on the container, which is added
//    on textarea focus and removed on textarea blur.
// ─────────────────────────────────────────────────────────────────

/**
 * Enter edit mode: show format bar + enable textarea pointer events.
 * @param {HTMLElement} stickyEl   — the .sticky-note div
 * @param {HTMLElement} container  — the parent .sticky-container
 * @param {HTMLTextAreaElement} textarea
 */
function enterEditMode(stickyEl, container, textarea) {
    container.classList.add('editing-container');
    textarea.classList.add('editing-textarea'); // pointer-events: auto
    textarea.style.pointerEvents = 'auto';
    textarea.style.cursor = 'text';
    announceAssertive('Editing sticky note. Type your text. Press Escape to stop editing.');
}

/**
 * Exit edit mode: hide format bar + disable textarea pointer events.
 */
function exitEditMode(stickyEl, container, textarea) {
    container.classList.remove('editing-container');
    textarea.classList.remove('editing-textarea');
    textarea.style.pointerEvents = 'none';
    textarea.style.cursor = 'default';
    const content = textarea.value.trim();
    if (content) {
        announcePolite(`Stopped editing. Note says: "${content}"`);
    } else {
        announcePolite('Stopped editing. Note is empty.');
    }
}

// For non-sticky objects (shape, text-box etc.)
function setupTextEditing(el, textarea) {
    el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        el.classList.add('editing');
        textarea.style.pointerEvents = 'auto';
        textarea.focus();
    });
    textarea.addEventListener('blur', () => {
        el.classList.remove('editing');
        textarea.style.pointerEvents = 'none';
    });
}

// ─────────────────────────────────────────────────────────────────
// 10. FORMAT BAR — sticky notes only
// ─────────────────────────────────────────────────────────────────
function buildStickyFormatBar(stickyEl, textarea, container) {
    const bar = document.createElement('div');
    bar.className = 'sticky-format-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Text formatting for sticky note');

    // ── Bold ──────────────────────────────────────────────────────
    const boldBtn = makeFmtBtn('B', 'Bold (Ctrl+B)', () => {
        const isBold = textarea.style.fontWeight === '700' || textarea.style.fontWeight === 'bold';
        textarea.style.fontWeight = isBold ? '400' : '700';
        boldBtn.classList.toggle('fmt-active', !isBold);
        boldBtn.setAttribute('aria-pressed', String(!isBold));
        fitStickyFont(stickyEl);
        announceAssertive(isBold ? 'Bold off' : 'Bold on');
    });
    boldBtn.style.fontWeight = '700';
    boldBtn.setAttribute('aria-pressed', 'false');

    // ── Italic ────────────────────────────────────────────────────
    const italicBtn = makeFmtBtn('I', 'Italic (Ctrl+Alt+I)', () => {
        const isItalic = textarea.style.fontStyle === 'italic';
        textarea.style.fontStyle = isItalic ? 'normal' : 'italic';
        italicBtn.classList.toggle('fmt-active', !isItalic);
        italicBtn.setAttribute('aria-pressed', String(!isItalic));
        italicBtn.style.fontStyle = isItalic ? 'normal' : 'italic';
        announceAssertive(isItalic ? 'Italic off' : 'Italic on');
    });
    italicBtn.style.fontStyle = 'italic';
    italicBtn.setAttribute('aria-pressed', 'false');

    // ── Align toggle ──────────────────────────────────────────────
    const alignments = ['center', 'left', 'right'];
    const alignIcons  = ['≡', '«', '»'];
    const alignLabels = ['Centre aligned', 'Left aligned', 'Right aligned'];
    let alignIdx = 0;
    const alignBtn = makeFmtBtn(alignIcons[0], 'Text alignment', () => {
        alignIdx = (alignIdx + 1) % alignments.length;
        textarea.style.textAlign = alignments[alignIdx];
        alignBtn.textContent = alignIcons[alignIdx];
        alignBtn.title = alignLabels[alignIdx];
        announceAssertive(alignLabels[alignIdx]);
    });

    const div1 = document.createElement('div');
    div1.className = 'fmt-divider';
    div1.setAttribute('aria-hidden', 'true');

    // ── Font size ─────────────────────────────────────────────────
    const sizeDownBtn = makeFmtBtn('−', 'Decrease font size (Ctrl+[)', () => {
        const cur = parseFloat(textarea.style.fontSize) || 18;
        const next = Math.max(9, cur - 2);
        textarea.style.fontSize = next + 'px';
        announceAssertive(`Font size ${next}px`);
    });
    const sizeUpBtn = makeFmtBtn('+', 'Increase font size (Ctrl+])', () => {
        const cur = parseFloat(textarea.style.fontSize) || 18;
        const next = cur + 2;
        textarea.style.fontSize = next + 'px';
        // Roll back if overflow
        if (textarea.scrollHeight > stickyEl.clientHeight - 32 || textarea.scrollWidth > stickyEl.clientWidth - 32) {
            textarea.style.fontSize = cur + 'px';
            announceAssertive('Font size at maximum for this note.');
        } else {
            announceAssertive(`Font size ${next}px`);
        }
    });

    const div2 = document.createElement('div');
    div2.className = 'fmt-divider';
    div2.setAttribute('aria-hidden', 'true');

    // ── Colour dot ────────────────────────────────────────────────
    const miniPalette   = ['#fff59d','#ffb74d','#f8bbd0','#b39ddb','#81d4fa','#a5d6a7','#eeeeee','#212121'];
    const colorNames    = ['Yellow','Orange','Pink','Lavender','Blue','Green','White','Dark'];
    let   colorIdx      = 0;
    const colorDot      = document.createElement('div');
    colorDot.className  = 'fmt-color-dot';
    colorDot.style.backgroundColor = stickyEl.style.backgroundColor || currentStickyColor;
    colorDot.setAttribute('role', 'button');
    colorDot.setAttribute('tabindex', '0');
    colorDot.setAttribute('aria-label', 'Change sticky note colour');
    colorDot.title = 'Change colour (cycles through palette)';

    function cycleStickyColor() {
        colorIdx = (colorIdx + 1) % miniPalette.length;
        const newColor = miniPalette[colorIdx];
        stickyEl.style.backgroundColor = newColor;
        colorDot.style.backgroundColor = newColor;
        announceAssertive(`Colour changed to ${colorNames[colorIdx]}`);
        showToast(`Colour: ${colorNames[colorIdx]}`);
    }
    colorDot.addEventListener('mousedown', (e) => { e.stopPropagation(); cycleStickyColor(); });
    colorDot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleStickyColor(); }
    });

    // Expose the format-bar buttons to the in-textarea keyboard shortcuts
    stickyEl._fmtBoldBtn    = boldBtn;
    stickyEl._fmtItalicBtn  = italicBtn;
    stickyEl._fmtSizeDown   = sizeDownBtn;
    stickyEl._fmtSizeUp     = sizeUpBtn;
    stickyEl._fmtColorCycle = cycleStickyColor;

    bar.append(boldBtn, italicBtn, alignBtn, div1, sizeDownBtn, sizeUpBtn, div2, colorDot);

    // Prevent bar clicks from bubbling to the board
    bar.addEventListener('mousedown', e => e.stopPropagation());

    return bar;
}

function makeFmtBtn(label, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'fmt-btn';
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('type', 'button');
    btn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); onClick(); });
    return btn;
}

// ─────────────────────────────────────────────────────────────────
// 11. OBJECT CREATION
// ─────────────────────────────────────────────────────────────────
function spawnDrawingObject(bbox, pathData) {
    const el = document.createElement('div');
    el.className = 'board-object drawing-box';
    el.style.left   = `${bbox.x}px`;
    el.style.top    = `${bbox.y}px`;
    el.style.width  = `${bbox.width}px`;
    el.style.height = `${bbox.height}px`;
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Freehand drawing');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    svg.style.width  = '100%';
    svg.style.height = '100%';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('stroke', '#050038');
    path.setAttribute('stroke-width', '4');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
    el.appendChild(svg);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Add label...';
    textarea.setAttribute('aria-label', 'Drawing label');
    el.appendChild(textarea);

    htmlLayer.appendChild(el);
    makeDraggable(el);
    setupTextEditing(el, textarea);
}

function addColorPicker(el) {
    const palette = document.createElement('div');
    palette.className = 'color-palette';
    const shapeColors = ['#ffeb3b','#ff9800','#ff5722','#e91e63','#9c27b0','#2196f3','#4caf50'];
    shapeColors.forEach(color => {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.backgroundColor = color;
        dot.addEventListener('click', (e) => { e.stopPropagation(); el.style.backgroundColor = color; });
        palette.appendChild(dot);
    });
    el.appendChild(palette);
}

function addHandles(el) {
    ['top', 'right', 'bottom', 'left'].forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `conn-handle ${pos}`;
        handle.setAttribute('aria-label', `Connect from ${pos}`);
        handle.setAttribute('title', `Draw connector from ${pos}`);
        handle.onmousedown = (e) => beginConnectionDraw(e, el);
        el.appendChild(handle);
    });
}

/**
 * Main factory for all object types.
 * Returns the top-level element appended to htmlLayer
 * (for sticky: the .sticky-container; for others: the .board-object).
 */
function spawnObject(type, x, y, opts = {}) {
    const el = document.createElement('div');
    el.className = 'board-object';
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;

    const wrapper  = document.createElement('div');
    wrapper.className = 'text-container-wrapper';
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Type...';
    wrapper.appendChild(textarea);

    // ── STICKY ──────────────────────────────────────────────────
    if (type === 'sticky') {
        const container = document.createElement('div');
        container.className = 'sticky-container';
        container.style.position = 'absolute';
        container.style.left = `${x}px`;
        container.style.top  = `${y}px`;

        el.classList.add('sticky-note');
        el.style.left  = '0';
        el.style.top   = '0';
        el.style.position = 'relative';
        el.style.backgroundColor = opts.color || currentStickyColor;
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'note');

        // Give initial ARIA label; updated on content change
        el.setAttribute('aria-label', 'Empty sticky note. Double-click or press Enter to edit.');

        textarea.setAttribute('aria-label', 'Sticky note text');
        textarea.setAttribute('aria-multiline', 'true');
        el.appendChild(wrapper);
        addHandles(el);

        // Build format bar and prepend it to the container
        const formatBar = buildStickyFormatBar(el, textarea, container);
        container.appendChild(formatBar);   // order: -1 puts it above
        container.appendChild(el);

        // ── Edit mode: enter on dblclick OR mousedown on sticky when already active ──
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            enterEditMode(el, container, textarea);
            textarea.focus();
        });

        // ── Edit mode: exit on textarea blur ──
        textarea.addEventListener('blur', (e) => {
            // Don't exit if focus moved to the format bar
            const relatedTarget = e.relatedTarget;
            if (relatedTarget && container.contains(relatedTarget)) return;
            exitEditMode(el, container, textarea);
            // Update ARIA label with current content
            const content = textarea.value.trim();
            el.setAttribute('aria-label', content
                ? `Sticky note: "${content}". Press Enter to edit.`
                : 'Empty sticky note. Press Enter to edit.');
        });

        // Live ARIA label update + font fitting while typing
        textarea.addEventListener('input', () => {
            fitStickyFont(el);
            updateConnections();
            const content = textarea.value.trim();
            el.setAttribute('aria-label', content
                ? `Sticky note: "${content}". Press Escape to stop editing.`
                : 'Sticky note, empty. Press Escape to stop editing.');
        });

        // ── In-textarea keyboard shortcuts ─────────────────────
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                textarea.blur();
                el.focus();
                return;
            }
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'b' || e.key === 'B') {
                    e.preventDefault();
                    el._fmtBoldBtn && el._fmtBoldBtn.dispatchEvent(new MouseEvent('mousedown'));
                    return;
                }
                if (e.altKey && (e.key === 'i' || e.key === 'I')) {
                    e.preventDefault();
                    el._fmtItalicBtn && el._fmtItalicBtn.dispatchEvent(new MouseEvent('mousedown'));
                    return;
                }
                if (e.key === ']') {
                    e.preventDefault();
                    el._fmtSizeUp && el._fmtSizeUp.dispatchEvent(new MouseEvent('mousedown'));
                    return;
                }
                if (e.key === '[') {
                    e.preventDefault();
                    el._fmtSizeDown && el._fmtSizeDown.dispatchEvent(new MouseEvent('mousedown'));
                    return;
                }
            }
        });

        // ── Mouse selection ────────────────────────────────────
        el.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('conn-handle')) return;
            document.querySelectorAll('.sticky-container').forEach(c => c.classList.remove('active-container'));
            document.querySelectorAll('.board-object').forEach(o => o.classList.remove('active-obj'));
            container.classList.add('active-container');
        });

        setTimeout(() => fitStickyFont(el), 10);
        htmlLayer.appendChild(container);
        makeDraggableContainer(container, el);
        container.classList.add('active-container');

        announcePolite('Sticky note created. Double-click or press Enter to add text.');
        return container;

    // ── SHAPE ───────────────────────────────────────────────────
    } else if (type === 'shape') {
        el.classList.add('shape-rect');
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', 'Shape. Double-click to add text.');
        el.appendChild(wrapper);
        addHandles(el);
        addColorPicker(el);
        setupTextEditing(el, textarea);
        textarea.addEventListener('input', () => fitTextToContainer(el));
        setTimeout(() => fitTextToContainer(el), 10);
        announcePolite('Shape created.');

    // ── TEXT BOX ────────────────────────────────────────────────
    } else if (type === 'text') {
        el.classList.add('text-box');
        textarea.placeholder = 'Add text...';
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'textbox');
        el.setAttribute('aria-label', 'Text box. Double-click to edit.');
        el.appendChild(wrapper);
        setupTextEditing(el, textarea);
        announcePolite('Text box created.');

    // ── FRAME ───────────────────────────────────────────────────
    } else if (type === 'frame') {
        el.classList.add('frame-box');
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'Frame container');
        const title = document.createElement('div');
        title.className = 'frame-title';
        title.innerText  = 'New Frame';
        title.setAttribute('aria-hidden', 'true');
        el.appendChild(title);
        announcePolite('Frame created.');
    }

    htmlLayer.appendChild(el);
    makeDraggable(el);
    el.classList.add('active-obj');
    return el;
}

// ─────────────────────────────────────────────────────────────────
// 12. DRAGGING
// ─────────────────────────────────────────────────────────────────
function makeDraggable(el) {
    el.onmousedown = function(e) {
        if (activeTool !== 'select') return;
        if (e.target.classList.contains('conn-handle') || e.target.classList.contains('color-dot') || e.target.closest('.color-palette')) return;
        if (el.classList.contains('editing')) return;

        document.querySelectorAll('.board-object').forEach(obj => obj.classList.remove('active-obj'));
        el.classList.add('active-obj');

        let shiftX = e.clientX - el.getBoundingClientRect().left;
        let shiftY = e.clientY - el.getBoundingClientRect().top;

        let attached = [];
        if (el.classList.contains('frame-box')) {
            const frameRect = el.getBoundingClientRect();
            document.querySelectorAll('.board-object:not(.frame-box)').forEach(obj => {
                const r = obj.getBoundingClientRect();
                if (r.left >= frameRect.left && r.right <= frameRect.right &&
                    r.top  >= frameRect.top  && r.bottom <= frameRect.bottom) {
                    attached.push({ element: obj, offsetX: obj.offsetLeft - el.offsetLeft, offsetY: obj.offsetTop - el.offsetTop });
                }
            });
        }

        function moveAt(px, py) {
            const c = getBoardCoords(px, py);
            el.style.left = `${c.x - shiftX}px`;
            el.style.top  = `${c.y - shiftY}px`;
            attached.forEach(item => {
                item.element.style.left = `${parseFloat(el.style.left) + item.offsetX}px`;
                item.element.style.top  = `${parseFloat(el.style.top)  + item.offsetY}px`;
            });
            updateConnections();
        }

        const onMove = (ev) => moveAt(ev.clientX, ev.clientY);
        document.addEventListener('mousemove', onMove);
        el.onmouseup = () => { document.removeEventListener('mousemove', onMove); el.onmouseup = null; };
    };
    el.ondragstart = () => false;
}

/** Draggable for .sticky-container — moves the whole container (bar + note) */
function makeDraggableContainer(container, stickyEl) {
    stickyEl.onmousedown = function(e) {
        if (activeTool !== 'select') return;
        if (e.target.classList.contains('conn-handle')) return;
        // If already in edit mode, don't start a drag
        if (container.classList.contains('editing-container')) return;

        document.querySelectorAll('.sticky-container').forEach(c => c.classList.remove('active-container'));
        document.querySelectorAll('.board-object').forEach(o => o.classList.remove('active-obj'));
        container.classList.add('active-container');

        const shiftX = e.clientX - parseFloat(container.style.left || 0) - boardX;
        const shiftY = e.clientY - parseFloat(container.style.top  || 0) - boardY;

        function moveAt(px, py) {
            container.style.left = `${px - boardX - shiftX}px`;
            container.style.top  = `${py - boardY - shiftY}px`;
            updateConnections();
        }

        const onMove = (ev) => moveAt(ev.clientX, ev.clientY);
        document.addEventListener('mousemove', onMove);
        stickyEl.onmouseup = () => { document.removeEventListener('mousemove', onMove); stickyEl.onmouseup = null; };
    };
    stickyEl.ondragstart = () => false;
}

// ─────────────────────────────────────────────────────────────────
// 13. CONNECTIONS
// ─────────────────────────────────────────────────────────────────
let isDrawingConnection = false;
let tempPath = null;
let currentSourceObj = null;

function beginConnectionDraw(e, sourceObj) {
    e.stopPropagation();
    isDrawingConnection = true;
    currentSourceObj   = sourceObj;
    tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.setAttribute('stroke', '#9b99af');
    tempPath.setAttribute('stroke-width', '2');
    tempPath.setAttribute('fill', 'none');
    tempPath.setAttribute('stroke-linecap', 'round');
    tempPath.setAttribute('marker-end', 'url(#arrowhead)');
    pathsGroup.appendChild(tempPath);
    announceAssertive('Drawing connector. Release on another object to connect.');
}

function calcCurve(sx, sy, tx, ty) {
    const dx = Math.abs(tx - sx);
    const ctrl = Math.min(dx * 0.5, 120);
    return `M ${sx} ${sy} C ${sx + ctrl} ${sy}, ${tx - ctrl} ${ty}, ${tx} ${ty}`;
}

window.addEventListener('mousemove', (e) => {
    if (isDrawingConnection && tempPath) {
        const r = getObjRect(currentSourceObj);
        const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
        const coords = getBoardCoords(e.clientX, e.clientY);
        tempPath.setAttribute('d', calcCurve(sx, sy, coords.x, coords.y));
    }
});

window.addEventListener('mouseup', (e) => {
    if (!isDrawingConnection) return;
    isDrawingConnection = false;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const targetObj = hit?.closest('.board-object');
    if (targetObj && targetObj !== currentSourceObj) {
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('stroke', '#9b99af');
        pathEl.setAttribute('stroke-width', '2');
        pathEl.setAttribute('fill', 'none');
        pathEl.setAttribute('stroke-linecap', 'round');
        pathEl.setAttribute('marker-end', 'url(#arrowhead)');
        pathsGroup.appendChild(pathEl);
        connections.push({ source: currentSourceObj, target: targetObj, path: pathEl });
        updateConnections();
        announcePolite('Connector created.');
    }
    if (tempPath) tempPath.remove();
    tempPath = null;
    currentSourceObj = null;
    selectToolById('select');
});

function getObjRect(el) {
    const container = el.closest('.sticky-container');
    if (container) {
        return {
            left:   parseFloat(container.style.left) || 0,
            top:    parseFloat(container.style.top)  || 0,
            width:  el.offsetWidth,
            height: el.offsetHeight
        };
    }
    return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
}

function updateConnections() {
    connections.forEach(conn => {
        const sR = getObjRect(conn.source);
        const tR = getObjRect(conn.target);
        const sx = sR.left + sR.width / 2,  sy = sR.top + sR.height / 2;
        const tx = tR.left + tR.width / 2,  ty = tR.top + tR.height / 2;
        const dx = tx - sx, dy = ty - sy;
        const start = getIntersection(sR,  dx,  dy, false);
        const end   = getIntersection(tR, -dx, -dy, true);
        conn.path.setAttribute('d', calcCurve(start.x, start.y, end.x, end.y));
    });
}

function getIntersection(rect, dx, dy, isTarget) {
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const hw = rect.width / 2, hh = rect.height / 2;
    const scaleX = dx === 0 ? Infinity : hw / Math.abs(dx);
    const scaleY = dy === 0 ? Infinity : hh / Math.abs(dy);
    const scale  = Math.min(scaleX, scaleY);
    const padding = isTarget ? 14 : 0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const adj = Math.max(0, scale - (padding / len));
    return { x: cx + dx * adj, y: cy + dy * adj };
}

// ─────────────────────────────────────────────────────────────────
// 14. GLOBAL KEYBOARD HANDLING
// ─────────────────────────────────────────────────────────────────
let isWaitingForDirection = false;
let directionTimeout = null;

document.addEventListener('keydown', (e) => {
    const inTextarea  = document.activeElement?.tagName === 'TEXTAREA';
    const inInput     = document.activeElement?.tagName === 'INPUT';
    const modalOpen   = onboardingOverlay && !onboardingOverlay.classList.contains('hidden');
    const panelOpen   = shortcutsPanel && !shortcutsPanel.classList.contains('hidden');

    // ── Inside textarea: handle Escape, Ctrl+B, Ctrl+Alt+I, Ctrl+[, Ctrl+] ──
    // (these are wired directly on the textarea in spawnObject; nothing extra here)

    // ── While a modal/panel is open — let it handle its own keys ──
    if (modalOpen && !inTextarea) return;
    if (panelOpen && e.key === 'Escape') {
        closeShortcutsPanel();
        return;
    }

    // ── Shortcuts that work outside textareas/inputs ──────────────
    if (inTextarea || inInput) return;

    // Open shortcuts panel
    if (e.key === '?') {
        openShortcutsPanel();
        return;
    }

    // Tool shortcuts
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const toolMap = { v: 'select', t: 'text', n: 'sticky', s: 'shape', p: 'pen', f: 'frame' };
        if (e.key.toLowerCase() in toolMap && !isWaitingForDirection) {
            if (e.key.toLowerCase() !== 'n') { // N is hijacked for spatial creation below
                selectToolById(toolMap[e.key.toLowerCase()]);
                return;
            }
        }
    }

    // Describe selected (Ctrl+I)
    if ((e.ctrlKey || e.metaKey) && e.key === 'i' && !e.altKey) {
        e.preventDefault();
        const activeContainer = document.querySelector('.sticky-container.active-container');
        const activeObj = document.querySelector('.board-object.active-obj');
        if (activeContainer) describeObject(activeContainer);
        else if (activeObj) describeObject(activeObj);
        else announceAssertive('No object selected. Tab to an object, then press Ctrl+I to describe it.');
        return;
    }

    // Board overview (Ctrl+D)
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        describeBoardOverview();
        return;
    }

    // Delete selected object (Del / Backspace)
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeContainer = document.querySelector('.sticky-container.active-container');
        const activeObj = document.querySelector('.board-object.active-obj');
        if (activeContainer) {
            announceAssertive('Deleted sticky note.');
            activeContainer.remove();
            tabFocusIndex = -1;
        } else if (activeObj) {
            const type = activeObj.classList.contains('frame-box') ? 'frame'
                : activeObj.classList.contains('shape-rect') ? 'shape'
                : activeObj.classList.contains('text-box') ? 'text box'
                : 'object';
            announceAssertive(`Deleted ${type}.`);
            activeObj.remove();
            tabFocusIndex = -1;
        }
        return;
    }

    // ── Enter: edit selected sticky ────────────────────────────
    if (e.key === 'Enter') {
        const activeContainer = document.querySelector('.sticky-container.active-container');
        if (activeContainer) {
            const stickyEl = activeContainer.querySelector('.sticky-note');
            const textarea = stickyEl?.querySelector('textarea');
            if (stickyEl && textarea) {
                e.preventDefault();
                enterEditMode(stickyEl, activeContainer, textarea);
                textarea.focus();
            }
        }
        return;
    }

    // ── Tab: navigate board objects ────────────────────────────
    if (e.key === 'Tab') {
        const all = getAllBoardObjects();
        if (all.length === 0) {
            announceAssertive('Board is empty. Use toolbar buttons or keyboard shortcuts to create objects.');
            return;
        }
        e.preventDefault();
        if (e.shiftKey) {
            tabFocusIndex = (tabFocusIndex - 1 + all.length) % all.length;
        } else {
            tabFocusIndex = (tabFocusIndex + 1) % all.length;
        }
        focusBoardObject(all[tabFocusIndex]);
        return;
    }

    // ── Escape: deselect all ───────────────────────────────────
    if (e.key === 'Escape') {
        document.querySelectorAll('.sticky-container').forEach(c => c.classList.remove('active-container'));
        document.querySelectorAll('.board-object').forEach(o => o.classList.remove('active-obj'));
        tabFocusIndex = -1;
        announcePolite('Selection cleared.');
        return;
    }

    // ── N: spatial creation mode (waits for arrow) ─────────────
    if ((e.key === 'n' || e.key === 'N') && !isWaitingForDirection && !e.ctrlKey && !e.metaKey) {
        const activeContainer = document.querySelector('.sticky-container.active-container');
        const activeObj       = document.querySelector('.board-object.active-obj');
        const selected        = activeContainer || activeObj;
        if (!selected) {
            // Create new sticky at a default position when nothing is selected
            const cx = Math.round(window.innerWidth / 2)  - boardX;
            const cy = Math.round(window.innerHeight / 2) - boardY;
            spawnObject('sticky', cx, cy);
            selectToolById('select');
            announceAssertive('Sticky note created at centre. Tab to navigate to it. Press Enter to edit.');
            return;
        }
        isWaitingForDirection = true;
        e.preventDefault();
        announceAssertive('Spatial create mode. Press Right Arrow to add note to the right, or Shift+Down to add below and link.');
        clearTimeout(directionTimeout);
        directionTimeout = setTimeout(() => {
            if (isWaitingForDirection) {
                isWaitingForDirection = false;
                announcePolite('Spatial create mode timed out.');
            }
        }, 5000);
        return;
    }

    // ── Arrow keys in spatial creation mode ───────────────────
    if (isWaitingForDirection) {
        const activeContainer = document.querySelector('.sticky-container.active-container');
        const activeObj       = document.querySelector('.board-object.active-obj');
        const selected        = activeContainer || activeObj;
        if (!selected) { isWaitingForDirection = false; return; }

        const refEl   = activeContainer || activeObj;
        const currentX = parseFloat(refEl.style.left)  || 0;
        const currentY = parseFloat(refEl.style.top)   || 0;
        const currentW = (activeContainer
            ? activeContainer.querySelector('.sticky-note')?.offsetWidth
            : activeObj?.offsetWidth) || 200;
        const currentH = (activeContainer
            ? activeContainer.querySelector('.sticky-note')?.offsetHeight
            : activeObj?.offsetHeight) || 200;
        const gap = 60;

        // Right Arrow → clone to the right
        if (e.key === 'ArrowRight' && !e.shiftKey) {
            e.preventDefault();
            isWaitingForDirection = false;
            clearTimeout(directionTimeout);
            const newContainer = spawnObject('sticky', currentX + currentW + gap, currentY);
            selectToolById('select');
            if (newContainer) focusBoardObject(newContainer);
            announceAssertive('Sticky note created to the right. Tab to it, then press Enter to edit.');
        }

        // Shift+Down → clone below AND draw a connector
        if (e.key === 'ArrowDown' && e.shiftKey) {
            e.preventDefault();
            isWaitingForDirection = false;
            clearTimeout(directionTimeout);
            const newContainer = spawnObject('sticky', currentX, currentY + currentH + gap);
            selectToolById('select');

            // Draw connector from the source sticky to the new one
            if (newContainer) {
                const sourceSticky = activeContainer
                    ? activeContainer.querySelector('.sticky-note')
                    : activeObj;
                const targetSticky = newContainer.querySelector('.sticky-note');
                if (sourceSticky && targetSticky) {
                    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    pathEl.setAttribute('stroke', '#9b99af');
                    pathEl.setAttribute('stroke-width', '2');
                    pathEl.setAttribute('fill', 'none');
                    pathEl.setAttribute('stroke-linecap', 'round');
                    pathEl.setAttribute('marker-end', 'url(#arrowhead)');
                    pathsGroup.appendChild(pathEl);
                    connections.push({ source: sourceSticky, target: targetSticky, path: pathEl });
                    updateConnections();
                }
                focusBoardObject(newContainer);
            }
            announceAssertive('Sticky note created below and linked with a connector. Press Enter to edit it.');
        }
    }
});

// ─────────────────────────────────────────────────────────────────
// 15. ONBOARDING LOGIC
// ─────────────────────────────────────────────────────────────────
const onboardingOverlay  = document.getElementById('onboarding-overlay');
const step1              = document.getElementById('step-1');
const step2              = document.getElementById('step-2');
const stepCustomName     = document.getElementById('step-custom-name');
const modalHeader        = document.querySelector('.modal-header');
const selectBtns         = document.querySelectorAll('.select-tool-btn');
const continueBtn        = document.getElementById('continue-btn');
const doneBtn            = document.getElementById('done-btn');
let   selectedConfig     = null;

const toolConfigs = {
    simple: [
        { id: 'select', icon: '↖', title: 'Select (V)' },
        { id: 'frame',  icon: '🪟', title: 'Frame (F)' },
        { id: 'sticky', icon: '📝', title: 'Sticky Note (N)' },
        { id: 'shape',  icon: '⬛', title: 'Shape (S)' }
    ],
    default: [
        { id: 'select', icon: '↖', title: 'Select (V)' },
        { id: 'text',   icon: 'T',  title: 'Text (T)' },
        { id: 'sticky', icon: '📝', title: 'Sticky Note (N)' },
        { id: 'shape',  icon: '⬛', title: 'Shape (S)' },
        { id: 'pen',    icon: '🖊', title: 'Pen (P)' },
        { id: 'frame',  icon: '🪟', title: 'Frame (F)' }
    ],
    custom: []
};

function renderSidebar(configKey) {
    sidebar.innerHTML = '';
    const tools = configKey === 'custom' ? customSelectedTools : toolConfigs[configKey];
    tools.forEach((tool, index) => {
        const btn = document.createElement('button');
        btn.className = 'icon-btn tool-btn';
        if (index === 0) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
        else { btn.setAttribute('aria-pressed', 'false'); }
        btn.dataset.tool = tool.id;
        btn.title = tool.title;
        btn.setAttribute('aria-label', tool.title);
        btn.innerText = tool.icon;
        sidebar.appendChild(btn);
    });
}

selectBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        selectBtns.forEach(b => {
            b.classList.remove('selected');
            const orig = b.getAttribute('data-original-text');
            if (orig) b.innerText = orig;
        });
        const target = e.currentTarget;
        if (!target.getAttribute('data-original-text')) {
            target.setAttribute('data-original-text', target.innerText);
        }
        target.classList.add('selected');
        target.innerText = '✓ Selected';
        selectedConfig = target.getAttribute('data-config');
        continueBtn.disabled = false;
        if (selectedConfig !== 'custom') renderSidebar(selectedConfig);
    });
});

continueBtn.addEventListener('click', () => {
    step1.classList.add('hidden');
    if (selectedConfig === 'custom') {
        modalHeader.classList.add('hidden');
        stepCustomName.classList.remove('hidden');
        document.getElementById('toolbar-name-input').focus();
    } else {
        step2.classList.remove('hidden');
    }
});

document.getElementById('cancel-custom-name-btn').addEventListener('click', () => {
    stepCustomName.classList.add('hidden');
    modalHeader.classList.remove('hidden');
    step1.classList.remove('hidden');
});

document.getElementById('continue-custom-name-btn').addEventListener('click', () => {
    // Tool selection step — to be implemented
});

doneBtn.addEventListener('click', () => {
    onboardingOverlay.classList.add('hidden');
    announcePolite('Setup complete. Board is ready. Press Tab to navigate objects, or use the toolbar to create new ones. Press ? for keyboard shortcuts.');
    // Focus the first toolbar button after modal closes
    setTimeout(() => sidebar.querySelector('.tool-btn')?.focus(), 100);
});

// ─────────────────────────────────────────────────────────────────
// 16. CUSTOM TOOLBAR PICKER
// ─────────────────────────────────────────────────────────────────
const MAX_TOOLS = 8;
let customSelectedTools = [];

const allAvailableTools = {
    core: [
        { id: 'select',  icon: '↖',  title: 'Select (V)',        label: 'Select' },
        { id: 'frame',   icon: '🪟', title: 'Frame (F)',          label: 'Frame' },
    ],
    creation: [
        { id: 'sticky',  icon: '📝', title: 'Sticky Note (N)',    label: 'Sticky' },
        { id: 'text',    icon: 'T',  title: 'Text (T)',            label: 'Text' },
        { id: 'shape',   icon: '⬛', title: 'Shape (S)',           label: 'Shape' },
        { id: 'pen',     icon: '🖊', title: 'Pen (P)',             label: 'Pen' },
        { id: 'connect', icon: '🔗', title: 'Connector',           label: 'Connect' },
        { id: 'image',   icon: '🖼️', title: 'Image',              label: 'Image' },
        { id: 'table',   icon: '⊞',  title: 'Table',              label: 'Table' },
        { id: 'card',    icon: '📇', title: 'Card',                label: 'Card' },
    ],
    a11y: [
        { id: 'sr-describe',  icon: '🗣️', title: 'Describe (Ctrl+I)',  label: 'Describe' },
        { id: 'sr-overview',  icon: '📋', title: 'Overview (Ctrl+D)',  label: 'Overview' },
        { id: 'sr-navigate',  icon: '🧭', title: 'Navigate Objects',   label: 'Navigate' },
        { id: 'sr-shortcuts', icon: '⌨️', title: 'Shortcuts Panel',    label: 'Shortcuts' },
    ]
};

function initCustomPicker() {
    renderPickerCategory('picker-grid-core',     allAvailableTools.core);
    renderPickerCategory('picker-grid-creation', allAvailableTools.creation);
    renderPickerCategory('picker-grid-a11y',     allAvailableTools.a11y);
    updatePickerPreview();
}

function renderPickerCategory(containerId, tools) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';
    tools.forEach(tool => {
        const chip = document.createElement('button');
        chip.className = 'picker-tool-chip';
        chip.dataset.toolId = tool.id;
        chip.innerHTML = `<span class="chip-icon" aria-hidden="true">${tool.icon}</span><span class="chip-label">${tool.label}</span>`;
        chip.setAttribute('aria-pressed', 'false');
        chip.setAttribute('title', tool.title);
        chip.setAttribute('type', 'button');
        chip.addEventListener('click', () => togglePickerTool(tool, chip));
        grid.appendChild(chip);
    });
}

function togglePickerTool(tool, chipEl) {
    const isSelected = chipEl.classList.contains('chip-selected');
    if (!isSelected && customSelectedTools.length >= MAX_TOOLS) {
        announceAssertive(`Maximum of ${MAX_TOOLS} tools reached.`);
        return;
    }
    if (isSelected) {
        customSelectedTools = customSelectedTools.filter(t => t.id !== tool.id);
        chipEl.classList.remove('chip-selected');
        chipEl.setAttribute('aria-pressed', 'false');
    } else {
        customSelectedTools.push(tool);
        chipEl.classList.add('chip-selected');
        chipEl.setAttribute('aria-pressed', 'true');
    }
    updatePickerPreview();
    updateCustomPreviewBox();
    if (selectedConfig === 'custom') {
        continueBtn.disabled = customSelectedTools.length === 0;
        renderSidebar('custom');
    }
}

function updatePickerPreview() {
    const livePreview = document.getElementById('picker-live-preview');
    const countEl     = document.getElementById('picker-count');
    if (!livePreview || !countEl) return;
    livePreview.innerHTML = '';
    if (customSelectedTools.length === 0) {
        livePreview.innerHTML = '<span style="font-size:12px;color:#bbb;">No tools selected yet</span>';
    } else {
        customSelectedTools.forEach(tool => {
            const chip = document.createElement('div');
            chip.className = 'preview-chip';
            chip.title = tool.title;
            chip.setAttribute('aria-label', tool.label);
            chip.textContent = tool.icon;
            livePreview.appendChild(chip);
        });
    }
    const count = customSelectedTools.length;
    countEl.textContent = `${count} / ${MAX_TOOLS} selected`;
    countEl.classList.toggle('at-max', count >= MAX_TOOLS);
}

function updateCustomPreviewBox() {
    const previewBox = document.getElementById('custom-preview-box');
    if (!previewBox) return;
    previewBox.innerHTML = '';
    if (customSelectedTools.length === 0) {
        previewBox.innerHTML = `<span class="custom-placeholder-icon">?</span><span class="custom-placeholder-icon">?</span><span class="add-btn">+</span>`;
    } else {
        customSelectedTools.forEach(tool => {
            const s = document.createElement('span');
            s.textContent = tool.icon;
            s.title = tool.label;
            previewBox.appendChild(s);
        });
        const add = document.createElement('span');
        add.className = 'add-btn';
        add.textContent = '+';
        previewBox.appendChild(add);
    }
}

initCustomPicker();

// ─────────────────────────────────────────────────────────────────
// 17. KEYBOARD SHORTCUTS PANEL
// ─────────────────────────────────────────────────────────────────
const shortcutsPanel     = document.getElementById('shortcuts-panel');
const shortcutsToggleBtn = document.getElementById('shortcuts-toggle-btn');
const shortcutsCloseBtn  = document.getElementById('shortcuts-close-btn');

function openShortcutsPanel() {
    shortcutsPanel.classList.remove('hidden');
    shortcutsToggleBtn.setAttribute('aria-expanded', 'true');
    shortcutsCloseBtn.focus();
    announcePolite('Keyboard shortcuts panel opened.');
}

function closeShortcutsPanel() {
    shortcutsPanel.classList.add('hidden');
    shortcutsToggleBtn.setAttribute('aria-expanded', 'false');
    shortcutsToggleBtn.focus();
    announcePolite('Keyboard shortcuts panel closed.');
}

shortcutsToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    shortcutsPanel.classList.contains('hidden') ? openShortcutsPanel() : closeShortcutsPanel();
});
shortcutsCloseBtn.addEventListener('click', (e) => { e.stopPropagation(); closeShortcutsPanel(); });

document.addEventListener('click', (e) => {
    if (!shortcutsPanel.classList.contains('hidden') &&
        !shortcutsPanel.contains(e.target) &&
        e.target !== shortcutsToggleBtn &&
        !shortcutsToggleBtn.contains(e.target)) {
        closeShortcutsPanel();
    }
});

// ─────────────────────────────────────────────────────────────────
// 18. EXTENDED STICKY COLOUR PANEL
// ─────────────────────────────────────────────────────────────────
function initExtendedColorPanel() {
    if (!colorGridContainer) return;
    colorGridContainer.innerHTML = '';
    miroColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'sticky-color-swatch';
        swatch.style.backgroundColor = color;
        swatch.setAttribute('tabindex', '0');
        swatch.setAttribute('role', 'button');
        swatch.setAttribute('aria-label', `Set sticky colour to ${color}`);
        if (color === currentStickyColor) swatch.classList.add('selected-color');
        const pick = (e) => {
            e.stopPropagation();
            currentStickyColor = color;
            document.querySelectorAll('.sticky-color-swatch').forEach(s => s.classList.remove('selected-color'));
            swatch.classList.add('selected-color');
        };
        swatch.addEventListener('click', pick);
        swatch.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') pick(e); });
        colorGridContainer.appendChild(swatch);
    });
}

window.addEventListener('click', () => {
    if (!stickyColorPanel) return;
    if (activeTool === 'sticky') {
        stickyColorPanel.classList.remove('hidden');
    } else {
        stickyColorPanel.classList.add('hidden');
    }
});

initExtendedColorPanel();