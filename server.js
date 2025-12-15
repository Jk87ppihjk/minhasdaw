
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false } // Necessário para alguns hosts remotos como Hostinger/Render
};

let pool;
try {
    pool = mysql.createPool(dbConfig);
    console.log('Database configuration loaded.');
} catch (err) {
    console.error('Database config error:', err);
}

// Inicializar Tabela de Usuários se não existir
const initDB = async () => {
    try {
        const connection = await pool.getConnection();
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
        connection.release();
        console.log('Users table checked/created.');
    } catch (error) {
        console.error('Error initializing DB:', error);
    }
};
initDB();

// --- CONFIGURAÇÕES DE SERVIÇOS ---

// Mercado Pago
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// Brevo (Email)
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;

    try {
        const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Email já cadastrado.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
            [email, hashedPassword, name]
        );

        // Enviar Email de Boas-Vindas
        try {
            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
            sendSmtpEmail.subject = "Bem-vindo ao Monochrome Studio!";
            sendSmtpEmail.htmlContent = `<html><body><h1>Olá ${name},</h1><p>Sua conta foi criada com sucesso. Prepare-se para produzir hits.</p></body></html>`;
            sendSmtpEmail.sender = { "name": "Monochrome Team", "email": process.env.SENDER_EMAIL };
            sendSmtpEmail.to = [{ "email": email, "name": name }];
            await apiInstance.sendTransacEmail(sendSmtpEmail);
        } catch (emailErr) {
            console.error("Brevo Error:", emailErr);
        }

        const token = jwt.sign({ id: result.insertId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({ 
            token, 
            user: { id: result.insertId, email, name, is_subscribed: false } 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(400).json({ message: 'Credenciais inválidas.' });

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Credenciais inválidas.' });

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({ 
            token, 
            user: { 
                id: user.id, 
                email: user.email, 
                name: user.name, 
                is_subscribed: user.is_subscribed 
            } 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

app.get('/api/auth/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [users] = await pool.query('SELECT id, email, name, is_subscribed, subscription_end FROM users WHERE id = ?', [decoded.id]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });
        
        res.json(users[0]);
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

// --- ROTAS DE PAGAMENTO ---

app.post('/api/checkout/create-preference', async (req, res) => {
    const { userId, email } = req.body;

    try {
        const preference = new Preference(client);
        
        const result = await preference.create({
            body: {
                items: [
                    {
                        id: 'monochrome-pro',
                        title: 'Assinatura Monochrome Studio PRO',
                        quantity: 1,
                        unit_price: 49.90,
                        currency_id: 'BRL',
                        description: 'Acesso ilimitado à DAW e recursos de IA.'
                    }
                ],
                payer: {
                    email: email
                },
                external_reference: userId.toString(), // ID do usuário para identificar no webhook
                back_urls: {
                    success: `${req.headers.origin}/?status=success`,
                    failure: `${req.headers.origin}/?status=failure`,
                    pending: `${req.headers.origin}/?status=pending`
                },
                auto_return: 'approved',
                notification_url: `${req.protocol}://${req.get('host')}/api/checkout/webhook` // Em produção, use HTTPS real
            }
        });

        res.json({ init_point: result.init_point });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar pagamento.' });
    }
});

app.post('/api/checkout/webhook', async (req, res) => {
    const { type, data } = req.body;

    if (type === 'payment') {
        try {
            // Em um app real, consultamos o Mercado Pago para validar o status
            // const payment = await payment.get({ id: data.id });
            // Mas aqui simplificamos assumindo que o webhook vem de uma fonte confiável (deveria validar assinatura)
            
            // Para simplicidade neste exemplo, assumimos sucesso se recebermos o hook
            // Precisaríamos pegar o external_reference (userId) do objeto de pagamento
            
            // Simulação: Ativa a assinatura para o usuário (em produção, buscaria o pagamento real pelo ID)
            // const userId = payment.external_reference;
            // await pool.query('UPDATE users SET is_subscribed = TRUE, subscription_end = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?', [userId]);
            
            console.log("Webhook received:", data.id);
        } catch (error) {
            console.error("Webhook error:", error);
        }
    }
    res.status(200).send();
});

// Simulação de Sucesso (Rota de Dev para ativar manualmente se webhook falhar em localhost)
app.post('/api/dev/activate-sub', async (req, res) => {
    const { userId } = req.body;
    await pool.query('UPDATE users SET is_subscribed = TRUE WHERE id = ?', [userId]);
    res.json({ success: true });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
