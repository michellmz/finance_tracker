// App.jsx - React Frontend conectado al backend
import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Brain, Plus, Calendar, AlertCircle, Sparkles, PieChart } from 'lucide-react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';
const USER_ID = '674d8e9a1234567890abcdef'; // ID de usuario de ejemplo

const App = () => {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [predictions, setPredictions] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [categoryInsights, setCategoryInsights] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    description: '',
    amount: '',
    type: 'expense'
  });

  // Cargar datos iniciales
  useEffect(() => {
    loadUserData();
    loadTransactions();
  }, []);

  const loadUserData = async () => {
    try {
      const response = await axios.get(`${API_URL}/users/${USER_ID}`);
      setUser(response.data);
    } catch (error) {
      console.error('Error cargando usuario:', error);
      // Crear usuario si no existe
      try {
        const newUser = await axios.post(`${API_URL}/users`, {
          email: 'usuario@example.com',
          name: 'Usuario Demo'
        });
        setUser(newUser.data);
      } catch (createError) {
        console.error('Error creando usuario:', createError);
      }
    }
  };

  const loadTransactions = async () => {
    try {
      const response = await axios.get(`${API_URL}/transactions/${USER_ID}`);
      setTransactions(response.data);
    } catch (error) {
      console.error('Error cargando transacciones:', error);
    }
  };

  const addTransaction = async () => {
    if (!newTransaction.description || !newTransaction.amount) return;

    setIsLoading(true);
    try {
      const amount = parseFloat(newTransaction.amount);
      const finalAmount = newTransaction.type === 'expense' ? -Math.abs(amount) : Math.abs(amount);

      const response = await axios.post(`${API_URL}/transactions`, {
        userId: USER_ID,
        description: newTransaction.description,
        amount: finalAmount,
        type: newTransaction.type
      });

      setTransactions([response.data, ...transactions]);
      setNewTransaction({ description: '', amount: '', type: 'expense' });
      setShowAddTransaction(false);
      loadUserData(); // Actualizar balance
    } catch (error) {
      console.error('Error añadiendo transacción:', error);
      alert('Error al añadir transacción. Verifica que el backend esté corriendo.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteTransaction = async (id) => {
    try {
      await axios.delete(`${API_URL}/transactions/${id}`);
      setTransactions(transactions.filter(t => t._id !== id));
      loadUserData();
    } catch (error) {
      console.error('Error eliminando transacción:', error);
    }
  };

  const getPredictions = async () => {
    setIsLoading(true);
    try {
      // Llamar al servicio Python ML
      const response = await axios.post(`${API_URL}/predict`, {
        userId: USER_ID
      });

      setPredictions(response.data);
    } catch (error) {
      console.error('Error obteniendo predicciones:', error);
      alert('Error al conectar con el servicio ML. Verifica que Python esté corriendo en puerto 5000.');
    } finally {
      setIsLoading(false);
    }
  };

  const getRecommendations = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_URL}/recommendations`, {
        userId: USER_ID
      });

      setRecommendations(response.data);
    } catch (error) {
      console.error('Error obteniendo recomendaciones:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryInsights = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/category-insights', {
        transactions: transactions
      });

      setCategoryInsights(response.data.insights);
    } catch (error) {
      console.error('Error obteniendo insights:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalExpenses = Math.abs(
    transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <Brain className="text-green-600" size={36} />
                AI Finance Tracker Pro
              </h1>
              <p className="text-gray-500 mt-1">
                Node.js + Python ML + OpenAI
              </p>
            </div>
            <button
              onClick={() => setShowAddTransaction(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-md"
            >
              <Plus size={20} />
              Nueva Transacción
            </button>
          </div>

          {/* Balance Card */}
          <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl p-8 text-white">
            <p className="text-green-100 mb-2">Balance Total</p>
            <h2 className="text-5xl font-bold mb-6">
              {user ? user.balance.toFixed(2) : '0.00'}€
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-green-100 mb-1">
                  <TrendingUp size={16} />
                  <span className="text-sm">Ingresos</span>
                </div>
                <p className="text-2xl font-semibold">+{totalIncome.toFixed(2)}€</p>
              </div>
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-green-100 mb-1">
                  <TrendingDown size={16} />
                  <span className="text-sm">Gastos</span>
                </div>
                <p className="text-2xl font-semibold">-{totalExpenses.toFixed(2)}€</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <button
              onClick={getPredictions}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Brain size={20} />
              Predecir con ML
            </button>
            <button
              onClick={getRecommendations}
              disabled={isLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Sparkles size={20} />
              Recomendaciones AI
            </button>
            <button
              onClick={getCategoryInsights}
              disabled={isLoading}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <PieChart size={20} />
              Análisis Categorías
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Transactions List */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Calendar size={24} className="text-green-600" />
              Transacciones ({transactions.length})
            </h3>
            
            {transactions.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p>No hay transacciones. ¡Añade la primera!</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {transactions.map(transaction => (
                  <div 
                    key={transaction._id} 
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center text-2xl shadow-sm">
                        {transaction.category?.split(' ')[0] || '💳'}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">
                          {transaction.description}
                        </p>
                        <p className="text-sm text-gray-500">{transaction.category}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(transaction.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`text-xl font-bold ${
                        transaction.amount > 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {transaction.amount > 0 ? '+' : ''}{transaction.amount.toFixed(2)}€
                      </div>
                      <button
                        onClick={() => deleteTransaction(transaction._id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 text-sm transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Results Panel */}
          <div className="space-y-6">
            {/* ML Predictions */}
            {predictions && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Brain size={24} className="text-blue-600" />
                  Predicciones ML
                </h3>
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
                    <p className="text-sm text-gray-600 mb-1">Gasto Proyectado (30d)</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {predictions.predictedMonthlyExpense?.toFixed(2)}€
                    </p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 border-2 border-green-200">
                    <p className="text-sm text-gray-600 mb-1">Balance Proyectado</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {predictions.predictedBalance?.toFixed(2)}€
                    </p>
                  </div>
                  <div className={`rounded-xl p-4 border-2 ${
                    predictions.riskLevel === 'alto' ? 'bg-red-50 border-red-200' :
                    predictions.riskLevel === 'medio' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-green-50 border-green-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={20} />
                      <p className="font-semibold">Nivel de Riesgo</p>
                    </div>
                    <p className="text-lg font-bold uppercase">{predictions.riskLevel}</p>
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                    <p>Método: {predictions.model_info?.prediction_method}</p>
                    <p>Modelo entrenado: {predictions.model_info?.trained ? 'Sí' : 'No'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* AI Recommendations */}
            {recommendations && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Sparkles size={24} className="text-purple-600" />
                  Recomendaciones AI
                </h3>
                <div className="space-y-3">
                  {recommendations.recommendations?.map((rec, idx) => (
                    <div key={idx} className="bg-purple-50 rounded-lg p-3">
                      <p className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-purple-600 font-bold">{idx + 1}.</span>
                        <span>{rec}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category Insights */}
            {categoryInsights.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <PieChart size={24} className="text-orange-600" />
                  Análisis por Categoría
                </h3>
                <div className="space-y-3">
                  {categoryInsights.map((insight, idx) => (
                    <div key={idx} className="bg-orange-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">{insight.category}</span>
                        <span className="text-sm font-bold">{insight.percentage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-orange-600 h-2 rounded-full"
                          style={{ width: `${insight.percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-2">
                        Total: {insight.total.toFixed(2)}€ | Promedio: {insight.average.toFixed(2)}€
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showAddTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">
              Nueva Transacción
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Tipo
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setNewTransaction({...newTransaction, type: 'expense'})}
                    className={`py-3 rounded-xl font-semibold transition-all ${
                      newTransaction.type === 'expense'
                        ? 'bg-red-500 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Gasto
                  </button>
                  <button
                    onClick={() => setNewTransaction({...newTransaction, type: 'income'})}
                    className={`py-3 rounded-xl font-semibold transition-all ${
                      newTransaction.type === 'income'
                        ? 'bg-green-500 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Ingreso
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Descripción
                </label>
                <input
                  type="text"
                  value={newTransaction.description}
                  onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                  placeholder="Ej: Supermercado, Salario..."
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Cantidad (€)
                </label>
                <input
                  type="number"
                  value={newTransaction.amount}
                  onChange={(e) => setNewTransaction({...newTransaction, amount: e.target.value})}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none"
                />
              </div>

              {isLoading && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                  <span className="text-sm">Clasificando con OpenAI...</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddTransaction(false)}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={addTransaction}
                disabled={isLoading}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-all font-semibold disabled:opacity-50"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-40">
          <div className="bg-white rounded-xl p-6 shadow-2xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-green-600 mx-auto" />
            <p className="mt-4 text-gray-700 font-semibold">Procesando...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
