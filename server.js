import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import axios from 'axios'; // Ensure Axios is imported for Suno Proxy

// Carrega variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- DEBUG: VERIFICAÇÃO DE VARIÁVEIS DE AMBIENTE ---
console.log("========================================");
console.log("🚀 INICIANDO SERVIDOR MONOCHROME STUDIO (FREE CLOUD ZIP + SUNO)");
console.log("========================================");

// --- MIDDLEWARE ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '100mb' })); 
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// --- CONFIGURAÇÕES ---

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

// 4. Multer (Upload) Configuration - Modified for ZIP support
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        // Se for ZIP, trata como RAW para não tentar processar como imagem/video
        const isZip = file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.endsWith('.zip');
        return {
            folder: 'monochrome-projects',
            resource_type: isZip ? 'raw' : 'auto', 
            public_id: `project_${Date.now()}_${file.originalname.replace(/\.[^/.]+$/, "")}`,
            format: isZip ? 'zip' : undefined, // Força extensão zip se for raw
        };
    },
});
const upload = multer({ storage: storage });

// --- INICIALIZAÇÃO E MIGRAÇÃO DO BANCO DE DADOS ---

const initDB = async () => {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('🛠️  Checking Database Schema...');

        // 1. Tabela de Usuários (FREE = TRUE DEFAULT)
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

        // 2. Tabela de Projetos - Adicionando zip_url se não existir
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
        
        // 3. Tabela de Songs (Para Suno History)
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
        
        // Add column safely if it doesn't exist (Migration)
        try {
            await connection.query("ALTER TABLE projects ADD COLUMN zip_url VARCHAR(512)");
            console.log("   - Added 'zip_url' column to projects table.");
        } catch(e) { /* Ignore */ }

        // Force update old users to subscribed
        await connection.query("UPDATE users SET is_subscribed = TRUE WHERE is_subscribed = FALSE");

        console.log('✅ Database Schema Sync Complete.');
    } catch (error) {
        console.error('❌ Error initializing DB Schema:', error.message);
    } finally {
        if (connection) connection.release();
    }
};

// --- MIDDLEWARES AUXILIARES ---

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET || 'monochrome_secret_key', (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- ROTAS DA API ---

// 1. Autenticação
app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    if (!pool) return res.status(500).json({ message: 'Database not connected' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (email, password, name, is_subscribed) VALUES (?, ?, ?, TRUE)', 
            [email, hashedPassword, name]
        );
        const token = jwt.sign({ id: result.insertId, email }, process.env.JWT_SECRET || 'monochrome_secret_key');
        res.json({ token, user: { id: result.insertId, email, name, is_subscribed: true } });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Email already exists' });
        }
        res.status(500).json({ message: 'Error registering user', error: e.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!pool) return res.status(500).json({ message: 'Database not connected' });

    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(400).json({ message: 'User not found' });
        
        const user = rows[0];
        if (await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'monochrome_secret_key');
            res.json({ token, user: { id: user.id, email: user.email, name: user.name, is_subscribed: true } });
        } else {
            res.status(403).json({ message: 'Invalid password' });
        }
    } catch (e) {
        res.status(500).json({ message: 'Login error' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    if (!pool) return res.sendStatus(500);
    try {
        const [rows] = await pool.query('SELECT id, email, name, is_subscribed FROM users WHERE id = ?', [req.user.id]);
        if (rows.length > 0) res.json(rows[0]);
        else res.sendStatus(404);
    } catch (e) {
        res.sendStatus(500);
    }
});

// 2. Gerenciamento de Projetos (CLOUD ZIP)

// LISTAR PROJETOS
app.get('/api/projects', authenticateToken, async (req, res) => {
    if (!pool) return res.sendStatus(500);
    try {
        // Retorna apenas metadados para a lista
        const [rows] = await pool.query('SELECT id, name, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC', [req.user.id]);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: 'Error loading projects' });
    }
});

// SALVAR PROJETO (UPLOAD ZIP)
app.post('/api/projects/cloud/save', authenticateToken, upload.single('projectZip'), async (req, res) => {
    // Agora esperamos um arquivo ZIP no campo 'projectZip' e o nome no body
    if (!req.file || !req.body.name) return res.status(400).json({ message: 'Missing file or name' });
    if (!pool) return res.sendStatus(500);

    const projectName = req.body.name;
    const zipUrl = req.file.path || req.file.secure_url; // Cloudinary URL

    try {
        const [existing] = await pool.query('SELECT id FROM projects WHERE user_id = ? AND name = ?', [req.user.id, projectName]);
        
        if (existing.length > 0) {
            // Update URL e timestamp
            await pool.query('UPDATE projects SET zip_url = ?, updated_at = NOW() WHERE id = ?', [zipUrl, existing[0].id]);
        } else {
            // Create New
            await pool.query('INSERT INTO projects (user_id, name, zip_url) VALUES (?, ?, ?)', [req.user.id, projectName, zipUrl]);
        }
        
        res.json({ success: true, url: zipUrl });
    } catch (e) {
        console.error("Save Error:", e);
        res.status(500).json({ message: 'Error saving project to cloud' });
    }
});

// CARREGAR PROJETO (OBTER URL)
app.get('/api/projects/:id', authenticateToken, async (req, res) => {
    if (!pool) return res.sendStatus(500);
    try {
        const [rows] = await pool.query('SELECT name, zip_url FROM projects WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (rows.length > 0) {
            // Retorna a URL para o frontend baixar e descompactar
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

// 3. SUNO MUSIC GENERATION (Proxy)

app.post('/api/music/generate', authenticateToken, async (req, res) => {
    const { prompt, tags, title, instrumental } = req.body;
    
    try {
        const payload = {
            customMode: true,
            prompt: prompt,
            style: tags || "instrumental",
            title: title || "AI Beat",
            instrumental: instrumental,
            model: "V3_5",
            callBackUrl: `https://monochrome-studio.onrender.com/api/webhook/suno` // Adjust for production
        };

        const response = await axios.post(`${SUNO_BASE_URL}/generate`, payload, {
            headers: { 
                'Authorization': `Bearer ${SUNO_API_KEY}`,
                'Content-Type': 'application/json' 
            }
        });

        // Salvar no DB para tracking
        const songs = response.data.clips || response.data; // Suno API structure varies
        // Simple insert for history (optional for this context but good for polling)
        if (Array.isArray(songs)) {
            for (const song of songs) {
                if (song.id) {
                    await pool.query(
                        `INSERT INTO songs (user_id, suno_id, title, status) VALUES (?, ?, ?, ?)`,
                        [req.user.id, song.id, title, 'submitted']
                    );
                }
            }
        } else if (songs.id) {
             await pool.query(
                `INSERT INTO songs (user_id, suno_id, title, status) VALUES (?, ?, ?, ?)`,
                [req.user.id, songs.id, title, 'submitted']
            );
        }

        res.json({ data: songs });

    } catch (error) {
        console.error("Suno Gen Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to generate music via Suno." });
    }
});

app.get('/api/music/my-songs', authenticateToken, async (req, res) => {
    try {
        // 1. Pega músicas do DB local que estão pendentes
        const [localSongs] = await pool.query('SELECT suno_id FROM songs WHERE user_id = ? AND status != "complete" ORDER BY created_at DESC LIMIT 5', [req.user.id]);
        
        if (localSongs.length === 0) return res.json([]);

        const ids = localSongs.map(s => s.suno_id).join(',');
        
        // 2. Consulta API da Suno
        const response = await axios.get(`${SUNO_BASE_URL}/generate/record-info?taskId=${ids}`, {
            headers: { 'Authorization': `Bearer ${SUNO_API_KEY}` }
        });

        const updates = response.data; // Array of objects
        
        // 3. Atualiza DB local e retorna
        // (Simplificado: apenas retorna os dados frescos para o frontend polling)
        res.json(updates);

    } catch (error) {
        console.error("Suno Check Error:", error.message);
        res.json([]);
    }
});


// --- SERVIDOR DE ARQUIVOS ESTÁTICOS ---
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
        console.log(`🌍 Environment: ${isProduction ? 'Production' : 'Development'}`);
    });
});
