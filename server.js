import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import SibApiV3Sdk from 'sib-api-v3-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- MIDDLEWARE ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true }));

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
    queueLimit: 0
};

let pool;
const connectDB = async () => {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('✅ Database connected.');
        await initDB();
    } catch (err) {
        console.error('❌ Database connection error:', err);
    }
};

// 2. Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 3. Multer (Upload) Configuration
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'monochrome-projects',
        resource_type: 'auto', 
        allowed_formats: ['wav', 'mp3', 'webm', 'png', 'jpg'],
    },
});
const upload = multer({ storage: storage });

// 4. External APIs
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || 'TEST-TOKEN' });

// --- INICIALIZAÇÃO E MIGRAÇÃO DO BANCO DE DADOS ---

const initDB = async () => {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('🔄 Checking database schema...');

        // 1. Tabela de Usuários
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                is_subscribed BOOLEAN DEFAULT FALSE,
                subscription_end DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Tabela de Projetos (Armazena o estado JSON da DAW)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                data LONGTEXT, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // 3. Tabela de Assets (Arquivos de áudio no Cloudinary)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS assets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                project_id INT,
                public_id VARCHAR(255) NOT NULL,
                url VARCHAR(512) NOT NULL,
                format VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Verificação de Colunas
        const [columns] = await connection.query("SHOW COLUMNS FROM users LIKE 'is_subscribed'");
        if (columns.length === 0) {
            await connection.query("ALTER TABLE users ADD COLUMN is_subscribed BOOLEAN DEFAULT FALSE");
            console.log("⚠️ Column 'is_subscribed' added to users table.");
        }

        console.log('✅ Database schema verified/updated.');
    } catch (error) {
        console.error('❌ Error initializing DB:', error);
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
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (email, password, name) VALUES (?, ?, ?)', 
            [email, hashedPassword, name]
        );
        
        const token = jwt.sign({ id: result.insertId, email }, process.env.JWT_SECRET || 'monochrome_secret_key');
        res.json({ token, user: { id: result.insertId, email, name, is_subscribed: false } });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Email already exists' });
        }
        res.status(500).json({ message: 'Error registering user', error: e.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(400).json({ message: 'User not found' });
        
        const user = rows[0];
        if (await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'monochrome_secret_key');
            res.json({ token, user: { id: user.id, email: user.email, name: user.name, is_subscribed: !!user.is_subscribed } });
        } else {
            res.status(403).json({ message: 'Invalid password' });
        }
    } catch (e) {
        res.status(500).json({ message: 'Login error' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, email, name, is_subscribed FROM users WHERE id = ?', [req.user.id]);
        if (rows.length > 0) res.json(rows[0]);
        else res.sendStatus(404);
    } catch (e) {
        res.sendStatus(500);
    }
});

// 2. Gerenciamento de Projetos
app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC', [req.user.id]);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ message: 'Error loading projects' });
    }
});

app.post('/api/projects/save', authenticateToken, async (req, res) => {
    const { name, data } = req.body;
    if (!name || !data) return res.status(400).json({ message: 'Missing name or data' });

    try {
        // Verifica se projeto com mesmo nome existe para este usuário
        const [existing] = await pool.query('SELECT id FROM projects WHERE user_id = ? AND name = ?', [req.user.id, name]);
        
        if (existing.length > 0) {
            await pool.query('UPDATE projects SET data = ? WHERE id = ?', [JSON.stringify(data), existing[0].id]);
        } else {
            await pool.query('INSERT INTO projects (user_id, name, data) VALUES (?, ?, ?)', [req.user.id, name, JSON.stringify(data)]);
        }
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error saving project' });
    }
});

app.post('/api/projects/load', authenticateToken, async (req, res) => {
    const { name } = req.body;
    try {
        const [rows] = await pool.query('SELECT data FROM projects WHERE user_id = ? AND name = ?', [req.user.id, name]);
        if (rows.length > 0) {
            // Retorna o JSON diretamente
            res.json(JSON.parse(rows[0].data));
        } else {
            res.status(404).json({ message: 'Project not found' });
        }
    } catch (e) {
        res.status(500).json({ message: 'Error loading project' });
    }
});

// 3. Upload de Assets (Áudio)
app.post('/api/assets/upload', authenticateToken, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    
    try {
        // Salva referência no DB
        await pool.query('INSERT INTO assets (user_id, public_id, url, format) VALUES (?, ?, ?, ?)', 
            [req.user.id, req.file.filename, req.file.path, req.file.mimetype]);
            
        res.json({ 
            success: true,
            url: req.file.path, 
            public_id: req.file.filename,
            format: req.file.mimetype
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error saving asset info' });
    }
});

// 4. Pagamentos (Mercado Pago)
app.post('/api/checkout/create-preference', authenticateToken, async (req, res) => {
    try {
        const preference = new Preference(mpClient);
        const result = await preference.create({
            body: {
                items: [{ title: 'Monochrome Pro Subscription', quantity: 1, unit_price: 49.90, currency_id: 'BRL' }],
                payer: { email: req.user.email },
                back_urls: {
                    success: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?status=success`,
                    failure: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?status=failure`,
                },
                auto_return: 'approved',
            }
        });
        res.json({ init_point: result.init_point });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Payment error' });
    }
});

// Rota de desenvolvimento para ativar assinatura sem pagar
app.post('/api/dev/activate-sub', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE users SET is_subscribed = TRUE WHERE id = ?', [req.user.id]);
        res.json({ success: true, message: 'Subscription activated (DEV MODE)' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- SERVIDOR DE ARQUIVOS ESTÁTICOS (PRODUÇÃO) ---
// Em produção, o Node.js serve o build do React
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
if (isProduction) {
    app.use(express.static(path.join(__dirname, 'dist')));
    
    // Qualquer rota não-API retorna o index.html (SPA)
    app.get('*', (req, res) => {
        // Ignora rotas API
        if (req.path.startsWith('/api')) return res.sendStatus(404);
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

// Inicia o Servidor e Banco
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌍 Environment: ${isProduction ? 'Production' : 'Development'}`);
    });
});
