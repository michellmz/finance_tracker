// server.js - Node.js Backend con Express
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/finance-tracker', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Modelo de Usuario
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  balance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// Modelo de Transacción
const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  category: String,
  type: { type: String, enum: ['income', 'expense'], required: true },
  date: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', TransactionSchema);

// ==================== RUTAS ====================

// Crear usuario
app.post('/api/users', async (req, res) => {
  try {
    const { email, name } = req.body;
    const user = new User({ email, name });
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Obtener usuario
app.get('/api/users/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Clasificar transacción con OpenAI
app.post('/api/classify', async (req, res) => {
  try {
    const { description } = req.body;
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Eres un asistente que clasifica transacciones financieras. Responde SOLO con la categoría en formato: emoji + nombre'
          },
          {
            role: 'user',
            content: `Clasifica esta transacción en UNA de estas categorías:
🛒 Alimentación
🏠 Vivienda
🚗 Transporte
🎬 Entretenimiento
👕 Compras
🏥 Salud
🍽️ Restaurantes
💰 Ingresos
📚 Educación
✈️ Viajes
💳 Otros

Transacción: "${description}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 50
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const category = response.data.choices[0].message.content.trim();
    res.json({ category });
  } catch (error) {
    console.error('Error OpenAI:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al clasificar transacción', category: '💳 Otros' });
  }
});

// Crear transacción
app.post('/api/transactions', async (req, res) => {
  try {
    const { userId, description, amount, type } = req.body;
    
    // Clasificar automáticamente con OpenAI
    let category = '💳 Otros';
    try {
      const classifyResponse = await axios.post(
        `http://localhost:${process.env.PORT || 3001}/api/classify`,
        { description }
      );
      category = classifyResponse.data.category;
    } catch (error) {
      console.error('Error al clasificar:', error.message);
    }

    const transaction = new Transaction({
      userId,
      description,
      amount,
      category,
      type
    });
    
    await transaction.save();

    // Actualizar balance del usuario
    const user = await User.findById(userId);
    user.balance += amount;
    await user.save();

    res.status(201).json(transaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Obtener transacciones de un usuario
app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, skip = 0 } = req.query;
    
    const transactions = await Transaction.find({ userId })
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    res.json(transactions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Eliminar transacción
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Transacción no encontrada' });

    // Actualizar balance del usuario
    const user = await User.findById(transaction.userId);
    user.balance -= transaction.amount;
    await user.save();

    await transaction.deleteOne();
    res.json({ message: 'Transacción eliminada' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Obtener estadísticas
app.get('/api/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const query = { userId };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query);
    
    const stats = {
      totalIncome: 0,
      totalExpenses: 0,
      categoryBreakdown: {},
      transactionCount: transactions.length
    };

    transactions.forEach(t => {
      if (t.type === 'income') {
        stats.totalIncome += t.amount;
      } else {
        stats.totalExpenses += Math.abs(t.amount);
      }

      if (!stats.categoryBreakdown[t.category]) {
        stats.categoryBreakdown[t.category] = 0;
      }
      stats.categoryBreakdown[t.category] += Math.abs(t.amount);
    });

    res.json(stats);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Predicción con Python ML Service
app.post('/api/predict', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Obtener transacciones históricas
    const transactions = await Transaction.find({ userId })
      .sort({ date: -1 })
      .limit(100);

    // Llamar al servicio Python
    const pythonResponse = await axios.post(
      'http://localhost:5000/predict',
      {
        transactions: transactions.map(t => ({
          amount: t.amount,
          type: t.type,
          category: t.category,
          date: t.date
        }))
      },
      {
        timeout: 30000 // 30 segundos timeout
      }
    );

    res.json(pythonResponse.data);
  } catch (error) {
    console.error('Error al predecir:', error.message);
    res.status(500).json({ 
      error: 'Error al generar predicción',
      details: error.response?.data || error.message
    });
  }
});

// Generar recomendaciones con OpenAI
app.post('/api/recommendations', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const transactions = await Transaction.find({ userId })
      .sort({ date: -1 })
      .limit(30);
    
    const user = await User.findById(userId);

    const expenses = transactions.filter(t => t.type === 'expense');
    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Eres un asesor financiero experto. Genera recomendaciones personalizadas basadas en los datos financieros del usuario.'
          },
          {
            role: 'user',
            content: `Analiza esta situación financiera y da 5 recomendaciones concretas:

Balance actual: ${user.balance}€
Gastos últimos 30 días: ${totalExpenses.toFixed(2)}€
Número de transacciones: ${transactions.length}

Transacciones recientes:
${transactions.slice(0, 10).map(t => `- ${t.description}: ${t.amount}€ (${t.category})`).join('\n')}

Genera un JSON con esta estructura:
{
  "recommendations": ["rec1", "rec2", "rec3", "rec4", "rec5"],
  "riskLevel": "bajo|medio|alto",
  "savingsGoal": número
}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const recommendations = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      recommendations: ['Establece un presupuesto mensual', 'Revisa gastos recurrentes'],
      riskLevel: 'medio',
      savingsGoal: 500
    };

    res.json(recommendations);
  } catch (error) {
    console.error('Error OpenAI recomendaciones:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al generar recomendaciones' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Node.js corriendo en puerto ${PORT}`);
  console.log(`📊 MongoDB conectado`);
});
