/**
 * SonicMind Application Logic (Full Stack)
 * Connects frontend to Node.js/SQLite backend.
 */

// --- State Management ---
const state = {
    library: [],
    playlist: []
};

// --- Initialization ---
async function init() {
    await loadLibrary();
    setupGlobalListeners();
    injectPlayer(); // Add persistent player
    updateUI();

    // Check for Generator specific elements
    if (document.getElementById('sourceList')) {
        renderSourceList();
        renderPlaylist();
    }
}

// Global Player State
let audioplayer = null;
let currentTrackId = null;

function injectPlayer() {
    // Only inject if not exists
    if (document.getElementById('sonicPlayer')) return;

    const playerHTML = `
        <div class="audio-player-bar" id="sonicPlayer">
            <div class="player-info">
                <div class="music-thumbnail" id="pThumb" style="width:50px; height:50px;"></div>
                <div style="overflow:hidden;">
                    <div class="music-title" id="pTitle" style="white-space:nowrap;">Select a song</div>
                    <div class="music-meta" id="pArtist">SonicMind Player</div>
                </div>
            </div>
            
            <div class="player-controls">
                <button class="player-btn"><i class="fas fa-step-backward"></i></button>
                <button class="player-btn play-xl" id="pPlayBtn" onclick="togglePlay()">
                    <i class="fas fa-play"></i>
                </button>
                <button class="player-btn"><i class="fas fa-step-forward"></i></button>
            </div>

            <div class="player-track">
                <span id="pCurrentTime" style="font-size:0.8rem; font-family:monospace">0:00</span>
                <div class="progress-container" id="pProgress">
                    <div class="progress-bar" id="pBar"></div>
                </div>
                <span id="pDuration" style="font-size:0.8rem; font-family:monospace">0:00</span>
            </div>

            <audio id="realAudio" style="display:none;"></audio>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', playerHTML);

    // Set up audio events
    const audio = document.getElementById('realAudio');
    audioplayer = audio;

    audio.addEventListener('timeupdate', () => {
        const percent = (audio.currentTime / audio.duration) * 100;
        document.getElementById('pBar').style.width = percent + '%';
        document.getElementById('pCurrentTime').innerText = formatTime(audio.currentTime);
        document.getElementById('pDuration').innerText = formatTime(audio.duration || 0);
    });

    audio.addEventListener('ended', () => {
        document.getElementById('pPlayBtn').innerHTML = '<i class="fas fa-play"></i>';
    });

    document.getElementById('pProgress').addEventListener('click', (e) => {
        const rect = e.target.closest('.progress-container').getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const clickPercent = x / width;
        if (audio.duration) audio.currentTime = clickPercent * audio.duration;
    });
}

window.togglePlay = function () {
    if (!audioplayer.src) return;
    if (audioplayer.paused) {
        audioplayer.play();
        document.getElementById('pPlayBtn').innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        audioplayer.pause();
        document.getElementById('pPlayBtn').innerHTML = '<i class="fas fa-play"></i>';
    }
}

window.playLocalTrack = function (id) {
    const song = state.library.find(s => s.id === id);
    if (!song) return;

    if (shouldUseExternalApp(song)) {
        openInApp(song.title, song.artist);
        return;
    }

    // Local Playback
    console.log("Playing local:", song.filename);

    // Show player
    document.getElementById('sonicPlayer').classList.add('active');
    document.getElementById('pTitle').innerText = song.title;
    document.getElementById('pArtist').innerText = song.artist;

    const src = `/uploads/${song.filename}`;
    if (audioplayer.src !== window.location.origin + src) {
        audioplayer.src = src;
    }

    audioplayer.play().catch(e => console.error(e));
    document.getElementById('pPlayBtn').innerHTML = '<i class="fas fa-pause"></i>';
}

function shouldUseExternalApp(song) {
    // If it's from the CSV/Seed dataset (no real file path or explicit marker)
    // In our server logic: 
    // - Uploads have filename = generated string
    // - CSV/Seed have filename = "External Source" or "Pre-loaded Dataset"
    return (song.filename === "External Source" || song.filename === "Pre-loaded Dataset" || !song.filename);
}

// Fetch Library from Backend DB
async function loadLibrary() {
    try {
        const res = await fetch('/api/tracks');
        if (res.ok) {
            state.library = await res.json();
            renderLibrary(); // Update upload.html list if present
        }
    } catch (e) {
        console.error("Failed to load library:", e);
    }
}

// --- Upload Logic ---

async function handleFiles(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    // Show loading state
    const dropZone = document.getElementById('dropZone');
    const originalText = dropZone ? dropZone.innerHTML : '';
    if (dropZone) dropZone.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Uploading & Analyzing...</p>';

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            state.library.unshift(...data.tracks); // Add new tracks to front
            // Reload full library to match DB order
            await loadLibrary();
            alert(`Successfully analyzed and uploaded ${data.tracks.length} tracks.`);
        } else {
            alert('Upload failed.');
        }
    } catch (e) {
        console.error(e);
        alert('Error uploading files.');
    } finally {
        if (dropZone) dropZone.innerHTML = originalText;
    }
}

function renderLibrary() {
    const list = document.getElementById('libraryList');
    if (!list) return;

    const countEl = document.getElementById('trackCount');
    if (countEl) countEl.innerText = state.library.length;

    list.innerHTML = '';

    if (state.library.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No tracks found. Upload some music to get started.</div>`;
        return;
    }

    state.library.forEach(song => {
        const div = document.createElement('div');
        div.className = 'music-item';
        div.innerHTML = `
            <div class="music-thumbnail"></div>
            <div class="music-info">
                <div class="music-title">${song.title}</div>
                <div class="music-meta">
                    ${song.artist} • ${Math.round(song.bpm)} BPM • 
                    <span style="color: ${getEnergyColor(song.energy)}">
                        ${getMoodLabel(song)}
                    </span>
                </div>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">
                ${formatTime(song.duration)}
            </div>
            <!-- Play Button for Library -->
            <button class="btn btn-outline" style="margin-left: 1rem; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;" onclick="playLocalTrack('${song.id}')">
               <i class="fas fa-play"></i>
            </button>
        `;
        list.appendChild(div);
    });
}

// --- Generator Logic ---

function renderSourceList() {
    const list = document.getElementById('sourceList');
    if (!list) return;

    list.innerHTML = '';
    state.library.forEach(song => {
        const div = document.createElement('div');
        div.className = 'music-item';
        div.draggable = true;
        div.dataset.id = song.id;
        div.innerHTML = `
            <div class="music-thumbnail" style="width: 40px; height: 40px;"></div>
            <div class="music-info">
                <div class="music-title" style="font-size: 0.85rem;">${song.title}</div>
            </div>
            <button class="add-btn" onclick="addToPlaylist('${song.id}')"><i class="fas fa-plus"></i></button>
            <button class="add-btn" style="background:var(--secondary); margin-left:5px;" onclick="playLocalTrack('${song.id}')"><i class="fas fa-play" style="font-size:0.7rem"></i></button>
        `;
        list.appendChild(div);
    });

    if (window.Sortable && !list.sortableInitialized) {
        new Sortable(list, {
            group: {
                name: 'shared',
                pull: 'clone',
                put: false
            },
            sort: false,
            animation: 150
        });
        list.sortableInitialized = true;
    }
}

function renderPlaylist() {
    const list = document.getElementById('playlistList');
    if (!list) return;

    const empty = list.querySelector('.empty-state');
    if (state.playlist.length === 0) {
        if (empty) empty.style.display = 'flex';
        const items = list.querySelectorAll('.music-item');
        items.forEach(i => i.remove());
    } else {
        if (empty) empty.style.display = 'none';

        // Remove existing items to re-render
        // (Optimized approach would diff, but full re-render is fine for this size)
        const currentItems = Array.from(list.children).filter(c => !c.classList.contains('empty-state'));
        currentItems.forEach(c => c.remove());

        state.playlist.forEach((song, index) => {
            const div = document.createElement('div');
            div.className = 'music-item';
            div.dataset.id = song.id;
            div.innerHTML = `
                <div style="color: var(--text-muted); width: 20px;">${index + 1}</div>
                <div class="music-thumbnail"></div>
                <div class="music-info">
                    <div class="music-title">${song.title}</div>
                    <div class="music-meta">${song.artist} • ${getMoodLabel(song)}</div>
                </div>
                <div style="display:flex; gap: 5px;">
                    <button class="btn btn-outline" style="padding: 5px 10px; border: none; color: var(--primary);" onclick="playLocalTrack('${song.id}')" title="Play">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-outline" style="padding: 5px 10px; border: none;" onclick="removeFromPlaylist('${song.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                `;
            list.appendChild(div);
        });

        updatePlaylistStats();
    }

    // Initialize Sortable for playlist
    if (window.Sortable && !list.sortableInitialized) {
        new Sortable(list, {
            group: 'shared',
            animation: 150,
            onAdd: function (evt) {
                const id = evt.item.dataset.id;
                evt.item.remove();
                addToPlaylist(id);
            }
        });
        list.sortableInitialized = true;
    }
}

// Redirect Logic
window.openInApp = function (title, artist) {
    const app = localStorage.getItem('sonicmind_connected_app') || 'Spotify';
    const query = encodeURIComponent(`${title} ${artist} `);

    let url = '';

    if (app === 'Spotify') {
        // Try deep link first, usually requires specific URI scheme handling
        // Fallback to web player search if deep link fails (browser dependent)
        url = `https://open.spotify.com/search/${query}`;
        // Alternatively: `spotify:search:${query}` if we want to force app. 
        // But browsers might block custom protocols without user interaction.
        // Web search is safer for "redirecting to page".
    } else if (app === 'YouTube Music') {
        url = `https://music.youtube.com/search?q=${query}`;
    } else {
        // Default Google Search
        url = `https://www.google.com/search?q=${query}`;
    }

    // Open in new tab which should trigger app intent on mobile or open web player
    window.open(url, '_blank');
};

function addToPlaylist(id) {
    const song = state.library.find(s => s.id === id);
    if (song) {
        state.playlist.push(song);
        renderPlaylist();
    }
}

function removeFromPlaylist(id) {
    const idx = state.playlist.findIndex(s => s.id === id);
    if (idx > -1) {
        state.playlist.splice(idx, 1);
        renderPlaylist();
    }
}

// Call Backend AI Generator
async function generatePlaylist() {
    const vibe = document.getElementById('vibeSelect').value;
    const duration = parseInt(document.getElementById('durationRange').value);

    // UI Feedback
    const btn = document.getElementById('generateBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing & Clustering...';

    try {
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vibe, duration })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.playlist.length === 0) {
                alert("No matching tracks found. Try uploading more diverse music!");
            } else {
                state.playlist = data.playlist;
                renderPlaylist();
            }
        }
    } catch (e) {
        console.error(e);
        alert("Generation failed");
    } finally {
        btn.innerHTML = originalText;
    }
}

// --- Helpers ---

function updatePlaylistStats() {
    const count = document.getElementById('playlistCount');
    const dur = document.getElementById('playlistDuration');

    if (count) count.innerText = state.playlist.length;

    const totalSeconds = state.playlist.reduce((acc, s) => acc + s.duration, 0);
    if (dur) dur.innerText = formatTime(totalSeconds);
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function getEnergyColor(energy) {
    if (energy > 0.7) return '#ef4444';
    if (energy > 0.4) return '#eab308';
    return '#3b82f6';
}

function getMoodLabel(s) {
    // Backend properties might differ slightly, normalize
    const e = s.energy;
    const v = s.valence;
    if (e > 0.8) return 'Intense';
    if (v > 0.7) return 'Happy';
    if (v < 0.3) return 'Sad';
    if (s.bpm < 80) return 'Slow';
    return 'Balanced';
}

function updateUI() {
    // Minor UI updates if needed
    const analyzedEl = document.getElementById('analyzedCount');
    if (analyzedEl) analyzedEl.innerText = state.library.length;
}

function setupGlobalListeners() {
    // File Input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }

    // Generate Button
    const genBtn = document.getElementById('generateBtn');
    if (genBtn) {
        genBtn.addEventListener('click', generatePlaylist);
    }

    // Save Playlist Button
    const saveBtn = document.getElementById('savePlaylistBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (state.playlist.length === 0) return alert('Playlist is empty!');

            const titleEl = document.getElementById('playlistTitle');
            const name = titleEl ? titleEl.innerText : "My Playlist";

            try {
                const res = await fetch('/api/save-playlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, tracks: state.playlist })
                });

                if (res.ok) {
                    alert('Playlist saved to database!');
                } else {
                    alert('Failed to save playlist.');
                }
            } catch (e) {
                console.error(e);
                alert('Error saving playlist.');
            }
        });
    }

    // Export Button
    const expBtn = document.getElementById('exportBtn');
    if (expBtn) {
        expBtn.addEventListener('click', () => {
            if (state.playlist.length === 0) return alert('Playlist is empty!');

            const titleEl = document.getElementById('playlistTitle');
            const name = titleEl ? titleEl.innerText : "My Playlist";

            // Generate CSV Content
            let csvContent = "Title,Artist,Album\n";
            state.playlist.forEach(t => {
                csvContent += `"${t.title}","${t.artist}","${t.album}"\n`;
            });

            downloadFile(name + ".csv", csvContent);
        });
    }
}

function downloadFile(filename, text) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// Boot
document.addEventListener('DOMContentLoaded', init);
window.addToPlaylist = addToPlaylist; // Expose for inline onclicks
window.removeFromPlaylist = removeFromPlaylist;

// Drag Drop Zone special handler for upload.html
const dropZone = document.getElementById('dropZone');
if (dropZone) {
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--glass-border)';
        dropZone.style.background = 'transparent';

        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--primary)';
        dropZone.style.background = 'var(--glass)';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--glass-border)';
        dropZone.style.background = 'transparent';
    });

    dropZone.addEventListener('click', () => document.getElementById('fileInput').click());
}
