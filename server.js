import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import axios from 'axios'; 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- DEBUG: VERIFICAÇÃO DE VARIÁVEIS DE AMBIENTE ---
console.log("========================================");
console.log("🚀 INICIANDO SERVIDOR MONOCHROME STUDIO (GUEST MODE)");
console.log("========================================");

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '100mb' })); 
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// 1. Database Configuration
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }, 
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000 
};

let pool;

const connectDB = async () => {
    try {
        console.log('🔄 Attempting to connect to MySQL...');
        pool = mysql.createPool(dbConfig);
        
        const connection = await pool.getConnection();
        console.log('✅ MySQL Connection Established Successfully!');
        connection.release();
        
        await initDB();
    } catch (err) {
        console.error('❌ FATAL DATABASE ERROR:', err);
    }
};

// 2. Cloudinary Configuration
if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('✅ Cloudinary Configured');
} else {
    console.warn('⚠️ Cloudinary credentials missing. Uploads will fail.');
}

// 3. Suno Configuration
const SUNO_API_KEY = process.env.SUNO_API;
const SUNO_BASE_URL = "https://api.sunoapi.org/api/v1";

if (SUNO_API_KEY) {
    console.log('✅ Suno API Key Detected');
} else {
    console.warn('⚠️ Suno API Key Missing. Beat Generator will fail.');
}

// 4. Multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const isZip = file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.endsWith('.zip');
        return {
            folder: 'monochrome-projects',
            resource_type: isZip ? 'raw' : 'auto', 
            public_id: `project_${Date.now()}_${file.originalname.replace(/\.[^/.]+$/, "")}`,
            format: isZip ? 'zip' : undefined,
        };
    },
});
const upload = multer({ storage: storage });

// --- INIT DB ---
const initDB = async () => {
    let connection;
    try {
        connection = await pool.getConnection();
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                is_subscribed BOOLEAN DEFAULT TRUE,
                subscription_end DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Ensure DEFAULT GUEST USER (ID 1)
        await connection.query(`
            INSERT IGNORE INTO users (id, email, password, name, is_subscribed) 
            VALUES (1, 'guest@studio.com', 'nopass', 'Guest Producer', TRUE)
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                data LONGTEXT, 
                zip_url VARCHAR(512),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS songs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                suno_id VARCHAR(255),
                title VARCHAR(255),
                prompt TEXT,
                tags VARCHAR(255),
                audio_url TEXT,
                image_url TEXT,
                status VARCHAR(50) DEFAULT 'queued',
                duration DECIMAL(10, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        try {
            await connection.query("ALTER TABLE projects ADD COLUMN zip_url VARCHAR(512)");
        } catch(e) { /* Ignore */ }

        console.log('✅ Database Schema Sync Complete.');
    } catch (error) {
        console.error('❌ Error initializing DB Schema:', error.message);
    } finally {
        if (connection) connection.release();
    }
};

const DEFAULT_USER_ID = 1;

// --- ROTAS DA API ---

// LISTAR PROJETOS
app.get('/api/projects', async (req, res) => {
    if (!pool) return res.sendStatus(500);
    try {
        const [rows] = await pool.query('SELECT id, name, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC', [DEFAULT_USER_ID]);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: 'Error loading projects' });
    }
});

// SALVAR PROJETO
app.post('/api/projects/cloud/save', upload.single('projectZip'), async (req, res) => {
    if (!req.file || !req.body.name) return res.status(400).json({ message: 'Missing file or name' });
    if (!pool) return res.sendStatus(500);

    const projectName = req.body.name;
    const zipUrl = req.file.path || req.file.secure_url; 

    try {
        const [existing] = await pool.query('SELECT id FROM projects WHERE user_id = ? AND name = ?', [DEFAULT_USER_ID, projectName]);
        
        if (existing.length > 0) {
            await pool.query('UPDATE projects SET zip_url = ?, updated_at = NOW() WHERE id = ?', [zipUrl, existing[0].id]);
        } else {
            await pool.query('INSERT INTO projects (user_id, name, zip_url) VALUES (?, ?, ?)', [DEFAULT_USER_ID, projectName, zipUrl]);
        }
        
        res.json({ success: true, url: zipUrl });
    } catch (e) {
        console.error("Save Error:", e);
        res.status(500).json({ message: 'Error saving project to cloud' });
    }
});

// CARREGAR PROJETO
app.get('/api/projects/:id', async (req, res) => {
    if (!pool) return res.sendStatus(500);
    try {
        const [rows] = await pool.query('SELECT name, zip_url FROM projects WHERE id = ? AND user_id = ?', [req.params.id, DEFAULT_USER_ID]);
        if (rows.length > 0) {
            res.json({ 
                name: rows[0].name,
                zipUrl: rows[0].zip_url 
            });
        } else {
            res.status(404).json({ message: 'Project not found' });
        }
    } catch (e) {
        res.status(500).json({ message: 'Error fetching project' });
    }
});

// SUNO MUSIC GENERATION
app.post('/api/music/generate', async (req, res) => {
    const { prompt, tags, title, instrumental } = req.body;
    
    try {
        const payload = {
            customMode: true,
            prompt: prompt,
            style: tags || "instrumental",
            title: title || "AI Beat",
            instrumental: instrumental,
            model: "V3_5",
            callBackUrl: `https://monochrome-studio.onrender.com/api/webhook/suno` 
        };

        const response = await axios.post(`${SUNO_BASE_URL}/generate`, payload, {
            headers: { 
                'Authorization': `Bearer ${SUNO_API_KEY}`,
                'Content-Type': 'application/json' 
            }
        });

        const songs = response.data.clips || response.data;
        if (Array.isArray(songs)) {
            for (const song of songs) {
                if (song.id) {
                    await pool.query(
                        `INSERT INTO songs (user_id, suno_id, title, status) VALUES (?, ?, ?, ?)`,
                        [DEFAULT_USER_ID, song.id, title, 'submitted']
                    );
                }
            }
        } else if (songs.id) {
             await pool.query(
                `INSERT INTO songs (user_id, suno_id, title, status) VALUES (?, ?, ?, ?)`,
                [DEFAULT_USER_ID, songs.id, title, 'submitted']
            );
        }

        res.json({ data: songs });

    } catch (error) {
        console.error("Suno Gen Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to generate music via Suno." });
    }
});

app.get('/api/music/my-songs', async (req, res) => {
    try {
        const [localSongs] = await pool.query('SELECT suno_id FROM songs WHERE user_id = ? AND status != "complete" ORDER BY created_at DESC LIMIT 5', [DEFAULT_USER_ID]);
        
        if (localSongs.length === 0) return res.json([]);

        const ids = localSongs.map(s => s.suno_id).join(',');
        
        const response = await axios.get(`${SUNO_BASE_URL}/generate/record-info?taskId=${ids}`, {
            headers: { 'Authorization': `Bearer ${SUNO_API_KEY}` }
        });

        const updates = response.data;
        res.json(updates);

    } catch (error) {
        console.error("Suno Check Error:", error.message);
        res.json([]);
    }
});

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;

if (isProduction) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ message: 'API Route not found' });
        }
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
});
