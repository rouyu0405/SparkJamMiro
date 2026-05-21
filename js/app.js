// --- 1. STATE & GLOBALS ---
let activeTool = 'select';
let boardX = 0, boardY = 0;
const connections = [];

// DOM Elements
const viewport = document.getElementById('viewport');
const board = document.getElementById('board');
const htmlLayer = document.getElementById('html-layer');
const pathsGroup = document.getElementById('paths');
const drawingsGroup = document.getElementById('drawings');
const toolBtns = document.querySelectorAll('.tool-btn');
const sidebar = document.getElementById('sidebar');

// Unified 16-color modern Miro palette
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

const stickyColorPanel = document.getElementById('sticky-color-panel');
const colorGridContainer = document.getElementById('color-grid-container');

// --- 2. TOOLBAR SELECTION ---
toolBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        toolBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        activeTool = e.currentTarget.dataset.tool;
        viewport.style.cursor = activeTool === 'select' ? 'grab' : 'crosshair';
    });
});

function getBoardCoordinates(clientX, clientY) {
    return { x: clientX - boardX, y: clientY - boardY };
}

// --- 3. VIEWPORT INTERACTIONS ---
let isPanning = false, isDrawing = false;
let startPanX = 0, startPanY = 0;
let currentDrawingPath = null;

viewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('.toolbar') || e.target.closest('.board-object') || e.target.closest('#sticky-color-panel')) return;

    document.querySelectorAll('.board-object').forEach(el => el.classList.remove('active-obj'));

    const coords = getBoardCoordinates(e.clientX, e.clientY);

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
        const selectBtn = document.querySelector('[data-tool="select"]');
        if (selectBtn) selectBtn.click();
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
        const coords = getBoardCoordinates(e.clientX, e.clientY);
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

// --- 4. OBJECT CREATION ---
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

function setupTextEditing(el, textarea) {
    el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        el.classList.add('editing');
        textarea.style.pointerEvents = 'auto';
        textarea.focus();
        // Show format bar only while editing
        const container = el.closest('.sticky-container');
        if (container) container.classList.add('editing-container');
    });

    textarea.addEventListener('blur', () => {
        el.classList.remove('editing');
        textarea.style.pointerEvents = 'none';
        // Hide format bar when done editing
        const container = el.closest('.sticky-container');
        if (container) container.classList.remove('editing-container');
    });
}

function addColorPicker(el) {
    const palette = document.createElement('div');
    palette.className = 'color-palette';
    const shapeColors = ['#ffeb3b', '#ff9800', '#ff5722', '#e91e63', '#9c27b0', '#2196f3', '#4caf50'];
    shapeColors.forEach(color => {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.backgroundColor = color;
        dot.addEventListener('click', (e) => { e.stopPropagation(); el.style.backgroundColor = color; });
        palette.appendChild(dot);
    });
    el.appendChild(palette);
}

function spawnDrawingObject(bbox, pathData) {
    const el = document.createElement('div');
    el.className = 'board-object drawing-box';
    el.style.left = `${bbox.x}px`;
    el.style.top = `${bbox.y}px`;
    el.style.width = `${bbox.width}px`;
    el.style.height = `${bbox.height}px`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    svg.style.width = '100%';
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
    el.appendChild(textarea);

    htmlLayer.appendChild(el);
    makeDraggable(el);
    setupTextEditing(el, textarea);
}

// Scales font DOWN to fit fixed sticky square — never grows the box
function fitStickyFont(el) {
    const textarea = el.querySelector('textarea');
    if (!textarea) return;
    // 200px square - 32px total padding = 168px usable
    const maxH = 168;
    const maxW = 168;
    let size = 22;
    textarea.style.fontSize = size + 'px';
    void textarea.scrollHeight; // force layout
    while (size > 9 && (textarea.scrollHeight > maxH || textarea.scrollWidth > maxW)) {
        size -= 0.5;
        textarea.style.fontSize = size + 'px';
    }
}

// Sticky text format state per element (stored on the element itself)
function buildStickyFormatBar(el, textarea) {
    const bar = document.createElement('div');
    bar.className = 'sticky-format-bar';
    bar.setAttribute('aria-label', 'Text formatting options');

    // Bold
    const boldBtn = makeFmtBtn('B', 'Bold', () => {
        const isBold = textarea.style.fontWeight === '700' || textarea.style.fontWeight === 'bold';
        textarea.style.fontWeight = isBold ? '400' : '700';
        boldBtn.classList.toggle('fmt-active', !isBold);
        fitStickyFont(el);
    });
    boldBtn.style.fontWeight = '700';

    // Italic
    const italicBtn = makeFmtBtn('I', 'Italic', () => {
        const isItalic = textarea.style.fontStyle === 'italic';
        textarea.style.fontStyle = isItalic ? 'normal' : 'italic';
        italicBtn.classList.toggle('fmt-active', !isItalic);
        italicBtn.style.fontStyle = isItalic ? 'normal' : 'italic';
    });
    italicBtn.style.fontStyle = 'italic';

    // Align toggle (center / left / right)
    const alignments = ['center', 'left', 'right'];
    const alignIcons  = ['≡', '«', '»'];
    let alignIdx = 0;
    const alignBtn = makeFmtBtn(alignIcons[0], 'Text alignment', () => {
        alignIdx = (alignIdx + 1) % alignments.length;
        textarea.style.textAlign = alignments[alignIdx];
        alignBtn.textContent = alignIcons[alignIdx];
    });

    // Divider
    const div1 = document.createElement('div');
    div1.className = 'fmt-divider';

    // Font size nudge buttons
    const sizeDownBtn = makeFmtBtn('−', 'Decrease font size', () => {
        const cur = parseFloat(textarea.style.fontSize) || 18;
        textarea.style.fontSize = Math.max(9, cur - 2) + 'px';
    });
    const sizeUpBtn = makeFmtBtn('+', 'Increase font size', () => {
        const cur = parseFloat(textarea.style.fontSize) || 18;
        // Only grow if it still fits
        const next = cur + 2;
        textarea.style.fontSize = next + 'px';
        // Roll back if it overflows
        if (textarea.scrollHeight > el.clientHeight - 32 || textarea.scrollWidth > el.clientWidth - 32) {
            textarea.style.fontSize = cur + 'px';
        }
    });

    // Divider
    const div2 = document.createElement('div');
    div2.className = 'fmt-divider';

    // Color dot (reflects current sticky colour; click cycles through a mini palette)
    const miniPalette = ['#fff59d', '#ffb74d', '#f8bbd0', '#b39ddb', '#81d4fa', '#a5d6a7', '#eeeeee', '#212121'];
    let colorIdx = 0;
    const colorDot = document.createElement('div');
    colorDot.className = 'fmt-color-dot';
    colorDot.style.backgroundColor = el.style.backgroundColor || currentStickyColor;
    colorDot.title = 'Change colour';
    colorDot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        colorIdx = (colorIdx + 1) % miniPalette.length;
        const newColor = miniPalette[colorIdx];
        el.style.backgroundColor = newColor;
        colorDot.style.backgroundColor = newColor;
    });

    bar.append(boldBtn, italicBtn, alignBtn, div1, sizeDownBtn, sizeUpBtn, div2, colorDot);

    // Stop bar clicks from triggering board interactions
    // Stop bar clicks from blurring the textarea
    bar.addEventListener('mousedown', e => {
        e.stopPropagation();
        e.preventDefault(); // prevents textarea blur
        // Restore focus to textarea after button action
        setTimeout(() => textarea.focus(), 0);
    });
    return bar;
}

function makeFmtBtn(label, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'fmt-btn';
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); onClick(); });
    return btn;
}

function spawnObject(type, x, y) {
    const el = document.createElement('div');
    el.className = 'board-object';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    const wrapper = document.createElement('div');
    wrapper.className = 'text-container-wrapper';
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Type...';
    wrapper.appendChild(textarea);

    if (type === 'sticky') {
        // Wrap sticky + format bar in a container so the bar isn't clipped
        const container = document.createElement('div');
        container.className = 'sticky-container';
        container.style.position = 'absolute';
        container.style.left = `${x}px`;
        container.style.top  = `${y}px`;

        el.classList.add('sticky-note');
        el.style.left = '0';
        el.style.top  = '0';
        el.style.position = 'relative';
        el.style.backgroundColor = currentStickyColor;
        el.appendChild(wrapper);
        addHandles(el);

        const formatBar = buildStickyFormatBar(el, textarea);
        container.appendChild(formatBar);  // bar is sibling ABOVE sticky
        container.appendChild(el);

        // Proxy active-obj on the container so outline + z-index work
        el.addEventListener('mousedown', () => {
            document.querySelectorAll('.sticky-container').forEach(c => c.classList.remove('active-container'));
            container.classList.add('active-container');
        });

        setupTextEditing(el, textarea);
        textarea.addEventListener('input', () => {
            fitStickyFont(el);
            if (typeof updateConnections === 'function') updateConnections();
        });
        setTimeout(() => fitStickyFont(el), 10);

        htmlLayer.appendChild(container);
        makeDraggableContainer(container, el);
        container.classList.add('active-container');
        return; // early return — already appended
    } else if (type === 'shape') {
        el.classList.add('shape-rect');
        el.appendChild(wrapper);
        addHandles(el);
        addColorPicker(el);
        setupTextEditing(el, textarea);
        textarea.addEventListener('input', () => fitTextToContainer(el));
        setTimeout(() => fitTextToContainer(el), 10);
    } else if (type === 'text') {
        el.classList.add('text-box');
        textarea.placeholder = 'Add text...';
        el.appendChild(wrapper);
        setupTextEditing(el, textarea);
    } else if (type === 'frame') {
        el.classList.add('frame-box');
        const title = document.createElement('div');
        title.className = 'frame-title';
        title.innerText = 'New Frame';
        el.appendChild(title);
    }

    htmlLayer.appendChild(el);
    makeDraggable(el);
    el.classList.add('active-obj');
}

function addHandles(el) {
    ['top', 'right', 'bottom', 'left'].forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `conn-handle ${pos}`;
        handle.onmousedown = (e) => beginConnectionDraw(e, el);
        el.appendChild(handle);
    });
}

// --- 5. DRAGGING ---
function makeDraggable(el) {
    el.onmousedown = function(e) {
        if (activeTool !== 'select') return;
        if (e.target.classList.contains('conn-handle') || e.target.classList.contains('color-dot') || e.target.closest('.color-palette')) return;
        if (el.classList.contains('editing')) return;

        document.querySelectorAll('.board-object').forEach(obj => obj.classList.remove('active-obj'));
        el.classList.add('active-obj');

        let shiftX = e.clientX - el.getBoundingClientRect().left;
        let shiftY = e.clientY - el.getBoundingClientRect().top;

        let attachedObjects = [];
        if (el.classList.contains('frame-box')) {
            const frameRect = el.getBoundingClientRect();
            document.querySelectorAll('.board-object:not(.frame-box)').forEach(obj => {
                const objRect = obj.getBoundingClientRect();
                if (objRect.left >= frameRect.left && objRect.right <= frameRect.right &&
                    objRect.top >= frameRect.top && objRect.bottom <= frameRect.bottom) {
                    attachedObjects.push({ element: obj, offsetX: obj.offsetLeft - el.offsetLeft, offsetY: obj.offsetTop - el.offsetTop });
                }
            });
        }

        function moveAt(pageX, pageY) {
            const coords = getBoardCoordinates(pageX, pageY);
            const newX = coords.x - shiftX;
            const newY = coords.y - shiftY;
            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;
            attachedObjects.forEach(item => {
                item.element.style.left = `${newX + item.offsetX}px`;
                item.element.style.top = `${newY + item.offsetY}px`;
            });
            if (typeof updateConnections === 'function') updateConnections();
        }

        function onMouseMove(moveEvent) { moveAt(moveEvent.clientX, moveEvent.clientY); }
        document.addEventListener('mousemove', onMouseMove);
        el.onmouseup = function() { document.removeEventListener('mousemove', onMouseMove); el.onmouseup = null; };
    };
    el.ondragstart = () => false;
}

// Draggable for sticky containers (bar + note wrapped together)
function makeDraggableContainer(container, stickyEl) {
    stickyEl.onmousedown = function(e) {
        if (activeTool !== 'select') return;
        if (e.target.classList.contains('conn-handle')) return;
        if (stickyEl.classList.contains('editing')) return;

        document.querySelectorAll('.sticky-container').forEach(c => c.classList.remove('active-container'));
        document.querySelectorAll('.board-object').forEach(o => o.classList.remove('active-obj'));
        container.classList.add('active-container');

        let shiftX = e.clientX - parseFloat(container.style.left || 0) - boardX;
        let shiftY = e.clientY - parseFloat(container.style.top  || 0) - boardY;

        function moveAt(px, py) {
            const nx = px - boardX - shiftX;
            const ny = py - boardY - shiftY;
            container.style.left = nx + 'px';
            container.style.top  = ny + 'px';
            if (typeof updateConnections === 'function') updateConnections();
        }

        function onMove(ev) { moveAt(ev.clientX, ev.clientY); }
        document.addEventListener('mousemove', onMove);
        stickyEl.onmouseup = () => { document.removeEventListener('mousemove', onMove); stickyEl.onmouseup = null; };
    };
    stickyEl.ondragstart = () => false;
}
let isDrawingConnection = false;
let tempPath = null;
let currentSourceObj = null;

function beginConnectionDraw(e, sourceObj) {
    e.stopPropagation();
    isDrawingConnection = true;
    currentSourceObj = sourceObj;
    tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.setAttribute('stroke', '#9b99af');
    tempPath.setAttribute('stroke-width', '2');
    tempPath.setAttribute('fill', 'none');
    tempPath.setAttribute('stroke-linecap', 'round');
    tempPath.setAttribute('marker-end', 'url(#arrowhead)');
    pathsGroup.appendChild(tempPath);
}

function calculateMiroCurve(sx, sy, tx, ty) {
    const dx = Math.abs(tx - sx);
    const dy = Math.abs(ty - sy);
    // Use whichever axis dominates to set a sensible control-point distance
    const dist = Math.sqrt(dx * dx + dy * dy);
    const offset = Math.min(dist * 0.4, 150);
    // Horizontal bias when wide, vertical bias when tall
    const cpX = dx >= dy ? offset : 0;
    const cpY = dx >= dy ? 0 : offset;
    return `M ${sx} ${sy} C ${sx + cpX} ${sy + cpY}, ${tx - cpX} ${ty - cpY}, ${tx} ${ty}`;
}

window.addEventListener('mousemove', (e) => {
    if (isDrawingConnection && tempPath) {
        const r = getObjRect(currentSourceObj);
        const sx = r.left + r.width / 2;
        const sy = r.top  + r.height / 2;
        const coords = getBoardCoordinates(e.clientX, e.clientY);
        tempPath.setAttribute('d', calculateMiroCurve(sx, sy, coords.x, coords.y));
    }
});

window.addEventListener('mouseup', (e) => {
    if (isDrawingConnection) {
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
        }
        if (tempPath) tempPath.remove();
        tempPath = null;
        currentSourceObj = null;
        const selectBtn = document.querySelector('[data-tool="select"]');
        if (selectBtn) selectBtn.click();
    }
});

function getObjRect(el) {
    // Stickies are inside .sticky-container — use the container's position
    const container = el.closest('.sticky-container');
    if (container) {
        return { left: parseFloat(container.style.left) || 0, top: parseFloat(container.style.top) || 0, width: el.offsetWidth, height: el.offsetHeight };
    }
    return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
}

function updateConnections() {
    connections.forEach(conn => {
        const sRect = getObjRect(conn.source);
        const tRect = getObjRect(conn.target);
        const sx = sRect.left + sRect.width / 2, sy = sRect.top + sRect.height / 2;
        const tx = tRect.left + tRect.width / 2, ty = tRect.top + tRect.height / 2;
        const dx = tx - sx, dy = ty - sy;
        const start = getIntersection(sRect, dx, dy, false);
        const end = getIntersection(tRect, -dx, -dy, true);
        conn.path.setAttribute('d', calculateMiroCurve(start.x, start.y, end.x, end.y));
    });
}

function getIntersection(rect, dx, dy, isTarget) {
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const hw = rect.width / 2, hh = rect.height / 2;
    const scaleX = dx === 0 ? Infinity : hw / Math.abs(dx);
    const scaleY = dy === 0 ? Infinity : hh / Math.abs(dy);
    const scale = Math.min(scaleX, scaleY);
    const padding = isTarget ? 14 : 0;
    const length = Math.sqrt(dx * dx + dy * dy);
    const adjustedScale = Math.max(0, scale - (padding / length));
    return { x: cx + dx * adjustedScale, y: cy + dy * adjustedScale };
}

// --- 7. ONBOARDING LOGIC ---
const onboardingOverlay = document.getElementById('onboarding-overlay');
const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const selectBtns = document.querySelectorAll('.select-tool-btn');
const continueBtn = document.getElementById('continue-btn');
const doneBtn = document.getElementById('done-btn');

let selectedConfig = null;

const toolConfigs = {
    simple: [
        { id: 'select', icon: '↖', title: 'Select (V)' },
        { id: 'frame', icon: '🪟', title: 'Frame (F)' },
        { id: 'sticky', icon: '📝', title: 'Sticky Note (N)' },
        { id: 'shape', icon: '⬛', title: 'Shape (S)' }
    ],
    default: [
        { id: 'select', icon: '↖', title: 'Select (V)' },
        { id: 'text', icon: 'T', title: 'Text (T)' },
        { id: 'sticky', icon: '📝', title: 'Sticky Note (N)' },
        { id: 'shape', icon: '⬛', title: 'Shape (S)' },
        { id: 'pen', icon: '🖊', title: 'Pen (P)' },
        { id: 'frame', icon: '🪟', title: 'Frame (F)' }
    ],
    custom: [] // Populated dynamically by the picker
};

function renderSidebar(configKey) {
    sidebar.innerHTML = '';
    const tools = configKey === 'custom' ? customSelectedTools : toolConfigs[configKey];
    tools.forEach((tool, index) => {
        const btn = document.createElement('button');
        btn.className = 'icon-btn tool-btn';
        if (index === 0) btn.classList.add('active');
        btn.dataset.tool = tool.id;
        btn.title = tool.title;
        btn.innerText = tool.icon;
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeTool = e.currentTarget.dataset.tool;
            viewport.style.cursor = activeTool === 'select' ? 'grab' : 'crosshair';
        });
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

        // Show/hide custom picker
        const picker = document.getElementById('custom-tool-picker');
        if (selectedConfig === 'custom') {
            picker.classList.remove('hidden');
        } else {
            picker.classList.add('hidden');
            renderSidebar(selectedConfig);
        }
    });
});

continueBtn.addEventListener('click', () => {
    step1.classList.add('hidden');
    step2.classList.remove('hidden');
});

doneBtn.addEventListener('click', () => {
    onboardingOverlay.classList.add('hidden');
});

// --- 8. CUSTOM TOOLBAR PICKER ---
const MAX_TOOLS = 8;
let customSelectedTools = [];

const allAvailableTools = {
    core: [
        { id: 'select', icon: '↖', title: 'Select (V)', label: 'Select' },
        { id: 'frame', icon: '🪟', title: 'Frame (F)', label: 'Frame' },
    ],
    creation: [
        { id: 'sticky', icon: '📝', title: 'Sticky Note (N)', label: 'Sticky' },
        { id: 'text',   icon: 'T',  title: 'Text (T)',         label: 'Text' },
        { id: 'shape',  icon: '⬛', title: 'Shape (S)',        label: 'Shape' },
        { id: 'pen',    icon: '🖊', title: 'Pen (P)',           label: 'Pen' },
        { id: 'connect',icon: '🔗', title: 'Connector',        label: 'Connect' },
        { id: 'image',  icon: '🖼️', title: 'Image',            label: 'Image' },
        { id: 'table',  icon: '⊞',  title: 'Table',            label: 'Table' },
        { id: 'card',   icon: '📇', title: 'Card',             label: 'Card' },
    ],
    a11y: [
        { id: 'sr-describe', icon: '🗣️', title: 'Describe (Ctrl+I)',  label: 'Describe' },
        { id: 'sr-overview', icon: '📋', title: 'Overview (Ctrl+D)',  label: 'Overview' },
        { id: 'sr-navigate', icon: '🧭', title: 'Navigate Objects',   label: 'Navigate' },
        { id: 'sr-shortcuts',icon: '⌨️', title: 'Shortcuts Panel',    label: 'Shortcuts' },
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

        chip.addEventListener('click', () => togglePickerTool(tool, chip));
        grid.appendChild(chip);
    });
}

function togglePickerTool(tool, chipEl) {
    const isSelected = chipEl.classList.contains('chip-selected');

    if (!isSelected && customSelectedTools.length >= MAX_TOOLS) {
        announceToScreenReader(`Maximum of ${MAX_TOOLS} tools reached.`);
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

    // Also update the custom-preview-box at the top of the column
    updateCustomPreviewBox();

    // If at least 1 tool selected & custom config is active, enable continue
    if (selectedConfig === 'custom') {
        continueBtn.disabled = customSelectedTools.length === 0;
        renderSidebar('custom');
    }
}

function updatePickerPreview() {
    const livePreview = document.getElementById('picker-live-preview');
    const countEl = document.getElementById('picker-count');
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

// --- 9. KEYBOARD SHORTCUTS PANEL ---
const shortcutsPanel = document.getElementById('shortcuts-panel');
const shortcutsToggleBtn = document.getElementById('shortcuts-toggle-btn');
const shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');

function openShortcutsPanel() {
    shortcutsPanel.classList.remove('hidden');
    shortcutsCloseBtn.focus();
    announceToScreenReader('Keyboard shortcuts panel opened.');
}

function closeShortcutsPanel() {
    shortcutsPanel.classList.add('hidden');
    shortcutsToggleBtn.focus();
    announceToScreenReader('Keyboard shortcuts panel closed.');
}

shortcutsToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (shortcutsPanel.classList.contains('hidden')) {
        openShortcutsPanel();
    } else {
        closeShortcutsPanel();
    }
});

shortcutsCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeShortcutsPanel();
});

// Close on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !shortcutsPanel.classList.contains('hidden')) {
        closeShortcutsPanel();
    }
});

// Close panel when clicking outside
document.addEventListener('click', (e) => {
    if (!shortcutsPanel.classList.contains('hidden') &&
        !shortcutsPanel.contains(e.target) &&
        e.target !== shortcutsToggleBtn &&
        !shortcutsToggleBtn.contains(e.target)) {
        closeShortcutsPanel();
    }
});

// --- 10. EXTENDED COLOR PALETTE ---
function initExtendedColorPanel() {
    if (!colorGridContainer) return;
    colorGridContainer.innerHTML = '';
    miroColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'sticky-color-swatch';
        swatch.style.backgroundColor = color;
        if (color === currentStickyColor) swatch.classList.add('selected-color');
        swatch.addEventListener('click', (e) => {
            e.stopPropagation();
            currentStickyColor = color;
            document.querySelectorAll('.sticky-color-swatch').forEach(s => s.classList.remove('selected-color'));
            swatch.classList.add('selected-color');
            const stickyBtn = document.querySelector('[data-tool="sticky"]');
            if (stickyBtn) stickyBtn.style.backgroundColor = currentStickyColor;
        });
        colorGridContainer.appendChild(swatch);
    });
}

window.addEventListener('click', () => {
    if (!stickyColorPanel) return;
    if (activeTool === 'sticky') {
        stickyColorPanel.classList.remove('hidden');
        const stickyBtn = document.querySelector('[data-tool="sticky"]');
        if (stickyBtn) stickyBtn.style.backgroundColor = currentStickyColor;
    } else {
        stickyColorPanel.classList.add('hidden');
        const stickyBtn = document.querySelector('[data-tool="sticky"]');
        if (stickyBtn) stickyBtn.style.backgroundColor = 'transparent';
    }
});

initExtendedColorPanel();

// --- 11. ACCESSIBLE KEYBOARD SHORTCUTS (SPATIAL CREATION) ---
let isWaitingForDirection = false;
let directionTimeout = null;

const sraudio = document.createElement('div');
sraudio.setAttribute('aria-live', 'assertive');
sraudio.setAttribute('aria-atomic', 'true');
sraudio.className = 'sr-only';
document.body.appendChild(sraudio);

function announceToScreenReader(message) {
    sraudio.textContent = '';
    setTimeout(() => { sraudio.textContent = message; }, 50);
}

window.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
    if (onboardingOverlay && !onboardingOverlay.classList.contains('hidden')) return;

    // Open shortcuts panel with '?'
    if (e.key === '?' && shortcutsPanel.classList.contains('hidden')) {
        openShortcutsPanel();
        return;
    }

    // Find selected object — stickies use active-container on their wrapper
    const activeContainer = document.querySelector('.sticky-container.active-container');
    const selectedEl = activeContainer
        ? activeContainer.querySelector('.board-object')
        : document.querySelector('.board-object.active-obj');

    if ((e.key === 'n' || e.key === 'N') && !isWaitingForDirection) {
        if (!selectedEl) {
            announceToScreenReader("No object selected. Please select an element first using Tab.");
            return;
        }
        isWaitingForDirection = true;
        e.preventDefault();
        announceToScreenReader("Create note mode active. Press Right Arrow to clone right, or Shift plus Down Arrow to link below.");
        clearTimeout(directionTimeout);
        directionTimeout = setTimeout(() => {
            if (isWaitingForDirection) {
                isWaitingForDirection = false;
                announceToScreenReader("Create note mode timed out.");
            }
        }, 5000);
        return;
    }

    if (isWaitingForDirection && selectedEl) {
        // For stickies, position lives on the container; for others, on the element itself
        const posSource = activeContainer || selectedEl;
        const currentX = parseFloat(posSource.style.left) || 0;
        const currentY = parseFloat(posSource.style.top)  || 0;
        const currentW = selectedEl.offsetWidth  || 200;
        const currentH = selectedEl.offsetHeight || 200;
        const spacingGap = 60;

        if (e.key === 'ArrowRight' && !e.shiftKey) {
            e.preventDefault();
            isWaitingForDirection = false;
            clearTimeout(directionTimeout);
            spawnObject('sticky', currentX + currentW + spacingGap, currentY);
            const newSticky = document.querySelector('.board-object.active-obj');
            if (newSticky) { fitStickyFont(newSticky); const ta = newSticky.querySelector('textarea'); if (ta) ta.focus(); }
            announceToScreenReader("Sticky note created to the right. Text editor opened.");
        }

        if (e.key === 'ArrowDown' && e.shiftKey) {
            e.preventDefault();
            isWaitingForDirection = false;
            clearTimeout(directionTimeout);
            spawnObject('sticky', currentX, currentY + currentH + spacingGap);
            // New sticky uses active-container, not active-obj
            const newContainer = document.querySelector('.sticky-container.active-container');
            const targetEl = newContainer ? newContainer.querySelector('.board-object') : null;
            if (targetEl && targetEl !== selectedEl) {
                fitStickyFont(targetEl);
                const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                pathEl.setAttribute('stroke', '#9b99af');
                pathEl.setAttribute('stroke-width', '2');
                pathEl.setAttribute('fill', 'none');
                pathEl.setAttribute('stroke-linecap', 'round');
                pathEl.setAttribute('marker-end', 'url(#arrowhead)');
                pathsGroup.appendChild(pathEl);
                connections.push({ source: selectedEl, target: targetEl, path: pathEl });
                updateConnections();
                const ta = targetEl.querySelector('textarea');
                if (ta) ta.focus();
            }
            announceToScreenReader("Sticky note created below and linked with a connector line. Text editor opened.");
        }
    }
});