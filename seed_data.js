const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'library.db');
const csvPath = path.join(__dirname, 'datasets', 'sample_music_data.csv');

// Ensure DB directory exists
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new sqlite3.Database(dbPath);

const results = [];

console.log(`Reading dataset from ${csvPath}...`);

fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => {
        // Map CSV fields
        const track = {
            id: uuidv4(),
            title: data.Title || "Unknown",
            artist: data.Artist || "Unknown",
            album: data.Album || "Unknown",
            duration: parseInt(data.Duration) || 180,
            bpm: parseFloat(data.BPM) || 120,
            energy: parseFloat(data.Energy) || 0.5,
            valence: parseFloat(data.Valence) || 0.5,
            danceability: parseFloat(data.Danceability) || 0.5,
            uploadDate: Date.now()
        };
        results.push(track);
    })
    .on('end', () => {
        db.serialize(() => {
            // Ensure table exists just in case
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

            const stmt = db.prepare(`INSERT INTO tracks (id, title, artist, album, duration, filename, path, bpm, energy, valence, danceability, uploadDate) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            let count = 0;
            results.forEach(t => {
                stmt.run(
                    t.id, t.title, t.artist, t.album, t.duration,
                    "Pre-loaded Dataset", "", // filename, path
                    t.bpm, t.energy, t.valence, t.danceability, t.uploadDate
                );
                count++;
            });

            stmt.finalize(() => {
                console.log(`Successfully seeded ${count} tracks into the database.`);
                db.close();
            });
        });
    });
