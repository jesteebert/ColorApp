class ColorAnalyzer {
    constructor() {
        this.canvas = document.getElementById('imageCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.colorCursor = document.getElementById('colorCursor');
        this.cursorPreview = this.colorCursor.querySelector('.cursor-preview');
        this.uploadArea = document.getElementById('uploadArea');
        this.canvasWrapper = document.getElementById('canvasWrapper');
        this.imageUpload = document.getElementById('imageUpload');
        this.analysisOverlay = document.getElementById('analysisOverlay');
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.swapImageBtn = document.getElementById('swapImageBtn');
        this.resetViewBtn = document.getElementById('resetViewBtn');
        this.pinColorBtn = document.getElementById('pinColorBtn');
        this.pinnedColorsList = document.getElementById('pinnedColorsList');
        this.clearAllBtn = document.getElementById('clearAllBtn');
        this.selectedColorMarker = document.getElementById('selectedColorMarker');
        this.generatePaletteBtn = document.getElementById('generatePaletteBtn');
        this.paletteDisplay = document.getElementById('paletteDisplay');
        
        this.colorData = [];
        this.pinnedColors = [];
        this.currentTab = 'color-picking';
        this.currentImage = null;
        this.currentImageData = null;
        this.activeCategory = null;
        this.currentColor = null;
        this.hoverColor = null;
        this.feedbackMode = 'design';
        this.activeFilter = null;
        this.filterOpacity = 0.5;
        this.originalImageData = null;

        // Color history (last 10 picked colors)
        this.colorHistory = [];

        // Color script state
        this.colorScriptActive = false;
        this.colorScriptZones  = null;

        // Region sampler state
        this.isSampling = false;
        this.sampleStart = null;
        this.sampleOverlay = null;

        // Loupe
        this.loupeCanvas = null;
        this.loupeCtx = null;

        this.initEventListeners();
        this.initLoupe();
        this.initSampleOverlay();

        // Reposition color script overlay on resize
        window.addEventListener('resize', () => {
            if (!this.colorScriptActive) return;
            const overlay = document.getElementById('colorScriptOverlay');
            if (overlay) this.positionScriptOverlay(overlay);
        });
    }
    
    initEventListeners() {
        // File upload
        this.uploadArea.addEventListener('click', () => this.imageUpload.click());
        this.imageUpload.addEventListener('change', (e) => this.handleImageUpload(e));
        
        // Swap and reset buttons
        this.swapImageBtn.addEventListener('click', () => this.swapImage());
        this.resetViewBtn.addEventListener('click', () => this.resetView());
        
        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        
        // Paste image
        document.addEventListener('paste', (e) => this.handlePaste(e));
        
        // Pin color button
        this.pinColorBtn.addEventListener('click', () => this.pinCurrentColor());
        
        // Clear all button
        this.clearAllBtn.addEventListener('click', () => this.clearAllPinnedColors());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'p' || e.key === 'P') {
                if (this.currentTab === 'color-picking' && this.currentColor) {
                    this.pinCurrentColor();
                }
            }
            if (e.key === 'Escape') {
                this.clearSelectedColor();
            }
        });
        
        // Tab switching
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // Canvas hover and click
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
        this.canvas.addEventListener('mouseleave', () => this.handleCanvasLeave());
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        // Region sampler (Shift+drag)
        this.canvas.addEventListener('mousedown', (e) => this.handleSampleStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleSampleMove(e));
        this.canvas.addEventListener('mouseup',   (e) => this.handleSampleEnd(e));
        
        // Analyze button
        this.analyzeBtn.addEventListener('click', () => this.analyzeImage());

        // Color Script button
        const colorScriptBtn = document.getElementById('colorScriptBtn');
        if (colorScriptBtn) {
            colorScriptBtn.addEventListener('click', () => this.generateColorScript());
        }
        
        // Generate palette button
        this.generatePaletteBtn.addEventListener('click', () => this.generatePalette());
        
        // Copy color values when clicked
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('copyable-color') || 
                e.target.classList.contains('bar-hex')) {
                this.copyToClipboard(e.target.textContent);
                this.showCopyFeedback(e.target);
            }
            
            if (e.target.closest('.scheme-color')) {
                const color = e.target.closest('.scheme-color').dataset.color;
                this.copyToClipboard(color);
                this.showCopyFeedback(e.target.closest('.scheme-color'));
            }
            
            if (e.target.classList.contains('harmony-color-dot')) {
                const color = e.target.style.backgroundColor;
                const hex = this.rgbStringToHex(color);
                this.copyToClipboard(hex);
                this.showCopyFeedback(e.target);
            }
        });
        
        // Mode selector
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.switchMode(mode);
            });
        });
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                this.applyFilter(filter);
            });
        });
        
        // Filter opacity slider
        const opacitySlider = document.getElementById('filterOpacity');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                this.filterOpacity = e.target.value / 100;
                document.getElementById('opacityValue').textContent = e.target.value + '%';
                if (this.activeFilter) {
                    this.applyFilter(this.activeFilter);
                }
            });
        }
        
        // Reset filter button
        const resetFilterBtn = document.getElementById('resetFilterBtn');
        if (resetFilterBtn) {
            resetFilterBtn.addEventListener('click', () => this.resetFilter());
        }
    }
    
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadArea.classList.add('drag-over');
    }
    
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadArea.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                this.loadImageFromFile(file);
            } else {
                this.showNotification('Please drop a valid image file.', 'warning');
            }
        }
    }
    
    handlePaste(e) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                this.loadImageFromFile(blob);
                break;
            }
        }
    }
    
    swapImage() {
        this.clearAnalysis();
        this.pinnedColors = [];
        this.updatePinnedColorsList();
        this.clearSelectedColor();
        this.canvasWrapper.style.display = 'none';
        this.uploadArea.style.display = 'flex';
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.clearLiveFeedback();
        this.imageUpload.click();
    }
    
    resetView() {
        this.clearSelectedColor();
        this.clearAnalysis();
    }
    
    switchTab(tabName) {
        this.currentTab = tabName;
        
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tabName);
        });
        
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === tabName);
        });
        
        if (tabName === 'analyzer') {
            this.colorCursor.classList.remove('active');
        } else if (tabName === 'color-picking') {
            this.analysisOverlay.hidden = true;
        } else if (tabName === 'live-feedback') {
            this.analysisOverlay.hidden = true;
            this.colorCursor.classList.remove('active');
            this.updateLiveFeedback();
        } else if (tabName === 'filters') {
            this.analysisOverlay.hidden = true;
        } else {
            this.analysisOverlay.hidden = true;
            this.colorCursor.classList.remove('active');
        }
    }
    
    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please upload a valid image file.', 'warning');
            return;
        }
        
        this.loadImageFromFile(file);
    }
    
    loadImageFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.displayImage(img);
                this.uploadArea.style.display = 'none';
                this.canvasWrapper.style.display = 'flex';
                this.clearAnalysis();
                this.updateLiveFeedback();
                this.showAutoAnalyzePrompt();
            };
            img.onerror = () => {
                this.showNotification('Failed to load image. Please try another.', 'error');
            };
            img.src = e.target.result;
        };
        reader.onerror = () => {
            this.showNotification('Failed to read file. Please try again.', 'error');
        };
        reader.readAsDataURL(file);
    }

    showAutoAnalyzePrompt() {
        // Remove any existing prompt
        const existing = document.getElementById('auto-analyze-prompt');
        if (existing) existing.remove();

        const prompt = document.createElement('div');
        prompt.id = 'auto-analyze-prompt';
        prompt.style.cssText = `
            position: fixed;
            bottom: 28px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: #1e293b;
            color: white;
            padding: 12px 16px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 500;
            z-index: 10001;
            opacity: 0;
            transition: all 0.3s ease;
            box-shadow: 0 8px 24px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            gap: 12px;
            white-space: nowrap;
        `;

        prompt.innerHTML = `
            <span>Auto analyze colors?</span>
            <button id="autoAnalyzeYes" style="
                padding: 6px 14px;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
            ">Yes</button>
            <button id="autoAnalyzeNo" style="
                padding: 6px 10px;
                background: transparent;
                color: rgba(255,255,255,0.6);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
            ">Skip</button>
        `;

        document.body.appendChild(prompt);

        // Animate in
        requestAnimationFrame(() => {
            prompt.style.opacity = '1';
            prompt.style.transform = 'translateX(-50%) translateY(0)';
        });

        const dismiss = () => {
            prompt.style.opacity = '0';
            prompt.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => prompt.remove(), 300);
        };

        document.getElementById('autoAnalyzeYes').addEventListener('click', () => {
            dismiss();
            // Switch to analyzer tab and run
            this.switchTab('analyzer');
            document.querySelectorAll('.tab-button').forEach(b =>
                b.classList.toggle('active', b.dataset.tab === 'analyzer')
            );
            setTimeout(() => this.analyzeImage(), 50);
        });

        document.getElementById('autoAnalyzeNo').addEventListener('click', dismiss);

        // Auto-dismiss after 6 seconds
        setTimeout(dismiss, 6000);
    }
    
    displayImage(img) {
        this.currentImage = img;
        
        // Calculate dimensions to fit the image properly
        const maxWidth = 800;
        const maxHeight = 600;
        
        let width = img.width;
        let height = img.height;
        
        // Scale down if too large
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
        }
        
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.drawImage(img, 0, 0, width, height);
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
    
    handleCanvasHover(e) {
        if (!this.currentImage) return;
        
        if (this.currentTab !== 'color-picking' && this.currentTab !== 'filters') return;
        
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        
        const x = Math.floor(canvasX);
        const y = Math.floor(canvasY);
        
        if (x >= 0 && x < this.canvas.width && y >= 0 && y < this.canvas.height) {
            this.colorCursor.classList.add('active');
            this.colorCursor.style.left = e.clientX + 'px';
            this.colorCursor.style.top = e.clientY + 'px';
            
            const pixelData = this.ctx.getImageData(x, y, 1, 1).data;
            const hex = this.rgbToHex(pixelData[0], pixelData[1], pixelData[2]);
            this.cursorPreview.style.backgroundColor = hex;

            this.updateLoupe(x, y, e.clientX, e.clientY);
            
            this.hoverColor = {
                rgb: { r: pixelData[0], g: pixelData[1], b: pixelData[2] },
                hex: hex
            };
        }
    }
    
    handleCanvasLeave() {
        this.colorCursor.classList.remove('active');
        if (this.loupeCanvas) this.loupeCanvas.style.display = 'none';
    }
    
    handleCanvasClick(e) {
        if (this.currentTab !== 'color-picking' || !this.currentImage) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        
        const x = Math.floor(canvasX);
        const y = Math.floor(canvasY);
        
        if (x >= 0 && x < this.canvas.width && y >= 0 && y < this.canvas.height) {
            const pixelData = this.ctx.getImageData(x, y, 1, 1).data;
            const rgb = { r: pixelData[0], g: pixelData[1], b: pixelData[2] };
            const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);
            const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
            const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
            
            this.currentColor = { rgb, hex, hsl, hsv };
            this.updateColorInfo(rgb, hex, hsl, hsv);
            this.addToColorHistory({ rgb, hex, hsl, hsv });
            
            this.selectedColorMarker.style.display = 'block';
            this.selectedColorMarker.style.left = e.clientX + 'px';
            this.selectedColorMarker.style.top = e.clientY + 'px';
            this.selectedColorMarker.style.backgroundColor = hex;
            
            this.pinColorBtn.disabled = false;
            
            this.updateLiveFeedback();
        }
    }
    
    clearSelectedColor() {
        this.currentColor = null;
        this.selectedColorMarker.style.display = 'none';
        this.updateColorInfo({ r: 0, g: 0, b: 0 }, '#000000', { h: 0, s: 0, l: 0 }, { h: 0, s: 0, v: 0 });
        this.pinColorBtn.disabled = true;
    }
    
    updateColorInfo(rgb, hex, hsl, hsv) {
        document.getElementById('colorPreview').style.backgroundColor = hex;
        document.getElementById('rgbValue').textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        document.getElementById('hexValue').textContent = hex;
        document.getElementById('hslValue').textContent = `hsl(${hsl.h}°, ${hsl.s}%, ${hsl.l}%)`;
        document.getElementById('hsvValue').textContent = `hsv(${hsv.h}°, ${hsv.s}%, ${hsv.v}%)`;
    }
    
    pinCurrentColor() {
        if (!this.currentColor) {
            this.showNotification('Pick a color first!', 'warning');
            return;
        }
        
        const alreadyPinned = this.pinnedColors.some(c => c.hex === this.currentColor.hex);
        if (alreadyPinned) {
            this.showNotification('This color is already pinned!', 'warning');
            return;
        }
        
        this.pinnedColors.push({...this.currentColor});
        this.updatePinnedColorsList();
        this.updateLiveFeedback();
        this.showNotification(`Pinned ${this.currentColor.hex}`, 'success');
    }
    
    updatePinnedColorsList() {
        if (this.pinnedColors.length === 0) {
            this.pinnedColorsList.innerHTML = '<p class="placeholder">No pinned colors yet</p>';
            this.clearAllBtn.style.display = 'none';
            return;
        }
        
        this.clearAllBtn.style.display = 'block';
        this.pinnedColorsList.innerHTML = '';
        
        this.pinnedColors.forEach((color, index) => {
            const colorItem = document.createElement('div');
            colorItem.className = 'pinned-color-item';
            
            colorItem.innerHTML = `
                <div class="color-swatch" style="background-color: ${color.hex}"></div>
                <div class="color-details">
                    <div class="color-hex copyable-color">${color.hex}</div>
                    <div class="color-values-small">
                        RGB: <span class="copyable-color">${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}</span><br>
                        HSL: <span class="copyable-color">${color.hsl.h}°, ${color.hsl.s}%, ${color.hsl.l}%</span>
                    </div>
                </div>
                <button class="unpin-btn" data-index="${index}" title="Unpin">×</button>
            `;
            
            const unpinBtn = colorItem.querySelector('.unpin-btn');
            unpinBtn.addEventListener('click', () => {
                this.pinnedColors.splice(index, 1);
                this.updatePinnedColorsList();
                this.updateLiveFeedback();
            });
            
            this.pinnedColorsList.appendChild(colorItem);
        });
    }
    
    clearAllPinnedColors() {
        if (this.pinnedColors.length === 0) return;
        this.pinnedColors = [];
        this.updatePinnedColorsList();
        this.updateLiveFeedback();
        this.showNotification('All pinned colors cleared', 'success');
    }
    
    analyzeImage() {
        if (!this.currentImageData) {
            this.showNotification('Please upload an image first!', 'warning');
            return;
        }
        
        this.colorData = this.extractColors(this.currentImageData);
        this.displayGradientMode();
        this.updateLiveFeedback();
    }
    
    // FIXED: Improved color extraction with distinctness checking
    extractColors(imageData) {
        const colorMap = new Map();
        const data = imageData.data;
        let validPixels = 0;
        
        // First pass: collect all colors with quantization
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha < 128) continue;
            
            validPixels++;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Use less aggressive quantization for better distinction
            const quantized = this.quantizeColor(r, g, b, 20);
            const hex = this.rgbToHex(quantized.r, quantized.g, quantized.b);
            
            colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
        }
        
        // Convert to array and sort by frequency
        let colorArray = Array.from(colorMap.entries())
            .map(([hex, count]) => {
                const rgb = this.hexToRgb(hex);
                const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
                const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
                const percentage = ((count / validPixels) * 100).toFixed(2);
                return { hex, count, percentage: parseFloat(percentage), rgb, hsl, hsv };
            })
            .sort((a, b) => b.count - a.count);
        
        // FIXED: Filter for distinct colors only
        const distinctColors = this.getDistinctColors(colorArray, 15);
        
        return distinctColors;
    }
    
    // NEW: Get distinct colors by checking color difference
    getDistinctColors(colorArray, maxColors = 15) {
        if (colorArray.length === 0) return [];
        
        const distinctColors = [];
        const minColorDifference = 25; // Threshold for color distinctness
        
        for (const color of colorArray) {
            // Always add the first color
            if (distinctColors.length === 0) {
                distinctColors.push(color);
                continue;
            }
            
            // Check if this color is distinct from already selected colors
            const isDistinct = distinctColors.every(existingColor => {
                const diff = this.getColorDifference(color.rgb, existingColor.rgb);
                return diff >= minColorDifference;
            });
            
            if (isDistinct) {
                distinctColors.push(color);
            }
            
            // Stop when we have enough distinct colors
            if (distinctColors.length >= maxColors) break;
        }
        
        return distinctColors;
    }
    
    // Calculate perceptual color difference
    getColorDifference(rgb1, rgb2) {
        // Use weighted Euclidean distance for better perceptual accuracy
        const rDiff = rgb1.r - rgb2.r;
        const gDiff = rgb1.g - rgb2.g;
        const bDiff = rgb1.b - rgb2.b;
        
        // Weights based on human perception
        const rWeight = 0.3;
        const gWeight = 0.59;
        const bWeight = 0.11;
        
        return Math.sqrt(
            rWeight * rDiff * rDiff +
            gWeight * gDiff * gDiff +
            bWeight * bDiff * bDiff
        );
    }
    
    //  quantization with configurable factor
    quantizeColor(r, g, b, factor = 20) {
        return {
            r: Math.round(r / factor) * factor,
            g: Math.round(g / factor) * factor,
            b: Math.round(b / factor) * factor
        };
    }
    
    displayGradientMode() {
        this.displayGradientStack('value', [...this.colorData].sort((a, b) => b.hsv.v - a.hsv.v));
        this.displayGradientStack('saturation', [...this.colorData].sort((a, b) => b.hsl.s - a.hsl.s));
        this.displayGradientStack('hue', [...this.colorData].sort((a, b) => a.hsl.h - b.hsl.h));
        this.displayGradientStack('frequency', [...this.colorData].sort((a, b) => b.count - a.count));
    }
    
    displayGradientStack(category, sortedColors) {
        const stackElement = document.getElementById(category + 'Gradient');
        
        // Clone to remove any previously attached click listeners before re-adding
        const fresh = stackElement.cloneNode(false);
        stackElement.parentNode.replaceChild(fresh, stackElement);
        fresh.id = category + 'Gradient';
        
        if (sortedColors.length === 0) {
            fresh.innerHTML = '<p class="placeholder">No colors analyzed yet</p>';
            return;
        }
        
        fresh.addEventListener('click', () => {
            this.toggleCategoryOverlay(category, sortedColors);
        });
        
        sortedColors.forEach(color => {
            const bar = document.createElement('div');
            bar.className = 'gradient-bar';
            bar.style.backgroundColor = color.hex;
            
            const brightness = (color.rgb.r * 299 + color.rgb.g * 587 + color.rgb.b * 114) / 1000;
            bar.style.color = brightness > 128 ? '#000' : '#fff';
            
            let displayValue = '';
            switch(category) {
                case 'value':      displayValue = `${color.hsv.v}%`; break;
                case 'saturation': displayValue = `${color.hsl.s}%`; break;
                case 'hue':        displayValue = `${color.hsl.h}°`; break;
                case 'frequency':  displayValue = `${color.percentage}%`; break;
            }
            
            bar.innerHTML = `
                <div class="bar-label">
                    <span class="bar-percentage">${displayValue}</span>
                    <span class="bar-hex copyable-color">${color.hex}</span>
                </div>
            `;
            
            fresh.appendChild(bar);
        });
    }
    
    toggleCategoryOverlay(category, sortedColors) {
        if (this.activeCategory === category) {
            this.hideColorOverlay();
            return;
        }
        
        this.activeCategory = category;
        
        document.querySelectorAll('.gradient-stack').forEach(stack => {
            stack.classList.remove('active');
        });
        document.getElementById(category + 'Gradient').classList.add('active');
        
        this.showColorOnImage(category, sortedColors);
    }
    
    showColorOnImage(category, sortedColors) {
        if (this.currentTab !== 'analyzer' || !this.currentImageData) return;
        
        this.analysisOverlay.innerHTML = '';
        this.analysisOverlay.hidden = false;
        
        const displayedPositions = [];
        const canvasRect = this.canvas.getBoundingClientRect();
        
        const topColors = sortedColors.slice(0, 10);
        
        topColors.forEach((color, index) => {
            const positions = this.findColorPositionsFast(color.hex, this.currentImageData, 2);
            
            positions.forEach(pos => {
                const tooClose = displayedPositions.some(dp => {
                    const dist = Math.sqrt(Math.pow(dp.x - pos.x, 2) + Math.pow(dp.y - pos.y, 2));
                    return dist < 50;
                });
                
                if (!tooClose) {
                    const label = document.createElement('div');
                    label.className = 'analysis-label';
                    
                    let displayValue = '';
                    switch(category) {
                        case 'value':
                            displayValue = `${color.hsv.v}%`;
                            break;
                        case 'saturation':
                            displayValue = `${color.hsl.s}%`;
                            break;
                        case 'hue':
                            displayValue = `${color.hsl.h}°`;
                            break;
                        case 'frequency':
                            displayValue = `${color.percentage}%`;
                            break;
                    }
                    
                    label.innerHTML = `
                        <span class="percentage">${displayValue}</span>
                    `;
                    
                    const scaleX = canvasRect.width / this.canvas.width;
                    const scaleY = canvasRect.height / this.canvas.height;
                    
                    const screenX = canvasRect.left + (pos.x * scaleX);
                    const screenY = canvasRect.top + (pos.y * scaleY);
                    
                    label.style.left = screenX + 'px';
                    label.style.top = screenY + 'px';
                    label.style.position = 'fixed';
                    
                    this.analysisOverlay.appendChild(label);
                    displayedPositions.push(pos);
                }
            });
        });
    }
    
    findColorPositionsFast(targetHex, imageData, maxPositions = 2) {
        const positions = [];
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // Deterministic grid scan — consistent positions every time
        const gridSize = Math.max(1, Math.floor(Math.sqrt((width * height) / 300)));
        
        outer:
        for (let y = 0; y < height; y += gridSize) {
            for (let x = 0; x < width; x += gridSize) {
                const index = (y * width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                
                const quantized = this.quantizeColor(r, g, b, 20);
                const hex = this.rgbToHex(quantized.r, quantized.g, quantized.b);
                
                if (hex === targetHex) {
                    const tooClose = positions.some(p => {
                        const dist = Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2));
                        return dist < 50;
                    });
                    if (!tooClose) {
                        positions.push({ x, y });
                        if (positions.length >= maxPositions) break outer;
                    }
                }
            }
        }
        
        return positions;
    }
    
    hideColorOverlay() {
        this.analysisOverlay.hidden = true;
        this.analysisOverlay.innerHTML = '';
        this.activeCategory = null;
        
        document.querySelectorAll('.gradient-stack').forEach(stack => {
            stack.classList.remove('active');
        });
    }
    
    generatePalette() {
        if (!this.currentImageData) {
            this.showNotification('Please upload an image first!', 'warning');
            return;
        }
        
        if (this.colorData.length === 0) {
            this.colorData = this.extractColors(this.currentImageData);
        }
        
        const dominantColors = this.colorData.slice(0, 5);
        
        this.paletteDisplay.innerHTML = '';
        
        this.createPaletteScheme('Dominant Colors', dominantColors.map(c => c.hex));
        
        if (dominantColors.length > 0) {
            const baseColor = dominantColors[0];
            const monochromaticColors = this.generateMonochromatic(baseColor.hsl);
            this.createPaletteScheme('Monochromatic', monochromaticColors);
        }
        
        if (dominantColors.length > 0) {
            const analogousColors = this.generateAnalogous(dominantColors[0].hsl);
            this.createPaletteScheme('Analogous', analogousColors);
        }
        
        if (dominantColors.length > 0) {
            const complementaryColors = this.generateComplementary(dominantColors[0].hsl);
            this.createPaletteScheme('Complementary', complementaryColors);
        }
    }
    
    createPaletteScheme(title, colors) {
        const scheme = document.createElement('div');
        scheme.className = 'palette-scheme';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'scheme-title';
        titleEl.textContent = title;
        
        const colorsContainer = document.createElement('div');
        colorsContainer.className = 'scheme-colors';
        
        colors.forEach(color => {
            const colorBox = document.createElement('div');
            colorBox.className = 'scheme-color';
            colorBox.style.backgroundColor = color;
            colorBox.dataset.color = color;
            colorBox.title = 'Click to copy';
            
            const label = document.createElement('div');
            label.className = 'scheme-color-label';
            label.textContent = color;
            
            colorBox.appendChild(label);
            colorsContainer.appendChild(colorBox);
        });
        
        scheme.appendChild(titleEl);
        scheme.appendChild(colorsContainer);
        this.paletteDisplay.appendChild(scheme);
    }
    
    generateMonochromatic(baseHsl) {
        const colors = [];
        for (let i = 0; i < 5; i++) {
            const lightness = 20 + (i * 15);
            colors.push(this.hslToHex(baseHsl.h, baseHsl.s, lightness));
        }
        return colors;
    }
    
    generateAnalogous(baseHsl) {
        const colors = [];
        const angles = [-60, -30, 0, 30, 60];
        angles.forEach(angle => {
            const hue = (baseHsl.h + angle + 360) % 360;
            colors.push(this.hslToHex(hue, baseHsl.s, baseHsl.l));
        });
        return colors;
    }
    
    generateComplementary(baseHsl) {
        const colors = [];
        colors.push(this.hslToHex(baseHsl.h, baseHsl.s, baseHsl.l));
        colors.push(this.hslToHex((baseHsl.h + 180) % 360, baseHsl.s, baseHsl.l));
        colors.push(this.hslToHex(baseHsl.h, Math.max(0, baseHsl.s - 20), Math.min(100, baseHsl.l + 10)));
        colors.push(this.hslToHex((baseHsl.h + 180) % 360, Math.max(0, baseHsl.s - 20), Math.min(100, baseHsl.l + 10)));
        colors.push(this.hslToHex(baseHsl.h, Math.min(100, baseHsl.s + 20), Math.max(0, baseHsl.l - 10)));
        return colors;
    }
    
    // Helper: returns colors to analyze based on priority: colorData > pinnedColors > currentColor
    // Filters out near-black/near-white for small limits so analysis isn't dominated by dark fills
    getColorsToAnalyze(limit = 5) {
        let pool = [];
        if (this.colorData.length > 0)      pool = this.colorData;
        else if (this.pinnedColors.length > 0) pool = this.pinnedColors;
        else if (this.currentColor)            return [this.currentColor];
        else return [];

        if (limit <= 5) {
            // Try to return interesting colors first; fall back to raw if not enough
            const interesting = pool.filter(c => {
                const hsl = c.hsl || this.rgbToHsl(c.rgb.r, c.rgb.g, c.rgb.b);
                return hsl.l > 8 && hsl.l < 92 && hsl.s > 5;
            });
            if (interesting.length >= Math.min(limit, 2)) {
                return interesting.slice(0, limit);
            }
        }
        return pool.slice(0, limit);
    }

    // Helper: returns the most visually interesting (saturated, non-trivial) color from a list
    getMostInterestingColor(colors) {
        if (!colors || colors.length === 0) return null;
        // Score = saturation * (1 - abs(lightness - 50)/50) — penalizes very dark/light
        const scored = colors.map(c => {
            const hsl = c.hsl || this.rgbToHsl(c.rgb.r, c.rgb.g, c.rgb.b);
            const score = hsl.s * (1 - Math.abs(hsl.l - 50) / 50);
            return { color: c, score };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored[0].color;
    }

    // Live Feedback Functions
    switchMode(mode) {
        this.feedbackMode = mode;
        
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        this.updateLiveFeedback();
    }
    
    updateLiveFeedback() {
        if (this.currentTab !== 'live-feedback') return;
        
        this.updateTemperatureAnalysis();
        
        if (this.feedbackMode === 'design') {
            this.updateContrastAnalysis();
            this.updateHarmonyAnalysis();
            this.updateDesignPsychology();
        } else {
            this.updateValueDistribution();
            this.updateColorMoodAnalysis();
            this.updateArtPsychology();
        }
    }
    
    clearLiveFeedback() {
        document.getElementById('temperatureText').textContent = 'Upload an image to analyze color temperature';
        
        const contrastSection = document.querySelector('#contrastAnalysis').parentElement;
        const harmonySection = document.querySelector('#harmonySuggestions').parentElement;
        const psychologySection = document.querySelector('#psychologyAnalysis').parentElement;
        
        document.getElementById('contrastGrid').innerHTML = '<p class="placeholder">Analyze image to check contrast ratios</p>';
        
        document.getElementById('harmonyContent').innerHTML = '<p class="placeholder">Pick or analyze colors to get harmony suggestions</p>';
        
        document.getElementById('psychologyContent').innerHTML = '<p class="placeholder">Analyze colors to see psychological impact</p>';
        
        if (this.feedbackMode === 'design') {
            contrastSection.style.display = 'block';
            harmonySection.style.display = 'block';
            contrastSection.querySelector('h4').textContent = 'Contrast & Accessibility';
            harmonySection.querySelector('h4').textContent = 'Harmony Suggestions';
            psychologySection.querySelector('h4').textContent = 'Color Psychology';
        } else {
            contrastSection.style.display = 'block';
            harmonySection.style.display = 'block';
            contrastSection.querySelector('h4').textContent = 'Value Distribution';
            harmonySection.querySelector('h4').textContent = 'Color Mood Analysis';
            psychologySection.querySelector('h4').textContent = 'Artistic Impact';
        }
        
        const tempBar = document.getElementById('tempBar');
        tempBar.style.setProperty('--temp-position', '50%');
    }
    
    updateTemperatureAnalysis() {
        if (!this.currentImageData && this.colorData.length === 0) {
            document.getElementById('temperatureText').textContent = 'Upload an image to analyze color temperature';
            return;
        }

        const colorsToAnalyze = this.getColorsToAnalyze(10);
        if (colorsToAnalyze.length === 0) return;

        let totalTemp = 0;
        colorsToAnalyze.forEach(color => {
            totalTemp += this.getColorTemperature(color.rgb || color);
        });
        const avgTemp   = totalTemp / colorsToAnalyze.length;
        const pct       = Math.max(2, Math.min(98, ((avgTemp + 100) / 200) * 100));

        // Update needle position via CSS var
        const tempBar = document.getElementById('tempBar');
        tempBar.style.setProperty('--temp-position', `${pct}%`);

        // Descriptive label
        let label, emoji;
        if (avgTemp < -50)      { label = 'Very Cool';  emoji = '🧊'; }
        else if (avgTemp < 0)   { label = 'Cool';        emoji = '❄️'; }
        else if (avgTemp < 50)  { label = 'Warm';        emoji = '☀️'; }
        else                    { label = 'Very Warm';   emoji = '🔥'; }

        document.getElementById('temperatureText').innerHTML = `
            <span class="temp-badge" style="
                display:inline-flex; align-items:center; gap:6px;
                background: ${pct < 50
                    ? `hsl(${220 - pct},70%,55%)`
                    : `hsl(${30 - (pct - 50) * 0.4},85%,52%)`};
                color:#fff; padding:4px 12px; border-radius:20px;
                font-size:12px; font-weight:700; margin-bottom:6px;">
                ${emoji} ${label}
            </span>
            <br>
            <span style="font-size:12px; color:#64748b; line-height:1.5;">
                ${avgTemp < -50  ? 'Very cool palette — calming, professional, serene.' :
                  avgTemp < 0    ? 'Cool tones — trust, stability, and tranquility.' :
                  avgTemp < 50   ? 'Warm tones — energetic, friendly, and inviting.' :
                                   'Very warm — exciting, passionate, attention-grabbing.'}
            </span>`;

        // Show a mini swatch row of the analyzed colors
        const swatchRow = document.getElementById('tempSwatchRow');
        if (swatchRow) {
            swatchRow.innerHTML = '';
            colorsToAnalyze.slice(0, 8).forEach(c => {
                const s = document.createElement('div');
                s.style.cssText = `flex:1; height:10px; background:${c.hex}; border-radius:2px;`;
                swatchRow.appendChild(s);
            });
        }
    }
    
    getColorTemperature(rgb) {
        const r = rgb.r || 0;
        const g = rgb.g || 0;
        const b = rgb.b || 0;
        
        return (r - b) / 2.55;
    }
    
    updateContrastAnalysis() {
        const contrastGrid = document.getElementById('contrastGrid');

        let colorsToCheck = [];
        if (this.colorData.length >= 2)        colorsToCheck = this.colorData.slice(0, 4);
        else if (this.pinnedColors.length >= 2) colorsToCheck = this.pinnedColors.slice(0, 4);
        else if (this.currentColor && this.pinnedColors.length === 1)
            colorsToCheck = [this.currentColor, this.pinnedColors[0]];

        if (colorsToCheck.length < 2) {
            contrastGrid.innerHTML = '<p class="placeholder">Need at least 2 colors to check contrast</p>';
            return;
        }

        contrastGrid.innerHTML = '';

        for (let i = 0; i < colorsToCheck.length - 1; i++) {
            const c1 = colorsToCheck[i];
            const c2 = colorsToCheck[i + 1];
            const ratio = this.getContrastRatio(c1.rgb, c2.rgb);

            let status, statusColor, grade;
            if (ratio >= 7)        { status = 'AAA'; statusColor = '#16a34a'; grade = 'Best'; }
            else if (ratio >= 4.5) { status = 'AA';  statusColor = '#2563eb'; grade = 'Good'; }
            else if (ratio >= 3)   { status = 'AA Large'; statusColor = '#d97706'; grade = 'Large text only'; }
            else                   { status = 'Fail'; statusColor = '#dc2626'; grade = 'Insufficient'; }

            const pairDiv = document.createElement('div');
            pairDiv.className = 'contrast-pair-visual';

            // Live text preview on both color combos
            pairDiv.innerHTML = `
                <div class="contrast-preview-row">
                    <div class="contrast-preview-box" style="background:${c1.hex}; color:${c2.hex};">
                        <span class="cp-text">Aa</span>
                        <span class="cp-hex">${c1.hex}</span>
                    </div>
                    <div class="contrast-preview-box" style="background:${c2.hex}; color:${c1.hex};">
                        <span class="cp-text">Aa</span>
                        <span class="cp-hex">${c2.hex}</span>
                    </div>
                </div>
                <div class="contrast-meta">
                    <span class="contrast-ratio-num">${ratio.toFixed(2)}:1</span>
                    <span class="contrast-badge" style="background:${statusColor}15; color:${statusColor}; border:1px solid ${statusColor}40;">
                        ${status}
                    </span>
                    <span class="contrast-grade">${grade}</span>
                </div>
                <div class="contrast-bar-wrap">
                    <div class="contrast-bar-fill" style="width:${Math.min(100,(ratio/21)*100)}%; background:${statusColor};"></div>
                </div>
            `;
            contrastGrid.appendChild(pairDiv);
        }
    }
    
    getContrastRatio(rgb1, rgb2) {
        const l1 = this.getRelativeLuminance(rgb1);
        const l2 = this.getRelativeLuminance(rgb2);
        
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        
        return (lighter + 0.05) / (darker + 0.05);
    }
    
    getRelativeLuminance(rgb) {
        const rsRGB = rgb.r / 255;
        const gsRGB = rgb.g / 255;
        const bsRGB = rgb.b / 255;
        
        const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
        const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
        const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
        
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    
    updateHarmonyAnalysis() {
        const harmonyContent = document.getElementById('harmonyContent');

        let baseColor;
        if (this.currentColor) {
            baseColor = this.currentColor;
        } else if (this.colorData.length > 0) {
            // Prefer the most saturated color over the most frequent (which is often black)
            baseColor = this.getMostInterestingColor(this.colorData) || this.colorData[0];
        } else if (this.pinnedColors.length > 0) {
            baseColor = this.getMostInterestingColor(this.pinnedColors) || this.pinnedColors[0];
        }
        
        if (!baseColor) {
            harmonyContent.innerHTML = '<p class="placeholder">Pick or analyze colors to get harmony suggestions</p>';
            return;
        }
        
        harmonyContent.innerHTML = '';
        
        const triadicColors = this.generateTriadic(baseColor.hsl);
        this.createHarmonyItem(harmonyContent, 'Triadic', triadicColors);
        
        const splitCompColors = this.generateSplitComplementary(baseColor.hsl);
        this.createHarmonyItem(harmonyContent, 'Split Comp.', splitCompColors);
        
        const tetradicColors = this.generateTetradic(baseColor.hsl);
        this.createHarmonyItem(harmonyContent, 'Tetradic', tetradicColors);
    }
    
    generateTriadic(baseHsl) {
        return [
            this.hslToHex(baseHsl.h, baseHsl.s, baseHsl.l),
            this.hslToHex((baseHsl.h + 120) % 360, baseHsl.s, baseHsl.l),
            this.hslToHex((baseHsl.h + 240) % 360, baseHsl.s, baseHsl.l)
        ];
    }
    
    generateSplitComplementary(baseHsl) {
        return [
            this.hslToHex(baseHsl.h, baseHsl.s, baseHsl.l),
            this.hslToHex((baseHsl.h + 150) % 360, baseHsl.s, baseHsl.l),
            this.hslToHex((baseHsl.h + 210) % 360, baseHsl.s, baseHsl.l)
        ];
    }
    
    generateTetradic(baseHsl) {
        return [
            this.hslToHex(baseHsl.h, baseHsl.s, baseHsl.l),
            this.hslToHex((baseHsl.h + 90) % 360, baseHsl.s, baseHsl.l),
            this.hslToHex((baseHsl.h + 180) % 360, baseHsl.s, baseHsl.l),
            this.hslToHex((baseHsl.h + 270) % 360, baseHsl.s, baseHsl.l)
        ];
    }
    
    createHarmonyItem(container, label, colors) {
        const item = document.createElement('div');
        item.className = 'harmony-item';

        const labelDiv = document.createElement('div');
        labelDiv.className = 'harmony-label';
        labelDiv.textContent = label;

        // Large swatch strip instead of tiny dots
        const strip = document.createElement('div');
        strip.className = 'harmony-strip';

        colors.forEach(color => {
            const seg = document.createElement('div');
            seg.className = 'harmony-seg';
            seg.style.backgroundColor = color;
            seg.title = `${color} — click to copy`;

            const hexLabel = document.createElement('span');
            hexLabel.className = 'harmony-seg-hex';
            hexLabel.textContent = color;
            seg.appendChild(hexLabel);

            seg.addEventListener('click', () => {
                this.copyToClipboard(color);
                this.showNotification(`Copied ${color}`, 'success');
            });
            strip.appendChild(seg);
        });

        item.appendChild(labelDiv);
        item.appendChild(strip);
        container.appendChild(item);
    }
    
    updatePsychologyAnalysis() {
        if (this.feedbackMode === 'design') {
            this.updateDesignPsychology();
        } else {
            this.updateArtPsychology();
        }
    }
    
    updateDesignPsychology() {
        const psychologyContent = document.getElementById('psychologyContent');
        const colorsToAnalyze = this.getColorsToAnalyze(3);

        if (colorsToAnalyze.length === 0) {
            psychologyContent.innerHTML = '<p class="placeholder">Analyze colors to see psychological impact</p>';
            return;
        }

        psychologyContent.innerHTML = '';

        colorsToAnalyze.forEach(color => {
            const psy = this.getColorPsychology(color.hsl);

            const item = document.createElement('div');
            item.className = 'psych-card';
            item.style.borderLeft = `4px solid ${color.hex}`;

            item.innerHTML = `
                <div class="psych-card-top">
                    <div class="psych-swatch" style="background:${color.hex};"></div>
                    <div class="psych-feeling">${psy.feeling}</div>
                </div>
                <div class="psych-desc">${psy.description}</div>
            `;
            psychologyContent.appendChild(item);
        });
    }

    updateArtPsychology() {
        const psychologyContent = document.getElementById('psychologyContent');
        const colorsToAnalyze = this.getColorsToAnalyze(3);

        if (colorsToAnalyze.length === 0) {
            psychologyContent.innerHTML = '<p class="placeholder">Analyze colors to see artistic impact</p>';
            return;
        }

        psychologyContent.innerHTML = '';

        colorsToAnalyze.forEach(color => {
            const impact = this.getArtisticImpact(color.hsl || this.rgbToHsl(color.rgb.r, color.rgb.g, color.rgb.b));

            const item = document.createElement('div');
            item.className = 'psych-card';
            item.style.borderLeft = `4px solid ${color.hex}`;

            item.innerHTML = `
                <div class="psych-card-top">
                    <div class="psych-swatch" style="background:${color.hex};"></div>
                    <div class="psych-feeling">${impact.feeling}</div>
                </div>
                <div class="psych-desc">${impact.description}</div>
            `;
            psychologyContent.appendChild(item);
        });
    }
    
    getColorPsychology(hsl) {
        const h = hsl.h;
        const s = hsl.s;
        const l = hsl.l;
        
        if (s < 15 || l > 90 || l < 10) {
            if (l > 90) {
                return { feeling: 'Pure & Clean', description: 'Evokes simplicity, innocence, and clarity. Often used in minimal designs.' };
            } else if (l < 10) {
                return { feeling: 'Powerful & Formal', description: 'Creates sophistication, mystery, and authority. Strong emotional impact.' };
            } else {
                return { feeling: 'Neutral & Balanced', description: 'Conveys stability, calm, and professionalism. Versatile for any context.' };
            }
        }
        
        if (h >= 0 && h < 15 || h >= 345) {
            return { feeling: 'Passionate & Energetic', description: 'Red evokes strong emotions, urgency, and excitement. Grabs attention immediately.' };
        } else if (h >= 15 && h < 45) {
            return { feeling: 'Creative & Enthusiastic', description: 'Orange represents energy, warmth, and friendliness. Encourages action and optimism.' };
        } else if (h >= 45 && h < 75) {
            return { feeling: 'Cheerful & Optimistic', description: 'Yellow brings happiness, clarity, and sunshine. Stimulates mental activity.' };
        } else if (h >= 75 && h < 165) {
            return { feeling: 'Growth & Harmony', description: 'Green symbolizes nature, balance, and renewal. Creates a sense of calm and safety.' };
        } else if (h >= 165 && h < 255) {
            return { feeling: 'Trust & Stability', description: 'Blue conveys reliability, peace, and professionalism. Most universally preferred color.' };
        } else if (h >= 255 && h < 285) {
            return { feeling: 'Creative & Luxurious', description: 'Purple represents creativity, royalty, and spirituality. Adds sophistication.' };
        } else {
            return { feeling: 'Romantic & Compassionate', description: 'Pink/Magenta evokes care, nurturing, and playfulness. Softens bold designs.' };
        }
    }
    
    updateValueDistribution() {
        const contrastGrid = document.getElementById('contrastGrid');
        
        const colorsToAnalyze = this.getColorsToAnalyze(10);
        
        if (colorsToAnalyze.length === 0) {
            contrastGrid.innerHTML = '<p class="placeholder">Analyze image to see value distribution</p>';
            return;
        }
        
        const valueRanges = {
            dark: { count: 0, label: 'Shadows (0-33%)', colors: [] },
            mid: { count: 0, label: 'Midtones (34-66%)', colors: [] },
            light: { count: 0, label: 'Highlights (67-100%)', colors: [] }
        };
        
        colorsToAnalyze.forEach(color => {
            const value = color.hsv?.v || this.rgbToHsv(color.rgb.r, color.rgb.g, color.rgb.b).v;
            if (value <= 33) {
                valueRanges.dark.count++;
                valueRanges.dark.colors.push(color.hex);
            } else if (value <= 66) {
                valueRanges.mid.count++;
                valueRanges.mid.colors.push(color.hex);
            } else {
                valueRanges.light.count++;
                valueRanges.light.colors.push(color.hex);
            }
        });
        
        const total = colorsToAnalyze.length;
        
        contrastGrid.innerHTML = '';
        
        Object.entries(valueRanges).forEach(([key, data]) => {
            const percentage = ((data.count / total) * 100).toFixed(0);
            
            const rangeDiv = document.createElement('div');
            rangeDiv.className = 'value-range-item';
            
            const sampleColors = data.colors.slice(0, 3);
            const colorSamples = sampleColors.map(c => 
                `<div class="value-sample" style="background-color: ${c}"></div>`
            ).join('');
            
            let feedback = '';
            if (key === 'dark' && percentage > 50) {
                feedback = '⚠️ Heavy on shadows - consider adding highlights';
            } else if (key === 'light' && percentage > 50) {
                feedback = '⚠️ Very bright - add darker values for depth';
            } else if (key === 'mid' && percentage > 70) {
                feedback = '💡 Mostly midtones - add contrast for impact';
            } else if (percentage > 0) {
                feedback = '✓ Good balance';
            }
            
            rangeDiv.innerHTML = `
                <div class="value-range-header">
                    <span class="value-range-label">${data.label}</span>
                    <span class="value-range-percent">${percentage}%</span>
                </div>
                <div class="value-samples">${colorSamples || '<span style="color: #6c757d; font-size: 11px;">No colors</span>'}</div>
                <div class="value-feedback">${feedback}</div>
            `;
            
            contrastGrid.appendChild(rangeDiv);
        });
    }
    
    updateColorMoodAnalysis() {
        const harmonyContent = document.getElementById('harmonyContent');
        
        const colorsToAnalyze = this.getColorsToAnalyze(5);
        
        if (colorsToAnalyze.length === 0) {
            harmonyContent.innerHTML = '<p class="placeholder">Analyze colors to see mood analysis</p>';
            return;
        }
        
        let totalSaturation = 0;
        let vibrantCount = 0;
        let mutedCount = 0;
        
        colorsToAnalyze.forEach(color => {
            const sat = color.hsl?.s || this.rgbToHsl(color.rgb.r, color.rgb.g, color.rgb.b).s;
            totalSaturation += sat;
            if (sat > 60) vibrantCount++;
            else if (sat < 30) mutedCount++;
        });
        
        const avgSaturation = totalSaturation / colorsToAnalyze.length;
        
        harmonyContent.innerHTML = '';
        
        const moodDiv = document.createElement('div');
        moodDiv.className = 'mood-assessment';
        
        let mood = '';
        let moodIcon = '';
        let moodDesc = '';
        
        if (avgSaturation > 70) {
            mood = 'Vibrant & Energetic';
            moodIcon = '⚡';
            moodDesc = 'High saturation creates dynamic, eye-catching artwork. Great for stylized or anime-style pieces.';
        } else if (avgSaturation > 40) {
            mood = 'Balanced & Natural';
            moodIcon = '🎨';
            moodDesc = 'Moderate saturation feels realistic and versatile. Perfect for portraits and natural scenes.';
        } else {
            mood = 'Muted & Atmospheric';
            moodIcon = '🌫️';
            moodDesc = 'Low saturation creates mood and atmosphere. Excellent for dramatic or vintage aesthetics.';
        }
        
        moodDiv.innerHTML = `
            <div class="mood-header">
                <span class="mood-icon">${moodIcon}</span>
                <span class="mood-title">${mood}</span>
            </div>
            <p class="mood-description">${moodDesc}</p>
        `;
        
        harmonyContent.appendChild(moodDiv);
        
        const samplesDiv = document.createElement('div');
        samplesDiv.className = 'mood-color-samples';
        
        colorsToAnalyze.slice(0, 5).forEach(color => {
            const sample = document.createElement('div');
            sample.className = 'mood-color-sample';
            sample.style.backgroundColor = color.hex;
            sample.title = color.hex;
            samplesDiv.appendChild(sample);
        });
        
        harmonyContent.appendChild(samplesDiv);
    }
    
    getArtisticImpact(hsl) {
        const h = hsl.h;
        const s = hsl.s;
        const l = hsl.l;
        
        if (s < 15) {
            if (l > 85) {
                return { feeling: 'Soft Highlights', description: 'Creates gentle illumination. Use for light sources, skin highlights, or ethereal effects.' };
            } else if (l < 15) {
                return { feeling: 'Deep Shadows', description: 'Adds dramatic depth. Essential for form definition and creating mystery.' };
            } else {
                return { feeling: 'Neutral Tones', description: 'Perfect for underpainting and base layers. Provides structure without overwhelming.' };
            }
        }
        
        if (h >= 0 && h < 30 || h >= 330) {
            if (s > 60) {
                return { feeling: 'Bold Reds', description: 'Commands attention. Use sparingly for focal points, passion, or danger.' };
            } else {
                return { feeling: 'Warm Skin Tones', description: 'Essential for portrait work. Conveys life and warmth in figures.' };
            }
        } else if (h >= 30 && h < 60) {
            return { feeling: 'Warm Accents', description: 'Orange tones add energy without overwhelming. Great for lighting and atmosphere.' };
        } else if (h >= 60 && h < 150) {
            if (l < 40) {
                return { feeling: 'Natural Darks', description: 'Green-based shadows feel organic. Ideal for landscapes and natural subjects.' };
            } else {
                return { feeling: 'Life & Growth', description: 'Brings vitality to nature scenes. Use for foliage, life, and renewal themes.' };
            }
        } else if (h >= 150 && h < 270) {
            if (s > 50) {
                return { feeling: 'Cool Depths', description: 'Blue creates distance and calm. Perfect for backgrounds, sky, and water.' };
            } else {
                return { feeling: 'Cool Shadows', description: 'Subtle blues in shadows add realism. Creates atmospheric perspective.' };
            }
        } else {
            return { feeling: 'Mystical Purples', description: 'Adds fantasy and drama. Excellent for magical themes and twilight scenes.' };
        }
    }
    
    // Filter Functions
    applyFilter(filterType) {
        if (!this.originalImageData) {
            this.showNotification('Please upload an image first!', 'warning');
            return;
        }
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filterType);
        });
        
        this.activeFilter = filterType;
        
        const imageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );
        
        const data = imageData.data;
        
        switch(filterType) {
            case 'grayscale':
                this.applyGrayscale(data);
                break;
            case 'highcontrast':
                this.applyHighContrast(data);
                break;
            case 'values':
                this.applyValueZones(data);
                break;
            case 'hue':
                this.applyHueOnly(data);
                break;
            case 'saturation':
                this.applySaturationView(data);
                break;
            case 'temperature':
                this.applyTemperatureView(data);
                break;
            case 'red':
            case 'blue':
            case 'green':
            case 'yellow':
                this.applyColorOverlay(data, filterType);
                break;
        }
        
        this.ctx.putImageData(imageData, 0, 0);
        this.currentImageData = imageData;
    }
    
    applyGrayscale(data) {
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    }
    
    applyHighContrast(data) {
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            const value = gray > 127 ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = value;
        }
    }
    
    applyValueZones(data) {
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            
            let value;
            if (gray < 85) {
                value = 40;
            } else if (gray < 170) {
                value = 127;
            } else {
                value = 215;
            }
            
            data[i] = data[i + 1] = data[i + 2] = value;
        }
    }
    
    applyHueOnly(data) {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            const hsl = this.rgbToHsl(r, g, b);
            const rgb = this.hslToRgb(hsl.h, 100, 50);
            
            data[i] = rgb.r;
            data[i + 1] = rgb.g;
            data[i + 2] = rgb.b;
        }
    }
    
    applySaturationView(data) {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            const hsl = this.rgbToHsl(r, g, b);
            const satValue = Math.round(hsl.s * 2.55);
            
            data[i] = data[i + 1] = data[i + 2] = satValue;
        }
    }
    
    applyTemperatureView(data) {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            const temp = (r - b) / 2;
            
            if (temp > 0) {
                data[i] = Math.min(255, 127 + temp * 2);
                data[i + 1] = Math.min(255, 80 + temp);
                data[i + 2] = 50;
            } else {
                data[i] = 50;
                data[i + 1] = Math.min(255, 127 - temp);
                data[i + 2] = Math.min(255, 127 - temp * 2);
            }
        }
    }
    
    applyColorOverlay(data, color) {
        let overlayR, overlayG, overlayB;
        
        switch(color) {
            case 'red':
                overlayR = 255; overlayG = 107; overlayB = 107;
                break;
            case 'blue':
                overlayR = 77; overlayG = 171; overlayB = 247;
                break;
            case 'green':
                overlayR = 81; overlayG = 207; overlayB = 102;
                break;
            case 'yellow':
                overlayR = 255; overlayG = 212; overlayB = 59;
                break;
        }
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i] * (1 - this.filterOpacity) + overlayR * this.filterOpacity;
            data[i + 1] = data[i + 1] * (1 - this.filterOpacity) + overlayG * this.filterOpacity;
            data[i + 2] = data[i + 2] * (1 - this.filterOpacity) + overlayB * this.filterOpacity;
        }
    }
    
    resetFilter() {
        if (!this.originalImageData) return;
        
        this.activeFilter = null;
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        this.ctx.putImageData(this.originalImageData, 0, 0);
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
    
    hslToRgb(h, s, l) {
        s /= 100;
        l /= 100;
        
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        
        let r = 0, g = 0, b = 0;
        
        if (h >= 0 && h < 60) {
            r = c; g = x; b = 0;
        } else if (h >= 60 && h < 120) {
            r = x; g = c; b = 0;
        } else if (h >= 120 && h < 180) {
            r = 0; g = c; b = x;
        } else if (h >= 180 && h < 240) {
            r = 0; g = x; b = c;
        } else if (h >= 240 && h < 300) {
            r = x; g = 0; b = c;
        } else if (h >= 300 && h < 360) {
            r = c; g = 0; b = x;
        }
        
        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }
    
    clearAnalysis() {
        this.colorData = [];
        this.clearColorScript();
        
        ['value', 'saturation', 'hue', 'frequency'].forEach(category => {
            const stackElement = document.getElementById(category + 'Gradient');
            stackElement.innerHTML = '<p class="placeholder">Analyze the image to see color data</p>';
        });
        
        this.analysisOverlay.innerHTML = '';
        this.analysisOverlay.hidden = true;
        this.activeCategory = null;
        
        this.paletteDisplay.innerHTML = '<p class="placeholder">Generate a palette to see color schemes</p>';
    }
    
    // ─── LOUPE ────────────────────────────────────────────────────────────────
    initLoupe() {
        this.loupeCanvas = document.createElement('canvas');
        this.loupeCanvas.width  = 120;
        this.loupeCanvas.height = 120;
        this.loupeCanvas.style.cssText = `
            position: fixed;
            width: 120px;
            height: 120px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3);
            pointer-events: none;
            z-index: 2000;
            display: none;
            image-rendering: pixelated;
        `;
        document.body.appendChild(this.loupeCanvas);
        this.loupeCtx = this.loupeCanvas.getContext('2d');
        this.loupeCtx.imageSmoothingEnabled = false;
    }

    updateLoupe(canvasX, canvasY, screenX, screenY) {
        if (!this.loupeCanvas || this.currentTab !== 'color-picking') return;

        const radius = 8; // pixels to sample around cursor
        const srcX = Math.max(0, canvasX - radius);
        const srcY = Math.max(0, canvasY - radius);
        const srcW = radius * 2;
        const srcH = radius * 2;

        this.loupeCtx.clearRect(0, 0, 120, 120);
        this.loupeCtx.drawImage(this.canvas, srcX, srcY, srcW, srcH, 0, 0, 120, 120);

        // Centre crosshair
        this.loupeCtx.strokeStyle = 'rgba(255,255,255,0.9)';
        this.loupeCtx.lineWidth = 1;
        this.loupeCtx.beginPath();
        this.loupeCtx.moveTo(60, 48); this.loupeCtx.lineTo(60, 72);
        this.loupeCtx.moveTo(48, 60); this.loupeCtx.lineTo(72, 60);
        this.loupeCtx.stroke();

        // Position loupe above and to the right of cursor
        const offset = 70;
        let lx = screenX + offset;
        let ly = screenY - offset;
        if (lx + 120 > window.innerWidth)  lx = screenX - offset - 120;
        if (ly < 0)                          ly = screenY + offset;

        this.loupeCanvas.style.left    = lx + 'px';
        this.loupeCanvas.style.top     = ly + 'px';
        this.loupeCanvas.style.display = 'block';
    }

    // ─── REGION SAMPLER ───────────────────────────────────────────────────────
    initSampleOverlay() {
        this.sampleOverlay = document.createElement('div');
        this.sampleOverlay.style.cssText = `
            position: absolute;
            border: 2px dashed #667eea;
            background: rgba(102,126,234,0.15);
            pointer-events: none;
            display: none;
            z-index: 100;
        `;
        const canvasContainer = document.querySelector('.canvas-container');
        if (canvasContainer) canvasContainer.appendChild(this.sampleOverlay);
    }

    handleSampleStart(e) {
        if (!e.shiftKey || !this.currentImage) return;
        if (this.currentTab !== 'color-picking') return;
        e.preventDefault();

        // sampleStart stores coords relative to the canvas element itself
        const canvasRect = this.canvas.getBoundingClientRect();
        this.isSampling = true;
        this.sampleStart = {
            x: e.clientX - canvasRect.left,
            y: e.clientY - canvasRect.top
        };

        // The overlay lives inside .canvas-container, so offset by where
        // the canvas sits inside that container
        const containerRect = this.canvas.parentElement.getBoundingClientRect();
        const canvasOffsetX = canvasRect.left - containerRect.left;
        const canvasOffsetY = canvasRect.top  - containerRect.top;

        this.sampleOverlay.style.display = 'block';
        this.sampleOverlay.style.left   = (canvasOffsetX + this.sampleStart.x) + 'px';
        this.sampleOverlay.style.top    = (canvasOffsetY + this.sampleStart.y) + 'px';
        this.sampleOverlay.style.width  = '0px';
        this.sampleOverlay.style.height = '0px';
    }

    handleSampleMove(e) {
        if (!this.isSampling || !this.sampleStart) return;

        const canvasRect    = this.canvas.getBoundingClientRect();
        const containerRect = this.canvas.parentElement.getBoundingClientRect();
        const canvasOffsetX = canvasRect.left - containerRect.left;
        const canvasOffsetY = canvasRect.top  - containerRect.top;

        // Current mouse position relative to canvas
        const cx = e.clientX - canvasRect.left;
        const cy = e.clientY - canvasRect.top;

        const x = Math.min(cx, this.sampleStart.x);
        const y = Math.min(cy, this.sampleStart.y);
        const w = Math.abs(cx - this.sampleStart.x);
        const h = Math.abs(cy - this.sampleStart.y);

        this.sampleOverlay.style.left   = (canvasOffsetX + x) + 'px';
        this.sampleOverlay.style.top    = (canvasOffsetY + y) + 'px';
        this.sampleOverlay.style.width  = w + 'px';
        this.sampleOverlay.style.height = h + 'px';
    }

    handleSampleEnd(e) {
        if (!this.isSampling) return;
        this.isSampling = false;
        this.sampleOverlay.style.display = 'none';

        const canvasRect = this.canvas.getBoundingClientRect();
        const scaleX     = this.canvas.width  / canvasRect.width;
        const scaleY     = this.canvas.height / canvasRect.height;

        // End position relative to canvas
        const cx = e.clientX - canvasRect.left;
        const cy = e.clientY - canvasRect.top;

        const x1 = Math.round(Math.min(this.sampleStart.x, cx) * scaleX);
        const y1 = Math.round(Math.min(this.sampleStart.y, cy) * scaleY);
        const x2 = Math.round(Math.max(this.sampleStart.x, cx) * scaleX);
        const y2 = Math.round(Math.max(this.sampleStart.y, cy) * scaleY);

        const w = x2 - x1;
        const h = y2 - y1;
        if (w < 3 || h < 3) return; // Too small — treat as normal click

        const regionData = this.ctx.getImageData(x1, y1, w, h).data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;

        for (let i = 0; i < regionData.length; i += 4) {
            if (regionData[i + 3] < 128) continue;
            rSum += regionData[i];
            gSum += regionData[i + 1];
            bSum += regionData[i + 2];
            count++;
        }

        if (count === 0) return;

        const rgb = {
            r: Math.round(rSum / count),
            g: Math.round(gSum / count),
            b: Math.round(bSum / count)
        };
        const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);
        const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
        const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);

        this.currentColor = { rgb, hex, hsl, hsv };
        this.updateColorInfo(rgb, hex, hsl, hsv);
        this.addToColorHistory({ rgb, hex, hsl, hsv });
        this.pinColorBtn.disabled = false;
        this.updateLiveFeedback();
        this.showNotification(`Sampled region average: ${hex}`, 'success');
    }

    // ─── COLOR HISTORY ────────────────────────────────────────────────────────
    addToColorHistory(color) {
        // Avoid consecutive duplicates
        if (this.colorHistory.length > 0 && this.colorHistory[0].hex === color.hex) return;
        this.colorHistory.unshift({ ...color });
        if (this.colorHistory.length > 10) this.colorHistory.pop();
        this.renderColorHistory();
    }

    renderColorHistory() {
        const container = document.getElementById('colorHistoryStrip');
        if (!container) return;
        container.innerHTML = '';
        this.colorHistory.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'history-swatch';
            swatch.style.backgroundColor = color.hex;
            swatch.title = color.hex;
            swatch.addEventListener('click', () => {
                this.currentColor = { ...color };
                this.updateColorInfo(color.rgb, color.hex, color.hsl, color.hsv);
                this.pinColorBtn.disabled = false;
            });
            container.appendChild(swatch);
        });
    }

    // ─── COLOR SCRIPT / ZONE VIEW ─────────────────────────────────────────────
    generateColorScript() {
        if (!this.currentImageData) {
            this.showNotification('Upload an image first!', 'warning');
            return;
        }

        // Toggle off if already showing
        if (this.colorScriptActive) {
            this.clearColorScript();
            return;
        }

        const cols = 3, rows = 2;
        const zoneW = Math.floor(this.canvas.width  / cols);
        const zoneH = Math.floor(this.canvas.height / rows);
        const zones = [];

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * zoneW;
                const y = row * zoneH;
                const src = this.originalImageData || this.currentImageData;
                const regionData = this.getRegionFromImageData(src, x, y, zoneW, zoneH);

                const rgb = this.getDominantColorFromRegion(regionData);
                if (!rgb) continue;

                zones.push({
                    col, row,
                    hex: this.rgbToHex(rgb.r, rgb.g, rgb.b),
                    rgb,
                    label: ['TL','TM','TR','BL','BM','BR'][row * cols + col],
                    fullLabel: ['Top Left','Top Mid','Top Right','Bot Left','Bot Mid','Bot Right'][row * cols + col]
                });
            }
        }

        this.colorScriptActive = true;
        this.colorScriptZones  = zones;
        this.drawColorScriptGrid(cols, rows);
        this.renderColorScript(zones, cols, rows);

        // Update button to show active state
        const btn = document.getElementById('colorScriptBtn');
        if (btn) {
            btn.textContent = '🎬 Color Script ✓';
            btn.style.background = '#5a3a82';
        }
    }

    // Extract pixels from an ImageData object without calling getImageData again
    getRegionFromImageData(imageData, x, y, w, h) {
        const result = new Uint8ClampedArray(w * h * 4);
        const srcW = imageData.width;
        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                const srcIdx = ((y + row) * srcW + (x + col)) * 4;
                const dstIdx = (row * w + col) * 4;
                result[dstIdx]     = imageData.data[srcIdx];
                result[dstIdx + 1] = imageData.data[srcIdx + 1];
                result[dstIdx + 2] = imageData.data[srcIdx + 2];
                result[dstIdx + 3] = imageData.data[srcIdx + 3];
            }
        }
        return result;
    }

    // Get the most visually representative (dominant) color from a pixel array.
    // Uses quantized frequency counting, then picks the most frequent color
    // that isn't near-black or near-white (those can still win if truly dominant).
    getDominantColorFromRegion(pixelData) {
        const colorMap = new Map();
        const QUANT = 16; // quantization step — smaller = more distinct buckets

        let totalPixels = 0;
        let darkCount   = 0;

        // First pass: count quantized colors
        for (let i = 0; i < pixelData.length; i += 4) {
            if (pixelData[i + 3] < 128) continue;
            const r = Math.round(pixelData[i]     / QUANT) * QUANT;
            const g = Math.round(pixelData[i + 1] / QUANT) * QUANT;
            const b = Math.round(pixelData[i + 2] / QUANT) * QUANT;

            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (brightness < 20) { darkCount++; }

            totalPixels++;
            const key = `${r},${g},${b}`;
            colorMap.set(key, (colorMap.get(key) || 0) + 1);
        }

        if (totalPixels === 0) return null;

        // Sort by frequency
        const sorted = [...colorMap.entries()]
            .map(([key, count]) => {
                const [r, g, b] = key.split(',').map(Number);
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                return { r, g, b, count, brightness };
            })
            .sort((a, b) => b.count - a.count);

        // Decide whether near-black is truly dominant (>60% of zone) or just noise
        const darkFraction = darkCount / totalPixels;

        // Try to find the most frequent non-near-black color first
        // unless the zone really IS mostly black
        const nonDark = sorted.filter(c => c.brightness >= 25);

        if (nonDark.length > 0 && darkFraction < 0.60) {
            // Return the most frequent non-trivial color
            const best = nonDark[0];
            return { r: best.r, g: best.g, b: best.b };
        }

        // Zone is genuinely very dark — return actual dominant color
        const best = sorted[0];
        return { r: best.r, g: best.g, b: best.b };
    }

    drawColorScriptGrid(cols, rows) {
        let overlay = document.getElementById('colorScriptOverlay');
        if (!overlay) {
            overlay = document.createElement('canvas');
            overlay.id = 'colorScriptOverlay';
            overlay.style.cssText = `
                position: absolute;
                pointer-events: none;
                z-index: 10;
                image-rendering: pixelated;
            `;
            // Append to the container, not the canvas itself
            this.canvas.parentElement.appendChild(overlay);
        }

        overlay.style.display = 'block';
        this.positionScriptOverlay(overlay);

        const gCtx = overlay.getContext('2d');
        gCtx.clearRect(0, 0, overlay.width, overlay.height);

        const zoneW = overlay.width  / cols;
        const zoneH = overlay.height / rows;

        gCtx.save();
        gCtx.strokeStyle = 'rgba(255,255,255,0.85)';
        gCtx.lineWidth = 1.5;
        gCtx.shadowColor = 'rgba(0,0,0,0.6)';
        gCtx.shadowBlur = 3;

        for (let c = 1; c < cols; c++) {
            gCtx.beginPath();
            gCtx.moveTo(c * zoneW, 0);
            gCtx.lineTo(c * zoneW, overlay.height);
            gCtx.stroke();
        }
        for (let r = 1; r < rows; r++) {
            gCtx.beginPath();
            gCtx.moveTo(0, r * zoneH);
            gCtx.lineTo(overlay.width, r * zoneH);
            gCtx.stroke();
        }

        if (this.colorScriptZones) {
            this.colorScriptZones.forEach(zone => {
                const x = zone.col * zoneW;
                const y = zone.row * zoneH;

                gCtx.shadowBlur = 0;
                gCtx.fillStyle = 'rgba(0,0,0,0.55)';
                const lw = 26, lh = 14;
                gCtx.beginPath();
                gCtx.roundRect(x + 6, y + 6, lw, lh, 3);
                gCtx.fill();

                gCtx.fillStyle = 'rgba(255,255,255,0.95)';
                gCtx.font = `bold ${Math.max(9, overlay.width / 80)}px system-ui, sans-serif`;
                gCtx.fillText(zone.label, x + 9, y + 16);

                gCtx.fillStyle = zone.hex;
                gCtx.strokeStyle = 'rgba(255,255,255,0.8)';
                gCtx.lineWidth = 1.5;
                gCtx.shadowBlur = 2;
                gCtx.shadowColor = 'rgba(0,0,0,0.5)';
                gCtx.beginPath();
                gCtx.arc(x + zoneW - 12, y + 12, 7, 0, Math.PI * 2);
                gCtx.fill();
                gCtx.stroke();
            });
        }

        gCtx.restore();
    }

    // Align overlay pixel-for-pixel with the rendered canvas element
    positionScriptOverlay(overlay) {
        const canvasRect    = this.canvas.getBoundingClientRect();
        const containerRect = this.canvas.parentElement.getBoundingClientRect();

        // Position relative to the container
        const offsetLeft = canvasRect.left - containerRect.left;
        const offsetTop  = canvasRect.top  - containerRect.top;

        // Pixel dimensions match the canvas's internal resolution
        overlay.width  = this.canvas.width;
        overlay.height = this.canvas.height;

        // CSS size matches the canvas's rendered (CSS pixel) size exactly
        overlay.style.left   = offsetLeft + 'px';
        overlay.style.top    = offsetTop  + 'px';
        overlay.style.width  = canvasRect.width  + 'px';
        overlay.style.height = canvasRect.height + 'px';
    }

    clearColorScript() {
        this.colorScriptActive = false;
        this.colorScriptZones  = null;

        const overlay = document.getElementById('colorScriptOverlay');
        if (overlay) overlay.style.display = 'none';

        const container = document.getElementById('colorScriptDisplay');
        if (container) container.innerHTML = '';

        const btn = document.getElementById('colorScriptBtn');
        if (btn) {
            btn.textContent = '🎬 Color Script';
            btn.style.background = '';
        }
    }

    renderColorScript(zones, cols, rows) {
        const container = document.getElementById('colorScriptDisplay');
        if (!container) return;
        container.innerHTML = '';

        // ── Header ──
        const header = document.createElement('div');
        header.className = 'cs-header';
        header.innerHTML = `
            <span class="cs-title">🎬 Color Script</span>
            <span class="cs-subtitle">${cols}×${rows} zone average</span>
        `;
        container.appendChild(header);

        // ── Grid that mirrors the image layout ──
        const grid = document.createElement('div');
        grid.className = 'cs-panel-grid';
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;

        zones.forEach(zone => {
            const brightness = (zone.rgb.r * 299 + zone.rgb.g * 587 + zone.rgb.b * 114) / 1000;
            const textColor  = brightness > 145 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)';

            const cell = document.createElement('div');
            cell.className = 'cs-panel-cell';
            cell.style.cssText = `background:${zone.hex}; color:${textColor};`;
            cell.title = `${zone.fullLabel} — click to copy ${zone.hex}`;

            cell.innerHTML = `
                <span class="cs-panel-label">${zone.label}</span>
                <span class="cs-panel-hex">${zone.hex}</span>
            `;

            cell.addEventListener('click', () => {
                this.copyToClipboard(zone.hex);
                this.showNotification(`Copied ${zone.hex}`, 'success');
                // Set as current color too
                const hsl = this.rgbToHsl(zone.rgb.r, zone.rgb.g, zone.rgb.b);
                const hsv = this.rgbToHsv(zone.rgb.r, zone.rgb.g, zone.rgb.b);
                this.currentColor = { rgb: zone.rgb, hex: zone.hex, hsl, hsv };
                this.updateColorInfo(zone.rgb, zone.hex, hsl, hsv);
            });

            grid.appendChild(cell);
        });

        container.appendChild(grid);

        // ── Horizontal strip (film-style read order) ──
        const stripWrap = document.createElement('div');
        stripWrap.className = 'cs-strip-wrap';
        stripWrap.innerHTML = '<div class="cs-strip-label">Film strip (L→R, T→B)</div>';

        const strip = document.createElement('div');
        strip.className = 'cs-strip';

        // Sort zones left-to-right, top-to-bottom
        const ordered = [...zones].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);
        ordered.forEach((zone, i) => {
            const seg = document.createElement('div');
            seg.className = 'cs-strip-seg';
            seg.style.background = zone.hex;
            seg.title = `${zone.fullLabel}: ${zone.hex}`;
            seg.addEventListener('click', () => {
                this.copyToClipboard(zone.hex);
                this.showNotification(`Copied ${zone.hex}`, 'success');
            });
            strip.appendChild(seg);

            // Divider between segments
            if (i < ordered.length - 1) {
                const div = document.createElement('div');
                div.className = 'cs-strip-divider';
                strip.appendChild(div);
            }
        });

        stripWrap.appendChild(strip);
        container.appendChild(stripWrap);
    }

    showNotification(message, type = 'success') {
        let notif = document.getElementById('app-notification');
        if (!notif) {
            notif = document.createElement('div');
            notif.id = 'app-notification';
            notif.style.cssText = `
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(20px);
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                z-index: 10000;
                opacity: 0;
                transition: all 0.25s ease;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                pointer-events: none;
            `;
            document.body.appendChild(notif);
        }
        
        const styles = {
            success: { bg: '#d4edda', text: '#155724', border: '#c3e6cb' },
            warning: { bg: '#fff3cd', text: '#856404', border: '#ffeaa7' },
            error:   { bg: '#f8d7da', text: '#721c24', border: '#f5c6cb' }
        };
        const s = styles[type] || styles.warning;
        notif.textContent = message;
        notif.style.backgroundColor = s.bg;
        notif.style.color = s.text;
        notif.style.border = `2px solid ${s.border}`;
        
        // Clear any existing hide timer
        clearTimeout(notif._hideTimer);
        
        // Animate in
        requestAnimationFrame(() => {
            notif.style.opacity = '1';
            notif.style.transform = 'translateX(-50%) translateY(0)';
        });
        
        notif._hideTimer = setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transform = 'translateX(-50%) translateY(20px)';
        }, 2500);
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('Failed to copy to clipboard:', err);
            this.showNotification('Copy failed — try again', 'error');
        });
    }
    
    showCopyFeedback(element) {
        const originalText = element.textContent;
        const originalBg = element.style.backgroundColor;
        
        if (element.classList.contains('copyable-color')) {
            element.textContent = 'Copied!';
            element.classList.add('copy-feedback');
            setTimeout(() => {
                element.textContent = originalText;
                element.classList.remove('copy-feedback');
            }, 1000);
        } else {
            element.style.backgroundColor = 'rgba(40, 167, 69, 0.3)';
            setTimeout(() => {
                element.style.backgroundColor = originalBg;
            }, 500);
        }
    }
    
    rgbStringToHex(rgbString) {
        const match = rgbString.match(/\d+/g);
        if (!match) return '#000000';
        const r = parseInt(match[0]);
        const g = parseInt(match[1]);
        const b = parseInt(match[2]);
        return this.rgbToHex(r, g, b);
    }
    
    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = Math.max(0, Math.min(255, x)).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }
    
    rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        
        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }
    
    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, v = max;
        
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        
        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        
        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            v: Math.round(v * 100)
        };
    }
    
    hslToHex(h, s, l) {
        const { r, g, b } = this.hslToRgb(h, s, l);
        return this.rgbToHex(r, g, b);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const analyzer = new ColorAnalyzer();
    
    // WebSocket connection for receiving phone camera frames
    const WS_URL = (location.origin.replace(/^http/, 'ws')) + '/';
    let ws;
    let reconnectTimeout;
    
    function connectWebSocket() {
        try {
            ws = new WebSocket(WS_URL);
            
            ws.addEventListener('open', () => {
                console.log('WebSocket connected as viewer');
                ws.send(JSON.stringify({ type: 'introduce', role: 'viewer' }));
                showConnectionStatus('Connected - Ready to receive', 'success');
            });
            
            ws.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'frame' && data.image) {
                        loadImageFromBase64(data.image);
                    }
                } catch (e) {
                    console.error('Error parsing WebSocket message:', e);
                }
            });
            
            ws.addEventListener('close', () => {
                console.log('WebSocket disconnected');
                showConnectionStatus('Disconnected', 'warning');
                reconnectTimeout = setTimeout(() => {
                    connectWebSocket();
                }, 3000);
            });
            
            ws.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
                showConnectionStatus('Connection error', 'error');
            });
            
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
        }
    }
    
    function loadImageFromBase64(base64Data) {
        const img = new Image();
        
        img.onload = () => {
            analyzer.displayImage(img);
            analyzer.uploadArea.style.display = 'none';
            analyzer.canvasWrapper.style.display = 'flex';
            analyzer.clearAnalysis();
            analyzer.updateLiveFeedback();
            analyzer.showAutoAnalyzePrompt();
            showConnectionStatus('Image received!', 'success');
        };
        
        img.onerror = () => {
            console.error('Failed to load received image');
            showConnectionStatus('Failed to load image', 'error');
        };
        
        img.src = base64Data;
    }
    
    function showConnectionStatus(message, type) {
        let statusDiv = document.getElementById('ws-status');
        
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'ws-status';
            statusDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 10px 15px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                z-index: 10000;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            `;
            document.body.appendChild(statusDiv);
        }
        
        statusDiv.textContent = message;
        
        const colors = {
            success: { bg: '#d4edda', text: '#155724', border: '#c3e6cb' },
            warning: { bg: '#fff3cd', text: '#856404', border: '#ffeaa7' },
            error: { bg: '#f8d7da', text: '#721c24', border: '#f5c6cb' }
        };
        
        const color = colors[type] || colors.warning;
        statusDiv.style.backgroundColor = color.bg;
        statusDiv.style.color = color.text;
        statusDiv.style.border = `2px solid ${color.border}`;
        statusDiv.style.opacity = '1';
        statusDiv.style.transform = 'translateY(0)';
        
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.opacity = '0';
                statusDiv.style.transform = 'translateY(-10px)';
            }, 3000);
        }
    }
    
    connectWebSocket();
    
    window.addEventListener('beforeunload', () => {
        if (ws) ws.close();
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
    });
});
