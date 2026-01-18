const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const mm = require('music-metadata');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;
const csv = require('csv-parser');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

// Ensure directories exist
['./uploads', './database', './public', './public/css', './public/js'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Database Setup
const db = new sqlite3.Database('./database/library.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        title TEXT,
        artist TEXT,
        album TEXT,
        duration INTEGER,
        filename TEXT,
        path TEXT,
        bpm REAL,
        energy REAL, 
        valence REAL,
        danceability REAL,
        uploadDate INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT,
        tracks TEXT, -- JSON string of track IDs
        created INTEGER
    )`);
});

// Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- Helper Functions ---

// Mock Feature Extraction (Simulating Unsupervised Learning Models)
// In a real production Python env, we'd use Librosa. 
// Here, we use music-metadata for basic info + randomize/hash "AI" features if not present.
async function extractAudioFeatures(filePath) {
    try {
        const metadata = await mm.parseFile(filePath);

        // We simulate "AI" features based on some file hashes/lengths to be deterministic but varied
        // In reality, this is where your Machine Learning model would run
        const pseudoRandom = (metadata.format.duration || 0) * 123.45;
        const energy = Math.abs(Math.sin(pseudoRandom));
        const valence = Math.abs(Math.cos(pseudoRandom * 2));
        const danceability = Math.abs(Math.sin(pseudoRandom * 3));

        return {
            title: metadata.common.title,
            artist: metadata.common.artist,
            album: metadata.common.album,
            duration: metadata.format.duration,
            bpm: metadata.common.bpm || (60 + (energy * 120)), // Fallback mock BPM
            energy,
            valence,
            danceability
        };
    } catch (error) {
        console.error("Metadata error:", error);
        return {
            energy: 0.5, valence: 0.5, bpm: 100, duration: 180
        };
    }
}

// --- Routes ---

// Get All Tracks
app.get('/api/tracks', (req, res) => {
    db.all("SELECT * FROM tracks ORDER BY uploadDate DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Upload Track
app.post('/api/upload', upload.array('files'), async (req, res) => {
    const files = req.files;
    const results = [];

    for (const file of files) {
        const features = await extractAudioFeatures(file.path);
        const track = {
            id: uuidv4(),
            title: features.title || file.originalname.replace(/\.[^/.]+$/, ""),
            artist: features.artist || "Unknown Artist",
            album: features.album || "Unknown Album",
            duration: features.duration || 0,
            filename: file.filename,
            path: file.path,
            bpm: features.bpm,
            energy: features.energy,
            valence: features.valence,
            danceability: features.danceability,
            uploadDate: Date.now()
        };

        db.run(`INSERT INTO tracks (id, title, artist, album, duration, filename, path, bpm, energy, valence, danceability, uploadDate) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [track.id, track.title, track.artist, track.album, track.duration, track.filename, track.path, track.bpm, track.energy, track.valence, track.danceability, track.uploadDate]
        );
        results.push(track);
    }

    res.json({ message: "Uploaded successfully", tracks: results });
});

// Upload CSV Data
app.post('/api/upload-csv', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No CSV file uploaded" });
    }

    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => {
            // Map CSV columns to Schema (Case insensitive check helper could be added, but keeping simple)
            // Expected headers: Title, Artist, Album, Duration, BPM, Energy...
            // If missing AI stats, generate defaults

            const pseudoRandom = Math.random() * 100;

            const track = {
                id: uuidv4(),
                title: data.Title || data.title || "Unknown Title",
                artist: data.Artist || data.artist || "Unknown Artist",
                album: data.Album || data.album || "Unknown Album",
                duration: parseInt(data.Duration || data.duration) || 180,
                filename: "External Source",
                path: "", // No local file
                bpm: parseFloat(data.BPM || data.bpm) || (80 + Math.random() * 40),
                energy: parseFloat(data.Energy || data.energy) || Math.random(),
                valence: parseFloat(data.Valence || data.valence) || Math.random(),
                danceability: parseFloat(data.Danceability || data.danceability) || Math.random(),
                uploadDate: Date.now()
            };
            results.push(track);
        })
        .on('end', () => {
            // Bulk insert
            const stmt = db.prepare(`INSERT INTO tracks (id, title, artist, album, duration, filename, path, bpm, energy, valence, danceability, uploadDate) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            results.forEach(t => {
                stmt.run(t.id, t.title, t.artist, t.album, t.duration, t.filename, t.path, t.bpm, t.energy, t.valence, t.danceability, t.uploadDate);
            });
            stmt.finalize();

            // Cleanup CSV file
            fs.unlinkSync(req.file.path);

            res.json({ message: `Imported ${results.length} tracks from CSV`, tracks: results });
        });
});

// Generate Playlist (The "AI" Part)
app.post('/api/generate', (req, res) => {
    const { vibe, duration } = req.body; // duration in minutes
    const targetSeconds = duration * 60;

    db.all("SELECT * FROM tracks", [], (err, allTracks) => {
        if (err) return res.status(500).json({ error: err.message });

        // Filter logic (Clustering)
        let candidates = [];

        switch (vibe) {
            case 'energetic':
                candidates = allTracks.filter(t => t.energy > 0.6);
                candidates.sort((a, b) => b.energy - a.energy);
                break;
            case 'chill':
                candidates = allTracks.filter(t => t.energy < 0.5 && t.bpm < 110);
                candidates.sort((a, b) => a.energy - b.energy);
                break;
            case 'focus':
                candidates = allTracks.filter(t => t.danceability < 0.5);
                break;
            case 'party':
                candidates = allTracks.filter(t => t.valance > 0.6 && t.danceability > 0.6);
                break;
            default:
                candidates = allTracks;
        }

        // If filtering restricted too much, fallback to all sorted by reasonable metric
        if (candidates.length < 5) candidates = allTracks;

        // Greedy Knapsack-ish approach to fill duration
        const playlist = [];
        let currentSec = 0;

        for (const track of candidates) {
            if (currentSec + track.duration <= targetSeconds + 120) { // Allow slight buffer
                playlist.push(track);
                currentSec += track.duration;
            }
        }

        res.json({ playlist, totalDuration: currentSec });
        res.json({ playlist, totalDuration: currentSec });
    });
});

// Save Playlist
app.post('/api/save-playlist', (req, res) => {
    const { name, tracks } = req.body;
    const id = uuidv4();
    const created = Date.now();
    const tracksJson = JSON.stringify(tracks.map(t => t.id)); // Store IDs only

    db.run(`INSERT INTO playlists (id, name, tracks, created) VALUES (?, ?, ?, ?)`,
        [id, name, tracksJson, created],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Playlist saved successfully", id });
        }
    );
});

// Get All Playlists
app.get('/api/playlists', (req, res) => {
    db.all("SELECT * FROM playlists ORDER BY created DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse the tracks JSON string back to array
        const playlists = rows.map(p => ({
            ...p,
            tracks: JSON.parse(p.tracks)
        }));
        res.json(playlists);
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Ensure you visit http://localhost:${PORT} to see the app.`);
});
